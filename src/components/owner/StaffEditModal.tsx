import React, { useState } from 'react';
import { BusinessConfig, Professional, DaySchedule } from '../../types';
import { X, Check, Trash2 } from 'lucide-react';

interface StaffEditModalProps {
  business: BusinessConfig;
  staffToEdit?: Professional | null;
  onClose: () => void;
  onSave: (staff: Professional) => void;
  onDelete?: (staffId: string) => void;
  saving?: boolean;
}

export const StaffEditModal: React.FC<StaffEditModalProps> = ({
  business,
  staffToEdit,
  onClose,
  onSave,
  onDelete,
  saving = false
}) => {
  const isEditing = !!staffToEdit;

  const [name, setName] = useState(staffToEdit?.name || '');
  const [role, setRole] = useState(staffToEdit?.role || 'Especialista en Belleza');
  const [email, setEmail] = useState(staffToEdit?.email || '');
  const [pin, setPin] = useState(staffToEdit?.pin || '1234');
  const [color, setColor] = useState(staffToEdit?.color || '#B69A70');
  const [canManageOwnBreaks, setCanManageOwnBreaks] = useState(
    staffToEdit?.canManageOwnBreaks ?? true
  );
  const [enabledServiceIds, setEnabledServiceIds] = useState<string[]>(
    staffToEdit?.enabledServiceIds || business.services.map(s => s.id)
  );

  // Default work hours
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('19:00');
  const [lunchStart, setLunchStart] = useState('13:00');
  const [lunchEnd, setLunchEnd] = useState('14:00');

  const toggleService = (sId: string) => {
    setEnabledServiceIds(prev => 
      prev.includes(sId) ? prev.filter(id => id !== sId) : [...prev, sId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Build weekly schedule (Mon-Fri 09-19 with lunch, Sat 10-16, Sun closed)
    const baseDay: DaySchedule = {
      start: workStart,
      end: workEnd,
      breaks: [{ start: lunchStart, end: lunchEnd, title: 'Almuerzo' }]
    };

    const weeklySchedule: Professional['weeklySchedule'] = {
      1: { ...baseDay },
      2: { ...baseDay },
      3: { ...baseDay },
      4: { ...baseDay },
      5: { ...baseDay },
      6: { start: '10:00', end: '16:00', breaks: [] },
      0: null // Domingo cerrado
    };

    const newStaff: Professional = {
      id: staffToEdit ? staffToEdit.id : `prof_new_${Date.now()}`,
      name: name.trim(),
      role: role.trim(),
      email: email.trim(), // Sin email cargado queda vacío: no se inventa una dirección
      pin: pin.trim(),
      avatarUrl: staffToEdit?.avatarUrl,
      enabledServiceIds: enabledServiceIds.length === 0 ? ['*'] : enabledServiceIds,
      locationIds: staffToEdit?.locationIds || business.locations.map(l => l.id),
      weeklySchedule: staffToEdit?.weeklySchedule || weeklySchedule,
      canManageOwnBreaks,
      color
    };

    onSave(newStaff);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative my-8 text-xs">
        <button
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Gestión de Equipo
          </span>
          <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
            {isEditing ? `Editar Profesional: ${staffToEdit.name}` : 'Añadir Nuevo Profesional'}
          </h3>
          <p className="text-[#80766E] mt-1">
            Configura su rol, PIN de acceso al portal y servicios habilitados.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Nombre y Apellido *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Julieta Ramos"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Rol / Especialidad *</label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej. Estilista & Colorista"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="julieta@atelierbeaute.com"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">PIN Portal Empleado (4 dígitos)</label>
              <input
                type="text"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1005"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] font-mono text-center text-xs text-[#302C29]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Color identificador en agenda</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E5DDD3] cursor-pointer"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canManageOwnBreaks}
                  onChange={(e) => setCanManageOwnBreaks(e.target.checked)}
                  className="rounded border-[#E5DDD3] text-[#302C29]"
                />
                <span className="text-[#302C29] font-medium">Puede programar sus pausas</span>
              </label>
            </div>
          </div>

          {/* Enabled services selection */}
          <div>
            <label className="block font-semibold text-[#302C29] mb-1">
              Servicios que puede atender:
            </label>
            <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-[#FAF8F4] border border-[#E5DDD3] rounded-lg">
              {business.services.map(s => {
                const isChecked = enabledServiceIds.includes('*') || enabledServiceIds.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleService(s.id)}
                      className="rounded border-[#E5DDD3] text-[#302C29]"
                    />
                    <span className="text-xs text-[#302C29]">{s.name} ({s.durationMinutes} min)</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5DDD3] flex items-center justify-between">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Seguro que deseas eliminar a ${staffToEdit.name}?`)) {
                    onDelete(staffToEdit.id);
                  }
                }}
                className="text-xs text-[#CEAAA3] hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar del equipo</span>
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E5DDD3] text-[#80766E] rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg shadow-xs disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar Profesional'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
