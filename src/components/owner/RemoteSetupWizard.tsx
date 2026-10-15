import React, { useState } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import {
  BusinessSetupInput,
  createOwnerBusiness,
  validateBusinessSetup
} from '../../services/ownerSupabase';

interface RemoteSetupWizardProps {
  // Datos del negocio local de este navegador, solo para prellenar. Se pueden revisar y cambiar.
  prefill: Partial<BusinessSetupInput> | null;
  onDone: (businessId: string) => void;
  onCancel: () => void;
}

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const INPUT = 'w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]';
const LABEL = 'block font-semibold text-[#302C29] mb-1 text-xs';

// Asistente de alta del negocio. Guarda en Supabase con el usuario autenticado.
export const RemoteSetupWizard: React.FC<RemoteSetupWizardProps> = ({ prefill, onDone, onCancel }) => {
  const [form, setForm] = useState<BusinessSetupInput>({
    name: prefill?.name ?? '',
    mode: prefill?.mode ?? 'independent',
    address: prefill?.address ?? '',
    phone: prefill?.phone ?? '',
    email: prefill?.email ?? '',
    openDays: prefill?.openDays?.length ? prefill.openDays : [1, 2, 3, 4, 5, 6],
    openTime: prefill?.openTime ?? '09:00',
    closeTime: prefill?.closeTime ?? '19:00',
    categoryName: prefill?.categoryName ?? '',
    serviceName: prefill?.serviceName ?? '',
    serviceDescription: prefill?.serviceDescription ?? '',
    serviceMinutes: prefill?.serviceMinutes ?? 45,
    serviceBufferMinutes: prefill?.serviceBufferMinutes ?? 10,
    servicePrice: prefill?.servicePrice ?? null,
    professionalName: prefill?.professionalName ?? ''
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BusinessSetupInput>(key: K, value: BusinessSetupInput[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      openDays: prev.openDays.includes(day)
        ? prev.openDays.filter(d => d !== day)
        : [...prev.openDays, day].sort((a, b) => a - b)
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const problem = validateBusinessSetup(form);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const businessId = await createOwnerBusiness(form);
      onDone(businessId);
    } catch (err) {
      setError(`${(err as Error).message} Tu negocio no quedó configurado: podés reintentar.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 sm:p-10 shadow-sm">
        <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-1">
          Configuración inicial
        </span>
        <h2 className="font-serif-editorial text-3xl font-normal text-[#302C29] mb-2">Tu negocio</h2>
        <p className="text-xs text-[#80766E] mb-6">
          Completá los datos reales de tu negocio. Podés revisarlos y cambiarlos antes de guardar.
          Hasta que se guarden, la reserva pública no estará disponible.
        </p>

        {error && (
          <div role="alert" className="mb-5 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#CEAAA3] shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6 text-xs">
          <fieldset className="space-y-4">
            <legend className="font-serif-editorial text-xl text-[#302C29] mb-2">Datos del negocio</legend>
            <div>
              <label className={LABEL}>Nombre del negocio *</label>
              <input className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Modalidad</label>
              <select className={INPUT} value={form.mode} onChange={e => set('mode', e.target.value as BusinessSetupInput['mode'])}>
                <option value="independent">Trabajo independiente (solo yo)</option>
                <option value="salon_employees">Salón con empleados</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Dirección *</label>
              <input className={INPUT} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Teléfono de contacto *</label>
                <input className={INPUT} value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Correo público (opcional)</label>
                <input type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-serif-editorial text-xl text-[#302C29] mb-2">Horario de atención</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    form.openDays.includes(d.value)
                      ? 'bg-[#302C29] text-white border-[#302C29]'
                      : 'bg-white text-[#80766E] border-[#E5DDD3]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Apertura</label>
                <input type="time" className={INPUT} value={form.openTime} onChange={e => set('openTime', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Cierre</label>
                <input type="time" className={INPUT} value={form.closeTime} onChange={e => set('closeTime', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-serif-editorial text-xl text-[#302C29] mb-2">Primer servicio</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Categoría *</label>
                <input className={INPUT} placeholder="Ej. Peluquería" value={form.categoryName} onChange={e => set('categoryName', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Nombre del servicio *</label>
                <input className={INPUT} value={form.serviceName} onChange={e => set('serviceName', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Descripción</label>
              <textarea rows={2} className={INPUT} value={form.serviceDescription} onChange={e => set('serviceDescription', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Duración (min) *</label>
                <input type="number" min={1} className={INPUT} value={form.serviceMinutes} onChange={e => set('serviceMinutes', Number(e.target.value))} />
              </div>
              <div>
                <label className={LABEL}>Limpieza posterior (min)</label>
                <input type="number" min={0} className={INPUT} value={form.serviceBufferMinutes} onChange={e => set('serviceBufferMinutes', Number(e.target.value))} />
              </div>
              <div>
                <label className={LABEL}>Precio (vacío = a consultar)</label>
                <input
                  type="number"
                  min={0}
                  className={INPUT}
                  value={form.servicePrice ?? ''}
                  onChange={e => set('servicePrice', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-serif-editorial text-xl text-[#302C29] mb-2">Profesional que atiende</legend>
            <div>
              <label className={LABEL}>Nombre *</label>
              <input className={INPUT} value={form.professionalName} onChange={e => set('professionalName', e.target.value)} />
              <span className="text-[11px] text-[#80766E] mt-1 block">
                Si trabajás solo, usá tu nombre. Podés agregar más profesionales después.
              </span>
            </div>
          </fieldset>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 border border-[#E5DDD3] text-[#80766E] rounded-lg hover:text-[#302C29] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <span>{saving ? 'Guardando…' : 'Guardar y activar reservas'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
