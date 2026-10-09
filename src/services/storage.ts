import { BusinessConfig, Appointment, AgendaBlock, OwnerNotification } from '../types';
import { 
  BUSINESS_SALON, 
  BUSINESS_INDEPENDENT, 
  INITIAL_APPOINTMENTS_SALON, 
  INITIAL_AGENDA_BLOCKS_SALON 
} from '../data/demoData';

const STORAGE_KEYS = {
  ACTIVE_BIZ_ID: 'maestro_active_biz_id',
  BUSINESSES: 'maestro_businesses_v2',
  APPOINTMENTS: 'maestro_appointments_v2',
  BLOCKS: 'maestro_agenda_blocks_v2',
  NOTIFICATIONS: 'maestro_notifications_v2',
  OWNER_AUTH: 'maestro_owner_logged_in',
  SYNC_VERSION: 'maestro_sync_ver'
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

// Memory lock for atomic operations to prevent race conditions
const atomicLocks = new Set<string>();

export async function acquireSlotLock(resourceKey: string, timeoutMs = 2500): Promise<boolean> {
  if (atomicLocks.has(resourceKey)) {
    return false;
  }
  atomicLocks.add(resourceKey);
  // Auto-release after timeout in case of failure
  setTimeout(() => {
    atomicLocks.delete(resourceKey);
  }, timeoutMs);
  return true;
}

export function releaseSlotLock(resourceKey: string): void {
  atomicLocks.delete(resourceKey);
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

// Initialize default store if empty
export function initStore(): void {
  const existingBusinesses = getJson<BusinessConfig[] | null>(STORAGE_KEYS.BUSINESSES, null);
  if (!existingBusinesses || existingBusinesses.length === 0) {
    setJson(STORAGE_KEYS.BUSINESSES, [BUSINESS_SALON, BUSINESS_INDEPENDENT]);
    setJson(STORAGE_KEYS.ACTIVE_BIZ_ID, BUSINESS_SALON.id);
    setJson(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS_SALON);
    setJson(STORAGE_KEYS.BLOCKS, INITIAL_AGENDA_BLOCKS_SALON);
  }
}

// Public API
export function getAllBusinesses(): BusinessConfig[] {
  initStore();
  return getJson<BusinessConfig[]>(STORAGE_KEYS.BUSINESSES, [BUSINESS_SALON, BUSINESS_INDEPENDENT]);
}

export function getActiveBusiness(): BusinessConfig {
  initStore();
  const activeId = getJson<string>(STORAGE_KEYS.ACTIVE_BIZ_ID, BUSINESS_SALON.id);
  const businesses = getAllBusinesses();
  const found = businesses.find(b => b.id === activeId);
  return found || businesses[0] || BUSINESS_SALON;
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
  initStore();
  const all = getJson<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
  if (!businessId) return all;
  return all.filter(a => a.businessId === businessId);
}

export function getAppointmentByCode(code: string): Appointment | null {
  const all = getAppointments();
  const cleanCode = code.trim().toUpperCase();
  return all.find(a => a.bookingCode.toUpperCase() === cleanCode || a.id === code) || null;
}

export function getAgendaBlocks(businessId?: string): AgendaBlock[] {
  initStore();
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
  initStore();
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

export function isOwnerLoggedIn(): boolean {
  return getJson<boolean>(STORAGE_KEYS.OWNER_AUTH, false);
}

export function setOwnerLoggedIn(val: boolean): void {
  setJson(STORAGE_KEYS.OWNER_AUTH, val);
  broadcastChange();
}

export function resetToDemo(): void {
  setJson(STORAGE_KEYS.BUSINESSES, [BUSINESS_SALON, BUSINESS_INDEPENDENT]);
  setJson(STORAGE_KEYS.ACTIVE_BIZ_ID, BUSINESS_SALON.id);
  setJson(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS_SALON);
  setJson(STORAGE_KEYS.BLOCKS, INITIAL_AGENDA_BLOCKS_SALON);
  setJson(STORAGE_KEYS.NOTIFICATIONS, []);
  broadcastChange();
}
