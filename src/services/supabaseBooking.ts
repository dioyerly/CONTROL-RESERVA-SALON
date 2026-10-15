import { supabase } from './supabase';
import { formatDateIso } from './availabilityEngine';
import {
  BusinessConfig,
  BusinessMode,
  CalculatedSlot,
  DayAvailabilitySummary,
  DaySchedule,
  PricingDisplayMode,
  Professional,
  Service,
  ServiceCategory,
  Location
} from '../types';

// Respuesta de public_catalog(p_business uuid) → jsonb (migración v3, sección 13)
export interface PublicCatalog {
  business: {
    id: string;
    name: string;
    slug: string;
    mode: BusinessMode;
    tagline: string;
    description: string;
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    pricing_display_mode: PricingDisplayMode;
    slot_interval_minutes: number;
    min_advance_notice_hours: number;
    max_advance_days: number;
  } | null;
  hours: { weekday: number; start: string; end: string }[];
  closures: string[];
  locations: { id: string; name: string; address: string; is_main: boolean }[];
  categories: { id: string; name: string; sort_order: number }[];
  services: {
    id: string;
    category_id: string | null;
    name: string;
    description: string;
    duration_minutes: number;
    buffer_minutes: number;
    price: number | null;
    price_type: 'fixed' | 'starting_at' | 'consult';
    requires_consultation: boolean;
    location_ids: string[];
    professional_ids: string[];
  }[];
  professionals: {
    id: string;
    name: string;
    role: string;
    color: string;
    location_ids: string[];
  }[];
}

// Fila de public_availability(...) → (r_start time, r_end time, r_segments jsonb)
interface AvailabilityRow {
  r_start: string;
  r_end: string;
  r_segments: {
    service_id: string;
    service_name: string;
    professional_id: string;
    professional_name: string;
    start: number; // minutos desde medianoche
    end: number;
  }[];
}

// Fila de create_public_booking(...) → (r_code text, r_date date, r_start time, r_end time)
interface CreatedRow {
  r_code: string;
  r_date: string;
  r_start: string;
  r_end: string;
}

export const NOT_CONFIGURED_MESSAGE = 'Las reservas online todavía no están configuradas para este negocio.';
const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente. Tu turno no fue confirmado.';

function requireClient() {
  if (!supabase) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }
  return supabase;
}

// Los errores de red llegan como texto genérico del navegador; los del servidor llegan con el mensaje de la función.
export function describeRpcError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (/failed to fetch|networkerror|network request failed|typeerror/i.test(message)) {
    return NETWORK_MESSAGE;
  }
  return message || 'No se pudo completar la operación. Intentá nuevamente.';
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

function minutesToHm(total: number): string {
  const h = Math.floor(total / 60).toString().padStart(2, '0');
  const m = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function periodOf(startMinutes: number): CalculatedSlot['period'] {
  if (startMinutes < 720) return 'morning';
  if (startMinutes < 960) return 'midday';
  return 'afternoon';
}

function rowToSlot(row: AvailabilityRow): CalculatedSlot {
  const startMinutes = row.r_segments[0]?.start ?? 0;
  return {
    startTime: hhmm(row.r_start),
    endTime: hhmm(row.r_end),
    isSimultaneousCombo: false,
    period: periodOf(startMinutes),
    segmentsPlan: row.r_segments.map(seg => ({
      serviceId: seg.service_id,
      serviceName: seg.service_name,
      durationMinutes: seg.end - seg.start,
      startTime: minutesToHm(seg.start),
      endTime: minutesToHm(seg.end),
      professionalId: seg.professional_id,
      professionalName: seg.professional_name,
      resourceIds: []
    }))
  };
}

export async function fetchPublicCatalog(businessUuid: string): Promise<PublicCatalog> {
  const client = requireClient();
  const { data, error } = await client.rpc('public_catalog', { p_business: businessUuid });
  if (error) throw new Error(describeRpcError(error));
  const catalog = data as PublicCatalog | null;
  if (!catalog || !catalog.business) {
    throw new Error('No encontramos el negocio en el servidor.');
  }
  return catalog;
}

export async function fetchDaySlots(params: {
  businessUuid: string;
  locationUuid: string;
  date: string;
  serviceUuids: string[];
  professionalUuid: string | null;
}): Promise<CalculatedSlot[]> {
  const client = requireClient();
  const { data, error } = await client.rpc('public_availability', {
    p_business: params.businessUuid,
    p_location: params.locationUuid,
    p_date: params.date,
    p_services: params.serviceUuids,
    p_pref: params.professionalUuid
  });
  if (error) throw new Error(describeRpcError(error));
  return ((data ?? []) as AvailabilityRow[]).map(rowToSlot);
}

// Resumen del mes con la misma escala que calculateMonthAvailability (AE 484-580):
// >4 turnos = alta, 1-4 = pocos, 0 = completo, cerrado = fecha pasada, fuera de ventana, feriado o día sin horario.
export async function fetchMonthSummary(params: {
  catalog: PublicCatalog;
  year: number;
  month: number;
  fetchDay: (date: string) => Promise<CalculatedSlot[]>;
}): Promise<Record<string, DayAvailabilitySummary>> {
  const { catalog, year, month, fetchDay } = params;
  const result: Record<string, DayAvailabilitySummary> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + (catalog.business?.max_advance_days || 60));
  const maxIso = formatDateIso(maxDate);
  const todayIso = formatDateIso(today);
  const openWeekdays = new Set(catalog.hours.map(h => h.weekday));
  const closures = new Set(catalog.closures);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const pending: Promise<void>[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const current = new Date(year, month, d);
    const dateStr = formatDateIso(current);
    const weekday = current.getDay();

    if (dateStr < todayIso) {
      result[dateStr] = { date: dateStr, level: 'closed', totalSlotsCount: 0, isClosed: true, reason: 'Fecha anterior' };
    } else if (dateStr > maxIso) {
      result[dateStr] = { date: dateStr, level: 'closed', totalSlotsCount: 0, isClosed: true, reason: 'Fuera de ventana de reserva' };
    } else if (closures.has(dateStr)) {
      result[dateStr] = { date: dateStr, level: 'closed', totalSlotsCount: 0, isClosed: true, reason: 'Feriado / Cerrado' };
    } else if (!openWeekdays.has(weekday)) {
      result[dateStr] = { date: dateStr, level: 'closed', totalSlotsCount: 0, isClosed: true, reason: 'Día de descanso' };
    } else {
      pending.push(
        fetchDay(dateStr).then(slots => {
          const count = slots.length;
          const level: DayAvailabilitySummary['level'] = count > 4 ? 'high' : count > 0 ? 'limited' : 'none';
          result[dateStr] = { date: dateStr, level, totalSlotsCount: count, isClosed: false };
        })
      );
    }
  }
  await Promise.all(pending);
  return result;
}

export async function createPublicBooking(params: {
  businessUuid: string;
  locationUuid: string;
  date: string;
  startTime: string;
  serviceUuids: string[];
  professionalUuid: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
}): Promise<{ code: string; date: string; startTime: string; endTime: string }> {
  const client = requireClient();
  const { data, error } = await client.rpc('create_public_booking', {
    p_business: params.businessUuid,
    p_location: params.locationUuid,
    p_date: params.date,
    p_start: params.startTime,
    p_services: params.serviceUuids,
    p_pref: params.professionalUuid,
    p_name: params.name,
    p_phone: params.phone,
    p_email: params.email.trim() || null,
    p_notes: params.notes.trim() || null
  });
  if (error) throw new Error(describeRpcError(error));
  const row = (Array.isArray(data) ? data[0] : data) as CreatedRow | undefined;
  if (!row?.r_code) {
    // Sin código no hay confirmación: no se muestra ninguna reserva.
    throw new Error('No recibimos la confirmación de la reserva. Revisá el horario e intentá nuevamente.');
  }
  return {
    code: row.r_code,
    date: row.r_date,
    startTime: hhmm(row.r_start),
    endTime: hhmm(row.r_end)
  };
}

// Convierte el catálogo público en la forma BusinessConfig que usa la pantalla de reservas.
// Los IDs de servicios, sedes y profesionales son los UUID de Supabase.
export function catalogToBusinessConfig(catalog: PublicCatalog, localBusinessId: string): BusinessConfig {
  const biz = catalog.business;
  if (!biz) throw new Error('No encontramos el negocio en el servidor.');

  const weeklyBusinessHours: BusinessConfig['weeklyBusinessHours'] = {};
  for (let d = 0; d <= 6; d++) weeklyBusinessHours[d] = null;
  catalog.hours.forEach(h => {
    weeklyBusinessHours[h.weekday] = { start: hhmm(h.start), end: hhmm(h.end), breaks: [] } as DaySchedule;
  });

  const locations: Location[] = catalog.locations.map(l => ({
    id: l.id,
    name: l.name,
    address: l.address,
    isMain: l.is_main
  }));

  const categories: ServiceCategory[] = catalog.categories.map(c => ({
    id: c.id,
    name: c.name,
    order: c.sort_order
  }));

  const services: Service[] = catalog.services.map(s => ({
    id: s.id,
    categoryId: s.category_id ?? '',
    name: s.name,
    description: s.description,
    durationMinutes: s.duration_minutes,
    bufferCleanupMinutes: s.buffer_minutes,
    minAdvanceHours: 0,
    price: s.price,
    priceType: s.price_type,
    enabledProfessionalIds: s.professional_ids,
    requiredResourceTypes: [], // el servidor valida los recursos al reservar
    locationIds: s.location_ids,
    allowSimultaneous: false,
    requiresConsultation: s.requires_consultation,
    isOnlineBookingEnabled: true
  }));

  const professionals: Professional[] = catalog.professionals.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    email: '',
    pin: '',
    enabledServiceIds: [],
    locationIds: p.location_ids,
    weeklySchedule: {},
    canManageOwnBreaks: false,
    color: p.color
  }));

  return {
    id: localBusinessId,
    name: biz.name,
    slug: biz.slug,
    mode: biz.mode,
    tagline: biz.tagline,
    description: biz.description,
    address: biz.address,
    phone: biz.phone,
    whatsapp: biz.whatsapp,
    email: biz.email,
    heroImage: '',
    pricingDisplayMode: biz.pricing_display_mode,
    slotIntervalMinutes: biz.slot_interval_minutes,
    minAdvanceNoticeHours: biz.min_advance_notice_hours,
    maxAdvanceDays: biz.max_advance_days,
    minBufferBetweenAppointments: 0,
    timezone: 'America/Argentina/Buenos_Aires',
    cancellationPolicyHours: 0,
    locations,
    resources: [],
    categories,
    services,
    professionals,
    simultaneousRules: [],
    bundlePricingRules: [],
    weeklyBusinessHours,
    holidaysAndVacations: catalog.closures
  };
}
