import React, { useState } from 'react';
import { BusinessConfig, DaySchedule } from '../../types';
import { X, Check, Plus, Trash2 } from 'lucide-react';

interface ScheduleEditModalProps {
  business: BusinessConfig;
  onClose: () => void;
  onSave: (updatedHours: BusinessConfig['weeklyBusinessHours'], holidays: string[]) => void;
  saving?: boolean;
}

const DAYS = [
  { index: 1, name: 'Lunes' },
  { index: 2, name: 'Martes' },
  { index: 3, name: 'Miércoles' },
  { index: 4, name: 'Jueves' },
  { index: 5, name: 'Viernes' },
  { index: 6, name: 'Sábado' },
  { index: 0, name: 'Domingo' }
];

export const ScheduleEditModal: React.FC<ScheduleEditModalProps> = ({
  business,
  onClose,
  onSave,
  saving = false
}) => {
  const [hoursState, setHoursState] = useState<BusinessConfig['weeklyBusinessHours']>(() => ({
    ...business.weeklyBusinessHours
  }));

  const [holidays, setHolidays] = useState<string[]>([...business.holidaysAndVacations]);
  const [newHolidayDate, setNewHolidayDate] = useState('');

  const handleToggleDayOpen = (dayIndex: number) => {
    setHoursState(prev => {
      const current = prev[dayIndex];
      if (current) {
        return { ...prev, [dayIndex]: null }; // Mark closed
      } else {
        return {
          ...prev,
          [dayIndex]: { start: '09:00', end: '19:00', breaks: [] }
        };
      }
    });
  };

  const handleTimeChange = (dayIndex: number, field: 'start' | 'end', val: string) => {
    setHoursState(prev => {
      const current = prev[dayIndex] || { start: '09:00', end: '19:00', breaks: [] };
      return {
        ...prev,
        [dayIndex]: { ...current, [field]: val }
      };
    });
  };

  const handleAddHoliday = () => {
    if (!newHolidayDate || holidays.includes(newHolidayDate)) return;
    setHolidays([...holidays, newHolidayDate]);
    setNewHolidayDate('');
  };

  const handleRemoveHoliday = (hDate: string) => {
    setHolidays(holidays.filter(d => d !== hDate));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(hoursState, holidays);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-xl p-6 sm:p-8 shadow-2xl relative my-8 text-xs">
        <button
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Configuración de Horarios
          </span>
          <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
            Horarios Comerciales y Días de Atención
          </h3>
          <p className="text-[#80766E] mt-1">
            Modifica las horas de apertura y cierre para cada día de la semana sin recrear el negocio.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Days schedule */}
          <div className="space-y-2.5">
            {DAYS.map(day => {
              const schedule = hoursState[day.index];
              const isOpen = schedule !== null && schedule !== undefined;

              return (
                <div
                  key={day.index}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isOpen ? 'bg-white border-[#E5DDD3]' : 'bg-[#FAF8F4] border-[#E5DDD3]/60'
                  }`}
                >
                  <div className="flex items-center gap-3 w-32">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOpen}
                        onChange={() => handleToggleDayOpen(day.index)}
                        className="rounded border-[#E5DDD3] text-[#302C29]"
                      />
                      <span className={`font-semibold text-xs ${isOpen ? 'text-[#302C29]' : 'text-[#80766E]'}`}>
                        {day.name}
                      </span>
                    </label>
                  </div>

                  {isOpen ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[#80766E] text-[11px]">Desde:</span>
                        <input
                          type="time"
                          value={schedule.start}
                          onChange={(e) => handleTimeChange(day.index, 'start', e.target.value)}
                          className="p-1.5 border border-[#E5DDD3] rounded bg-[#FAF8F4] font-mono text-xs text-[#302C29]"
                        />
                      </div>
                      <span className="text-[#80766E]">-</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[#80766E] text-[11px]">Hasta:</span>
                        <input
                          type="time"
                          value={schedule.end}
                          onChange={(e) => handleTimeChange(day.index, 'end', e.target.value)}
                          className="p-1.5 border border-[#E5DDD3] rounded bg-[#FAF8F4] font-mono text-xs text-[#302C29]"
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[#CEAAA3] font-medium text-xs">
                      Cerrado (Descanso semanal)
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Holidays section */}
          <div className="pt-4 border-t border-[#E5DDD3] space-y-2">
            <label className="block font-semibold text-[#302C29]">
              Feriados y Días Festivos Cerrados:
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="p-2 border border-[#E5DDD3] rounded bg-[#FAF8F4] text-xs text-[#302C29]"
              />
              <button
                type="button"
                onClick={handleAddHoliday}
                className="px-3 py-2 bg-[#FAF8F4] hover:bg-[#F0EAE2] border border-[#E5DDD3] text-[#302C29] font-medium rounded-lg text-xs"
              >
                + Añadir Feriado
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {holidays.map(h => (
                <span key={h} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FAF8F4] border border-[#E5DDD3] rounded text-[11px] text-[#302C29]">
                  <span>{h}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(h)}
                    className="text-[#80766E] hover:text-[#CEAAA3]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5DDD3] flex justify-end gap-2">
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
              {saving ? 'Guardando…' : 'Guardar Horarios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
