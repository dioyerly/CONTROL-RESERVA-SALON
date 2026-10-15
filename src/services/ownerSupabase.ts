import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { describeRpcError, hhmm } from './supabaseBooking';
import { Appointment, AppointmentSegment, AppointmentStatus } from '../types';

// Acceso del dueño con Supabase Auth. La contraseña no se guarda en el navegador:
// la librería mantiene la sesión (token) y la RLS limita lo que el dueño puede leer.

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase no está configurado en este navegador.');
  }
  return supabase;
}

export async function signInOwner(email: string, password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // No se distingue si falló el correo o la contraseña
    throw new Error('Correo o contraseña incorrectos.');
  }
}

export async function signOutOwner(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getOwnerSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(describeRpcError(error));
  return data.session;
}

export function onOwnerSessionChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// Negocio del dueño autenticado. La RLS (owner_business) devuelve solo sus negocios.
export async function fetchOwnerBusinessId(): Promise<string | null> {
  const client = requireClient();
  const { data, error } = await client.from('businesses').select('id').limit(1);
  if (error) throw new Error(describeRpcError(error));
  return (data && data[0]?.id) || null;
}

export type RemoteAppointmentRow = {
  id: string;
  booking_code: string;
  location_id: string;
  status: AppointmentStatus;
  customer_name: string;
  customer_phone: string;
  customer_notes: string | null;
  date: string;
  start_time: string;
  end_time: string;
  estimated_price: number | null;
  price_note: string | null;
  created_at: string;
  updated_at: string;
  appointment_private: { customer_email: string | null; internal_notes: string | null } | Array<{ customer_email: string | null; internal_notes: string | null }> | null;
  appointment_segments: Array<{
    id: string;
    service_id: string;
    professional_id: string;
    start_time: string;
    end_time: string;
    status: AppointmentSegment['status'];
    services: { name: string } | null;
    professionals: { name: string } | null;
  }>;
};

function toMinutes(time: string): number {
  const [h, m] = hhmm(time).split(':').map(Number);
  return h * 60 + m;
}

export function mapRemoteAppointment(row: RemoteAppointmentRow, localBusinessId: string): Appointment {
  const priv = Array.isArray(row.appointment_private) ? row.appointment_private[0] : row.appointment_private;
  return {
    id: row.id,
    bookingCode: row.booking_code,
    businessId: localBusinessId,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      email: priv?.customer_email ?? undefined,
      notes: row.customer_notes ?? undefined
    },
    date: row.date,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    totalDurationMinutes: toMinutes(row.end_time) - toMinutes(row.start_time),
    status: row.status,
    locationId: row.location_id,
    estimatedPrice: row.estimated_price ?? 0,
    priceNote: row.price_note ?? undefined,
    internalNotes: priv?.internal_notes ?? undefined,
    segments: (row.appointment_segments ?? []).map(seg => ({
      id: seg.id,
      serviceId: seg.service_id,
      serviceName: seg.services?.name ?? '',
      startTime: hhmm(seg.start_time),
      endTime: hhmm(seg.end_time),
      durationMinutes: toMinutes(seg.end_time) - toMinutes(seg.start_time),
      professionalId: seg.professional_id,
      professionalName: seg.professionals?.name ?? '',
      resourceIds: [],
      status: seg.status
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Turnos del negocio del dueño. Incluye datos privados (correo y notas internas) porque es el dueño quien consulta.
export async function fetchOwnerAppointments(businessUuid: string, localBusinessId: string): Promise<Appointment[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('appointments')
    .select(`
      id, booking_code, location_id, status, customer_name, customer_phone, customer_notes,
      date, start_time, end_time, estimated_price, price_note, created_at, updated_at,
      appointment_private ( customer_email, internal_notes ),
      appointment_segments ( id, service_id, professional_id, start_time, end_time, status,
                             services ( name ), professionals ( name ) )
    `)
    .eq('business_id', businessUuid)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw new Error(describeRpcError(error));
  return ((data ?? []) as unknown as RemoteAppointmentRow[]).map(row => mapRemoteAppointment(row, localBusinessId));
}

// Cambia el estado en Supabase. Solo se considera guardado si la base devuelve la fila actualizada.
export async function changeRemoteAppointmentStatus(
  appointmentId: string,
  businessUuid: string,
  status: AppointmentStatus
): Promise<void> {
  const client = requireClient();
  const { data, error } = await client
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('business_id', businessUuid)
    .select('id, status');
  if (error) throw new Error(describeRpcError(error));
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar el cambio. Revisá tu sesión e intentá nuevamente.');
  }
}

// ---------- Registro del dueño ----------

export interface SignUpResult {
  // true si Supabase exige confirmar el correo antes de iniciar sesión
  needsEmailConfirmation: boolean;
}

export async function signUpOwner(email: string, password: string): Promise<SignUpResult> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}/admin` }
  });
  if (error) {
    const msg = error.message ?? '';
    if (/already registered|already exists/i.test(msg)) {
      throw new Error('Ya existe una cuenta con ese correo. Iniciá sesión.');
    }
    if (/password/i.test(msg)) {
      throw new Error('La contraseña no cumple los requisitos (mínimo 6 caracteres, según la configuración del servidor).');
    }
    throw new Error('No pudimos crear la cuenta. Revisá los datos e intentá nuevamente.');
  }
  return { needsEmailConfirmation: !data.session };
}

// ---------- Alta del negocio desde la app ----------

export interface BusinessSetupInput {
  name: string;
  mode: 'independent' | 'salon_employees';
  address: string;
  phone: string;
  email: string;
  // Días de atención (0 = domingo … 6 = sábado) con apertura y cierre
  openDays: number[];
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
  categoryName: string;
  serviceName: string;
  serviceDescription: string;
  serviceMinutes: number;
  serviceBufferMinutes: number;
  servicePrice: number | null;
  professionalName: string;
}

export function validateBusinessSetup(input: BusinessSetupInput): string | null {
  if (!input.name.trim()) return 'Ingresá el nombre del negocio.';
  if (!input.address.trim()) return 'Ingresá la dirección.';
  if (!input.phone.trim()) return 'Ingresá un teléfono de contacto.';
  if (input.openDays.length === 0) return 'Elegí al menos un día de atención.';
  if (!/^\d{2}:\d{2}$/.test(input.openTime) || !/^\d{2}:\d{2}$/.test(input.closeTime)) return 'Revisá los horarios.';
  if (input.closeTime <= input.openTime) return 'El horario de cierre debe ser posterior a la apertura.';
  if (!input.categoryName.trim()) return 'Ingresá una categoría para el servicio.';
  if (!input.serviceName.trim()) return 'Ingresá el nombre del servicio.';
  if (!(input.serviceMinutes > 0)) return 'La duración del servicio debe ser mayor a cero.';
  if (input.serviceBufferMinutes < 0) return 'La limpieza no puede ser negativa.';
  if (!input.professionalName.trim()) return 'Ingresá el nombre del profesional que atiende.';
  return null;
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'negocio';
}

// Crea el negocio y su catálogo mínimo. Reanudable: si una parte ya existe, no la vuelve a crear.
// Sin una función atómica en la base, un fallo a mitad puede dejar datos parciales; al reintentar se completan.
export async function createOwnerBusiness(input: BusinessSetupInput): Promise<string> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Tu sesión venció. Iniciá sesión nuevamente.');
  const ownerId = userData.user.id;

  let businessId = await fetchOwnerBusinessId();
  if (!businessId) {
    const { data, error } = await client
      .from('businesses')
      .insert({
        owner_id: ownerId,
        name: input.name.trim(),
        slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`,
        mode: input.mode,
        address: input.address.trim(),
        phone: input.phone.trim(),
        whatsapp: input.phone.trim(),
        email: input.email.trim()
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(describeRpcError(error));
    businessId = data.id as string;
  }
  const biz = businessId;

  const count = async (table: string, filters: Record<string, string>) => {
    let q = client.from(table).select('*', { count: 'exact', head: true }).eq('business_id', biz);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { count: n, error } = await q;
    if (error) throw new Error(describeRpcError(error));
    return n ?? 0;
  };
  const check = (error: { message?: string } | null) => {
    if (error) throw new Error(describeRpcError(error));
  };

  // Sede principal
  let locationId: string | null = null;
  if ((await count('locations', {})) === 0) {
    const { data, error } = await client.from('locations')
      .insert({ business_id: biz, name: 'Sede principal', address: input.address.trim(), is_main: true })
      .select('id').single();
    check(error);
    locationId = data!.id as string;
  } else {
    const { data, error } = await client.from('locations').select('id').eq('business_id', biz).limit(1);
    check(error);
    locationId = data![0].id as string;
  }

  // Horarios del negocio
  if ((await count('business_hours', {})) === 0) {
    const rows = input.openDays.map(weekday => ({
      business_id: biz, weekday, start_time: input.openTime, end_time: input.closeTime
    }));
    const { error } = await client.from('business_hours').insert(rows);
    check(error);
  }

  // Categoría y servicio
  let categoryId: string | null = null;
  if ((await count('service_categories', {})) === 0) {
    const { data, error } = await client.from('service_categories')
      .insert({ business_id: biz, name: input.categoryName.trim(), sort_order: 1 })
      .select('id').single();
    check(error);
    categoryId = data!.id as string;
  } else {
    const { data, error } = await client.from('service_categories').select('id').eq('business_id', biz).limit(1);
    check(error);
    categoryId = data![0].id as string;
  }

  let serviceId: string | null = null;
  if ((await count('services', {})) === 0) {
    const { data, error } = await client.from('services')
      .insert({
        business_id: biz,
        category_id: categoryId,
        name: input.serviceName.trim(),
        description: input.serviceDescription.trim(),
        duration_minutes: input.serviceMinutes,
        buffer_minutes: input.serviceBufferMinutes,
        price: input.servicePrice,
        price_type: input.servicePrice === null ? 'consult' : 'fixed'
      })
      .select('id').single();
    check(error);
    serviceId = data!.id as string;
  } else {
    const { data, error } = await client.from('services').select('id').eq('business_id', biz).limit(1);
    check(error);
    serviceId = data![0].id as string;
  }

  await client.from('service_locations').upsert(
    { business_id: biz, service_id: serviceId, location_id: locationId },
    { onConflict: 'service_id,location_id', ignoreDuplicates: true }
  ).then(({ error }) => check(error));

  // Profesional y su jornada
  let professionalId: string | null = null;
  if ((await count('professionals', {})) === 0) {
    const { data, error } = await client.from('professionals')
      .insert({ business_id: biz, name: input.professionalName.trim(), role: 'Profesional' })
      .select('id').single();
    check(error);
    professionalId = data!.id as string;
  } else {
    const { data, error } = await client.from('professionals').select('id').eq('business_id', biz).limit(1);
    check(error);
    professionalId = data![0].id as string;
  }

  await client.from('professional_locations').upsert(
    { business_id: biz, professional_id: professionalId, location_id: locationId },
    { onConflict: 'professional_id,location_id', ignoreDuplicates: true }
  ).then(({ error }) => check(error));

  await client.from('professional_services').upsert(
    { business_id: biz, professional_id: professionalId, service_id: serviceId },
    { onConflict: 'professional_id,service_id', ignoreDuplicates: true }
  ).then(({ error }) => check(error));

  if ((await count('professional_hours', {})) === 0) {
    const rows = input.openDays.map(weekday => ({
      business_id: biz, professional_id: professionalId, weekday,
      start_time: input.openTime, end_time: input.closeTime
    }));
    const { error } = await client.from('professional_hours').insert(rows);
    check(error);
  }

  return biz;
}

// Datos de un negocio local para prefijar el asistente. Solo lectura: no se borra ni se modifica nada.
export function localBusinessPrefill(local: {
  name: string; address: string; phone: string; email: string;
  weeklyBusinessHours: Record<number, { start: string; end: string } | null>;
  categories: { name: string }[];
  services: { name: string; description: string; durationMinutes: number; bufferCleanupMinutes: number; price: number | null }[];
  professionals: { name: string }[];
} | null): Partial<BusinessSetupInput> | null {
  if (!local) return null;
  const openDays = Object.entries(local.weeklyBusinessHours)
    .filter(([, v]) => v !== null)
    .map(([k]) => Number(k));
  const first = Object.values(local.weeklyBusinessHours).find(v => v !== null) ?? null;
  const svc = local.services[0];
  return {
    name: local.name,
    address: local.address,
    phone: local.phone,
    email: local.email,
    openDays,
    openTime: first?.start ?? '09:00',
    closeTime: first?.end ?? '19:00',
    categoryName: local.categories[0]?.name ?? '',
    serviceName: svc?.name ?? '',
    serviceDescription: svc?.description ?? '',
    serviceMinutes: svc?.durationMinutes ?? 45,
    serviceBufferMinutes: svc?.bufferCleanupMinutes ?? 10,
    servicePrice: svc?.price ?? null,
    professionalName: local.professionals[0]?.name ?? ''
  };
}
