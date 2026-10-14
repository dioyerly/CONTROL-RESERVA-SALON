import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Appointment, 
  AgendaBlock, 
  Professional 
} from '../../types';
import { timeToMinutes, formatDateIso } from '../../services/availabilityEngine';
import { formatCurrency } from '../../services/pricingEngine';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Plus,
  Coffee
} from 'lucide-react';

interface VisualCalendarViewProps {
  business: BusinessConfig;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onQuickNewAppointment: (date: string, startTime: string, profId?: string) => void;
}

type CalendarMode = 'day' | 'week' | 'month';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 to 20:00

export const VisualCalendarView: React.FC<VisualCalendarViewProps> = ({
  business,
  appointments,
  agendaBlocks,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onQuickNewAppointment
}) => {
  const [viewMode, setViewMode] = useState<CalendarMode>('day');

  const currentDateObj = new Date(selectedDate + 'T12:00:00');

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDateObj);
    if (viewMode === 'day') {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    onSelectDate(d.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const d = new Date(currentDateObj);
    if (viewMode === 'day') {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    onSelectDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    onSelectDate(formatDateIso(new Date()));
  };

  // Week math
  const getWeekDays = () => {
    const curr = new Date(currentDateObj);
    const dayOfWeek = curr.getDay(); // 0 is Sunday
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - distanceToMonday);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDays = getWeekDays();

  // Month math
  const currentYear = currentDateObj.getFullYear();
  const currentMonth = currentDateObj.getMonth();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return (
    <div className="bg-white border border-[#E5DDD3] rounded-2xl overflow-hidden shadow-xs text-xs">
      {/* Calendar Header with Google Calendar-style controls */}
      <div className="p-4 sm:p-5 border-b border-[#E5DDD3] flex flex-wrap items-center justify-between gap-4 bg-[#FAF8F4]/50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 border border-[#E5DDD3] hover:border-[#302C29] bg-white rounded-lg font-semibold text-[#302C29] transition-colors cursor-pointer"
          >
            Hoy
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Anterior"
              className="p-1.5 border border-[#E5DDD3] hover:bg-white rounded-lg text-[#302C29] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Siguiente"
              className="p-1.5 border border-[#E5DDD3] hover:bg-white rounded-lg text-[#302C29] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h3 className="font-serif-editorial text-xl sm:text-2xl font-normal text-[#302C29] ml-2">
            {viewMode === 'day' && currentDateObj.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {viewMode === 'week' && `Semana del ${new Date(weekDays[0] + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} al ${new Date(weekDays[6] + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            {viewMode === 'month' && `${MONTH_NAMES[currentMonth]} ${currentYear}`}
          </h3>
        </div>

        {/* View Mode Switcher: Día / Semana / Mes (Google Calendar style) */}
        <div className="flex items-center gap-1 p-1 bg-[#F0EAE2] border border-[#E5DDD3] rounded-xl shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'day' 
                ? 'bg-white text-[#302C29] shadow-xs font-bold border border-[#E5DDD3]' 
                : 'text-[#80766E] hover:text-[#302C29] hover:bg-white/50'
            }`}
          >
            <span>📅</span>
            <span>Día (Horas)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'week' 
                ? 'bg-white text-[#302C29] shadow-xs font-bold border border-[#E5DDD3]' 
                : 'text-[#80766E] hover:text-[#302C29] hover:bg-white/50'
            }`}
          >
            <span>📊</span>
            <span>Semana</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'month' 
                ? 'bg-white text-[#302C29] shadow-xs font-bold border border-[#E5DDD3]' 
                : 'text-[#80766E] hover:text-[#302C29] hover:bg-white/50'
            }`}
          >
            <span>🗓️</span>
            <span>Mes Completo</span>
          </button>
        </div>
      </div>

      {/* ================= 1. VISTA DÍA (COLUMNAS POR PROFESIONAL) ================= */}
      {viewMode === 'day' && (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header row with professionals */}
            <div className="grid grid-cols-12 border-b border-[#E5DDD3] bg-[#FAF8F4]/70">
              <div className="col-span-2 p-3 text-center border-r border-[#E5DDD3] font-semibold text-[#80766E]">
                Hora
              </div>
              <div className="col-span-10 grid" style={{ gridTemplateColumns: `repeat(${business.professionals.length}, 1fr)` }}>
                {business.professionals.map(prof => (
                  <div key={prof.id} className="p-3 text-center border-r border-[#E5DDD3] last:border-none">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: prof.color }} />
                      <span className="font-semibold text-[#302C29]">{prof.name}</span>
                    </div>
                    <span className="text-[11px] text-[#80766E] block mt-0.5 truncate">{prof.role}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Time Grid with appointments positioned visually */}
            <div className="relative">
              {HOURS.map(hour => (
                <div key={hour} className="grid grid-cols-12 border-b border-[#E5DDD3]/40 min-h-[64px] hover:bg-[#FAF8F4]/30">
                  <div className="col-span-2 p-2 text-right pr-4 text-[#80766E] font-mono text-[11px] border-r border-[#E5DDD3] select-none">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  <div className="col-span-10 grid" style={{ gridTemplateColumns: `repeat(${business.professionals.length}, 1fr)` }}>
                    {business.professionals.map(prof => (
                      <div
                        key={prof.id}
                        onClick={() => onQuickNewAppointment(selectedDate, `${hour.toString().padStart(2, '0')}:00`, prof.id)}
                        className="border-r border-[#E5DDD3]/40 last:border-none p-1 relative min-h-[64px] hover:bg-[#B69A70]/5 cursor-pointer group"
                        title="Clic para crear turno aquí"
                      >
                        <span className="hidden group-hover:block absolute top-1 right-1 text-[10px] text-[#B69A70] font-semibold">
                          + Agregar
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Overlay Appointments on top of the grid */}
              {appointments
                .filter(apt => apt.date === selectedDate && apt.status !== 'cancelled')
                .map(apt => {
                  return apt.segments.map((seg, segIdx) => {
                    const profIndex = business.professionals.findIndex(p => p.id === seg.professionalId);
                    if (profIndex === -1) return null;

                    const startMin = timeToMinutes(seg.startTime);
                    const endMin = timeToMinutes(seg.endTime);
                    const gridStartMin = 8 * 60; // 08:00 = 480 min
                    const minFromGridStart = Math.max(0, startMin - gridStartMin);
                    const duration = Math.max(25, endMin - startMin);

                    // 64px per hour = 1.066px per minute
                    const pxPerMin = 64 / 60;
                    const topPx = minFromGridStart * pxPerMin;
                    const heightPx = Math.max(32, duration * pxPerMin);

                    const colWidthPercent = 100 / business.professionals.length;
                    const leftPercent = profIndex * colWidthPercent;

                    const prof = business.professionals[profIndex];

                    return (
                      <div
                        key={`${apt.id}_${segIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAppointment(apt);
                        }}
                        className="absolute z-10 m-0.5 rounded-lg border p-2 shadow-xs cursor-pointer transition-transform hover:scale-[1.01] overflow-hidden flex flex-col justify-between"
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                          left: `calc(16.666% + (${leftPercent} / 100) * 83.333%)`,
                          width: `calc((${colWidthPercent} / 100) * 83.333% - 8px)`,
                          backgroundColor: `${prof.color}15`,
                          borderColor: prof.color
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between font-semibold text-[#302C29] text-[11px] truncate">
                            <span>{apt.customer.name}</span>
                            <span className="font-mono tabular-nums">{seg.startTime}</span>
                          </div>
                          <div className="text-[10px] text-[#80766E] truncate">
                            {seg.serviceName}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#80766E] mt-auto">
                          <span className={`px-1 rounded text-[9px] uppercase font-bold ${
                            apt.status === 'confirmed' ? 'bg-[#A3B6A5]/30 text-[#302C29]' : 'bg-[#FAF8F4] text-[#80766E]'
                          }`}>
                            {apt.status === 'confirmed' ? 'Confirmado' : apt.status}
                          </span>
                          <span className="font-mono text-[9px]">{apt.bookingCode}</span>
                        </div>
                      </div>
                    );
                  });
                })}

              {/* Overlay Agenda Blocks (Breaks, Vacations) */}
              {agendaBlocks
                .filter(b => b.date === selectedDate)
                .map(block => {
                  const profIndex = business.professionals.findIndex(p => p.id === block.professionalId);
                  const isAll = profIndex === -1;

                  const startMin = timeToMinutes(block.startTime);
                  const endMin = timeToMinutes(block.endTime);
                  const gridStartMin = 8 * 60;
                  const minFromGridStart = Math.max(0, startMin - gridStartMin);
                  const duration = Math.max(30, endMin - startMin);

                  const pxPerMin = 64 / 60;
                  const topPx = minFromGridStart * pxPerMin;
                  const heightPx = duration * pxPerMin;

                  const colWidthPercent = isAll ? 100 : 100 / business.professionals.length;
                  const leftPercent = isAll ? 0 : profIndex * (100 / business.professionals.length);

                  return (
                    <div
                      key={block.id}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: `calc(16.666% + (${leftPercent} / 100) * 83.333%)`,
                        width: `calc((${colWidthPercent} / 100) * 83.333% - 8px)`
                      }}
                      className="absolute z-10 m-0.5 rounded-lg border border-dashed border-[#D7BE93] bg-[#F0EAE2]/80 p-2 text-[11px] text-[#80766E] flex items-center gap-2 pointer-events-none"
                    >
                      <Coffee className="w-3.5 h-3.5 text-[#B69A70] shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-[#302C29]">{block.reason}</span>
                        <span className="block text-[10px]">{block.startTime} a {block.endTime} hs</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ================= 2. VISTA SEMANA (7 DÍAS EN GRILLA HORARIA) ================= */}
      {viewMode === 'week' && (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header row with 7 days */}
            <div className="grid grid-cols-8 border-b border-[#E5DDD3] bg-[#FAF8F4]/70">
              <div className="p-3 text-center border-r border-[#E5DDD3] font-semibold text-[#80766E]">
                Hora
              </div>
              {weekDays.map(dStr => {
                const dateObj = new Date(dStr + 'T12:00:00');
                const isSelected = dStr === selectedDate;
                return (
                  <div
                    key={dStr}
                    onClick={() => onSelectDate(dStr)}
                    className={`p-3 text-center border-r border-[#E5DDD3] last:border-none cursor-pointer transition-colors ${
                      isSelected ? 'bg-white font-bold text-[#302C29]' : 'hover:bg-white text-[#80766E]'
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wider block">
                      {dateObj.toLocaleDateString('es-AR', { weekday: 'short' })}
                    </span>
                    <span className="text-base font-semibold text-[#302C29] tabular-nums">
                      {dateObj.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Time Grid for Week */}
            <div className="relative">
              {HOURS.map(hour => (
                <div key={hour} className="grid grid-cols-8 border-b border-[#E5DDD3]/40 min-h-[58px]">
                  <div className="p-2 text-right pr-4 text-[#80766E] font-mono text-[11px] border-r border-[#E5DDD3]">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  {weekDays.map(dStr => (
                    <div
                      key={dStr}
                      onClick={() => onQuickNewAppointment(dStr, `${hour.toString().padStart(2, '0')}:00`)}
                      className="border-r border-[#E5DDD3]/40 last:border-none p-1 relative min-h-[58px] hover:bg-[#B69A70]/5 cursor-pointer"
                    />
                  ))}
                </div>
              ))}

              {/* Overlay Appointments for the week */}
              {appointments
                .filter(apt => weekDays.includes(apt.date) && apt.status !== 'cancelled')
                .map(apt => {
                  const dayIndex = weekDays.indexOf(apt.date);
                  if (dayIndex === -1) return null;

                  const startMin = timeToMinutes(apt.startTime);
                  const endMin = timeToMinutes(apt.endTime);
                  const gridStartMin = 8 * 60;
                  const minFromGridStart = Math.max(0, startMin - gridStartMin);
                  const duration = Math.max(30, endMin - startMin);

                  const pxPerMin = 58 / 60;
                  const topPx = minFromGridStart * pxPerMin;
                  const heightPx = Math.max(32, duration * pxPerMin);

                  const colWidthPercent = 100 / 7;
                  const leftPercent = dayIndex * colWidthPercent;

                  return (
                    <div
                      key={apt.id}
                      onClick={() => onSelectAppointment(apt)}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: `calc(12.5% + (${leftPercent} / 100) * 87.5%)`,
                        width: `calc((${colWidthPercent} / 100) * 87.5% - 6px)`
                      }}
                      className="absolute z-10 m-0.5 rounded-lg border border-[#B69A70] bg-[#FAF8F4] p-1.5 shadow-xs cursor-pointer hover:scale-[1.01] overflow-hidden"
                    >
                      <div className="font-semibold text-[#302C29] text-[11px] truncate">
                        {apt.customer.name}
                      </div>
                      <div className="text-[10px] text-[#80766E] truncate">
                        {apt.startTime} - {apt.segments[0]?.serviceName}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ================= 3. VISTA MES COMPLETO ================= */}
      {viewMode === 'month' && (
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-xs font-semibold text-[#80766E]">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
              <div key={`empty-${idx}`} className="min-h-[90px] bg-[#FAF8F4]/30 rounded-lg" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
              const dayAppointments = appointments.filter(a => a.date === dateStr && a.status !== 'cancelled');
              const isSelected = selectedDate === dateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => {
                    onSelectDate(dateStr);
                    setViewMode('day'); // Open day view when clicking on a date
                  }}
                  className={`min-h-[90px] p-2 border rounded-xl flex flex-col justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#302C29] bg-[#FAF8F4] ring-1 ring-[#302C29]'
                      : 'border-[#E5DDD3] bg-white hover:border-[#B69A70] hover:bg-[#FAF8F4]/40'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs tabular-nums text-[#302C29]">
                      {dayNum}
                    </span>
                    {dayAppointments.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#A3B6A5]/30 text-[#302C29] font-bold text-[10px]">
                        {dayAppointments.length}
                      </span>
                    )}
                  </div>

                  {/* Micro list of appointments */}
                  <div className="space-y-1 my-1 overflow-hidden">
                    {dayAppointments.slice(0, 2).map(apt => (
                      <div
                        key={apt.id}
                        className="px-1.5 py-0.5 rounded bg-[#F0EAE2] text-[10px] text-[#302C29] truncate font-medium"
                      >
                        {apt.startTime} {apt.customer.name}
                      </div>
                    ))}
                    {dayAppointments.length > 2 && (
                      <span className="text-[10px] text-[#80766E] font-semibold block">
                        +{dayAppointments.length - 2} más
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#80766E] text-right block mt-auto">
                    Ver día →
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
