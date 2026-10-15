import React, { useMemo, useState } from 'react';
import { CalculatedSlot } from '../../types';
import { MonthCalendar, RemoteAvailability } from '../booking/MonthCalendar';
import {
  PublicCatalog,
  catalogToBusinessConfig,
  fetchDaySlots,
  fetchMonthSummary,
  fetchPublicCatalog
} from '../../services/supabaseBooking';
import {
  bookingActions,
  PublicBookingView,
  resolveBookingIds,
  validateLookupInput
} from '../../services/bookingActions';
import { createInFlightRunner } from '../../services/inFlight';
import { formatCurrency } from '../../services/pricingEngine';
import { AlertTriangle, Calendar, Check, Clock, MapPin, RefreshCw, Search, X } from 'lucide-react';

// Mismo mensaje para código inexistente y teléfono incorrecto: no revela cuál de los dos falló.
const LOOKUP_ERROR = 'No encontramos una reserva con ese código y teléfono. Revisá los datos e intentá nuevamente.';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'No asistió'
};

// Listas constantes: el calendario remoto no recalcula por cada render del padre
const NO_APPOINTMENTS: never[] = [];

const INPUT = 'w-full px-3 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-sm text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]';

interface RemoteSelfServiceProps {
  businessUuid: string;
  initialCode?: string;
}

// Consulta, cancelación y reprogramación sin cuenta. Todo pasa por las funciones públicas de Supabase.
export const RemoteSelfService: React.FC<RemoteSelfServiceProps> = ({ businessUuid, initialCode = '' }) => {
  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState('');
  const [booking, setBooking] = useState<PublicBookingView | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [runner] = useState(() => createInFlightRunner(setBusyKeys));
  const isBusy = (key: string) => busyKeys.includes(key);

  // Reprogramación
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [rescheduleIds, setRescheduleIds] = useState<{ locationUuid: string; serviceUuids: string[] } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<CalculatedSlot | null>(null);

  // Ejecuta una acción en curso. Devuelve su resultado solo si el servidor confirmó; si no, muestra el error.
  const runAction = async <T,>(key: string, fn: () => Promise<T>, success: (value: T) => string): Promise<T | null> => {
    try {
      let value: T | null = null;
      const ran = await runner.run(key, async () => { value = await fn(); });
      if (!ran || value === null) return null;
      setMessage({ text: success(value), type: 'success' });
      return value;
    } catch (err) {
      setMessage({ text: (err as Error).message, type: 'error' });
      return null;
    }
  };

  // Estado real del turno desde el servidor (se usa después de cada intento, también si falló)
  const refreshBooking = async (currentCode: string, currentPhone: string) => {
    try {
      const found = await bookingActions.findPublicBooking(businessUuid, currentCode, currentPhone);
      setBooking(found);
    } catch {
      // Si no se puede actualizar, se conserva lo último confirmado y el mensaje ya explicó el error
    }
  };

  const closeReschedule = () => {
    setIsRescheduling(false);
    setRescheduleDate(null);
    setRescheduleSlot(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateLookupInput(code, phone);
    if (problem) {
      setBooking(null);
      setMessage({ text: problem, type: 'error' });
      return;
    }
    setMessage(null);
    closeReschedule();
    try {
      await runner.run('lookup', async () => {
        const result = await bookingActions.findPublicBooking(businessUuid, code, phone);
        setBooking(result);
        if (!result) setMessage({ text: LOOKUP_ERROR, type: 'error' });
      });
    } catch (err) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    if (!window.confirm('¿Confirmás que querés cancelar este turno? El horario queda libre para otros clientes.')) return;
    const currentCode = booking.code;
    await runAction('cancel', () => bookingActions.cancelPublicBooking(businessUuid, currentCode, phone),
      () => 'Tu turno fue cancelado.');
    await refreshBooking(currentCode, phone);
  };

  const handleStartReschedule = async () => {
    if (!booking) return;
    setMessage(null);
    try {
      const loaded = catalog ?? await fetchPublicCatalog(businessUuid);
      setCatalog(loaded);
      // Sede y servicios del turno, a partir de los nombres que devuelve la consulta pública
      setRescheduleIds(resolveBookingIds(loaded, booking));
      setIsRescheduling(true);
    } catch (err) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  const rescheduleConfig = useMemo(
    () => (catalog ? catalogToBusinessConfig(catalog, businessUuid) : null),
    [catalog, businessUuid]
  );

  const rescheduleRemote = useMemo<RemoteAvailability | undefined>(() => {
    if (!catalog || !rescheduleIds) return undefined;
    const ids = rescheduleIds;
    const loadDay = (date: string) => fetchDaySlots({
      businessUuid,
      locationUuid: ids.locationUuid,
      date,
      serviceUuids: ids.serviceUuids,
      professionalUuid: null
    });
    return {
      loadDay,
      loadMonth: (year, month) => fetchMonthSummary({ catalog, year, month, fetchDay: loadDay })
    };
  }, [catalog, rescheduleIds, businessUuid]);

  const handleConfirmReschedule = async () => {
    if (!booking || !rescheduleDate || !rescheduleSlot) {
      setMessage({ text: 'Elegí una fecha y un horario para reprogramar.', type: 'error' });
      return;
    }
    const currentCode = booking.code;
    const result = await runAction(
      'reschedule',
      () => bookingActions.reschedulePublicBooking(businessUuid, currentCode, phone, rescheduleDate, rescheduleSlot.startTime),
      done => `Tu turno fue reprogramado para el ${done.date} a las ${done.startTime} hs.`
    );
    if (result) closeReschedule();
    await refreshBooking(currentCode, phone);
  };

  const selectedServices = rescheduleConfig && rescheduleIds
    ? rescheduleConfig.services.filter(s => rescheduleIds.serviceUuids.includes(s.id))
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12">
      <div className="text-center mb-8">
        <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-1">
          Autogestión de Clientes
        </span>
        <h2 className="font-serif-editorial text-3xl sm:text-4xl font-normal text-[#302C29]">
          Consulta y Modificación de Turnos
        </h2>
        <p className="text-xs text-[#80766E] max-w-md mx-auto mt-2">
          Ingresá el código que recibiste al reservar y el teléfono de la reserva para ver el turno, reprogramarlo o cancelarlo.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#80766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ej. MAE-4912"
              aria-label="Código de reserva"
              className={`${INPUT} pl-9 font-mono uppercase tracking-wider`}
            />
          </div>
          <div className="relative flex-1">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono de la reserva"
              aria-label="Teléfono de la reserva"
              autoComplete="tel"
              className={INPUT}
            />
          </div>
          <button
            type="submit"
            disabled={isBusy('lookup')}
            className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-60 text-white text-xs font-semibold uppercase tracking-wider rounded-lg cursor-pointer"
          >
            {isBusy('lookup') ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </form>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-6 p-4 rounded-xl text-xs sm:text-sm flex items-start gap-3 border shadow-xs bg-white text-[#302C29] ${
          message.type === 'success' ? 'border-[#A3B6A5]' : 'border-[#CEAAA3]'
        }`}>
          {message.type === 'success'
            ? <Check className="w-4 h-4 text-[#5e7761] shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 text-[#CEAAA3] shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {booking && (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5DDD3]">
            <div>
              <span className="text-xs text-[#80766E] block">Código de reserva:</span>
              <span className="font-mono text-xl font-bold text-[#302C29] tracking-wider">{booking.code}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#80766E] block">Estado:</span>
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded ${
                booking.status === 'confirmed' ? 'bg-[#A3B6A5]/20 text-[#302C29]'
                  : booking.status === 'cancelled' ? 'bg-[#CEAAA3]/30 text-[#80766E] line-through'
                  : 'bg-[#F0EAE2] text-[#302C29]'
              }`}>
                {STATUS_LABEL[booking.status] ?? booking.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Fecha:</span>
                <span className="font-semibold text-[#302C29]">
                  {new Date(booking.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'long' })}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Horario:</span>
                <span className="font-semibold tabular-nums text-[#302C29]">{booking.startTime} a {booking.endTime} hs</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#B69A70] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#80766E] block">Ubicación:</span>
                <span className="font-medium text-[#302C29]">{booking.location}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#FAF8F4] p-4 rounded-xl border border-[#E5DDD3]/70 space-y-2 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block mb-1">Servicios y profesionales:</span>
            {booking.segments.map((seg, idx) => (
              <div key={idx} className="flex justify-between items-center py-1 border-b border-[#E5DDD3]/40 last:border-none">
                <div>
                  <span className="font-semibold text-[#302C29]">{seg.service}</span>
                  <span className="text-[#80766E] block text-[11px]">Atendido por: {seg.professional}</span>
                </div>
                <span className="font-mono tabular-nums text-[#302C29]">{seg.start} - {seg.end}</span>
              </div>
            ))}
            {booking.total > 0 && (
              <div className="pt-2 flex justify-between items-center text-xs">
                <span className="text-[#80766E]">Presupuesto:</span>
                <span className="font-bold tabular-nums text-[#302C29]">{formatCurrency(booking.total)}</span>
              </div>
            )}
          </div>

          {booking.status === 'confirmed' && !isRescheduling && (
            <div className="pt-4 border-t border-[#E5DDD3] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isBusy('cancel') || isBusy('reschedule')}
                onClick={handleStartReschedule}
                className="px-4 py-2.5 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reprogramar fecha u horario</span>
              </button>
              <button
                type="button"
                disabled={isBusy('cancel') || isBusy('reschedule')}
                onClick={handleCancel}
                className="px-4 py-2.5 bg-white hover:bg-[#FAF8F4] disabled:opacity-60 text-[#CEAAA3] hover:text-[#b37a70] border border-[#E5DDD3] text-xs font-medium rounded-lg cursor-pointer"
              >
                {isBusy('cancel') ? 'Cancelando…' : 'Cancelar este turno'}
              </button>
            </div>
          )}

          {booking.status === 'confirmed' && isRescheduling && rescheduleConfig && rescheduleIds && rescheduleRemote && (
            <div className="pt-4 border-t border-[#E5DDD3] space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="font-serif-editorial text-xl font-normal text-[#302C29]">Elegí tu nueva fecha y horario</h4>
                <button
                  type="button"
                  onClick={closeReschedule}
                  disabled={isBusy('reschedule')}
                  className="text-xs text-[#80766E] hover:text-[#302C29] flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar cambio</span>
                </button>
              </div>

              <MonthCalendar
                config={rescheduleConfig}
                selectedServices={selectedServices}
                locationId={rescheduleIds.locationUuid}
                appointments={NO_APPOINTMENTS}
                agendaBlocks={NO_APPOINTMENTS}
                selectedDate={rescheduleDate}
                selectedSlot={rescheduleSlot}
                onSelectSlot={(date, slot) => { setRescheduleDate(date); setRescheduleSlot(slot); }}
                remote={rescheduleRemote}
              />

              {rescheduleSlot && (
                <div className="p-4 bg-[#FAF8F4] border border-[#E5DDD3] rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs">
                    <span className="text-[#80766E] block">Nuevo horario seleccionado:</span>
                    <span className="font-semibold text-[#302C29] tabular-nums">
                      {rescheduleDate} de {rescheduleSlot.startTime} a {rescheduleSlot.endTime} hs
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmReschedule}
                    disabled={isBusy('reschedule')}
                    className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {isBusy('reschedule') ? 'Validando…' : 'Confirmar reprogramación'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
