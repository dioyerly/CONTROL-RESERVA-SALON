import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Service, 
  CalculatedSlot, 
  Appointment, 
  AgendaBlock, 
  DayAvailabilitySummary 
} from '../../types';
import { 
  calculateMonthAvailability, 
  calculateAvailableSlotsForServices,
  formatDateIso 
} from '../../services/availabilityEngine';
import { ChevronLeft, ChevronRight, Sun, Sunset, Moon } from 'lucide-react';

// Disponibilidad desde Supabase. Si se pasa, el calendario no usa el cálculo local.
export interface RemoteAvailability {
  loadMonth: (year: number, month: number) => Promise<Record<string, DayAvailabilitySummary>>;
  loadDay: (dateIso: string) => Promise<CalculatedSlot[]>;
}

interface MonthCalendarProps {
  config: BusinessConfig;
  selectedServices: Service[];
  locationId: string;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  selectedProfessionalId?: string;
  selectedDate: string | null;
  selectedSlot: CalculatedSlot | null;
  onSelectSlot: (date: string, slot: CalculatedSlot) => void;
  remote?: RemoteAvailability;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Constantes estables para que el modo remoto no recalcule en cada render
const EMPTY_MONTH: Record<string, DayAvailabilitySummary> = {};

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  config,
  selectedServices,
  locationId,
  appointments,
  agendaBlocks,
  selectedProfessionalId,
  selectedDate,
  selectedSlot,
  onSelectSlot,
  remote
}) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  // Estado de la disponibilidad remota (solo se usa si `remote` está definido)
  const [remoteMonth, setRemoteMonth] = useState<Record<string, DayAvailabilitySummary> | null>(null);
  const [remoteMonthError, setRemoteMonthError] = useState<string | null>(null);
  const [remoteDay, setRemoteDay] = useState<CalculatedSlot[] | null>(null);
  const [remoteDayError, setRemoteDayError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  React.useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    setRemoteMonth(null);
    setRemoteMonthError(null);
    remote.loadMonth(currentYear, currentMonth)
      .then(result => { if (!cancelled) setRemoteMonth(result); })
      .catch((err: Error) => { if (!cancelled) setRemoteMonthError(err.message); });
    return () => { cancelled = true; };
  }, [remote, currentYear, currentMonth, retryKey]);

  React.useEffect(() => {
    if (!remote || !selectedDate) {
      setRemoteDay(null);
      setRemoteDayError(null);
      return;
    }
    let cancelled = false;
    setRemoteDay(null);
    setRemoteDayError(null);
    remote.loadDay(selectedDate)
      .then(slots => { if (!cancelled) setRemoteDay(slots); })
      .catch((err: Error) => { if (!cancelled) setRemoteDayError(err.message); });
    return () => { cancelled = true; };
  }, [remote, selectedDate, retryKey]);

  // Calculate day states for the displayed month (memoized to avoid rerender thrashing)
  const monthAvailability = React.useMemo(() => {
    if (remote) return remoteMonth ?? EMPTY_MONTH;
    return calculateMonthAvailability(
      config,
      selectedServices,
      currentYear,
      currentMonth,
      locationId,
      appointments,
      agendaBlocks,
      selectedProfessionalId
    );
  }, [remote, remoteMonth, config, selectedServices, currentYear, currentMonth, locationId, appointments, agendaBlocks, selectedProfessionalId]);

  // Calculate available slots for the selected date (memoized)
  const availableSlotsForDay: CalculatedSlot[] = React.useMemo(() => {
    if (remote) return remoteDay ?? [];
    if (!selectedDate) return [];
    return calculateAvailableSlotsForServices(
      config,
      selectedServices,
      selectedDate,
      locationId,
      appointments,
      agendaBlocks,
      selectedProfessionalId
    );
  }, [remote, remoteDay, config, selectedServices, selectedDate, locationId, appointments, agendaBlocks, selectedProfessionalId]);

  // Group slots by period
  const morningSlots = availableSlotsForDay.filter(s => s.period === 'morning');
  const middaySlots = availableSlotsForDay.filter(s => s.period === 'midday');
  const afternoonSlots = availableSlotsForDay.filter(s => s.period === 'afternoon');

  // Auto-select first available day if none selected
  React.useEffect(() => {
    if (remote) {
      if (selectedDate || !remoteMonth) return;
      const firstOpen = Object.values(remoteMonth).find(
        d => (d.level === 'high' || d.level === 'limited') && d.totalSlotsCount > 0
      );
      if (firstOpen) {
        remote.loadDay(firstOpen.date)
          .then(slots => { if (slots.length > 0) onSelectSlot(firstOpen.date, slots[0]); })
          .catch(() => { /* el error se muestra en el calendario */ });
      }
      return;
    }
    if (!selectedDate) {
      const firstOpenDay = Object.values(monthAvailability).find(
        d => (d.level === 'high' || d.level === 'limited') && d.totalSlotsCount > 0
      );
      if (firstOpenDay) {
        const slots = calculateAvailableSlotsForServices(
          config,
          selectedServices,
          firstOpenDay.date,
          locationId,
          appointments,
          agendaBlocks,
          selectedProfessionalId
        );
        if (slots.length > 0) {
          onSelectSlot(firstOpenDay.date, slots[0]);
        }
      }
    }
  }, [remote, remoteMonth, selectedDate, monthAvailability, config, selectedServices, locationId, appointments, agendaBlocks, selectedProfessionalId, onSelectSlot]);

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Calendar grid math
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handleDayClick = (dateStr: string, summary?: DayAvailabilitySummary) => {
    if (!summary || summary.level === 'closed' || summary.level === 'none') {
      return;
    }
    if (remote) {
      remote.loadDay(dateStr)
        .then(slots => { if (slots.length > 0) onSelectSlot(dateStr, slots[0]); })
        .catch(() => { /* el error se muestra en el calendario */ });
      return;
    }
    // Calculate slots for that date and set default if needed
    const slots = calculateAvailableSlotsForServices(
      config,
      selectedServices,
      dateStr,
      locationId,
      appointments,
      agendaBlocks,
      selectedProfessionalId
    );
    if (slots.length > 0) {
      onSelectSlot(dateStr, slots[0]);
    }
  };

  return (
    <div className="space-y-8">
      {/* Calendar Header with refined month navigation */}
      <div className="bg-white border border-[#E5DDD3] rounded-xl p-6 lg:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E5DDD3]/60">
          <div>
            <h3 className="font-serif-editorial text-2xl lg:text-3xl font-normal text-[#302C29]">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <p className="text-xs text-[#80766E] mt-0.5">
              Disponibilidad calculada para {selectedServices.length} {selectedServices.length === 1 ? 'servicio' : 'servicios seleccionados'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevMonth}
              aria-label="Mes anterior"
              className="p-2 border border-[#E5DDD3] rounded-lg text-[#302C29] hover:bg-[#F0EAE2] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToNextMonth}
              aria-label="Mes siguiente"
              className="p-2 border border-[#E5DDD3] rounded-lg text-[#302C29] hover:bg-[#F0EAE2] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Estado de la disponibilidad remota del mes */}
        {remote && remoteMonthError && (
          <div className="mb-4 p-3 bg-white border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-center justify-between gap-3">
            <span>{remoteMonthError}</span>
            <button type="button" onClick={() => setRetryKey(k => k + 1)} className="underline cursor-pointer whitespace-nowrap">
              Reintentar
            </button>
          </div>
        )}
        {remote && !remoteMonthError && remoteMonth === null && (
          <div className="mb-4 text-xs text-[#80766E]">Cargando disponibilidad…</div>
        )}

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
          {DAY_NAMES.map((name, i) => (
            <span key={name} className={`text-xs font-medium py-1 ${i === 0 ? 'text-[#80766E]/70' : 'text-[#80766E]'}`}>
              {name}
            </span>
          ))}
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
            <div key={`empty-${idx}`} className="aspect-square min-h-[46px] sm:min-h-[58px]" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const currentDayDate = new Date(currentYear, currentMonth, dayNum);
            const dateStr = formatDateIso(currentDayDate);
            const summary = monthAvailability[dateStr];
            const isSelected = selectedDate === dateStr;

            const isClickable = summary && (summary.level === 'high' || summary.level === 'limited');

            // Visual styling based on availability level
            let levelClass = 'bg-transparent text-[#80766E]/40 border-transparent cursor-not-allowed';
            let indicatorBadge = null;

            if (summary) {
              if (summary.level === 'high') {
                levelClass = isSelected
                  ? 'bg-[#302C29] text-white border-[#302C29] shadow-sm font-semibold'
                  : 'bg-white hover:bg-[#F0EAE2] text-[#302C29] border-[#E5DDD3] hover:border-[#A3B6A5] cursor-pointer';
                indicatorBadge = (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#A3B6A5]' : 'bg-[#A3B6A5]'}`} title={`${summary.totalSlotsCount} turnos disponibles`} />
                );
              } else if (summary.level === 'limited') {
                levelClass = isSelected
                  ? 'bg-[#302C29] text-white border-[#302C29] shadow-sm font-semibold'
                  : 'bg-white hover:bg-[#F0EAE2] text-[#302C29] border-[#E5DDD3] hover:border-[#D7BE93] cursor-pointer';
                indicatorBadge = (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#D7BE93]' : 'bg-[#D7BE93]'}`} title={`${summary.totalSlotsCount} turnos restantes`} />
                );
              } else if (summary.level === 'none') {
                levelClass = 'bg-[#FAF8F4] text-[#CEAAA3] border-transparent cursor-not-allowed';
                indicatorBadge = (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CEAAA3]" title="Completo" />
                );
              } else {
                // Closed
                levelClass = 'bg-transparent text-[#80766E]/30 border-transparent cursor-not-allowed';
              }
            }

            return (
              <button
                key={dateStr}
                type="button"
                disabled={!isClickable}
                onClick={() => handleDayClick(dateStr, summary)}
                className={`relative aspect-square min-h-[46px] sm:min-h-[58px] p-1 sm:p-2 rounded-lg border transition-all flex flex-col items-center justify-between text-left ${levelClass}`}
              >
                <span className="text-xs sm:text-sm tabular-nums">
                  {dayNum}
                </span>

                <div className="flex items-center gap-1 mt-auto">
                  {indicatorBadge}
                </div>
              </button>
            );
          })}
        </div>

        {/* Editorial Legend */}
        <div className="mt-6 pt-4 border-t border-[#E5DDD3]/60 flex flex-wrap items-center justify-between gap-4 text-xs text-[#80766E]">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A3B6A5]" />
              <span>Alta disponibilidad</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D7BE93]" />
              <span>Pocos turnos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#CEAAA3]" />
              <span>Completo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5DDD3]" />
              <span>Cerrado / Fuera de agenda</span>
            </div>
          </div>

          <span className="text-[11px] text-[#80766E]/80">
            Horarios calculados en tiempo real
          </span>
        </div>
      </div>

      {/* Available Slots for Selected Day */}
      {selectedDate && (
        <div className="bg-white border border-[#E5DDD3] rounded-xl p-6 lg:p-8 shadow-xs">
          <div className="mb-6 pb-3 border-b border-[#E5DDD3]/60">
            <h4 className="font-serif-editorial text-xl sm:text-2xl font-normal text-[#302C29]">
              Horarios disponibles para el {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h4>
            <p className="text-xs text-[#80766E] mt-0.5">
              {availableSlotsForDay.length} {availableSlotsForDay.length === 1 ? 'horario coincide' : 'horarios coinciden'} con todos los recursos y profesionales necesarios.
            </p>
          </div>

          {remote && remoteDayError ? (
            <div className="py-8 text-center text-sm text-[#80766E] space-y-2">
              <p>{remoteDayError}</p>
              <button type="button" onClick={() => setRetryKey(k => k + 1)} className="underline cursor-pointer">
                Reintentar
              </button>
            </div>
          ) : remote && remoteDay === null ? (
            <div className="py-8 text-center text-sm text-[#80766E]">Cargando horarios…</div>
          ) : availableSlotsForDay.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#80766E]">
              No hay horarios disponibles para esta combinación en esta fecha.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Morning Slots */}
              {morningSlots.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#80766E] mb-3">
                    <Sun className="w-3.5 h-3.5 text-[#B69A70]" />
                    <span>Mañana (antes de 12:00)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {morningSlots.map((slot) => {
                      const isPicked = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          onClick={() => onSelectSlot(selectedDate, slot)}
                          className={`px-3 py-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            isPicked
                              ? 'bg-[#302C29] text-white border-[#302C29] shadow-sm font-medium'
                              : 'bg-[#FAF8F4] hover:bg-white text-[#302C29] border-[#E5DDD3] hover:border-[#B69A70]'
                          }`}
                        >
                          <span className="text-sm font-semibold tabular-nums block">
                            {slot.startTime}
                          </span>
                          <span className={`text-[11px] block mt-0.5 ${isPicked ? 'text-white/80' : 'text-[#80766E]'}`}>
                            hasta {slot.endTime}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Midday Slots */}
              {middaySlots.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#80766E] mb-3">
                    <Sunset className="w-3.5 h-3.5 text-[#B69A70]" />
                    <span>Mediodía (12:00 a 16:00)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {middaySlots.map((slot) => {
                      const isPicked = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          onClick={() => onSelectSlot(selectedDate, slot)}
                          className={`px-3 py-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            isPicked
                              ? 'bg-[#302C29] text-white border-[#302C29] shadow-sm font-medium'
                              : 'bg-[#FAF8F4] hover:bg-white text-[#302C29] border-[#E5DDD3] hover:border-[#B69A70]'
                          }`}
                        >
                          <span className="text-sm font-semibold tabular-nums block">
                            {slot.startTime}
                          </span>
                          <span className={`text-[11px] block mt-0.5 ${isPicked ? 'text-white/80' : 'text-[#80766E]'}`}>
                            hasta {slot.endTime}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Afternoon Slots */}
              {afternoonSlots.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#80766E] mb-3">
                    <Moon className="w-3.5 h-3.5 text-[#B69A70]" />
                    <span>Tarde (después de 16:00)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {afternoonSlots.map((slot) => {
                      const isPicked = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          onClick={() => onSelectSlot(selectedDate, slot)}
                          className={`px-3 py-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            isPicked
                              ? 'bg-[#302C29] text-white border-[#302C29] shadow-sm font-medium'
                              : 'bg-[#FAF8F4] hover:bg-white text-[#302C29] border-[#E5DDD3] hover:border-[#B69A70]'
                          }`}
                        >
                          <span className="text-sm font-semibold tabular-nums block">
                            {slot.startTime}
                          </span>
                          <span className={`text-[11px] block mt-0.5 ${isPicked ? 'text-white/80' : 'text-[#80766E]'}`}>
                            hasta {slot.endTime}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
