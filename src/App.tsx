import React, { useState, useEffect, useCallback } from 'react';
import { BusinessConfig, Appointment, AgendaBlock } from './types';
import {
  getActiveBusiness,
  getAppointments,
  getPublicOccupancy,
  getAgendaBlocks,
  subscribeToStore
} from './services/storage';
import { Header, AppRoute } from './components/layout/Header';
import { CustomerBookingFlow } from './components/booking/CustomerBookingFlow';
import { CustomerSelfService } from './components/customer/CustomerSelfService';
import { OwnerStudio } from './components/owner/OwnerStudio';
import { OwnerLogin } from './components/owner/OwnerLogin';
import { EmployeePortal } from './components/employee/EmployeePortal';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ShieldCheck } from 'lucide-react';

// Cada rol tiene su propia dirección.
const PATH_BY_ROUTE: Record<AppRoute, string> = {
  client: '/',
  owner: '/admin',
  employee: '/equipo'
};

const OWNER_SESSION_KEY = 'maestro_owner_session_v1';

function routeFromPath(pathname: string): AppRoute {
  if (pathname.startsWith('/admin')) return 'owner';
  if (pathname.startsWith('/equipo')) return 'employee';
  return 'client';
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
  // La sesión del dueño dura mientras la pestaña esté abierta: sobrevive a las recargas,
  // pero se cierra al salir con "Cerrar sesión" o al cerrar la pestaña.
  const [isOwnerAuthenticated, setIsOwnerAuthenticatedState] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(OWNER_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setIsOwnerAuthenticated = (value: boolean) => {
    try {
      if (value) sessionStorage.setItem(OWNER_SESSION_KEY, '1');
      else sessionStorage.removeItem(OWNER_SESSION_KEY);
    } catch {
      // sin sessionStorage la sesión dura solo hasta la próxima recarga
    }
    setIsOwnerAuthenticatedState(value);
  };
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

  const handleBookingCompleted = (code: string) => {
    setSelfServiceTargetCode(code);
  };

  const handleGoToSelfService = (code: string) => {
    setSelfServiceTargetCode(code);
    setClientSubView('self_service');
  };

  const handleOnboardingFinished = (newBiz: BusinessConfig) => {
    refreshData();
    // Quien acaba de crear el negocio ya tiene sus credenciales: entra directo al Estudio
    setIsOwnerAuthenticated(true);
    setActiveBusiness(newBiz);
  };

  const handleLogout = () => {
    setIsOwnerAuthenticated(false);
  };

  const businessName = activeBusiness?.name ?? null;

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
        onLogout={route === 'owner' && isOwnerAuthenticated ? handleLogout : undefined}
      />

      <main className="flex-1">
        {route === 'client' && (
          activeBusiness ? (
            clientSubView === 'booking' ? (
              <CustomerBookingFlow
                business={activeBusiness}
                appointments={publicAppointments}
                agendaBlocks={agendaBlocks}
                onBookingComplete={handleBookingCompleted}
                onGoToSelfService={handleGoToSelfService}
              />
            ) : (
              <CustomerSelfService
                business={activeBusiness}
                allAppointments={publicAppointments}
                agendaBlocks={agendaBlocks}
                initialCode={selfServiceTargetCode}
              />
            )
          ) : (
            emptyMessage('Reservas no disponibles', 'Este espacio todavía no tiene un negocio configurado.')
          )
        )}

        {route === 'owner' && (
          !activeBusiness ? (
            <OnboardingWizard onFinish={handleOnboardingFinished} />
          ) : isOwnerAuthenticated ? (
            <ErrorBoundary fallbackTitle="Error al cargar el Estudio Propietario">
              <OwnerStudio
                business={activeBusiness}
                appointments={appointments}
                agendaBlocks={agendaBlocks}
                onRefresh={refreshData}
              />
            </ErrorBoundary>
          ) : (
            <OwnerLogin
              business={activeBusiness}
              onLoginSuccess={() => setIsOwnerAuthenticated(true)}
              onCancel={() => navigate('client')}
            />
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
