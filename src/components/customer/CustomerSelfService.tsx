import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Appointment, 
  AgendaBlock, 
  CalculatedSlot 
} from '../../types';
import { MonthCalendar } from '../booking/MonthCalendar';
import { 
  getAppointmentByCode, 
  saveAppointment, 
  updateAppointmentStatus 
} from '../../services/storage';
import { 
  verifyAndConfirmBooking, 
  calculateAvailableSlotsForServices 
} from '../../services/availabilityEngine';
import { formatCurrency } from '../../services/pricingEngine';
import { 
  Search, 
  Calendar, 
  Clock, 
  MapPin, 
  AlertTriangle, 
  Check, 
  X, 
  RefreshCw,
  Share2
} from 'lucide-react';

interface CustomerSelfServiceProps {
  business: BusinessConfig;
  allAppointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  initialCode?: string;
}

export const CustomerSelfService: React.FC<CustomerSelfServiceProps> = ({
  business,
  allAppointments,
  agendaBlocks,
  initialCode = ''
}) => {
  const [searchCode, setSearchCode] = useState(initialCode);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(() => {
    if (initialCode) {
      return getAppointmentByCode(initialCode);
    }
    return null;
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Reschedule mode state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<CalculatedSlot | null>(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!searchCode.trim()) return;

    const apt = getAppointmentByCode(searchCode.trim());
    if (apt) {
      setActiveAppointment(apt);
      setIsRescheduling(false);
    } else {
      setActiveAppointment(null);
      setMessage({
        text: `No se encontró ninguna reserva con el código "${searchCode.trim().toUpperCase()}". Revisa el número e intenta nuevamente.`,
        type: 'error'
      });
    }
  };

  const handleCancelBooking = () => {
    if (!activeAppointment) return;
    const confirmCancel = window.confirm('¿Confirmas que deseas cancelar este turno? Los recursos y el horario serán liberados para otros clientes.');
    if (!confirmCancel) return;

    const updated: Appointment = {
      ...activeAppointment,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    };
    saveAppointment(updated);
    setActiveAppointment(updated);
    setMessage({
      text: 'Tu reserva ha sido cancelada correctamente. Los cupos han sido liberados.',
      type: 'success'
    });
  };

  const handleConfirmReschedule = () => {
    if (!activeAppointment || !rescheduleDate || !rescheduleSlot) {
      setMessage({ text: 'Por favor selecciona una fecha y horario para reprogramar.', type: 'error' });
      return;
    }

    setIsSavingReschedule(true);
    setMessage(null);

    // Filter appointments excluding the current one so current slot doesn't conflict with itself if shifting
    const otherAppointments = allAppointments.filter(a => a.id !== activeAppointment.id);

    // Verify atomic availability for the new slot
    const verify = verifyAndConfirmBooking(
      business,
      rescheduleSlot,
      rescheduleDate,
      activeAppointment.locationId,
      otherAppointments,
      agendaBlocks,
      activeAppointment.customer.phone
    );

    if (!verify.success) {
      setIsSavingReschedule(false);
      setMessage({
        text: verify.error || 'El nuevo horario ya no está disponible. Tu reserva original sigue intacta.',
        type: 'error'
      });
      return;
    }

    // Safely update the appointment with the new slot (atomic swap)
    const rescheduledApt: Appointment = {
      ...activeAppointment,
      date: rescheduleDate,
      startTime: rescheduleSlot.startTime,
      endTime: rescheduleSlot.endTime,
      status: 'confirmed',
      segments: rescheduleSlot.segmentsPlan.map((sp, idx) => ({
        id: `seg_resched_${Date.now()}_${idx}`,
        serviceId: sp.serviceId,
        serviceName: sp.serviceName,
        startTime: sp.startTime,
        endTime: sp.endTime,
        durationMinutes: sp.durationMinutes,
        professionalId: sp.professionalId,
        professionalName: sp.professionalName,
        resourceIds: sp.resourceIds,
        status: 'scheduled'
      })),
      updatedAt: new Date().toISOString()
    };

    saveAppointment(rescheduledApt);
    setActiveAppointment(rescheduledApt);
    setIsRescheduling(false);
    setIsSavingReschedule(false);
    setMessage({
      text: `¡Tu turno ha sido reprogramado con éxito para el ${new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${rescheduleSlot.startTime} hs!`,
      type: 'success'
    });
  };

  // Reconstruct selected services list for the appointment to feed MonthCalendar
  const appointmentServices = activeAppointment
    ? activeAppointment.segments
        .map(seg => business.services.find(s => s.id === seg.serviceId))
        .filter((s): s is NonNullable<typeof s> => !!s)
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-1">
          Autogestión de Clientes
        </span>
        <h2 className="font-serif-editorial text-3xl sm:text-4xl font-normal text-[#302C29]">
          Consulta y Modificación de Turnos
        </h2>
        <p className="text-xs text-[#80766E] max-w-md mx-auto mt-2">
          Introduce el código que recibiste al reservar para revisar los detalles, reprogramar fecha u horario, o cancelar.
        </p>
      </div>

      {/* Code Search Box */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2 max-w-md mx-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#80766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Ej. MAE-4912"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-sm font-mono uppercase tracking-wider text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* Status Messages */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl text-xs sm:text-sm flex items-start gap-3 border shadow-xs ${
          message.type === 'success' 
            ? 'bg-white border-[#A3B6A5] text-[#302C29]' 
            : 'bg-white border-[#CEAAA3] text-[#302C29]'
        }`}>
          {message.type === 'success' ? (
            <Check className="w-4 h-4 text-[#5e7761] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#CEAAA3] shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Appointment Detail View */}
      {activeAppointment && (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5DDD3]">
            <div>
              <span className="text-xs text-[#80766E] block">Código de reserva:</span>
              <span className="font-mono text-xl font-bold text-[#302C29] tracking-wider">
                {activeAppointment.bookingCode}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs text-[#80766E] block">Estado:</span>
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded ${
                activeAppointment.status === 'confirmed'
                  ? 'bg-[#A3B6A5]/20 text-[#302C29]'
                  : activeAppointment.status === 'cancelled'
                  ? 'bg-[#CEAAA3]/30 text-[#80766E] line-through'
                  : 'bg-[#F0EAE2] text-[#302C29]'
              }`}>
                {activeAppointment.status === 'confirmed' && 'Confirmado'}
                {activeAppointment.status === 'cancelled' && 'Cancelado'}
                {activeAppointment.status === 'completed' && 'Completado'}
                {activeAppointment.status === 'no_show' && 'No asistió'}
              </span>
            </div>
          </div>

          {/* Core Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Fecha:</span>
                <span className="font-semibold text-[#302C29]">
                  {new Date(activeAppointment.date + 'T12:00:00').toLocaleDateString('es-AR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long'
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Horario:</span>
                <span className="font-semibold tabular-nums text-[#302C29]">
                  {activeAppointment.startTime} a {activeAppointment.endTime} hs
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Ubicación:</span>
                <span className="font-medium text-[#302C29]">
                  {business.locations.find(l => l.id === activeAppointment.locationId)?.name || business.address}
                </span>
              </div>
            </div>
          </div>

          {/* Segment details */}
          <div className="bg-[#FAF8F4] p-4 rounded-xl border border-[#E5DDD3]/70 space-y-2 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block mb-1">
              Servicios & Profesionales:
            </span>
            {activeAppointment.segments.map((seg, idx) => (
              <div key={idx} className="flex justify-between items-center py-1 border-b border-[#E5DDD3]/40 last:border-none">
                <div>
                  <span className="font-semibold text-[#302C29]">{seg.serviceName}</span>
                  <span className="text-[#80766E] block text-[11px]">
                    Atendido por: {seg.professionalName}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-[#302C29]">
                  {seg.startTime} - {seg.endTime}
                </span>
              </div>
            ))}

            {activeAppointment.estimatedPrice > 0 && (
              <div className="pt-2 flex justify-between items-center text-xs">
                <span className="text-[#80766E]">Presupuesto:</span>
                <span className="font-bold tabular-nums text-[#302C29]">
                  {formatCurrency(activeAppointment.estimatedPrice)}
                </span>
              </div>
            )}
          </div>

          {/* Customer notes */}
          {activeAppointment.customer.notes && (
            <p className="text-xs text-[#80766E] italic">
              Nota del cliente: «{activeAppointment.customer.notes}»
            </p>
          )}

          {/* Reschedule View or Action Buttons */}
          {activeAppointment.status === 'confirmed' && (
            <div>
              {!isRescheduling ? (
                <div className="pt-4 border-t border-[#E5DDD3] flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRescheduling(true)}
                    className="px-4 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reprogramar Fecha u Horario</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelBooking}
                    className="px-4 py-2.5 bg-white hover:bg-[#FAF8F4] text-[#CEAAA3] hover:text-[#b37a70] border border-[#E5DDD3] text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar este turno
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-[#E5DDD3] space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif-editorial text-xl font-normal text-[#302C29]">
                      Elige tu nueva fecha y horario
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsRescheduling(false)}
                      className="text-xs text-[#80766E] hover:text-[#302C29] flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar cambio</span>
                    </button>
                  </div>

                  {/* Calendar with real calculations for the appointment's services */}
                  <MonthCalendar
                    config={business}
                    selectedServices={appointmentServices}
                    locationId={activeAppointment.locationId}
                    appointments={allAppointments.filter(a => a.id !== activeAppointment.id)}
                    agendaBlocks={agendaBlocks}
                    selectedDate={rescheduleDate}
                    selectedSlot={rescheduleSlot}
                    onSelectSlot={(date, slot) => {
                      setRescheduleDate(date);
                      setRescheduleSlot(slot);
                    }}
                  />

                  {rescheduleSlot && (
                    <div className="p-4 bg-[#FAF8F4] border border-[#E5DDD3] rounded-xl flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-[#80766E] block">Nuevo horario seleccionado:</span>
                        <span className="font-semibold text-[#302C29] tabular-nums">
                          {rescheduleDate} de {rescheduleSlot.startTime} a {rescheduleSlot.endTime} hs
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmReschedule}
                        disabled={isSavingReschedule}
                        className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {isSavingReschedule ? 'Validando...' : 'Confirmar Reprogramación'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
