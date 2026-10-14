import React from 'react';

// Cada espacio tiene su propia dirección: / (clientes), /admin (propietario), /equipo (empleados)
export type AppRoute = 'client' | 'owner' | 'employee';

interface HeaderProps {
  route: AppRoute;
  businessName: string | null;
  clientSubView: 'booking' | 'self_service';
  onSelectClientSubView: (subView: 'booking' | 'self_service') => void;
  onLogout?: () => void;
}

const ROUTE_LABEL: Record<AppRoute, string> = {
  client: '',
  owner: 'Estudio Propietario',
  employee: 'Portal Equipo'
};

export const Header: React.FC<HeaderProps> = ({
  route,
  businessName,
  clientSubView,
  onSelectClientSubView,
  onLogout
}) => {
  if (route === 'client') {
    return (
      <header className="sticky top-0 z-40 bg-[#FAF8F4]/95 backdrop-blur-md border-b border-[#E5DDD3] px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-4 shrink-0">
            <span className="font-brand text-2xl lg:text-3xl font-medium tracking-tight text-[#302C29]">
              {businessName ?? 'MAESTRO'}
            </span>
          </div>

          {businessName && (
            <nav className="flex items-center gap-8 text-sm font-medium text-[#80766E]">
              <button
                type="button"
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
                type="button"
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
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E5DDD3] px-6 lg:px-12 py-3.5 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-brand text-2xl font-medium tracking-tight text-[#302C29] truncate">
            {businessName ?? 'MAESTRO'}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 bg-[#FAF8F4] border border-[#E5DDD3] rounded text-[#80766E] shrink-0">
            {ROUTE_LABEL[route]}
          </span>
        </div>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-1.5 border border-[#E5DDD3] hover:border-[#302C29] text-[#302C29] text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
};
