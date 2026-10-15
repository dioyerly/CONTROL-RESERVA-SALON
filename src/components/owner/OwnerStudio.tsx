import React, { useState, useEffect } from 'react';
import {
  BusinessConfig,
  Appointment,
  AgendaBlock,
  AppointmentStatus,
  Professional,
  Service,
  Resource,
  OwnerNotification
} from '../../types';
import { NewAppointmentModal } from './NewAppointmentModal';
import { ServiceEditModal } from './ServiceEditModal';
import { StaffEditModal } from './StaffEditModal';
import { ResourceEditModal } from './ResourceEditModal';
import { ScheduleEditModal } from './ScheduleEditModal';
import { VisualCalendarView } from './VisualCalendarView';
import { ImportLocalConfigModal } from './ImportLocalConfigModal';
import type { BusinessSettingsInput } from '../../services/ownerCatalog';
import { createInFlightRunner } from '../../services/inFlight';
import { 
  saveAppointment, 
  updateAppointmentStatus, 
  removeAgendaBlock,
  saveBusinessConfig,
  resetAllData,
  getStoredCounts,
  clearBusinessAgenda,
  getOwnerNotifications,
  markNotificationRead
} from '../../services/storage';
import { formatCurrency } from '../../services/pricingEngine';
import { formatDateIso } from '../../services/availabilityEngine';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  User, 
  MapPin, 
  Sparkles, 
  Filter, 
  Search, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  Trash2,
  Bell
} from 'lucide-react';

interface OwnerStudioProps {
  business: BusinessConfig;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  onRefresh: () => void;
  // Cambia el estado en Supabase. Solo resuelve si la base confirmó el cambio.
  onChangeAppointmentStatus: (aptId: string, status: AppointmentStatus) => Promise<void>;
  // Servicios en Supabase. Si no se pasan, los servicios se guardan en localStorage.
  onSaveService?: (service: Service) => Promise<void>;
  onDeleteService?: (serviceId: string) => Promise<void>;
  // Equipo y horarios en Supabase
  onSaveStaff?: (staff: Professional) => Promise<void>;
  onDeleteStaff?: (staffId: string) => Promise<void>;
  onSaveSchedule?: (hours: BusinessConfig['weeklyBusinessHours'], holidays: string[]) => Promise<void>;
  // Recursos, bloqueos (quitar) y ajustes en Supabase
  onSaveResource?: (resource: Resource) => Promise<void>;
  onDeleteResource?: (resourceId: string) => Promise<void>;
  onSaveSettings?: (settings: BusinessSettingsInput) => Promise<void>;
  onDeleteBlock?: (blockId: string) => Promise<void>;
  // Estudio conectado a Supabase: las secciones sin conexión no guardan nada en el navegador
  remoteConfig?: boolean;
}

const NOT_CONNECTED_MESSAGE = 'Esta sección todavía no está conectada a la base. Los cambios no se guardan aquí.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Clave de guardado: un registro nuevo usa una sola clave aunque el modal genere un ID distinto en cada envío
const saveKey = (prefix: string, id: string) => `${prefix}:${UUID_RE.test(id) ? id : 'new'}`;

type StudioTab = 'agenda' | 'servicios' | 'equipo' | 'horarios' | 'recursos' | 'clientes' | 'ajustes';
type AgendaViewMode = 'day' | 'week' | 'staff' | 'location';

export const OwnerStudio: React.FC<OwnerStudioProps> = ({
  business,
  appointments,
  agendaBlocks,
  onChangeAppointmentStatus,
  onSaveService,
  onDeleteService,
  onSaveStaff,
  onDeleteStaff,
  onSaveSchedule,
  onSaveResource,
  onDeleteResource,
  onSaveSettings,
  onDeleteBlock,
  remoteConfig,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('agenda');
  const [agendaView, setAgendaView] = useState<AgendaViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateIso(new Date()));

  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedAppointmentForDetail, setSelectedAppointmentForDetail] = useState<Appointment | null>(null);

  // Service CRUD state
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<Service | null>(null);

  // Staff CRUD state
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffToEdit, setStaffToEdit] = useState<Professional | null>(null);

  // Resource CRUD state
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [resourceToEdit, setResourceToEdit] = useState<Resource | null>(null);

  // Schedule CRUD state
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Guardados en curso: un doble clic o un reintento no repite la operación y el botón muestra "Guardando…"
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [saveRunner] = useState(() => createInFlightRunner(setSavingKeys));
  const isSaving = (prefix: string) => savingKeys.some(k => k.startsWith(prefix));

  // Importación de la configuración guardada en este navegador
  const [showImport, setShowImport] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [showNotificationsTray, setShowNotificationsTray] = useState(false);

  useEffect(() => {
    setNotifications(getOwnerNotifications(business.id));
  }, [business.id, appointments]);

  // Business settings state (for Ajustes tab). Solo contiene los campos que edita Ajustes:
  // así al guardar no se reescriben servicios, empleados o horarios con una copia vieja.
  type SettingsForm = Pick<BusinessConfig, 'name' | 'mode' | 'pricingDisplayMode' | 'slotIntervalMinutes' | 'minAdvanceNoticeHours'>;
  const pickSettings = (biz: BusinessConfig): SettingsForm => ({
    name: biz.name,
    mode: biz.mode,
    pricingDisplayMode: biz.pricingDisplayMode,
    slotIntervalMinutes: biz.slotIntervalMinutes,
    minAdvanceNoticeHours: biz.minAdvanceNoticeHours
  });
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(() => pickSettings(business));

  // Resincroniza solo al cambiar de negocio, sin pisar cambios no guardados de Ajustes
  useEffect(() => {
    setSettingsForm(pickSettings(business));
  }, [business.id]);

  const handleSaveService = async (service: Service) => {
    if (onSaveService) {
      try {
        await onSaveService(service);
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowServiceModal(false);
      setServiceToEdit(null);
      onRefresh();
      return;
    }
    const existingIdx = business.services.findIndex(s => s.id === service.id);
    let updatedServices: Service[];
    if (existingIdx >= 0) {
      updatedServices = [...business.services];
      updatedServices[existingIdx] = service;
    } else {
      updatedServices = [...business.services, service];
    }
    const updatedBiz: BusinessConfig = {
      ...business,
      services: updatedServices
    };
    saveBusinessConfig(updatedBiz);
    setShowServiceModal(false);
    setServiceToEdit(null);
    onRefresh();
  };

  const handleDeleteService = async (serviceId: string) => {
    if (onDeleteService) {
      try {
        await onDeleteService(serviceId);
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowServiceModal(false);
      setServiceToEdit(null);
      onRefresh();
      return;
    }
    const updatedServices = business.services.filter(s => s.id !== serviceId);
    const updatedBiz: BusinessConfig = {
      ...business,
      services: updatedServices
    };
    saveBusinessConfig(updatedBiz);
    setShowServiceModal(false);
    setServiceToEdit(null);
    onRefresh();
  };

  const handleSaveStaff = async (staff: Professional) => {
    if (onSaveStaff) {
      try {
        const ran = await saveRunner.run(saveKey('staff', staff.id), () => onSaveStaff(staff));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowStaffModal(false);
      setStaffToEdit(null);
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    const existingIdx = business.professionals.findIndex(p => p.id === staff.id);
    let updatedStaff: Professional[];
    if (existingIdx >= 0) {
      updatedStaff = [...business.professionals];
      updatedStaff[existingIdx] = staff;
    } else {
      updatedStaff = [...business.professionals, staff];
    }
    const updatedBiz: BusinessConfig = {
      ...business,
      professionals: updatedStaff
    };
    saveBusinessConfig(updatedBiz);
    setShowStaffModal(false);
    setStaffToEdit(null);
    onRefresh();
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (onDeleteStaff) {
      try {
        const ran = await saveRunner.run(`staff-del:${staffId}`, () => onDeleteStaff(staffId));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowStaffModal(false);
      setStaffToEdit(null);
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    const updatedStaff = business.professionals.filter(p => p.id !== staffId);
    const updatedBiz: BusinessConfig = {
      ...business,
      professionals: updatedStaff
    };
    saveBusinessConfig(updatedBiz);
    setShowStaffModal(false);
    setStaffToEdit(null);
    onRefresh();
  };

  const handleSaveResource = async (res: Resource) => {
    if (onSaveResource) {
      try {
        const ran = await saveRunner.run(saveKey('resource', res.id), () => onSaveResource(res));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowResourceModal(false);
      setResourceToEdit(null);
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    const existingIdx = business.resources.findIndex(r => r.id === res.id);
    let updatedRes: Resource[];
    if (existingIdx >= 0) {
      updatedRes = [...business.resources];
      updatedRes[existingIdx] = res;
    } else {
      updatedRes = [...business.resources, res];
    }
    const updatedBiz: BusinessConfig = {
      ...business,
      resources: updatedRes
    };
    saveBusinessConfig(updatedBiz);
    setShowResourceModal(false);
    setResourceToEdit(null);
    onRefresh();
  };

  const handleDeleteResource = async (resId: string) => {
    if (onDeleteResource) {
      try {
        const ran = await saveRunner.run(`resource-del:${resId}`, () => onDeleteResource(resId));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowResourceModal(false);
      setResourceToEdit(null);
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    const updatedRes = business.resources.filter(r => r.id !== resId);
    const updatedBiz: BusinessConfig = {
      ...business,
      resources: updatedRes
    };
    saveBusinessConfig(updatedBiz);
    setShowResourceModal(false);
    setResourceToEdit(null);
    onRefresh();
  };

  const handleSaveSchedule = async (
    updatedHours: BusinessConfig['weeklyBusinessHours'],
    holidays: string[]
  ) => {
    if (onSaveSchedule) {
      try {
        const ran = await saveRunner.run('schedule', () => onSaveSchedule(updatedHours, holidays));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      setShowScheduleModal(false);
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    const updatedBiz: BusinessConfig = {
      ...business,
      weeklyBusinessHours: updatedHours,
      holidaysAndVacations: holidays
    };
    saveBusinessConfig(updatedBiz);
    setShowScheduleModal(false);
    onRefresh();
  };

  // Filter appointments for the view
  const filteredAppointments = appointments.filter(apt => {
    if (agendaView === 'day' && apt.date !== selectedDate) return false;
    if (selectedLocationFilter !== 'all' && apt.locationId !== selectedLocationFilter) return false;
    if (selectedStaffFilter !== 'all') {
      const hasStaff = apt.segments.some(s => s.professionalId === selectedStaffFilter);
      if (!hasStaff) return false;
    }
    if (statusFilter !== 'all' && apt.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = apt.customer.name.toLowerCase().includes(q);
      const matchPhone = apt.customer.phone.toLowerCase().includes(q);
      const matchCode = apt.bookingCode.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCode) return false;
    }
    return true;
  });

  // Today's next appointment calculation
  const upcomingAppointments = appointments
    .filter(a => a.status === 'confirmed' && a.date >= selectedDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const nextAppointment = upcomingAppointments[0];

  const handleUpdateStatus = async (aptId: string, status: AppointmentStatus) => {
    try {
      await onChangeAppointmentStatus(aptId, status);
    } catch (err) {
      // Si Supabase no confirmó el cambio, la pantalla no se actualiza
      alert((err as Error).message);
      return;
    }
    if (selectedAppointmentForDetail && selectedAppointmentForDetail.id === aptId) {
      setSelectedAppointmentForDetail({ ...selectedAppointmentForDetail, status });
    }
    onRefresh();
  };

  // Turnos y bloqueos desde el Estudio: el formulario lee disponibilidad y guarda en Supabase
  const openNewAppointment = () => {
    if (!remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    setShowNewModal(true);
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (onDeleteBlock) {
      try {
        const ran = await saveRunner.run(`block:${blockId}`, () => onDeleteBlock(blockId));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    removeAgendaBlock(blockId);
    onRefresh();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveSettings) {
      try {
        const ran = await saveRunner.run('settings', () => onSaveSettings(settingsForm));
        if (!ran) return;
      } catch (err) {
        alert((err as Error).message);
        return;
      }
      alert('Configuración del negocio guardada exitosamente.');
      onRefresh();
      return;
    }
    if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
    // Partimos del negocio vigente y aplicamos solo los campos de Ajustes
    saveBusinessConfig({ ...business, ...settingsForm });
    alert('Configuración del negocio guardada exitosamente.');
    onRefresh();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
      {/* Studio Header: Minimal, refined, professional organization workspace */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E5DDD3]">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Estudio de Organización Profesional
          </span>
          <h2 className="font-brand text-3xl lg:text-4xl font-normal text-[#302C29]">
            {business.name}
          </h2>
          <div className="flex items-center gap-3 text-xs text-[#80766E] mt-1">
            <span>Modalidad: <strong className="text-[#302C29]">{business.mode === 'independent' ? 'Profesional Independiente' : 'Salón con Equipo'}</strong></span>
            <span>·</span>
            <span>Zona Horaria: <strong className="text-[#302C29]">{business.timezone}</strong></span>
          </div>
        </div>

        {/* Quick Action Buttons & Notifications */}
        <div className="flex items-center gap-3">
          {/* Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotificationsTray(!showNotificationsTray)}
              className="p-2.5 bg-white border border-[#E5DDD3] hover:border-[#302C29] rounded-lg text-[#302C29] relative transition-colors cursor-pointer"
              title="Notificaciones de turnos agendados por empleados"
            >
              <Bell className="w-4 h-4 text-[#B69A70]" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#CEAAA3] text-white text-[10px] font-bold flex items-center justify-center">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {showNotificationsTray && (
              <div className="absolute right-0 top-11 w-80 bg-white border border-[#E5DDD3] rounded-xl shadow-xl z-50 p-4 text-xs space-y-3">
                <div className="flex justify-between items-center border-b border-[#E5DDD3] pb-2 font-semibold text-[#302C29]">
                  <span>Notificaciones del Estudio</span>
                  <span className="text-[10px] text-[#80766E]">{notifications.length} registros</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <div className="text-[#80766E] py-4 text-center">Sin avisos pendientes</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                          n.read ? 'bg-[#FAF8F4] border-[#E5DDD3]/60 text-[#80766E]' : 'bg-white border-[#B69A70] text-[#302C29] font-medium shadow-2xs'
                        }`}
                      >
                        <div className="font-semibold">{n.title}</div>
                        <div className="text-[11px] mt-0.5">{n.message}</div>
                        <div className="text-[9px] text-[#80766E] mt-1">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={openNewAppointment}
            className="px-4 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Turno / Bloqueo</span>
          </button>
        </div>
      </div>

      {/* Primary Studio Navigation Bar */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto border-b border-[#E5DDD3] pt-3 pb-0 text-xs font-medium text-[#80766E] mb-8 scrollbar-none">
        {(['agenda', 'servicios', 'equipo', 'horarios', 'recursos', 'clientes', 'ajustes'] as StudioTab[]).map(tab => {
          const tabConfig: Record<StudioTab, { label: string; icon: string; badge?: string | number }> = {
            agenda: { label: 'Agenda & Calendario', icon: '📅' },
            servicios: { label: 'Servicios & Precios', icon: '✨', badge: business.services.length },
            equipo: { label: 'Equipo de Empleados', icon: '👥', badge: business.professionals.length },
            horarios: { label: 'Horarios Comerciales', icon: '⏰' },
            recursos: { label: 'Recursos Físicos', icon: '💺', badge: business.resources.length },
            clientes: { label: 'Clientes', icon: '📋' },
            ajustes: { label: 'Ajustes del Negocio', icon: '⚙️' }
          };
          const config = tabConfig[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-4 py-3 flex items-center gap-2 transition-all border-b-2 -mb-[1px] whitespace-nowrap cursor-pointer rounded-t-lg ${
                isActive
                  ? 'border-[#302C29] text-[#302C29] bg-white font-bold shadow-2xs'
                  : 'border-transparent text-[#80766E] hover:text-[#302C29] hover:bg-white/50'
              }`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
              {config.badge !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-[#302C29] text-white' : 'bg-[#E5DDD3] text-[#302C29]'
                }`}>
                  {config.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB: AGENDA */}
      {activeTab === 'agenda' && (
        <div className="space-y-6">
          {/* Top Priority Information Strip (Section 8: Prioridad de información) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Fecha actual & selector */}
            <div className="bg-white border border-[#E5DDD3] rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block">
                Fecha en pantalla
              </span>
              <div className="flex items-center justify-between mt-1">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="font-serif-editorial text-lg text-[#302C29] bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* 2. Próximo turno */}
            <div className="bg-white border border-[#E5DDD3] rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block">
                Próximo turno en agenda
              </span>
              {nextAppointment ? (
                <div className="mt-1">
                  <div className="text-sm font-semibold text-[#302C29] truncate">
                    {nextAppointment.startTime} hs · {nextAppointment.customer.name}
                  </div>
                  <div className="text-xs text-[#80766E] truncate">
                    {nextAppointment.segments.map(s => s.serviceName).join(', ')}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#80766E] mt-2">Sin turnos pendientes</div>
              )}
            </div>

            {/* 3. Profesionales disponibles */}
            <div className="bg-white border border-[#E5DDD3] rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block">
                Profesionales activos
              </span>
              <div className="flex items-center gap-1.5 mt-2">
                {business.professionals.map(p => (
                  <span
                    key={p.id}
                    title={`${p.name} (${p.role})`}
                    className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: p.color || '#B69A70' }}
                  >
                    {p.name.charAt(0)}
                  </span>
                ))}
                <span className="text-xs text-[#80766E] ml-1">
                  {business.professionals.length} en equipo
                </span>
              </div>
            </div>

            {/* 4. Resumen del día */}
            <div className="bg-white border border-[#E5DDD3] rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block">
                Citas para esta fecha
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold tabular-nums text-[#302C29]">
                  {filteredAppointments.length}
                </span>
                <span className="text-xs text-[#80766E]">
                  ({filteredAppointments.filter(a => a.status === 'confirmed').length} confirmadas)
                </span>
              </div>
            </div>
          </div>

          {/* Agenda Controls & Filters */}
          <div className="bg-white border border-[#E5DDD3] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Staff filter */}
              {business.professionals.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[#80766E]">Profesional:</span>
                  <select
                    value={selectedStaffFilter}
                    onChange={(e) => setSelectedStaffFilter(e.target.value)}
                    className="bg-[#FAF8F4] border border-[#E5DDD3] rounded px-2.5 py-1 text-xs text-[#302C29]"
                  >
                    <option value="all">Todos</option>
                    {business.professionals.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location filter */}
              {business.locations.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[#80766E]">Sede:</span>
                  <select
                    value={selectedLocationFilter}
                    onChange={(e) => setSelectedLocationFilter(e.target.value)}
                    className="bg-[#FAF8F4] border border-[#E5DDD3] rounded px-2.5 py-1 text-xs text-[#302C29]"
                  >
                    <option value="all">Todas</option>
                    {business.locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[#80766E]">Estado:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#FAF8F4] border border-[#E5DDD3] rounded px-2.5 py-1 text-xs text-[#302C29]"
                >
                  <option value="all">Todos los estados</option>
                  <option value="confirmed">Confirmados</option>
                  <option value="completed">Completados</option>
                  <option value="cancelled">Cancelados</option>
                  <option value="no_show">No asistió</option>
                </select>
              </div>
            </div>

            {/* Search and View Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#80766E] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente o código..."
                  className="pl-7 pr-3 py-1 rounded border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29] w-48 sm:w-56 focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                />
              </div>
            </div>
          </div>

          {/* Visual Google Calendar View */}
          <VisualCalendarView
            business={business}
            appointments={appointments}
            agendaBlocks={agendaBlocks}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSelectAppointment={(apt) => setSelectedAppointmentForDetail(apt)}
            onQuickNewAppointment={(date, startTime, profId) => {
              setSelectedDate(date);
              openNewAppointment();
            }}
          />

          {/* Agenda Appointments List / Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
            <div className="lg:col-span-8 space-y-3">
              {filteredAppointments.length === 0 ? (
                <div className="bg-white border border-[#E5DDD3] rounded-xl p-12 text-center text-sm text-[#80766E]">
                  No hay reservas programadas para este filtro o fecha.
                  <div className="mt-3">
                    <button
                      onClick={openNewAppointment}
                      className="text-xs font-semibold text-[#302C29] underline hover:text-[#B69A70]"
                    >
                      + Crear un turno manualmente
                    </button>
                  </div>
                </div>
              ) : (
                filteredAppointments.map(apt => {
                  const isSelected = selectedAppointmentForDetail?.id === apt.id;
                  return (
                    <div
                      key={apt.id}
                      onClick={() => setSelectedAppointmentForDetail(apt)}
                      className={`bg-white border rounded-xl p-4 sm:p-5 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isSelected
                          ? 'border-[#302C29] shadow-sm ring-1 ring-[#302C29]'
                          : 'border-[#E5DDD3] hover:border-[#B69A70]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-[#80766E]">
                            {apt.bookingCode}
                          </span>
                          <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${
                            apt.status === 'confirmed'
                              ? 'bg-[#A3B6A5]/20 text-[#302C29]'
                              : apt.status === 'completed'
                              ? 'bg-[#302C29] text-white'
                              : apt.status === 'cancelled'
                              ? 'bg-[#CEAAA3]/30 text-[#80766E] line-through'
                              : 'bg-[#F0EAE2] text-[#302C29]'
                          }`}>
                            {apt.status === 'confirmed' && 'Confirmado'}
                            {apt.status === 'completed' && 'Completado'}
                            {apt.status === 'cancelled' && 'Cancelado'}
                            {apt.status === 'no_show' && 'No asistió'}
                          </span>
                        </div>

                        <h4 className="font-serif-editorial text-lg font-medium text-[#302C29] mt-1">
                          {apt.customer.name}
                        </h4>

                        <div className="text-xs text-[#80766E] mt-0.5">
                          {apt.segments.map(s => `${s.serviceName} (${s.professionalName})`).join(' · ')}
                        </div>
                      </div>

                      <div className="sm:text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-[#302C29]">
                          {apt.startTime} - {apt.endTime} hs
                        </div>
                        <div className="text-xs text-[#80766E] mt-0.5">
                          {apt.totalDurationMinutes} min · {formatCurrency(apt.estimatedPrice)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Agenda Blocks list for this date */}
              {agendaBlocks.filter(b => b.date === selectedDate).length > 0 && (
                <div className="mt-8 pt-6 border-t border-[#E5DDD3]">
                  <span className="text-xs uppercase tracking-wider text-[#80766E] font-semibold block mb-3">
                    Bloqueos y Ausencias para esta fecha:
                  </span>
                  <div className="space-y-2">
                    {agendaBlocks.filter(b => b.date === selectedDate).map(block => {
                      const staff = business.professionals.find(p => p.id === block.professionalId);
                      return (
                        <div
                          key={block.id}
                          className="bg-[#FAF8F4] border border-[#E5DDD3] p-3 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-[#302C29]">
                              {block.startTime} a {block.endTime} hs: {block.reason}
                            </span>
                            <span className="text-[#80766E] block text-[11px]">
                              Afecta a: {staff ? staff.name : 'Todo el salón'} ({block.type})
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1.5 text-[#80766E] hover:text-[#CEAAA3] transition-colors cursor-pointer"
                            title="Eliminar bloqueo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Appointment Detail Sidebar */}
            <div className="lg:col-span-4">
              {selectedAppointmentForDetail ? (
                <div className="bg-white border border-[#E5DDD3] rounded-xl p-6 space-y-5 sticky top-20 shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
                    <div>
                      <span className="text-xs text-[#80766E] block">Detalle de Turno</span>
                      <span className="font-mono text-base font-bold text-[#302C29]">
                        {selectedAppointmentForDetail.bookingCode}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedAppointmentForDetail(null)}
                      className="text-[#80766E] hover:text-[#302C29] text-xs"
                    >
                      Cerrar
                    </button>
                  </div>

                  <div className="text-xs space-y-3">
                    <div>
                      <span className="text-[#80766E] block">Cliente:</span>
                      <strong className="text-sm font-semibold text-[#302C29]">
                        {selectedAppointmentForDetail.customer.name}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[#80766E] block">Contacto:</span>
                      <a 
                        href={`tel:${selectedAppointmentForDetail.customer.phone}`}
                        className="text-[#302C29] underline hover:text-[#B69A70]"
                      >
                        {selectedAppointmentForDetail.customer.phone}
                      </a>
                    </div>

                    <div>
                      <span className="text-[#80766E] block">Fecha y horario:</span>
                      <span className="font-semibold text-[#302C29] tabular-nums">
                        {selectedAppointmentForDetail.date} · {selectedAppointmentForDetail.startTime} a {selectedAppointmentForDetail.endTime} hs
                      </span>
                    </div>

                    <div>
                      <span className="text-[#80766E] block">Servicios y asignación:</span>
                      <div className="mt-1 space-y-1">
                        {selectedAppointmentForDetail.segments.map((seg, idx) => (
                          <div key={idx} className="p-2 bg-[#FAF8F4] rounded border border-[#E5DDD3]/60">
                            <div className="font-semibold text-[#302C29]">{seg.serviceName}</div>
                            <div className="text-[#80766E] text-[11px]">
                              {seg.professionalName} · {seg.startTime} a {seg.endTime}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedAppointmentForDetail.estimatedPrice > 0 && (
                      <div className="pt-2 border-t border-[#E5DDD3] flex justify-between items-center">
                        <span className="text-[#80766E]">Presupuesto:</span>
                        <strong className="text-sm text-[#302C29] tabular-nums">
                          {formatCurrency(selectedAppointmentForDetail.estimatedPrice)}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Operational status change buttons */}
                  <div className="pt-4 border-t border-[#E5DDD3] space-y-2 text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block">
                      Actualizar estado operativo:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedAppointmentForDetail.id, 'completed')}
                        className="p-2 bg-[#FAF8F4] hover:bg-[#302C29] hover:text-white border border-[#E5DDD3] rounded text-center transition-colors font-medium cursor-pointer"
                      >
                        Marcar Asistió / Finalizado
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedAppointmentForDetail.id, 'no_show')}
                        className="p-2 bg-[#FAF8F4] hover:bg-[#FAF8F4] text-[#80766E] border border-[#E5DDD3] rounded text-center transition-colors font-medium cursor-pointer"
                      >
                        Marcar No Asistió
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedAppointmentForDetail.id, 'confirmed')}
                        className="p-2 bg-[#FAF8F4] hover:bg-[#FAF8F4] text-[#302C29] border border-[#E5DDD3] rounded text-center transition-colors font-medium cursor-pointer"
                      >
                        Confirmado
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedAppointmentForDetail.id, 'cancelled')}
                        className="p-2 bg-[#FAF8F4] hover:bg-[#FAF8F4] text-[#CEAAA3] border border-[#E5DDD3] rounded text-center transition-colors font-medium cursor-pointer"
                      >
                        Cancelar Turno
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#FAF8F4] border border-[#E5DDD3] rounded-xl p-6 text-center text-xs text-[#80766E]">
                  Selecciona una reserva del listado para gestionar su estado, datos de contacto o notas internas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: SERVICIOS */}
      {activeTab === 'servicios' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
            <div>
              <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
                Catálogo de Servicios y Reglas
              </h3>
              <p className="text-xs text-[#80766E]">
                Configuración de duraciones, tiempos de preparación/limpieza, recursos y simultaneidad autorizada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setServiceToEdit(null);
                setShowServiceModal(true);
              }}
              className="px-4 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Añadir Nuevo Servicio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {business.services.map(s => (
              <div key={s.id} className="bg-white border border-[#E5DDD3] rounded-xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="font-serif-editorial text-lg font-medium text-[#302C29]">
                      {s.name}
                    </h4>
                    {s.price && (
                      <span className="font-semibold text-xs tabular-nums text-[#302C29]">
                        {formatCurrency(s.price)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#80766E] line-clamp-2 mt-1">{s.description}</p>
                  <div className="pt-2 mt-2 border-t border-[#E5DDD3]/60 text-xs text-[#80766E] space-y-1">
                    <div>Duración: <strong className="text-[#302C29]">{s.durationMinutes} min</strong></div>
                    <div>Buffer limpieza: <strong className="text-[#302C29]">+{s.bufferCleanupMinutes} min</strong></div>
                    <div>Recursos: <strong className="text-[#302C29]">{s.requiredResourceTypes.join(', ') || 'General'}</strong></div>
                    <div>Simultaneidad autorizada: <strong className="text-[#302C29]">{s.allowSimultaneous ? 'Sí (según regla)' : 'No'}</strong></div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E5DDD3]/40 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setServiceToEdit(s);
                      setShowServiceModal(true);
                    }}
                    className="text-xs text-[#302C29] hover:text-[#B69A70] font-semibold underline cursor-pointer"
                  >
                    Editar Servicio
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bundles section */}
          {business.bundlePricingRules.length > 0 && (
            <div className="pt-8 border-t border-[#E5DDD3]">
              <h4 className="font-serif-editorial text-xl font-normal text-[#302C29] mb-3">
                Combos y Precios Combinados Configurados
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {business.bundlePricingRules.map(bundle => (
                  <div key={bundle.id} className="bg-white border border-[#E5DDD3] p-4 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between items-center font-semibold text-[#302C29]">
                      <span>{bundle.name}</span>
                      <span className="tabular-nums text-sm">{formatCurrency(bundle.bundlePrice)}</span>
                    </div>
                    <p className="text-[#80766E]">{bundle.description}</p>
                    <div className="text-[11px] text-[#B69A70] pt-1">
                      Servicios incluidos: {bundle.serviceIds.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: EQUIPO */}
      {activeTab === 'equipo' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
            <div>
              <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
                Equipo Profesional y Especialidades
              </h3>
              <p className="text-xs text-[#80766E]">
                Añade o edita empleados, configura sus horarios semanales individuales, pausas y PIN del portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStaffToEdit(null);
                setShowStaffModal(true);
              }}
              className="px-4 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Añadir Profesional / Empleado</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {business.professionals.map(prof => (
              <div key={prof.id} className="bg-white border border-[#E5DDD3] rounded-xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: prof.color }}
                    >
                      {prof.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-serif-editorial text-lg font-medium text-[#302C29]">
                        {prof.name}
                      </h4>
                      <span className="text-xs text-[#80766E]">{prof.role}</span>
                    </div>
                  </div>

                  <div className="text-xs text-[#80766E] space-y-1 pt-3 mt-3 border-t border-[#E5DDD3]/60">
                    <div>Correo: <strong className="text-[#302C29]">{prof.email}</strong></div>
                    <div>PIN portal: <strong className="font-mono text-[#302C29]">{prof.pin}</strong></div>
                    <div>Sedes: <strong className="text-[#302C29]">{prof.locationIds.join(', ')}</strong></div>
                    <div>Servicios habilitados: <strong className="text-[#302C29]">{prof.enabledServiceIds.join(', ')}</strong></div>
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-[#E5DDD3]/40 flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStaffToEdit(prof);
                      setShowStaffModal(true);
                    }}
                    className="text-[#302C29] hover:text-[#B69A70] font-semibold underline cursor-pointer"
                  >
                    Editar Horarios & Especialidades
                  </button>
                  {business.professionals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${prof.name} del equipo?`)) {
                          handleDeleteStaff(prof.id);
                        }
                      }}
                      className="text-[#CEAAA3] hover:text-red-700 cursor-pointer p-1"
                      title="Eliminar profesional"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: RECURSOS */}
      {activeTab === 'recursos' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
            <div>
              <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
                Recursos Físicos e Infraestructura
              </h3>
              <p className="text-xs text-[#80766E]">
                Configura cabinas, camillas, puestos y estaciones para evitar que se reserven más turnos que la capacidad real.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResourceToEdit(null);
                setShowResourceModal(true);
              }}
              className="px-4 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Añadir Nuevo Recurso</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {business.resources.map(res => (
              <div key={res.id} className="bg-white border border-[#E5DDD3] rounded-xl p-5 text-xs space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium">
                      Tipo: {res.type}
                    </span>
                    <span className="px-2 py-0.5 bg-[#FAF8F4] border border-[#E5DDD3] rounded font-bold tabular-nums">
                      {res.totalQuantity} {res.totalQuantity === 1 ? 'unidad' : 'unidades'}
                    </span>
                  </div>
                  <h4 className="font-serif-editorial text-base font-semibold text-[#302C29] mt-2">
                    {res.name}
                  </h4>
                  <p className="text-[#80766E] text-[11px] mt-1">
                    Capacidad simultánea máxima: {res.totalQuantity} cliente(s) a la vez. Sede: {res.locationId}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#E5DDD3]/40 flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setResourceToEdit(res);
                      setShowResourceModal(true);
                    }}
                    className="text-[#302C29] hover:text-[#B69A70] font-semibold underline cursor-pointer"
                  >
                    Editar Recurso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar recurso ${res.name}?`)) {
                        handleDeleteResource(res.id);
                      }
                    }}
                    className="text-[#CEAAA3] hover:text-red-700 cursor-pointer p-1"
                    title="Eliminar recurso"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: HORARIOS */}
      {activeTab === 'horarios' && (
        <div className="bg-white border border-[#E5DDD3] rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
            <div>
              <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
                Horarios Comerciales y Días de Atención
              </h3>
              <p className="text-xs text-[#80766E]">
                Configura los horarios de apertura y cierre (ej. 07:00 a 19:00), días laborables y feriados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <span>✏️ Modificar Horarios Comerciales y Feriados</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 text-xs border border-[#E5DDD3] rounded-xl p-4 bg-[#FAF8F4]/50">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block mb-2">
                Horario Semanal
              </span>
              {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dayName, idx) => {
                const schedule = business.weeklyBusinessHours[idx];
                return (
                  <div key={dayName} className="flex justify-between items-center py-1.5 border-b border-[#E5DDD3]/40 last:border-none">
                    <span className="font-semibold text-[#302C29] w-28">{dayName}</span>
                    {schedule ? (
                      <span className="tabular-nums text-[#302C29] font-medium">
                        {schedule.start} a {schedule.end} hs
                      </span>
                    ) : (
                      <span className="text-[#CEAAA3] font-medium">Cerrado</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 text-xs border border-[#E5DDD3] rounded-xl p-4 bg-[#FAF8F4]/50">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block">
                Feriados y Días No Laborables
              </span>
              <div className="flex flex-wrap gap-2">
                {business.holidaysAndVacations.map(h => (
                  <span key={h} className="px-2.5 py-1 bg-white border border-[#E5DDD3] rounded text-[#302C29] font-mono text-[11px]">
                    {h}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#80766E] leading-relaxed">
                Durante estas fechas el motor de disponibilidad bloquea automáticamente las reservas para clientes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CLIENTES */}
      {activeTab === 'clientes' && (
        <div className="bg-white border border-[#E5DDD3] rounded-xl p-6 space-y-4">
          <div className="pb-3 border-b border-[#E5DDD3]">
            <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
              Directorio de Clientes
            </h3>
            <p className="text-xs text-[#80766E]">
              Historial de visitas y datos de contacto de las personas que reservaron.
            </p>
          </div>

          <div className="divide-y divide-[#E5DDD3]/60 text-xs">
            {Array.from(new Set(appointments.map(a => a.customer.phone))).map(phone => {
              const clientApts = appointments.filter(a => a.customer.phone === phone);
              const latest = clientApts[0];
              return (
                <div key={phone} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-serif-editorial text-base font-semibold text-[#302C29]">
                      {latest.customer.name}
                    </h4>
                    <span className="text-[#80766E]">{phone} {latest.customer.email && `· ${latest.customer.email}`}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#302C29]">{clientApts.length}</span> turnos registrados
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: AJUSTES */}
      {activeTab === 'ajustes' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-[#E5DDD3] rounded-xl p-6 space-y-6 text-xs">
          <div className="pb-3 border-b border-[#E5DDD3]">
            <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
              Ajustes de Operación y Políticas
            </h3>
            <p className="text-xs text-[#80766E]">
              Modalidad del negocio, visualización de precios y ventanas de reserva.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Modalidad de trabajo</label>
              <select
                value={settingsForm.mode}
                onChange={(e) => setSettingsForm({ ...settingsForm, mode: e.target.value as BusinessConfig['mode'] })}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="independent">Trabajo independiente (solo yo)</option>
                <option value="salon_employees">Salón con empleados</option>
                <option value="multi_staff_capacity">Personal intercambiable por disponibilidad</option>
                <option value="multi_location">Trabajo en diferentes ubicaciones</option>
                <option value="home_visit">Atención a domicilio</option>
              </select>
              <span className="text-[11px] text-[#80766E] mt-1 block">
                Cambiar la modalidad no borra clientes, turnos, bloqueos ni equipo.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Visualización de Precios (Módulo 7)</label>
              <select
                value={settingsForm.pricingDisplayMode}
                onChange={(e) => setSettingsForm({ ...settingsForm, pricingDisplayMode: e.target.value as any })}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="approximate">Presupuesto estimado aproximado</option>
                <option value="indicative">Precios orientativos (Desde...)</option>
                <option value="consult">Precio a consultar</option>
                <option value="hidden">Ocultar todos los precios</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Intervalo de turnos (minutos)</label>
              <select
                value={settingsForm.slotIntervalMinutes}
                onChange={(e) => setSettingsForm({ ...settingsForm, slotIntervalMinutes: Number(e.target.value) })}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="15">Cada 15 minutos</option>
                <option value="30">Cada 30 minutos</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Anticipación mínima (horas)</label>
              <input
                type="number"
                value={settingsForm.minAdvanceNoticeHours}
                onChange={(e) => setSettingsForm({ ...settingsForm, minAdvanceNoticeHours: Number(e.target.value) })}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>
          </div>

          {remoteConfig && (
            <div className="pt-4 border-t border-[#E5DDD3] flex flex-wrap gap-3 justify-between items-center">
              <div>
                <span className="font-semibold text-[#302C29] block">Configuración guardada en este navegador</span>
                <span className="text-[11px] text-[#80766E]">
                  Podés revisar y copiar al negocio en la base las sedes, servicios, equipo, recursos, horarios y bloqueos de aquí.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="px-4 py-2.5 border border-[#E5DDD3] text-[#302C29] hover:border-[#302C29] rounded-lg cursor-pointer"
              >
                Revisar e importar
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-[#E5DDD3] flex flex-wrap gap-3 justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
                  const c = getStoredCounts();
                  const summary =
                    `Esto borra TODOS los datos guardados en este navegador, de todos los negocios:\n` +
                    `- ${c.businesses} negocio(s) con sus servicios, equipo, recursos y horarios\n` +
                    `- ${c.appointments} turno(s) y clientes\n` +
                    `- ${c.blocks} bloqueo(s) de agenda\n` +
                    `- ${c.notifications} aviso(s)\n\n` +
                    `No se puede deshacer. Para confirmar, escribe BORRAR:`;
                  const typed = window.prompt(summary, '');
                  if (typed === 'BORRAR') {
                    resetAllData();
                    onRefresh();
                  } else if (typed !== null) {
                    alert('No se borró nada. Debes escribir BORRAR exactamente.');
                  }
                }}
                className="text-xs text-[#80766E] hover:underline cursor-pointer"
              >
                Borrar todos los datos guardados en este navegador
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  if (remoteConfig) { alert(NOT_CONNECTED_MESSAGE); return; }
                  if (confirm(`¿Vaciar la agenda de "${business.name}"? Se eliminan sus turnos, bloqueos y avisos. Servicios, equipo y horarios se conservan.`)) {
                    clearBusinessAgenda(business.id);
                    onRefresh();
                    alert('Agenda en blanco. Puedes seguir cargando tus turnos desde el Estudio.');
                  }
                }}
                className="text-xs text-[#B69A70] font-semibold hover:underline cursor-pointer"
              >
                Comenzar desde cero (Agenda limpia)
              </button>
            </div>

            <button
              type="submit"
              disabled={isSaving('settings')}
              className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg shadow-xs cursor-pointer disabled:opacity-60"
            >
              {isSaving('settings') ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}

      {/* New Appointment / Block Modal */}
      {showNewModal && (
        <NewAppointmentModal
          business={business}
          appointments={appointments}
          agendaBlocks={agendaBlocks}
          defaultDate={selectedDate}
          remoteBusinessUuid={remoteConfig ? business.id : undefined}
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            setShowNewModal(false);
            onRefresh();
          }}
        />
      )}

      {/* Service Edit / Creation Modal */}
      {showServiceModal && (
        <ServiceEditModal
          business={business}
          serviceToEdit={serviceToEdit}
          onClose={() => {
            setShowServiceModal(false);
            setServiceToEdit(null);
          }}
          onSave={handleSaveService}
          onDelete={handleDeleteService}
        />
      )}

      {/* Staff Edit / Creation Modal */}
      {showStaffModal && (
        <StaffEditModal
          business={business}
          staffToEdit={staffToEdit}
          onClose={() => {
            setShowStaffModal(false);
            setStaffToEdit(null);
          }}
          onSave={handleSaveStaff}
          onDelete={handleDeleteStaff}
          saving={isSaving('staff:') || isSaving('staff-del:')}
        />
      )}

      {/* Resource Edit / Creation Modal */}
      {showResourceModal && (
        <ResourceEditModal
          business={business}
          resourceToEdit={resourceToEdit}
          onClose={() => {
            setShowResourceModal(false);
            setResourceToEdit(null);
          }}
          onSave={handleSaveResource}
          onDelete={handleDeleteResource}
          saving={isSaving('resource:') || isSaving('resource-del:')}
        />
      )}

      {/* Schedule Edit Modal */}
      {showScheduleModal && (
        <ScheduleEditModal
          business={business}
          onClose={() => setShowScheduleModal(false)}
          onSave={handleSaveSchedule}
          saving={isSaving('schedule')}
        />
      )}

      {/* Importación desde este navegador: solo con el Estudio conectado */}
      {showImport && remoteConfig && (
        <ImportLocalConfigModal
          remote={business}
          remoteBlocks={agendaBlocks}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); onRefresh(); }}
        />
      )}
    </div>
  );
};
