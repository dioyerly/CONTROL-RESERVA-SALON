import React from 'react';
import { BusinessConfig } from '../../types';
import { Lock, Eye, ArrowRight, ShieldCheck } from 'lucide-react';

export type UserRole = 'client' | 'owner' | 'employee' | 'testing';

interface HeaderProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  activeBusiness: BusinessConfig;
  allBusinesses: BusinessConfig[];
  onSelectBusiness: (bizId: string) => void;
  clientSubView: 'booking' | 'self_service';
  onSelectClientSubView: (subView: 'booking' | 'self_service') => void;
  onOpenOnboarding: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onSelectRole,
  activeBusiness,
  allBusinesses,
  onSelectBusiness,
  clientSubView,
  onSelectClientSubView,
  onOpenOnboarding
}) => {
  return (
    <div>
      {/* Discreet Role / Demo Switcher Bar for evaluation */}
      <div className="bg-[#302C29] text-[#FAF8F4] px-4 py-1.5 text-[11px] flex items-center justify-between border-b border-[#302C29]">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#80766E] uppercase tracking-wider font-semibold">
              Espacio Activo:
            </span>
            <div className="flex items-center gap-1 bg-[#1a1715] p-0.5 rounded">
              <button
                type="button"
                onClick={() => onSelectRole('client')}
                className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                  currentRole === 'client'
                    ? 'bg-[#B69A70] text-[#302C29] font-bold shadow-xs'
                    : 'text-[#80766E] hover:text-[#FAF8F4]'
                }`}
              >
                👤 Vista Cliente (Pública)
              </button>

              <button
                type="button"
                onClick={() => onSelectRole('owner')}
                className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                  currentRole === 'owner'
                    ? 'bg-[#B69A70] text-[#302C29] font-bold shadow-xs'
                    : 'text-[#80766E] hover:text-[#FAF8F4]'
                }`}
              >
                👑 Estudio Propietario (Privado)
              </button>

              <button
                type="button"
                onClick={() => onSelectRole('employee')}
                className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                  currentRole === 'employee'
                    ? 'bg-[#B69A70] text-[#302C29] font-bold shadow-xs'
                    : 'text-[#80766E] hover:text-[#FAF8F4]'
                }`}
              >
                💼 Portal Empleado
              </button>

              <button
                type="button"
                onClick={() => onSelectRole('testing')}
                className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                  currentRole === 'testing'
                    ? 'bg-[#B69A70] text-[#302C29] font-bold shadow-xs'
                    : 'text-[#80766E] hover:text-[#FAF8F4]'
                }`}
              >
                🧪 Validador 18 Pruebas
              </button>
            </div>
          </div>

          {/* Quick Business switcher */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#80766E]">
            <span>Negocio demo:</span>
            <select
              value={activeBusiness.id}
              onChange={(e) => onSelectBusiness(e.target.value)}
              className="bg-[#1a1715] text-[#FAF8F4] border border-[#302C29] rounded px-2 py-0.5 focus:outline-none cursor-pointer"
            >
              {allBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Role-Specific Header */}
      {currentRole === 'client' ? (
        /* ================= 100% PURE CLIENT HEADER ================= */
        <header className="sticky top-0 z-40 bg-[#FAF8F4]/95 backdrop-blur-md border-b border-[#E5DDD3] px-6 lg:px-12 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
            {/* Zone 1: Brand wordmark */}
            <div className="flex items-center gap-4 shrink-0">
              <span className="font-serif-editorial text-2xl lg:text-3xl font-medium tracking-tight text-[#302C29]">
                {activeBusiness.name}
              </span>
            </div>

            {/* Zone 2: Navigation strictly for the client */}
            <nav className="flex items-center gap-8 text-sm font-medium text-[#80766E]">
              <button
                onClick={() => onSelectClientSubView('booking')}
                className={`transition-colors cursor-pointer pb-0.5 ${
                  clientSubView === 'booking'
                    ? 'text-[#302C29] border-b-2 border-[#B69A70] font-semibold'
                    : 'hover:text-[#302C29]'
                }`}
              >
                Reservar Turno
              </button>

              <button
                onClick={() => onSelectClientSubView('self_service')}
                className={`transition-colors cursor-pointer pb-0.5 ${
                  clientSubView === 'self_service'
                    ? 'text-[#302C29] border-b-2 border-[#B69A70] font-semibold'
                    : 'hover:text-[#302C29]'
                }`}
              >
                Consultar Mi Turno
              </button>
            </nav>

            {/* Zone 3: Discreet Access to Owner Studio */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => onSelectRole('owner')}
                className="text-xs text-[#80766E] hover:text-[#302C29] border border-[#E5DDD3] hover:border-[#302C29] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Acceso restringido para el propietario"
              >
                <Lock className="w-3.5 h-3.5 text-[#B69A70]" />
                <span className="hidden sm:inline">Acceso Propietario</span>
              </button>
            </div>
          </div>
        </header>
      ) : (
        /* ================= 100% PURE OWNER / BACKOFFICE HEADER ================= */
        <header className="sticky top-0 z-40 bg-white border-b border-[#E5DDD3] px-6 lg:px-12 py-3.5 shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-serif-editorial text-2xl font-medium tracking-tight text-[#302C29]">
                {activeBusiness.name}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-[#FAF8F4] border border-[#E5DDD3] rounded text-[#80766E]">
                {currentRole === 'owner' ? 'Estudio Propietario' : currentRole === 'employee' ? 'Portal Equipo' : 'Laboratorio'}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {currentRole === 'owner' && (
                <button
                  onClick={() => onSelectRole('client')}
                  className="px-3.5 py-1.5 border border-[#E5DDD3] hover:border-[#302C29] text-[#302C29] text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#B69A70]" />
                  <span>Ver Enlace Público de Reserva</span>
                </button>
              )}

              <button
                onClick={onOpenOnboarding}
                className="px-3.5 py-1.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                + Configurar Nuevo Negocio
              </button>
            </div>
          </div>
        </header>
      )}
    </div>
  );
};
