import type {
  AgendaBlock,
  BusinessConfig,
  Location,
  Professional,
  Resource,
  Service,
  ServiceCategory
} from '../types';
import {
  fetchOwnerCatalog,
  fetchOwnerBlocks,
  saveRemoteService,
  saveRemoteProfessional,
  saveRemoteResource,
  saveRemoteBusinessSchedule,
  createRemoteLocation,
  createRemoteCategory,
  createRemoteBlock
} from './ownerCatalog';

// Importa la configuración guardada en este navegador (localStorage) al negocio autenticado.
// Lectura de localStorage solamente: nunca lo modifica. No importa turnos, clientes, contraseñas ni PIN.
// Los registros se comparan por nombre con lo que ya hay en la base, así un reintento no duplica nada.

export type ImportSection = 'Sedes' | 'Servicios' | 'Equipo' | 'Recursos' | 'Horarios' | 'Bloqueos';

export interface ImportItem<T> {
  key: string;      // ID local
  label: string;    // nombre con el que se importa (editable en la vista previa)
  included: boolean;
  exists: boolean;  // ya hay un registro equivalente en la base
  note: string;
  source: T;
}

export interface SchedulePayload {
  hours: BusinessConfig['weeklyBusinessHours'];
  holidays: string[];
}

export interface ImportPlan {
  locations: ImportItem<Location>[];
  categories: ServiceCategory[];
  services: ImportItem<Service>[];
  staff: ImportItem<Professional>[];
  resources: ImportItem<Resource>[];
  blocks: ImportItem<AgendaBlock>[];
  schedule: ImportItem<SchedulePayload> | null;
}

export interface ImportResult {
  section: ImportSection;
  label: string;
  outcome: 'importado' | 'omitido' | 'error';
  message: string;
}

export function normalizeName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function hasRemoteSchedule(remote: BusinessConfig): boolean {
  return Object.values(remote.weeklyBusinessHours).some(v => v !== null) || remote.holidaysAndVacations.length > 0;
}

function blockKey(date: string, start: string, end: string, type: string, professionalId: string): string {
  return [date, start, end, type, professionalId].join('|');
}

// Vista previa: compara lo local con lo que hay hoy en la base. No escribe nada.
export function buildImportPlan(
  local: BusinessConfig | null,
  localBlocks: AgendaBlock[],
  remote: BusinessConfig,
  remoteBlocks: AgendaBlock[],
  today: string
): ImportPlan {
  const plan: ImportPlan = { locations: [], categories: [], services: [], staff: [], resources: [], blocks: [], schedule: null };
  if (!local) return plan;

  const remoteLocByName = new Map(remote.locations.map(l => [normalizeName(l.name), l.id]));
  const localLocToRemote = new Map<string, string>();
  local.locations.forEach(l => {
    const r = remoteLocByName.get(normalizeName(l.name));
    if (r) localLocToRemote.set(l.id, r);
  });
  const remoteServiceNames = new Set(remote.services.map(s => normalizeName(s.name)));
  const remoteProByName = new Map(remote.professionals.map(p => [normalizeName(p.name), p.id]));
  const localProToRemote = new Map<string, string>();
  local.professionals.forEach(p => {
    const r = remoteProByName.get(normalizeName(p.name));
    if (r) localProToRemote.set(p.id, r);
  });

  plan.locations = local.locations.map(l => {
    const exists = remoteLocByName.has(normalizeName(l.name));
    return {
      key: l.id, label: l.name, included: !exists, exists,
      note: exists ? 'Ya existe; no se modifica' : 'Sede nueva', source: l
    };
  });

  plan.categories = local.categories;

  plan.services = local.services.map(s => {
    const exists = remoteServiceNames.has(normalizeName(s.name));
    return {
      key: s.id, label: s.name, included: !exists, exists,
      note: exists ? 'Ya existe; no se modifica' : 'Servicio nuevo', source: s
    };
  });

  plan.staff = local.professionals.map(p => {
    const exists = remoteProByName.has(normalizeName(p.name));
    return {
      key: p.id, label: p.name, included: !exists, exists,
      note: exists ? 'Ya existe; no se modifica' : 'Profesional nuevo. El PIN no se importa', source: p
    };
  });

  plan.resources = local.resources.map(r => {
    const locRemote = localLocToRemote.get(r.locationId);
    const exists = !!locRemote && remote.resources.some(x =>
      normalizeName(x.name) === normalizeName(r.name) && x.type === r.type && x.locationId === locRemote
    );
    return {
      key: r.id, label: r.name, included: !exists, exists,
      note: exists ? 'Ya existe; no se modifica' : `Recurso nuevo (${r.totalQuantity} unidad/es)`, source: r
    };
  });

  const remoteBlockKeys = new Set(remoteBlocks.map(b =>
    blockKey(b.date, b.startTime, b.endTime, b.type, b.professionalId ?? '')
  ));
  plan.blocks = localBlocks.map(b => {
    const profRemote = b.professionalId ? (localProToRemote.get(b.professionalId) ?? '') : '';
    const exists = remoteBlockKeys.has(blockKey(b.date, b.startTime, b.endTime, b.type, profRemote));
    const future = b.date >= today;
    return {
      key: b.id,
      label: `${b.date} ${b.startTime}–${b.endTime} · ${b.reason || b.type}`,
      included: !exists && future,
      exists,
      note: exists ? 'Ya existe' : future ? 'Bloqueo a futuro' : 'Fecha pasada: no se importa por defecto',
      source: b
    };
  });

  const localHasSchedule = Object.values(local.weeklyBusinessHours).some(v => v !== null) || local.holidaysAndVacations.length > 0;
  if (localHasSchedule) {
    const exists = hasRemoteSchedule(remote);
    plan.schedule = {
      key: 'schedule', label: 'Horario semanal y cierres', included: !exists, exists,
      note: exists
        ? 'Ya hay horario guardado. Se reemplaza solo si lo marcás'
        : 'Se importa el horario y los cierres locales',
      source: { hours: local.weeklyBusinessHours, holidays: local.holidaysAndVacations }
    };
  }

  return plan;
}

type Named = { id: string; name: string };

// Ejecución: vuelve a leer la base antes de escribir. Cada registro se procesa por separado:
// un error no detiene el resto y queda registrado en el resultado.
export async function runImport(businessUuid: string, plan: ImportPlan): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const report = (section: ImportSection, label: string, outcome: ImportResult['outcome'], message = '') => {
    results.push({ section, label, outcome, message });
  };
  const reportError = (section: ImportSection, label: string, err: unknown) => {
    report(section, label, 'error', (err as Error).message);
  };

  const remote = await fetchOwnerCatalog(businessUuid);
  const remoteBlocks = await fetchOwnerBlocks(businessUuid);

  // ---- Sedes ----
  const locMap = new Map<string, string>();
  const remoteLocs: (Named & { isMain: boolean })[] = remote.locations.map(l => ({ id: l.id, name: l.name, isMain: l.isMain }));
  for (const item of plan.locations) {
    const found = remoteLocs.find(l => normalizeName(l.name) === normalizeName(item.label));
    if (found) locMap.set(item.key, found.id);
  }
  for (const item of plan.locations) {
    if (!item.included) continue;
    const label = item.label.trim();
    if (locMap.has(item.key)) { report('Sedes', label, 'omitido', 'Ya existe'); continue; }
    if (!label) { report('Sedes', item.label, 'error', 'Falta el nombre de la sede'); continue; }
    try {
      const hasMain = remoteLocs.some(l => l.isMain);
      const isMain = item.source.isMain && !hasMain;
      const id = await createRemoteLocation(businessUuid, label, item.source.address, isMain);
      locMap.set(item.key, id);
      remoteLocs.push({ id, name: label, isMain });
      report('Sedes', label, 'importado');
    } catch (err) {
      reportError('Sedes', label, err);
    }
  }

  // ---- Servicios (con sus categorías) ----
  const catMap = new Map<string, string>();
  const remoteCats: Named[] = remote.categories.map(c => ({ id: c.id, name: c.name }));
  const categoryFor = async (localCategoryId: string): Promise<string> => {
    const cached = catMap.get(localCategoryId);
    if (cached) return cached;
    const localCat = plan.categories.find(c => c.id === localCategoryId);
    if (!localCat) return '';
    const found = remoteCats.find(c => normalizeName(c.name) === normalizeName(localCat.name));
    if (found) { catMap.set(localCategoryId, found.id); return found.id; }
    const id = await createRemoteCategory(businessUuid, localCat.name, localCat.order);
    remoteCats.push({ id, name: localCat.name });
    catMap.set(localCategoryId, id);
    return id;
  };

  const svcMap = new Map<string, string>();
  const remoteSvcs: Named[] = remote.services.map(s => ({ id: s.id, name: s.name }));
  for (const item of plan.services) {
    const found = remoteSvcs.find(s => normalizeName(s.name) === normalizeName(item.label));
    if (found) svcMap.set(item.key, found.id);
  }
  for (const item of plan.services) {
    if (!item.included) continue;
    const label = item.label.trim();
    if (svcMap.has(item.key)) { report('Servicios', label, 'omitido', 'Ya existe'); continue; }
    if (!label) { report('Servicios', item.label, 'error', 'Falta el nombre del servicio'); continue; }
    try {
      const categoryId = await categoryFor(item.source.categoryId);
      // Los profesionales se vinculan después, desde el lado del profesional
      const id = await saveRemoteService(businessUuid, {
        ...item.source,
        id: '',
        name: label,
        categoryId,
        locationIds: item.source.locationIds.map(l => locMap.get(l)).filter((x): x is string => !!x),
        enabledProfessionalIds: []
      }, []);
      svcMap.set(item.key, id);
      remoteSvcs.push({ id, name: label });
      report('Servicios', label, 'importado');
    } catch (err) {
      reportError('Servicios', label, err);
    }
  }

  // ---- Equipo (sin PIN) ----
  const proMap = new Map<string, string>();
  const remotePros: Named[] = remote.professionals.map(p => ({ id: p.id, name: p.name }));
  for (const item of plan.staff) {
    const found = remotePros.find(p => normalizeName(p.name) === normalizeName(item.label));
    if (found) proMap.set(item.key, found.id);
  }
  for (const item of plan.staff) {
    if (!item.included) continue;
    const label = item.label.trim();
    if (proMap.has(item.key)) { report('Equipo', label, 'omitido', 'Ya existe'); continue; }
    if (!label) { report('Equipo', item.label, 'error', 'Falta el nombre del profesional'); continue; }
    try {
      const p = item.source;
      const allServiceIds = remoteSvcs.map(s => s.id);
      const allLocationIds = remoteLocs.map(l => l.id);
      const enabledServiceIds = p.enabledServiceIds.includes('*')
        ? allServiceIds
        : p.enabledServiceIds.map(id => svcMap.get(id)).filter((x): x is string => !!x);
      const locationIds = p.locationIds.map(id => locMap.get(id)).filter((x): x is string => !!x);
      const id = await saveRemoteProfessional(businessUuid, {
        id: '',
        name: label,
        role: p.role,
        email: p.email,
        color: p.color,
        canManageOwnBreaks: p.canManageOwnBreaks,
        enabledServiceIds,
        locationIds,
        weeklySchedule: p.weeklySchedule
      }, allServiceIds, allLocationIds);
      proMap.set(item.key, id);
      remotePros.push({ id, name: label });
      report('Equipo', label, 'importado');
    } catch (err) {
      reportError('Equipo', label, err);
    }
  }

  // ---- Recursos (una fila por unidad) ----
  const remoteRes: Resource[] = [...remote.resources];
  for (const item of plan.resources) {
    if (!item.included) continue;
    const label = item.label.trim();
    const r = item.source;
    const locRemote = locMap.get(r.locationId);
    if (!locRemote) { report('Recursos', label, 'error', 'La sede de este recurso no está importada'); continue; }
    if (remoteRes.some(x => normalizeName(x.name) === normalizeName(label) && x.type === r.type && x.locationId === locRemote)) {
      report('Recursos', label, 'omitido', 'Ya existe');
      continue;
    }
    if (!label) { report('Recursos', item.label, 'error', 'Falta el nombre del recurso'); continue; }
    try {
      const payload: Resource = { id: '', name: label, type: r.type, totalQuantity: r.totalQuantity, locationId: locRemote };
      await saveRemoteResource(businessUuid, payload);
      remoteRes.push(payload);
      report('Recursos', label, 'importado');
    } catch (err) {
      reportError('Recursos', label, err);
    }
  }

  // ---- Horario y cierres (solo si la usuaria lo marcó) ----
  if (plan.schedule && plan.schedule.included) {
    try {
      await saveRemoteBusinessSchedule(businessUuid, plan.schedule.source.hours, plan.schedule.source.holidays);
      report('Horarios', plan.schedule.label, 'importado');
    } catch (err) {
      reportError('Horarios', plan.schedule.label, err);
    }
  }

  // ---- Bloqueos ----
  const blockKeys = new Set(remoteBlocks.map(b =>
    blockKey(b.date, b.startTime, b.endTime, b.type, b.professionalId ?? '')
  ));
  for (const item of plan.blocks) {
    if (!item.included) continue;
    const b = item.source;
    const profRemote = b.professionalId ? proMap.get(b.professionalId) : undefined;
    if (b.professionalId && !profRemote) {
      report('Bloqueos', item.label, 'error', 'El profesional de este bloqueo no está importado'); continue;
    }
    const locRemote = b.locationId ? locMap.get(b.locationId) : undefined;
    if (b.locationId && !locRemote) {
      report('Bloqueos', item.label, 'error', 'La sede de este bloqueo no está importada'); continue;
    }
    const key = blockKey(b.date, b.startTime, b.endTime, b.type, profRemote ?? '');
    if (blockKeys.has(key)) { report('Bloqueos', item.label, 'omitido', 'Ya existe'); continue; }
    try {
      await createRemoteBlock(businessUuid, {
        professionalId: profRemote,
        locationId: locRemote,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        reason: b.reason,
        type: b.type
      });
      blockKeys.add(key);
      report('Bloqueos', item.label, 'importado');
    } catch (err) {
      reportError('Bloqueos', item.label, err);
    }
  }

  return results;
}
