import React, { useState, useEffect, useCallback } from 'react';
import { BusinessConfig, Appointment, AgendaBlock } from './types';
import { 
  getActiveBusiness, 
  getAllBusinesses, 
  setActiveBusinessId, 
  getAppointments, 
  getAgendaBlocks, 
  subscribeToStore,
  initStore 
} from './services/storage';
import { Header, UserRole } from './components/layout/Header';
import { CustomerBookingFlow } from './components/booking/CustomerBookingFlow';
import { CustomerSelfService } from './components/customer/CustomerSelfService';
import { OwnerStudio } from './components/owner/OwnerStudio';
import { OwnerLogin } from './components/owner/OwnerLogin';
import { EmployeePortal } from './components/employee/EmployeePortal';
import { TestSuiteView } from './components/testing/TestSuiteView';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ShieldCheck, Lock } from 'lucide-react';

export default function App() {
  // Primary Role separation: 'client' (Public booking) vs 'owner' (Admin studio) vs 'employee' vs 'testing'
  const [currentRole, setCurrentRole] = useState<UserRole>('client');
  const [clientSubView, setClientSubView] = useState<'booking' | 'self_service'>('booking');

  const [activeBusiness, setActiveBusiness] = useState<BusinessConfig>(() => {
    initStore();
    return getActiveBusiness();
  });
  const [allBusinesses, setAllBusinesses] = useState<BusinessConfig[]>(() => getAllBusinesses());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [agendaBlocks, setAgendaBlocks] = useState<AgendaBlock[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selfServiceTargetCode, setSelfServiceTargetCode] = useState<string>('');
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(false);

  const refreshData = useCallback(() => {
    const biz = getActiveBusiness();
    setActiveBusiness(biz);
    setAllBusinesses(getAllBusinesses());
    setAppointments(getAppointments(biz.id));
    setAgendaBlocks(getAgendaBlocks(biz.id));
  }, []);

  useEffect(() => {
    refreshData();
    const unsubscribe = subscribeToStore(() => {
      refreshData();
    });
    return unsubscribe;
  }, [refreshData]);

  const handleSelectBusiness = (bizId: string) => {
    setActiveBusinessId(bizId);
    refreshData();
  };

  const handleBookingCompleted = (code: string) => {
    setSelfServiceTargetCode(code);
  };

  const handleGoToSelfService = (code: string) => {
    setSelfServiceTargetCode(code);
    setClientSubView('self_service');
  };

  const handleOnboardingFinished = (newBiz: BusinessConfig) => {
    setShowOnboarding(false);
    refreshData();
    setCurrentRole('owner');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#302C29] flex flex-col font-sans-clean">
      {/* 1. Header with complete separation between Client and Owner */}
      <Header
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        activeBusiness={activeBusiness}
        allBusinesses={allBusinesses}
        onSelectBusiness={handleSelectBusiness}
        clientSubView={clientSubView}
        onSelectClientSubView={setClientSubView}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />

      {/* 2. Main Canvas strictly separated by role */}
      <main className="flex-1">
        {currentRole === 'client' && (
          <>
            {clientSubView === 'booking' ? (
              <CustomerBookingFlow
                business={activeBusiness}
                appointments={appointments}
                agendaBlocks={agendaBlocks}
                onBookingComplete={handleBookingCompleted}
                onGoToSelfService={handleGoToSelfService}
              />
            ) : (
              <CustomerSelfService
                business={activeBusiness}
                allAppointments={appointments}
                agendaBlocks={agendaBlocks}
                initialCode={selfServiceTargetCode}
              />
            )}
          </>
        )}

        {currentRole === 'owner' && (
          isOwnerAuthenticated ? (
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
              onCancel={() => setCurrentRole('client')}
            />
          )
        )}

        {currentRole === 'employee' && (
          <EmployeePortal
            business={activeBusiness}
            appointments={appointments}
            agendaBlocks={agendaBlocks}
            onRefresh={refreshData}
          />
        )}

        {currentRole === 'testing' && (
          <TestSuiteView />
        )}
      </main>

      {/* 3. Onboarding Wizard Modal */}
      {showOnboarding && (
        <OnboardingWizard
          onClose={() => setShowOnboarding(false)}
          onFinish={handleOnboardingFinished}
        />
      )}

      {/* 4. Editorial Footer */}
      <footer className="border-t border-[#E5DDD3] bg-[#FAF8F4] py-8 px-6 lg:px-12 mt-16 text-xs text-[#80766E]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif-editorial text-base text-[#302C29] font-medium">
              {activeBusiness.name}
            </span>
            <span>·</span>
            <span>Sistema Inteligente de Turnos y Planificación de Recursos</span>
          </div>

          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#5e7761]" />
              <span>Disponibilidad Real Garantizada</span>
            </span>

            {/* Access link to backoffice if in client mode */}
            {currentRole === 'client' ? (
              <button 
                onClick={() => setCurrentRole('owner')}
                className="text-[#80766E] hover:text-[#302C29] flex items-center gap-1 underline cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>Acceso Administración</span>
              </button>
            ) : (
              <button 
                onClick={() => setCurrentRole('client')}
                className="text-[#302C29] hover:text-[#B69A70] underline cursor-pointer"
              >
                Volver a Vista Cliente
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
