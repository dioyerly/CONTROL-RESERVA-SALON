import { supabase } from './supabase';
import { describeRpcError, hhmm } from './supabaseBooking';
import {
  AgendaBlock,
  BusinessConfig,
  DaySchedule,
  Location,
  Professional,
  Resource,
  Service,
  ServiceCategory
} from '../types';

// Catálogo completo del dueño (incluye servicios desactivados). Lo lee con su sesión y la RLS.
// Servicios, equipo, horarios, cierres, recursos, bloqueos y ajustes se guardan en Supabase.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireClient() {
  if (!supabase) throw new Error('Supabase no está configurado en este navegador.');
  return supabase;
}

function check(error: { message?: string } | null) {
  if (error) throw new Error(describeRpcError(error));
}

// Cada unidad física es una fila en resource_units. En el Estudio se muestra como un recurso con cantidad:
// las unidades se llaman "<nombre> 1", "<nombre> 2"… y se agrupan por sede, tipo y nombre base.
const UNIT_SUFFIX_RE = / \d+$/;
export function unitBaseName(name: string): string {
  return name.replace(UNIT_SUFFIX_RE, '');
}

type UnitRow = { id: string; location_id: string; name: string; resource_type: Resource['type'] };

function groupUnits(units: UnitRow[]): Resource[] {
  const groups = new Map<string, Resource>();
  for (const u of units) {
    const base = unitBaseName(u.name);
    const key = `${u.location_id}|${u.resource_type}|${base}`;
    const g = groups.get(key);
    if (g) {
      g.totalQuantity += 1;
    } else {
      // El ID del recurso es el de su primera unidad; sirve para editarlo o quitarlo
      groups.set(key, { id: u.id, name: base, type: u.resource_type, totalQuantity: 1, locationId: u.location_id });
    }
  }
  return Array.from(groups.values());
}

export async function fetchOwnerCatalog(businessUuid: string): Promise<BusinessConfig> {
  const client = requireClient();
  const [biz, cats, locs, svcs, pros, hours, closures, units] = await Promise.all([
    client.from('businesses').select('*').eq('id', businessUuid).single(),
    client.from('service_categories').select('id, name, sort_order').eq('business_id', businessUuid).order('sort_order'),
    client.from('locations').select('id, name, address, is_main, is_active').eq('business_id', businessUuid).order('is_main', { ascending: false }),
    client.from('services').select(`
      *,
      service_locations ( location_id ),
      professional_services ( professional_id ),
      service_resource_types ( resource_type )
    `).eq('business_id', businessUuid).eq('is_active', true).order('name'),
    client.from('professionals').select(`
      *,
      professional_locations ( location_id ),
      professional_hours ( weekday, start_time, end_time )
    `).eq('business_id', businessUuid).eq('is_active', true).order('name'),
    client.from('business_hours').select('weekday, start_time, end_time').eq('business_id', businessUuid),
    client.from('business_closures').select('closed_on').eq('business_id', businessUuid),
    client.from('resource_units').select('id, location_id, name, resource_type')
      .eq('business_id', businessUuid).eq('is_active', true).order('name')
  ]);
  check(biz.error); check(cats.error); check(locs.error); check(svcs.error); check(pros.error); check(hours.error); check(closures.error); check(units.error);

  const b = biz.data as Record<string, any>;
  const weeklyBusinessHours: BusinessConfig['weeklyBusinessHours'] = {};
  for (let d = 0; d <= 6; d++) weeklyBusinessHours[d] = null;
  (hours.data ?? []).forEach((h: any) => {
    weeklyBusinessHours[h.weekday] = { start: hhmm(h.start_time), end: hhmm(h.end_time), breaks: [] } as DaySchedule;
  });

  const categories: ServiceCategory[] = (cats.data ?? []).map((c: any) => ({ id: c.id, name: c.name, order: c.sort_order }));
  const locations: Location[] = (locs.data ?? []).map((l: any) => ({
    id: l.id, name: l.name, address: l.address ?? '', isMain: !!l.is_main
  }));

  const services: Service[] = (svcs.data ?? []).map((s: any) => ({
    id: s.id,
    categoryId: s.category_id ?? '',
    name: s.name,
    description: s.description ?? '',
    durationMinutes: s.duration_minutes,
    bufferCleanupMinutes: s.buffer_minutes,
    minAdvanceHours: s.min_advance_hours ?? 0,
    price: s.price,
    priceType: s.price_type,
    enabledProfessionalIds: (s.professional_services ?? []).map((p: any) => p.professional_id),
    requiredResourceTypes: (s.service_resource_types ?? []).map((r: any) => r.resource_type),
    locationIds: (s.service_locations ?? []).map((l: any) => l.location_id),
    allowSimultaneous: !!s.allow_simultaneous,
    requiresConsultation: !!s.requires_consultation,
    isOnlineBookingEnabled: !!s.is_online_booking_enabled
  }));

  const professionals: Professional[] = (pros.data ?? []).map((p: any) => {
    const weeklySchedule: Professional['weeklySchedule'] = {};
    for (let d = 0; d <= 6; d++) weeklySchedule[d] = null;
    (p.professional_hours ?? []).forEach((h: any) => {
      weeklySchedule[h.weekday] = { start: hhmm(h.start_time), end: hhmm(h.end_time), breaks: [] };
    });
    return {
      id: p.id,
      name: p.name,
      role: p.role ?? '',
      email: p.email ?? '',
      pin: '', // el PIN no se guarda en la base; pendiente con el portal del empleado
      enabledServiceIds: services.filter(s => s.enabledProfessionalIds.includes(p.id)).map(s => s.id),
      locationIds: (p.professional_locations ?? []).map((l: any) => l.location_id),
      weeklySchedule,
      canManageOwnBreaks: !!p.can_manage_own_breaks,
      color: p.color ?? '#B69A70'
    };
  });

  return {
    id: businessUuid,
    name: b.name,
    slug: b.slug,
    mode: b.mode,
    tagline: b.tagline ?? '',
    description: b.description ?? '',
    address: b.address ?? '',
    phone: b.phone ?? '',
    whatsapp: b.whatsapp ?? '',
    email: b.email ?? '',
    heroImage: '',
    pricingDisplayMode: b.pricing_display_mode,
    slotIntervalMinutes: b.slot_interval_minutes,
    minAdvanceNoticeHours: b.min_advance_notice_hours,
    maxAdvanceDays: b.max_advance_days,
    minBufferBetweenAppointments: b.min_buffer_minutes ?? 0,
    timezone: b.timezone,
    cancellationPolicyHours: b.cancellation_policy_hours ?? 0,
    locations,
    resources: groupUnits((units.data ?? []) as UnitRow[]),
    categories,
    services,
    professionals,
    simultaneousRules: [],
    bundlePricingRules: [],
    weeklyBusinessHours,
    holidaysAndVacations: (closures.data ?? []).map((c: any) => c.closed_on)
  };
}

// Guarda un servicio: alta si el ID no es un UUID, edición si lo es. Devuelve el UUID del servicio.
export async function saveRemoteService(
  businessUuid: string,
  service: Service,
  allProfessionalIds: string[]
): Promise<string> {
  const client = requireClient();
  const isNew = !UUID_RE.test(service.id);
  const row = {
    business_id: businessUuid,
    category_id: service.categoryId && UUID_RE.test(service.categoryId) ? service.categoryId : null,
    name: service.name.trim(),
    description: service.description.trim(),
    duration_minutes: service.durationMinutes,
    buffer_minutes: service.bufferCleanupMinutes,
    min_advance_hours: service.minAdvanceHours,
    price: service.price,
    price_type: service.priceType,
    allow_simultaneous: service.allowSimultaneous,
    requires_consultation: service.requiresConsultation,
    is_online_booking_enabled: service.isOnlineBookingEnabled,
    is_active: true
  };

  let serviceId = service.id;
  if (isNew) {
    const { data, error } = await client.from('services').insert(row).select('id').single();
    check(error);
    serviceId = data!.id as string;
  } else {
    const { data, error } = await client.from('services').update(row)
      .eq('id', serviceId).eq('business_id', businessUuid).select('id');
    check(error);
    if (!data || data.length === 0) throw new Error('No se pudo guardar el servicio. Revisá tu sesión e intentá de nuevo.');
  }

  // Sedes del servicio
  const locationIds = service.locationIds.filter(id => UUID_RE.test(id));
  if (locationIds.length === 0) {
    const { error } = await client.from('service_locations').delete().eq('service_id', serviceId);
    check(error);
  } else {
    const { error } = await client.from('service_locations').delete()
      .eq('service_id', serviceId).not('location_id', 'in', `(${locationIds.join(',')})`);
    check(error);
    const { error: upErr } = await client.from('service_locations').upsert(
      locationIds.map(location_id => ({ business_id: businessUuid, service_id: serviceId, location_id })),
      { onConflict: 'service_id,location_id', ignoreDuplicates: true }
    );
    check(upErr);
  }

  // Profesionales que hacen el servicio ('*' = todos los activos)
  const wanted = service.enabledProfessionalIds.includes('*')
    ? allProfessionalIds
    : service.enabledProfessionalIds.filter(id => UUID_RE.test(id));
  if (wanted.length === 0) {
    const { error } = await client.from('professional_services').delete().eq('service_id', serviceId);
    check(error);
  } else {
    const { error } = await client.from('professional_services').delete()
      .eq('service_id', serviceId).not('professional_id', 'in', `(${wanted.join(',')})`);
    check(error);
    const { error: upErr } = await client.from('professional_services').upsert(
      wanted.map(professional_id => ({ business_id: businessUuid, service_id: serviceId, professional_id })),
      { onConflict: 'professional_id,service_id', ignoreDuplicates: true }
    );
    check(upErr);
  }

  // Recursos requeridos
  {
    const { error } = await client.from('service_resource_types').delete().eq('service_id', serviceId);
    check(error);
    if (service.requiredResourceTypes.length > 0) {
      const { error: insErr } = await client.from('service_resource_types').insert(
        service.requiredResourceTypes.map(resource_type => ({ business_id: businessUuid, service_id: serviceId, resource_type }))
      );
      check(insErr);
    }
  }

  return serviceId;
}

// ---------- Equipo: perfil, sedes, servicios, jornada y descansos ----------
// El PIN no se envía: queda solo en el navegador para el portal del empleado (pendiente).

export async function saveRemoteProfessional(
  businessUuid: string,
  prof: { id: string; name: string; role: string; email: string; color: string; canManageOwnBreaks: boolean;
          enabledServiceIds: string[]; locationIds: string[]; weeklySchedule: Record<number, DaySchedule | null> },
  allServiceIds: string[],
  allLocationIds: string[]
): Promise<string> {
  const client = requireClient();
  const isNew = !UUID_RE.test(prof.id);
  const row = {
    business_id: businessUuid,
    name: prof.name.trim(),
    role: prof.role.trim(),
    email: prof.email.trim() || null,
    color: prof.color,
    can_manage_own_breaks: prof.canManageOwnBreaks,
    is_active: true
  };

  let profId = prof.id;
  if (isNew) {
    const { data, error } = await client.from('professionals').insert(row).select('id').single();
    check(error);
    profId = data!.id as string;
  } else {
    const { data, error } = await client.from('professionals').update(row)
      .eq('id', profId).eq('business_id', businessUuid).select('id');
    check(error);
    if (!data || data.length === 0) throw new Error('No se pudo guardar el profesional. Intentá de nuevo.');
  }

  // Sedes
  const locs = prof.locationIds.filter(id => UUID_RE.test(id) && allLocationIds.includes(id));
  if (locs.length === 0) {
    check((await client.from('professional_locations').delete().eq('professional_id', profId)).error);
  } else {
    check((await client.from('professional_locations').delete()
      .eq('professional_id', profId).not('location_id', 'in', `(${locs.join(',')})`)).error);
    check((await client.from('professional_locations').upsert(
      locs.map(location_id => ({ business_id: businessUuid, professional_id: profId, location_id })),
      { onConflict: 'professional_id,location_id', ignoreDuplicates: true })).error);
  }

  // Servicios ('*' = todos los servicios activos del negocio)
  const svcs = prof.enabledServiceIds.includes('*')
    ? allServiceIds
    : prof.enabledServiceIds.filter(id => UUID_RE.test(id) && allServiceIds.includes(id));
  if (svcs.length === 0) {
    check((await client.from('professional_services').delete().eq('professional_id', profId)).error);
  } else {
    check((await client.from('professional_services').delete()
      .eq('professional_id', profId).not('service_id', 'in', `(${svcs.join(',')})`)).error);
    check((await client.from('professional_services').upsert(
      svcs.map(service_id => ({ business_id: businessUuid, professional_id: profId, service_id })),
      { onConflict: 'professional_id,service_id', ignoreDuplicates: true })).error);
  }

  // Jornada: se escriben los días abiertos y se quitan los que ya no lo están
  const openDays = Object.entries(prof.weeklySchedule).filter(([, v]) => v !== null).map(([k]) => Number(k));
  if (openDays.length > 0) {
    check((await client.from('professional_hours').upsert(
      openDays.map(d => {
        const s = prof.weeklySchedule[d]!;
        return { business_id: businessUuid, professional_id: profId, weekday: d, start_time: s.start, end_time: s.end };
      }),
      { onConflict: 'professional_id,weekday' })).error);
    check((await client.from('professional_hours').delete()
      .eq('professional_id', profId).not('weekday', 'in', `(${openDays.join(',')})`)).error);
  } else {
    check((await client.from('professional_hours').delete().eq('professional_id', profId)).error);
  }

  // Descansos (almuerzo, etc.): se reemplazan por completo
  check((await client.from('schedule_breaks').delete().eq('professional_id', profId)).error);
  const breaks: Record<string, unknown>[] = [];
  for (const [d, s] of Object.entries(prof.weeklySchedule)) {
    if (!s) continue;
    for (const b of s.breaks) {
      breaks.push({ business_id: businessUuid, professional_id: profId, weekday: Number(d),
        start_time: b.start, end_time: b.end, title: b.title || 'Descanso' });
    }
  }
  if (breaks.length > 0) check((await client.from('schedule_breaks').insert(breaks)).error);

  return profId;
}

export async function deactivateRemoteProfessional(businessUuid: string, profId: string): Promise<void> {
  const client = requireClient();
  const { data, error } = await client.from('professionals').update({ is_active: false })
    .eq('id', profId).eq('business_id', businessUuid).select('id');
  check(error);
  if (!data || data.length === 0) throw new Error('No se pudo quitar el profesional. Intentá de nuevo.');
}

// ---------- Horarios comerciales y cierres ----------
// Se escriben los días/fechas actuales y después se quitan los que ya no están: si falla la escritura,
// no queda el negocio sin horarios.
export async function saveRemoteBusinessSchedule(
  businessUuid: string,
  hours: Record<number, DaySchedule | null>,
  holidays: string[]
): Promise<void> {
  const client = requireClient();
  const openDays = Object.entries(hours).filter(([, v]) => v !== null).map(([k]) => Number(k));
  if (openDays.length > 0) {
    check((await client.from('business_hours').upsert(
      openDays.map(d => ({ business_id: businessUuid, weekday: d,
        start_time: hours[d]!.start, end_time: hours[d]!.end })),
      { onConflict: 'business_id,weekday' })).error);
    check((await client.from('business_hours').delete()
      .eq('business_id', businessUuid).not('weekday', 'in', `(${openDays.join(',')})`)).error);
  } else {
    check((await client.from('business_hours').delete().eq('business_id', businessUuid)).error);
  }

  const dates = Array.from(new Set(holidays.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))));
  if (dates.length > 0) {
    check((await client.from('business_closures').upsert(
      dates.map(closed_on => ({ business_id: businessUuid, closed_on, reason: '' })),
      { onConflict: 'business_id,closed_on' })).error);
    check((await client.from('business_closures').delete()
      .eq('business_id', businessUuid).not('closed_on', 'in', `(${dates.join(',')})`)).error);
  } else {
    check((await client.from('business_closures').delete().eq('business_id', businessUuid)).error);
  }
}

// Desactiva el servicio (no se borra: puede tener turnos históricos que lo referencian).
export async function deactivateRemoteService(businessUuid: string, serviceId: string): Promise<void> {
  const client = requireClient();
  const { data, error } = await client.from('services').update({ is_active: false })
    .eq('id', serviceId).eq('business_id', businessUuid).select('id');
  check(error);
  if (!data || data.length === 0) throw new Error('No se pudo eliminar el servicio. Intentá de nuevo.');
}

type Client = ReturnType<typeof requireClient>;

// ---------- Sedes y categorías (solo altas: las usa la importación) ----------

export async function createRemoteLocation(businessUuid: string, name: string, address: string, isMain: boolean): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.from('locations').insert({
    business_id: businessUuid, name: name.trim(), address: address ?? '', is_main: isMain, is_active: true
  }).select('id').single();
  check(error);
  return data!.id as string;
}

export async function createRemoteCategory(businessUuid: string, name: string, sortOrder: number): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.from('service_categories').insert({
    business_id: businessUuid, name: name.trim(), sort_order: sortOrder
  }).select('id').single();
  check(error);
  return data!.id as string;
}

// ---------- Recursos (una fila por unidad) ----------

const MAX_RESOURCE_UNITS = 20;

// Unidades activas del mismo recurso: misma sede, tipo y nombre base que la unidad indicada
async function resourceGroupUnits(client: Client, businessUuid: string, unitId: string): Promise<UnitRow[]> {
  const { data, error } = await client.from('resource_units').select('id, location_id, name, resource_type')
    .eq('business_id', businessUuid).eq('is_active', true);
  check(error);
  const rows = (data ?? []) as UnitRow[];
  const anchor = rows.find(r => r.id === unitId);
  if (!anchor) throw new Error('No se encontró el recurso. Recargá la página e intentá de nuevo.');
  const key = (r: UnitRow) => `${r.location_id}|${r.resource_type}|${unitBaseName(r.name)}`;
  const anchorKey = key(anchor);
  return rows.filter(r => key(r) === anchorKey);
}

// Crea o edita un recurso. Edición: se ajustan las unidades del grupo a la nueva cantidad, nombre, tipo o sede.
// Las unidades que sobran se desactivan, no se borran: pueden estar en turnos anteriores.
export async function saveRemoteResource(businessUuid: string, res: Resource): Promise<void> {
  const client = requireClient();
  const name = res.name.trim();
  if (!name) throw new Error('Falta el nombre del recurso.');
  if (!UUID_RE.test(res.locationId)) throw new Error('Elegí una sede válida para el recurso.');
  const qty = Math.floor(Number(res.totalQuantity));
  if (!(qty >= 1 && qty <= MAX_RESOURCE_UNITS)) {
    throw new Error(`La cantidad debe estar entre 1 y ${MAX_RESOURCE_UNITS}.`);
  }

  const current = UUID_RE.test(res.id) ? await resourceGroupUnits(client, businessUuid, res.id) : [];
  const wanted = Array.from({ length: qty }, (_, i) => `${name} ${i + 1}`);

  // Un nombre ocupado en esa sede por otro recurso activo no se pisa
  const currentIds = new Set(current.map(u => u.id));
  const { data: taken, error: takenErr } = await client.from('resource_units').select('id')
    .eq('business_id', businessUuid).eq('location_id', res.locationId).eq('is_active', true).in('name', wanted);
  check(takenErr);
  if ((taken ?? []).some(t => !currentIds.has(t.id as string))) {
    throw new Error(`Ya existe otro recurso con el nombre "${name}" en esa sede.`);
  }

  // Upsert por sede y nombre: evita duplicados si se reintenta; reactiva una unidad inactiva con ese nombre
  const { data: saved, error: upErr } = await client.from('resource_units').upsert(
    wanted.map(n => ({ business_id: businessUuid, location_id: res.locationId, name: n, resource_type: res.type, is_active: true })),
    { onConflict: 'location_id,name' }
  ).select('id');
  check(upErr);

  const keep = new Set((saved ?? []).map(r => r.id as string));
  const stale = current.filter(u => !keep.has(u.id)).map(u => u.id);
  if (stale.length > 0) {
    const { error } = await client.from('resource_units').update({ is_active: false }).in('id', stale);
    check(error);
  }
}

export async function deleteRemoteResource(businessUuid: string, resId: string): Promise<void> {
  const client = requireClient();
  const group = await resourceGroupUnits(client, businessUuid, resId);
  const { error } = await client.from('resource_units').update({ is_active: false }).in('id', group.map(u => u.id));
  check(error);
}

// ---------- Ajustes del negocio (solo las columnas que usa el motor o la reserva pública) ----------

export interface BusinessSettingsInput {
  name: string;
  mode: BusinessConfig['mode'];
  pricingDisplayMode: BusinessConfig['pricingDisplayMode'];
  slotIntervalMinutes: number;
  minAdvanceNoticeHours: number;
}

export async function saveRemoteBusinessSettings(businessUuid: string, s: BusinessSettingsInput): Promise<void> {
  const client = requireClient();
  const name = s.name.trim();
  if (!name) throw new Error('El nombre comercial no puede quedar vacío.');
  if (s.slotIntervalMinutes !== 15 && s.slotIntervalMinutes !== 30) {
    throw new Error('El intervalo de turnos debe ser de 15 o 30 minutos.');
  }
  if (!Number.isInteger(s.minAdvanceNoticeHours) || s.minAdvanceNoticeHours < 0) {
    throw new Error('La anticipación mínima debe ser un número entero de horas, 0 o más.');
  }
  const { data, error } = await client.from('businesses').update({
    name,
    mode: s.mode,
    pricing_display_mode: s.pricingDisplayMode,
    slot_interval_minutes: s.slotIntervalMinutes,
    min_advance_notice_hours: s.minAdvanceNoticeHours,
    updated_at: new Date().toISOString()
  }).eq('id', businessUuid).select('id');
  check(error);
  if (!data || data.length === 0) throw new Error('No se pudo guardar la configuración. Revisá tu sesión e intentá de nuevo.');
}

// ---------- Bloqueos de agenda (agenda_blocks) ----------

type BlockRow = {
  id: string;
  professional_id: string | null;
  location_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  type: AgendaBlock['type'];
};

export async function fetchOwnerBlocks(businessUuid: string): Promise<AgendaBlock[]> {
  const client = requireClient();
  const { data, error } = await client.from('agenda_blocks')
    .select('id, professional_id, location_id, date, start_time, end_time, reason, type')
    .eq('business_id', businessUuid).order('date').order('start_time');
  check(error);
  return ((data ?? []) as BlockRow[]).map(b => ({
    id: b.id,
    businessId: businessUuid,
    professionalId: b.professional_id ?? undefined,
    locationId: b.location_id ?? undefined,
    date: b.date,
    startTime: hhmm(b.start_time),
    endTime: hhmm(b.end_time),
    reason: b.reason ?? '',
    type: b.type
  }));
}

export interface NewBlockInput {
  professionalId?: string;
  locationId?: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  type: AgendaBlock['type'];
}

// El trigger de la base rechaza un bloqueo que cae sobre turnos activos; ese error llega tal cual al usuario
export async function createRemoteBlock(businessUuid: string, b: NewBlockInput): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.from('agenda_blocks').insert({
    business_id: businessUuid,
    professional_id: b.professionalId ?? null,
    location_id: b.locationId ?? null,
    date: b.date,
    start_time: b.startTime,
    end_time: b.endTime,
    reason: b.reason.trim(),
    type: b.type
  }).select('id').single();
  check(error);
  return data!.id as string;
}

export async function deleteRemoteBlock(businessUuid: string, blockId: string): Promise<void> {
  const client = requireClient();
  const { data, error } = await client.from('agenda_blocks').delete()
    .eq('id', blockId).eq('business_id', businessUuid).select('id');
  check(error);
  if (!data || data.length === 0) throw new Error('No se pudo quitar el bloqueo. Intentá de nuevo.');
}
