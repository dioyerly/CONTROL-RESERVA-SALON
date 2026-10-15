import React, { useState } from 'react';
import { Lock, Mail, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { signInOwner, signUpOwner } from '../../services/ownerSupabase';

interface OwnerLoginProps {
  onLoginSuccess: () => void;
  onCancel: () => void;
}

type Mode = 'login' | 'signup' | 'confirm';

// Acceso del dueño con Supabase Auth: inicio de sesión y registro. Sin credenciales locales.
export const OwnerLogin: React.FC<OwnerLoginProps> = ({
  onLoginSuccess,
  onCancel
}) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await signInOwner(email, password);
        setPassword('');
        onLoginSuccess();
      } else {
        const result = await signUpOwner(email, password);
        setPassword('');
        if (result.needsEmailConfirmation) {
          setMode('confirm');
        } else {
          onLoginSuccess();
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'confirm') {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-8 shadow-sm text-center space-y-4">
          <h2 className="font-serif-editorial text-2xl font-normal text-[#302C29]">Revisá tu correo</h2>
          <p className="text-xs text-[#80766E]">
            Te enviamos un enlace para confirmar tu cuenta a <strong className="text-[#302C29]">{email}</strong>.
            Abrilo desde ese correo y después volvé a iniciar sesión.
          </p>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="px-6 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-semibold rounded-lg text-xs cursor-pointer"
          >
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  const isSignup = mode === 'signup';

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
            {isSignup ? 'Crear cuenta de propietario' : 'Estudio del Propietario'}
          </h2>
          <p className="text-xs text-[#80766E] mt-1">
            {isSignup
              ? 'Creá tu cuenta para configurar tu negocio y gestionar tu agenda.'
              : 'Inicia sesión para gestionar tu negocio, horarios, equipo y agenda en tiempo real.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-center gap-2">
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
                autoComplete="username"
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
                minLength={6}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
              />
            </div>
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
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
            >
              <span>{isSignup ? 'Crear cuenta' : 'Ingresar al Estudio'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-xs text-[#80766E]">
          {isSignup ? (
            <button type="button" onClick={() => switchMode('login')} className="underline cursor-pointer">
              Ya tengo cuenta: iniciar sesión
            </button>
          ) : (
            <button type="button" onClick={() => switchMode('signup')} className="underline cursor-pointer">
              Crear cuenta de propietario
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
