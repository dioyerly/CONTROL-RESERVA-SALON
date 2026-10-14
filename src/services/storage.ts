import { BusinessConfig, Appointment, AgendaBlock, OwnerNotification } from '../types';
import { isSamePhone } from './phone';

// Mismas claves que antes: los datos que ya cargaste siguen visibles en la app.
const STORAGE_KEYS = {
  ACTIVE_BIZ_ID: 'maestro_active_biz_id',
  BUSINESSES: 'maestro_businesses_v2',
  APPOINTMENTS: 'maestro_appointments_v2',
  BLOCKS: 'maestro_agenda_blocks_v2',
  NOTIFICATIONS: 'maestro_notifications_v2',
  OWNER_AUTH: 'maestro_owner_logged_in'
};

// Cross-tab real-time sync channel
let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel('maestro_booking_sync');
  }
} catch {
  // Fallback if BroadcastChannel is restricted in sandboxes
}

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

export const notifySubscribers = () => {
  listeners.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Error in storage subscriber', e);
    }
  });
};

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data?.type === 'STATE_CHANGED') {
      notifySubscribers();
    }
  };
}

export function subscribeToStore(cb: StorageListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function broadcastChange() {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'STATE_CHANGED', timestamp: Date.now() });
    } catch {
      // ignore
    }
  }
  notifySubscribers();
}

// Storage helpers
function getJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch (err) {
    console.warn(`Error reading localStorage key "${key}"`, err);
    return fallback;
  }
}

function setJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing localStorage key "${key}"`, err);
  }
}

// Public API. La app arranca vacía: no hay datos de ejemplo.
export function getAllBusinesses(): BusinessConfig[] {
  return getJson<BusinessConfig[]>(STORAGE_KEYS.BUSINESSES, []);
}

export function getActiveBusiness(): BusinessConfig | null {
  const activeId = getJson<string | null>(STORAGE_KEYS.ACTIVE_BIZ_ID, null);
  const businesses = getAllBusinesses();
  return businesses.find(b => b.id === activeId) || businesses[0] || null;
}

export function setActiveBusinessId(id: string): void {
  setJson(STORAGE_KEYS.ACTIVE_BIZ_ID, id);
  broadcastChange();
}

export function saveBusinessConfig(config: BusinessConfig): void {
  const businesses = getAllBusinesses();
  const idx = businesses.findIndex(b => b.id === config.id);
  let updated: BusinessConfig[];
  if (idx >= 0) {
    updated = [...businesses];
    updated[idx] = config;
  } else {
    updated = [...businesses, config];
  }
  setJson(STORAGE_KEYS.BUSINESSES, updated);
  broadcastChange();
}

export function getAppointments(businessId?: string): Appointment[] {
  const all = getJson<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
  if (!businessId) return all;
  return all.filter(a => a.businessId === businessId);
}

/**
 * Consulta pública de una reserva: exige código Y teléfono.
 * Devuelve null tanto si el código no existe como si el teléfono no coincide
 * (así no se puede saber cuál de los dos datos falló).
 *
 * Nota: esto reduce la exposición desde la pantalla. No es privacidad real:
 * los datos siguen en localStorage y la comparación ocurre en el navegador.
 * Eso requiere backend.
 */
export function findAppointmentForClient(code: string, phone: string): Appointment | null {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode || !phone.trim()) return null;
  const match = getAppointments().find(a => a.bookingCode.toUpperCase() === cleanCode);
  if (!match) return null;
  return isSamePhone(match.customer.phone, phone) ? match : null;
}

/**
 * Agenda para la pantalla pública: mismos horarios, servicios y profesionales,
 * pero sin nombres, teléfonos, emails ni notas de los clientes.
 */
export function getPublicOccupancy(businessId: string): Appointment[] {
  return getAppointments(businessId).map(a => ({
    ...a,
    bookingCode: '',
    customer: { name: '', phone: '' },
    internalNotes: undefined,
    priceNote: undefined
  }));
}

export function getAgendaBlocks(businessId?: string): AgendaBlock[] {
  const all = getJson<AgendaBlock[]>(STORAGE_KEYS.BLOCKS, []);
  if (!businessId) return all;
  return all.filter(b => b.businessId === businessId);
}

export function saveAppointment(appointment: Appointment): void {
  const all = getAppointments();
  const idx = all.findIndex(a => a.id === appointment.id);
  let updated: Appointment[];
  if (idx >= 0) {
    updated = [...all];
    updated[idx] = { ...appointment, updatedAt: new Date().toISOString() };
  } else {
    updated = [appointment, ...all];
  }
  setJson(STORAGE_KEYS.APPOINTMENTS, updated);
  broadcastChange();
}

export function updateAppointmentStatus(appointmentId: string, status: Appointment['status']): boolean {
  const all = getAppointments();
  const apt = all.find(a => a.id === appointmentId);
  if (!apt) return false;
  apt.status = status;
  apt.updatedAt = new Date().toISOString();
  saveAppointment(apt);
  return true;
}

export function addAgendaBlock(block: AgendaBlock): void {
  const all = getAgendaBlocks();
  const updated = [block, ...all];
  setJson(STORAGE_KEYS.BLOCKS, updated);
  broadcastChange();
}

export function removeAgendaBlock(blockId: string): void {
  const all = getAgendaBlocks();
  const updated = all.filter(b => b.id !== blockId);
  setJson(STORAGE_KEYS.BLOCKS, updated);
  broadcastChange();
}

export function getOwnerNotifications(businessId?: string): OwnerNotification[] {
  const all = getJson<OwnerNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  if (!businessId) return all;
  return all.filter(n => n.businessId === businessId);
}

export function addOwnerNotification(notification: OwnerNotification): void {
  const all = getOwnerNotifications();
  const updated = [notification, ...all];
  setJson(STORAGE_KEYS.NOTIFICATIONS, updated);
  broadcastChange();
}

export function markNotificationRead(notificationId: string): void {
  const all = getOwnerNotifications();
  const updated = all.map(n => n.id === notificationId ? { ...n, read: true } : n);
  setJson(STORAGE_KEYS.NOTIFICATIONS, updated);
  broadcastChange();
}

/**
 * Vacía la agenda (turnos, bloqueos y avisos) solo del negocio indicado.
 * La configuración del negocio (servicios, equipo, horarios) se conserva.
 */
export function clearBusinessAgenda(businessId: string): void {
  const appointments = getJson<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, [])
    .filter(a => a.businessId !== businessId);
  const blocks = getJson<AgendaBlock[]>(STORAGE_KEYS.BLOCKS, [])
    .filter(b => b.businessId !== businessId);
  const notifications = getJson<OwnerNotification[]>(STORAGE_KEYS.NOTIFICATIONS, [])
    .filter(n => n.businessId !== businessId);

  setJson(STORAGE_KEYS.APPOINTMENTS, appointments);
  setJson(STORAGE_KEYS.BLOCKS, blocks);
  setJson(STORAGE_KEYS.NOTIFICATIONS, notifications);
  broadcastChange();
}

/** Cuántos registros hay guardados en este navegador, de todos los negocios (para la confirmación). */
export function getStoredCounts(): { businesses: number; appointments: number; blocks: number; notifications: number } {
  return {
    businesses: getAllBusinesses().length,
    appointments: getAppointments().length,
    blocks: getAgendaBlocks().length,
    notifications: getOwnerNotifications().length
  };
}

/** Borra absolutamente todo lo guardado en este navegador, de todos los negocios: negocios, turnos, bloqueos y avisos. */
export function resetAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  });
  broadcastChange();
}
