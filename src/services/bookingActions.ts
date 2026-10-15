import { supabase } from './supabase';
import { NOT_CONFIGURED_MESSAGE, describeRpcError, hhmm, PublicCatalog } from './supabaseBooking';

// Acciones de turnos sobre las RPC existentes de la migración aplicada:
//   create_internal_appointment (dueño/empleado), find_public_booking,
//   cancel_public_booking y reschedule_public_booking (cliente, con código + teléfono).
// Ninguna escribe en tablas desde el navegador. El éxito se informa solo si el servidor devuelve el código.

export interface RpcResult { data: unknown; error: { message?: string } | null }
export interface RpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult> }

export interface CreatedBooking { code: string; date: string; startTime: string; endTime: string }

export interface InternalAppointmentInput {
  businessUuid: string;
  professionalUuid: string;
  locationUuid: string;
  serviceUuid: string;
  date: string;
  startTime: string;
  name: string;
  phone: string;
  notes: string;
}

export interface PublicBookingView {
  code: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  total: number;
  notes: string;
  segments: { service: string; professional: string; start: string; end: string }[];
}

const NO_CONFIRMATION = 'No recibimos la confirmación del servidor. Revisá la agenda antes de reintentar.';
const NOT_MATCHED = 'No podemos reprogramar este turno desde aquí. Escribinos al negocio para cambiarlo.';

async function callRpc(client: RpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  let res: RpcResult;
  try {
    res = await client.rpc(name, args);
  } catch (err) {
    throw new Error(describeRpcError(err as { message?: string }));
  }
  if (res.error) throw new Error(describeRpcError(res.error));
  return res.data;
}

const firstRow = <T>(data: unknown): T | undefined => (Array.isArray(data) ? data[0] : data) as T | undefined;

const phoneKey = (phone: string) => phone.replace(/\D/g, '');

// La fábrica recibe el cliente para poder probarla con un sustituto. En la app usa el cliente real.
export function createBookingActions(getClient: () => RpcClient | null) {
  // Mismo envío en curso (doble clic o reintento simultáneo): se comparte la respuesta; no se envía de nuevo
  const inFlight = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const pending = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
  const client = (): RpcClient => {
    const c = getClient();
    if (!c) throw new Error(NOT_CONFIGURED_MESSAGE);
    return c;
  };

  return {
    // Turno desde el Estudio. El profesional lo elige la disponibilidad (segmento del horario elegido).
    createInternalAppointment(input: InternalAppointmentInput): Promise<CreatedBooking> {
      const key = ['create', input.businessUuid, input.professionalUuid, input.date, input.startTime, phoneKey(input.phone)].join('|');
      return once(key, async () => {
        const data = await callRpc(client(), 'create_internal_appointment', {
          p_professional: input.professionalUuid,
          p_location: input.locationUuid,
          p_date: input.date,
          p_start: input.startTime,
          p_service: input.serviceUuid,
          p_name: input.name.trim(),
          p_phone: input.phone.trim(),
          p_email: null,
          p_notes: input.notes.trim() || null
        });
        const row = firstRow<{ r_code?: string; r_date?: string; r_start?: string; r_end?: string }>(data);
        if (!row?.r_code) throw new Error(NO_CONFIRMATION);
        return {
          code: row.r_code,
          date: row.r_date ?? input.date,
          startTime: hhmm(row.r_start ?? input.startTime),
          endTime: hhmm(row.r_end ?? input.startTime)
        };
      });
    },

    // Consulta pública: si el código o el teléfono no coinciden, devuelve null sin distinguir cuál falló
    async findPublicBooking(businessUuid: string, code: string, phone: string): Promise<PublicBookingView | null> {
      const data = await callRpc(client(), 'find_public_booking', {
        p_business: businessUuid, p_code: code.trim(), p_phone: phone.trim()
      });
      const row = firstRow<Record<string, unknown>>(data);
      if (!row || !row.r_code) return null;
      const segments = Array.isArray(row.r_segments) ? row.r_segments as Record<string, string>[] : [];
      return {
        code: String(row.r_code),
        status: String(row.r_status),
        date: String(row.r_date),
        startTime: hhmm(String(row.r_start)),
        endTime: hhmm(String(row.r_end)),
        location: String(row.r_location ?? ''),
        total: Number(row.r_total ?? 0),
        notes: String(row.r_notes ?? ''),
        segments: segments.map(s => ({
          service: s.service, professional: s.professional, start: String(s.start).slice(0, 5), end: String(s.end).slice(0, 5)
        }))
      };
    },

    // Solo resuelve si el servidor confirma la cancelación
    cancelPublicBooking(businessUuid: string, code: string, phone: string): Promise<string> {
      const key = ['cancel', businessUuid, code.trim().toUpperCase(), phoneKey(phone)].join('|');
      return once(key, async () => {
        const data = await callRpc(client(), 'cancel_public_booking', {
          p_business: businessUuid, p_code: code.trim(), p_phone: phone.trim()
        });
        const confirmed = typeof data === 'string' ? data : firstRow<string>(data);
        if (!confirmed) throw new Error(NO_CONFIRMATION);
        return confirmed;
      });
    },

    // Solo resuelve si el servidor confirma el nuevo horario; si falla, la reserva original queda como estaba
    reschedulePublicBooking(businessUuid: string, code: string, phone: string, date: string, startTime: string): Promise<CreatedBooking> {
      const key = ['reschedule', businessUuid, code.trim().toUpperCase(), phoneKey(phone), date, startTime].join('|');
      return once(key, async () => {
        const data = await callRpc(client(), 'reschedule_public_booking', {
          p_business: businessUuid, p_code: code.trim(), p_phone: phone.trim(), p_date: date, p_start: startTime
        });
        const row = firstRow<{ r_code?: string; r_date?: string; r_start?: string; r_end?: string }>(data);
        if (!row?.r_code) throw new Error(NO_CONFIRMATION);
        return {
          code: row.r_code,
          date: row.r_date ?? date,
          startTime: hhmm(row.r_start ?? startTime),
          endTime: hhmm(row.r_end ?? startTime)
        };
      });
    }
  };
}

export const bookingActions = createBookingActions(() => supabase as unknown as RpcClient | null);

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// La reprogramación usa la sede y los servicios del turno. Como find_public_booking devuelve nombres,
// se buscan sus UUID en el catálogo público; si el nombre no es único, no se reprograma desde aquí.
export function resolveBookingIds(catalog: PublicCatalog, booking: PublicBookingView): { locationUuid: string; serviceUuids: string[] } {
  const locs = catalog.locations.filter(l => normName(l.name) === normName(booking.location));
  if (locs.length !== 1) throw new Error(NOT_MATCHED);
  const serviceUuids = booking.segments.map(seg => {
    const matches = catalog.services.filter(s => normName(s.name) === normName(seg.service));
    if (matches.length !== 1) throw new Error(NOT_MATCHED);
    return matches[0].id;
  });
  return { locationUuid: locs[0].id, serviceUuids: Array.from(new Set(serviceUuids)) };
}

// ---------- Validaciones previas al envío (no reemplazan las de la base) ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function validateAppointmentInput(input: { date: string; today: string; slotStart: string | null; name: string; phone: string }): string | null {
  if (!DATE_RE.test(input.date)) return 'Elegí una fecha válida.';
  if (input.date < input.today) return 'No se pueden crear turnos en fechas pasadas.';
  if (!input.slotStart) return 'Elegí un horario disponible.';
  if (!input.name.trim()) return 'Indicá el nombre del cliente.';
  if (!input.phone.trim()) return 'Indicá el teléfono del cliente.';
  return null;
}

export function validateBlockInput(input: { date: string; today: string; startTime: string; endTime: string }): string | null {
  if (!DATE_RE.test(input.date)) return 'Elegí una fecha válida.';
  if (input.date < input.today) return 'No se pueden bloquear fechas pasadas.';
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) return 'Indicá el horario de inicio y de fin.';
  if (toMinutes(input.endTime) <= toMinutes(input.startTime)) return 'La hora de fin debe ser posterior a la de inicio.';
  return null;
}

export function validateLookupInput(code: string, phone: string): string | null {
  if (!code.trim() || !phone.trim()) return 'Ingresá el código de reserva y el teléfono con el que reservaste.';
  return null;
}
