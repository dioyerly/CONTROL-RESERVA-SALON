import React, { useState } from 'react';
import { BusinessConfig } from '../../types';
import { Lock, Mail, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';

interface OwnerLoginProps {
  business: BusinessConfig;
  onLoginSuccess: () => void;
  onCancel: () => void;
}

export const OwnerLogin: React.FC<OwnerLoginProps> = ({
  business,
  onLoginSuccess,
  onCancel
}) => {
  const defaultEmail = business.ownerCredentials?.email || 'admin@atelierbeaute.com';
  const defaultPass = business.ownerCredentials?.password || 'admin123';

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPass);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validEmail = business.ownerCredentials?.email || 'admin@atelierbeaute.com';
    const validPassword = business.ownerCredentials?.password || 'admin123';

    if (email.trim().toLowerCase() === validEmail.toLowerCase() && password === validPassword) {
      onLoginSuccess();
    } else {
      setError(`Credenciales incorrectas. Para esta demo puedes usar: ${validEmail} / ${validPassword}`);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#FAF8F4] border border-[#E5DDD3] rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-[#B69A70]" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Acceso Administrativo Privado
          </span>
          <h2 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
            Estudio del Propietario
          </h2>
          <p className="text-xs text-[#80766E] mt-1">
            Inicia sesión para gestionar tu negocio, horarios, equipo y agenda en tiempo real.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#CEAAA3] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#80766E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="propietario@negocio.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Contraseña</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#80766E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
              />
            </div>
          </div>

          <div className="p-2.5 bg-[#FAF8F4] border border-[#E5DDD3]/70 rounded-lg text-[11px] text-[#80766E] space-y-0.5">
            <div>Credenciales de demostración preconfiguradas:</div>
            <div>Usuario: <strong className="text-[#302C29]">{defaultEmail}</strong></div>
            <div>Contraseña: <strong className="text-[#302C29]">{defaultPass}</strong></div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 border border-[#E5DDD3] text-[#80766E] rounded-lg hover:text-[#302C29] cursor-pointer"
            >
              Volver a Clientes
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <span>Ingresar al Estudio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
