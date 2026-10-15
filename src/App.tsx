import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BusinessConfig, Appointment, AgendaBlock, Service, Professional, Resource } from './types';
import {
  getActiveBusiness,
  getAppointments,
  getPublicOccupancy,
  getAgendaBlocks,
  subscribeToStore
} from './services/storage';
import { Header, AppRoute } from './components/layout/Header';
import { CustomerBookingFlow } from './components/booking/CustomerBookingFlow';
import { RemoteSelfService } from './components/customer/RemoteSelfService';
import { OwnerStudio } from './components/owner/OwnerStudio';
import { OwnerLogin } from './components/owner/OwnerLogin';
import { EmployeePortal } from './components/employee/EmployeePortal';
import { RemoteSetupWizard } from './components/owner/RemoteSetupWizard';
import {
  fetchOwnerCatalog,
  saveRemoteService,
  deactivateRemoteService,
  saveRemoteProfessional,
  deactivateRemoteProfessional,
  saveRemoteBusinessSchedule,
  saveRemoteResource,
  deleteRemoteResource,
  saveRemoteBusinessSettings,
  fetchOwnerBlocks,
  deleteRemoteBlock,
  type BusinessSettingsInput
} from './services/ownerCatalog';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ShieldCheck } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import {
  getOwnerSession,
  onOwnerSessionChange,
  signOutOwner,
  fetchOwnerBusinessId,
  fetchOwnerAppointments,
  changeRemoteAppointmentStatus,
  localBusinessPrefill
} from './services/ownerSupabase';

// Cada rol tiene su propia dirección.
const PATH_BY_ROUTE: Record<AppRoute, string> = {
  client: '/',
  owner: '/admin',
  employee: '/equipo'
};

// Estado de la agenda del dueño leída desde Supabase
type RemoteAgenda = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'no_business';
  businessUuid: string | null;
  appointments: Appointment[];
  blocks: AgendaBlock[];
  error: string | null;
};
const EMPTY_AGENDA: RemoteAgenda = { status: 'idle', businessUuid: null, appointments: [], blocks: [], error: null };

function routeFromPath(pathname: string): AppRoute {
  if (pathname.startsWith('/admin')) return 'owner';
  if (pathname.startsWith('/equipo')) return 'employee';
  return 'client';
}

// Enlace público de reservas: /reservar/<uuid del negocio>
function publicBusinessUuidFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/reservar\/([0-9a-fA-F-]{36})\/?$/);
  return match ? match[1].toLowerCase() : null;
}

// Enlace de reservas del negocio, para copiarlo desde el Estudio
function OwnerPublicLink({ uuid }: { uuid: string }) {
  const url = `${window.location.origin}/reservar/${uuid}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-6 text-xs text-[#80766E] space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-[#302C29]">Enlace de reservas:</span>
        <a href={url} target="_blank" rel="noreferrer" className="underline break-all">{url}</a>
        <button type="button" onClick={copy} className="px-3 py-1 border border-[#E5DDD3] rounded-lg cursor-pointer hover:border-[#302C29]">
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p>
        Turnos, bloqueos, servicios, equipo, horarios, cierres, recursos y ajustes se guardan en la base.
        El portal del empleado (/equipo) todavía no está conectado.
      </p>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [clientSubView, setClientSubView] = useState<'booking' | 'self_service'>('booking');

  // Sin negocio cargado la app arranca vacía (no hay datos de ejemplo)
  const [activeBusiness, setActiveBusiness] = useState<BusinessConfig | null>(() => getActiveBusiness());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Agenda sin datos personales: es lo único que recibe la pantalla del cliente
  const [publicAppointments, setPublicAppointments] = useState<Appointment[]>([]);
  const [agendaBlocks, setAgendaBlocks] = useState<AgendaBlock[]>([]);
  // Sesión del dueño con Supabase Auth (la librería la mantiene; no se guarda la contraseña)
  const [ownerSession, setOwnerSession] = useState<Session | null>(null);
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [remoteAgenda, setRemoteAgenda] = useState<RemoteAgenda>(EMPTY_AGENDA);
  // Configuración del negocio del dueño, leída de Supabase (catálogo público)
  const [ownerBusiness, setOwnerBusiness] = useState<BusinessConfig | null>(null);
  const [selfServiceTargetCode, setSelfServiceTargetCode] = useState<string>('');

  const refreshData = useCallback(() => {
    const biz = getActiveBusiness();
    setActiveBusiness(biz);
    setAppointments(biz ? getAppointments(biz.id) : []);
    setPublicAppointments(biz ? getPublicOccupancy(biz.id) : []);
    setAgendaBlocks(biz ? getAgendaBlocks(biz.id) : []);
  }, []);

  useEffect(() => {
    refreshData();
    return subscribeToStore(refreshData);
  }, [refreshData]);

  // Navegación entre espacios por URL (atrás/adelante del navegador incluidos)
  const navigate = (next: AppRoute) => {
    window.history.pushState({}, '', PATH_BY_ROUTE[next]);
    setRoute(next);
  };

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Sesión del dueño: se consulta al cargar y se actualiza con cada cambio de sesión
  useEffect(() => {
    let cancelled = false;
    getOwnerSession()
      .then(s => { if (!cancelled) { setOwnerSession(s); setOwnerChecked(true); } })
      .catch(() => { if (!cancelled) setOwnerChecked(true); });
    const unsubscribe = onOwnerSessionChange(s => setOwnerSession(s));
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Agenda del dueño desde Supabase: negocio por owner_id (RLS) y turnos del negocio
  const loadRemoteAgenda = useCallback(async () => {
    setRemoteAgenda(prev => ({ ...prev, status: 'loading', error: null }));
    try {
      const uuid = await fetchOwnerBusinessId();
      if (!uuid) {
        setRemoteAgenda({ status: 'no_business', businessUuid: null, appointments: [], blocks: [], error: null });
        return;
      }
      const [list, blocks] = await Promise.all([
        fetchOwnerAppointments(uuid, uuid),
        fetchOwnerBlocks(uuid)
      ]);
      setRemoteAgenda({ status: 'ready', businessUuid: uuid, appointments: list, blocks, error: null });
    } catch (err) {
      setRemoteAgenda(prev => ({ ...prev, status: 'error', error: (err as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (route === 'owner' && ownerSession) {
      loadRemoteAgenda();
    }
  }, [route, ownerSession, loadRemoteAgenda]);

  // Configuración del negocio para el Estudio, leída de Supabase con la sesión del dueño
  const reloadOwnerConfig = useCallback(async () => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) return;
    try {
      setOwnerBusiness(await fetchOwnerCatalog(uuid));
    } catch {
      setOwnerBusiness(null);
    }
  }, [remoteAgenda.businessUuid]);

  useEffect(() => {
    if (!remoteAgenda.businessUuid) {
      setOwnerBusiness(null);
      return;
    }
    reloadOwnerConfig();
  }, [remoteAgenda.businessUuid, reloadOwnerConfig]);

  const handleBookingCompleted = (code: string) => {
    setSelfServiceTargetCode(code);
  };

  const handleGoToSelfService = (code: string) => {
    setSelfServiceTargetCode(code);
    setClientSubView('self_service');
  };

  // Al terminar el asistente, el negocio ya existe en Supabase: se recarga la agenda y la configuración
  const handleSetupDone = () => {
    loadRemoteAgenda();
  };

  const handleLogout = async () => {
    await signOutOwner();
    setOwnerSession(null);
    setRemoteAgenda(EMPTY_AGENDA);
  };

  // Servicios del Estudio en Supabase. Un guardado en curso bloquea otro (evita duplicados por doble clic).
  const savingService = useRef(false);
  const saveServiceRemote = async (service: Service) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid || !ownerBusiness) throw new Error('No hay negocio conectado. Recargá la página e intentá de nuevo.');
    if (savingService.current) return;
    savingService.current = true;
    try {
      await saveRemoteService(uuid, service, ownerBusiness.professionals.map(p => p.id));
      await reloadOwnerConfig();
    } finally {
      savingService.current = false;
    }
  };
  const saveStaffRemote = async (staff: Professional) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid || !ownerBusiness) throw new Error('No hay negocio conectado. Recargá la página e intentá de nuevo.');
    await saveRemoteProfessional(
      uuid,
      staff,
      ownerBusiness.services.map(s => s.id),
      ownerBusiness.locations.map(l => l.id)
    );
    await reloadOwnerConfig();
  };
  const deleteStaffRemote = async (staffId: string) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await deactivateRemoteProfessional(uuid, staffId);
    await reloadOwnerConfig();
  };
  const saveScheduleRemote = async (
    hours: BusinessConfig['weeklyBusinessHours'],
    holidays: string[]
  ) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await saveRemoteBusinessSchedule(uuid, hours, holidays);
    await reloadOwnerConfig();
  };
  const deleteServiceRemote = async (serviceId: string) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await deactivateRemoteService(uuid, serviceId);
    await reloadOwnerConfig();
  };
  const saveResourceRemote = async (res: Resource) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado. Recargá la página e intentá de nuevo.');
    await saveRemoteResource(uuid, res);
    await reloadOwnerConfig();
  };
  const deleteResourceRemote = async (resourceId: string) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await deleteRemoteResource(uuid, resourceId);
    await reloadOwnerConfig();
  };
  const saveSettingsRemote = async (settings: BusinessSettingsInput) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await saveRemoteBusinessSettings(uuid, settings);
    await reloadOwnerConfig();
  };
  const deleteBlockRemote = async (blockId: string) => {
    const uuid = remoteAgenda.businessUuid;
    if (!uuid) throw new Error('No hay negocio conectado.');
    await deleteRemoteBlock(uuid, blockId);
  };

  // Cambia el estado en Supabase; solo resuelve si la base confirmó el cambio
  const changeAppointmentStatus = async (aptId: string, status: Appointment['status']) => {
    if (!remoteAgenda.businessUuid) {
      throw new Error('No hay negocio conectado. Recargá la agenda e intentá nuevamente.');
    }
    await changeRemoteAppointmentStatus(aptId, remoteAgenda.businessUuid, status);
  };

  const businessName = activeBusiness?.name ?? null;

  // Reserva pública: el negocio se identifica por el UUID del enlace
  const publicBookingUuid = route === 'client' ? publicBusinessUuidFromPath(window.location.pathname) : null;

  const emptyMessage = (title: string, text: string) => (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-2">
        MAESTRO
      </span>
      <h2 className="font-serif-editorial text-3xl sm:text-4xl font-normal text-[#302C29]">{title}</h2>
      <p className="text-xs text-[#80766E] max-w-md mx-auto mt-3">{text}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#302C29] flex flex-col font-sans-clean">
      <Header
        route={route}
        businessName={businessName}
        clientSubView={clientSubView}
        onSelectClientSubView={setClientSubView}
        onLogout={route === 'owner' && ownerSession ? handleLogout : undefined}
      />

      <main className="flex-1">
        {route === 'client' && (
          publicBookingUuid ? (
            clientSubView === 'booking' ? (
              <CustomerBookingFlow
                businessUuid={publicBookingUuid}
                onBookingComplete={handleBookingCompleted}
                onGoToSelfService={handleGoToSelfService}
              />
            ) : (
              <RemoteSelfService businessUuid={publicBookingUuid} initialCode={selfServiceTargetCode} />
            )
          ) : (
            emptyMessage('Reservas', 'Usá el enlace de reservas de tu negocio para ver horarios y reservar.')
          )
        )}

        {route === 'owner' && (
          !ownerChecked ? (
            <div className="max-w-md mx-auto px-4 py-24 text-center text-xs text-[#80766E]">Cargando…</div>
          ) : !ownerSession ? (
            <OwnerLogin
              onLoginSuccess={() => undefined}
              onCancel={() => navigate('client')}
            />
          ) : remoteAgenda.status === 'no_business' ? (
            <RemoteSetupWizard
              prefill={localBusinessPrefill(activeBusiness)}
              onDone={handleSetupDone}
              onCancel={handleLogout}
            />
          ) : remoteAgenda.businessUuid === null ? (
            remoteAgenda.status === 'error' ? (
              <div className="max-w-md mx-auto px-4 py-24 text-center">
                <h2 className="font-serif-editorial text-2xl text-[#302C29]">No pudimos cargar la agenda</h2>
                <p className="text-xs text-[#80766E] mt-3">{remoteAgenda.error}</p>
                <button
                  type="button"
                  onClick={() => loadRemoteAgenda()}
                  className="mt-4 px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto px-4 py-24 text-center text-xs text-[#80766E]">Cargando agenda…</div>
            )
          ) : !ownerBusiness ? (
            <div className="max-w-md mx-auto px-4 py-24 text-center text-xs text-[#80766E]">Cargando configuración del negocio…</div>
          ) : (
            <>
              <OwnerPublicLink uuid={remoteAgenda.businessUuid} />
              <ErrorBoundary fallbackTitle="Error al cargar el Estudio Propietario">
                <OwnerStudio
                  business={ownerBusiness}
                  appointments={remoteAgenda.appointments}
                  agendaBlocks={remoteAgenda.blocks}
                  onRefresh={() => { loadRemoteAgenda(); reloadOwnerConfig(); refreshData(); }}
                  onChangeAppointmentStatus={changeAppointmentStatus}
                  onSaveService={saveServiceRemote}
                  onDeleteService={deleteServiceRemote}
                  onSaveStaff={saveStaffRemote}
                  onDeleteStaff={deleteStaffRemote}
                  onSaveSchedule={saveScheduleRemote}
                  onSaveResource={saveResourceRemote}
                  onDeleteResource={deleteResourceRemote}
                  onSaveSettings={saveSettingsRemote}
                  onDeleteBlock={deleteBlockRemote}
                  remoteConfig={true}
                />
              </ErrorBoundary>
            </>
          )
        )}

        {route === 'employee' && (
          activeBusiness ? (
            <EmployeePortal
              business={activeBusiness}
              appointments={appointments}
              agendaBlocks={agendaBlocks}
              onRefresh={refreshData}
            />
          ) : (
            emptyMessage('Portal no disponible', 'Este espacio todavía no tiene un negocio configurado.')
          )
        )}
      </main>

      <footer className="border-t border-[#E5DDD3] bg-[#FAF8F4] py-8 px-6 lg:px-12 mt-16 text-xs text-[#80766E]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-brand text-base text-[#302C29] font-medium">
              {businessName ?? 'MAESTRO'}
            </span>
            <span>·</span>
            <span>Sistema Inteligente de Turnos y Planificación de Recursos</span>
          </div>

          <span className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#5e7761]" />
            <span>Disponibilidad Real Garantizada</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
