export type BusinessMode = 
  | 'independent'           // Trabajo de manera independiente
  | 'salon_employees'       // Salón con empleados
  | 'multi_staff_capacity'  // Varios profesionales por disponibilidad / orden de llegada
  | 'multi_location'        // Diferentes ubicaciones
  | 'home_visit';           // Atiendo a domicilio

export type PricingDisplayMode = 
  | 'approximate'   // Presupuesto estimado / aproximado
  | 'indicative'    // Precios orientativos "Desde..."
  | 'consult'       // "Precio a consultar"
  | 'hidden';       // Ocultar todos los precios

export interface Location {
  id: string;
  name: string;
  address: string;
  isMain: boolean;
  transitMinutesToLocation?: Record<string, number>; // Time in min to travel to other location IDs
}

export interface Resource {
  id: string;
  name: string;
  type: 'cabina' | 'camilla' | 'puesto_manicura' | 'lavacabezas' | 'estacion_corte';
  totalQuantity: number;
  locationId: string;
}

export interface DaySchedule {
  start: string; // "09:00"
  end: string;   // "19:00"
  breaks: { start: string; end: string; title: string }[];
}

export interface Professional {
  id: string;
  name: string;
  role: string;
  email: string;
  pin: string; // 4-digit PIN for employee portal
  avatarUrl?: string;
  enabledServiceIds: string[]; // Or ['*'] for all
  locationIds: string[];
  weeklySchedule: {
    [dayOfWeek: number]: DaySchedule | null; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  };
  canManageOwnBreaks: boolean;
  color: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  order: number;
}

export interface Service {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  imageUrl?: string; // Foto chica del servicio (data URL, reducida al cargarla)
  durationMinutes: number;
  bufferCleanupMinutes: number; // Tiempo de preparación/limpieza post-servicio
  minAdvanceHours: number;
  price: number | null;
  priceType: 'fixed' | 'starting_at' | 'consult';
  enabledProfessionalIds: string[]; // Array of prof IDs, or ['*'] for any
  requiredResourceTypes: string[];  // e.g. ['cabina'] or ['camilla'] or ['puesto_manicura']
  locationIds: string[];
  allowSimultaneous: boolean;       // Puede realizarse al mismo tiempo si hay regla configurada
  requiresConsultation: boolean;
  isOnlineBookingEnabled: boolean;
}

export interface SimultaneousRule {
  id: string;
  serviceAId: string;
  serviceBId: string;
  jointDurationMinutes: number; // e.g. 90m total joint duration
  description: string;
  requiresDistinctStaff: boolean; // Must have 2 distinct staff members
  requiredResourceTypes: string[]; // Combined required resources
}

export interface BundlePricingRule {
  id: string;
  name: string;
  serviceIds: string[]; // e.g. ['serv_corte', 'serv_secado']
  bundlePrice: number;
  priority: number;
  description: string;
}

export type AppointmentStatus = 
  | 'confirmed'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface AppointmentSegment {
  id: string;
  serviceId: string;
  serviceName: string;
  startTime: string; // "14:00"
  endTime: string;   // "15:15"
  durationMinutes: number;
  professionalId: string;
  professionalName: string;
  resourceIds: string[];
  status: 'scheduled' | 'in_service' | 'completed';
}

export interface CustomerData {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export interface Appointment {
  id: string;
  bookingCode: string; // e.g. "MAE-7821"
  businessId: string;
  customer: CustomerData;
  date: string; // YYYY-MM-DD
  startTime: string; // "14:00"
  endTime: string;   // "16:00"
  totalDurationMinutes: number;
  status: AppointmentStatus;
  segments: AppointmentSegment[];
  locationId: string;
  estimatedPrice: number;
  bundleAppliedName?: string;
  priceNote?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaBlock {
  id: string;
  businessId: string;
  professionalId?: string; // If undefined, blocks whole location/business
  locationId?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "13:00"
  endTime: string;   // "14:00"
  reason: string;
  type: 'break' | 'vacation' | 'maintenance' | 'personal';
}

export interface BusinessConfig {
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
  heroImage: string;
  pricingDisplayMode: PricingDisplayMode;
  slotIntervalMinutes: number; // 15 or 30 min
  minAdvanceNoticeHours: number;
  maxAdvanceDays: number;
  minBufferBetweenAppointments: number;
  timezone: string;
  cancellationPolicyHours: number;
  
  // Entities
  locations: Location[];
  resources: Resource[];
  categories: ServiceCategory[];
  services: Service[];
  professionals: Professional[];
  simultaneousRules: SimultaneousRule[];
  bundlePricingRules: BundlePricingRule[];
  weeklyBusinessHours: {
    [dayOfWeek: number]: DaySchedule | null;
  };
  holidaysAndVacations: string[]; // ["2026-12-25", "2026-01-01"]
  ownerCredentials?: {
    email: string;
    password: string;
  };
}

export interface OwnerNotification {
  id: string;
  businessId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  appointmentId?: string;
}

export interface CalculatedSlot {
  startTime: string;
  endTime: string;
  segmentsPlan: {
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    professionalId: string;
    professionalName: string;
    resourceIds: string[];
  }[];
  isSimultaneousCombo: boolean;
  period: 'morning' | 'midday' | 'afternoon';
}

export type DayAvailabilityLevel = 'high' | 'limited' | 'none' | 'closed';

export interface DayAvailabilitySummary {
  date: string;
  level: DayAvailabilityLevel;
  totalSlotsCount: number;
  isClosed: boolean;
  reason?: string;
}

export interface PricingEvaluation {
  items: {
    name: string;
    originalPrice: number;
    finalPrice: number;
    note?: string;
  }[];
  bundlesApplied: {
    name: string;
    savedAmount: number;
    bundlePrice: number;
  }[];
  totalPrice: number;
  displayMode: PricingDisplayMode;
  variableNote?: string;
}
