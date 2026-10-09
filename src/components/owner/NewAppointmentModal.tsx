import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Appointment, 
  AgendaBlock, 
  CalculatedSlot 
} from '../../types';
import { calculateAvailableSlotsForServices } from '../../services/availabilityEngine';
import { saveAppointment, addAgendaBlock } from '../../services/storage';
import { formatCurrency } from '../../services/pricingEngine';
import { X, Calendar, Clock, User, ShieldAlert, Check } from 'lucide-react';

interface NewAppointmentModalProps {
  business: BusinessConfig;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  onClose: () => void;
  onSuccess: () => void;
  defaultDate?: string;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  business,
  appointments,
  agendaBlocks,
  onClose,
  onSuccess,
  defaultDate = new Date().toISOString().split('T')[0]
}) => {
  const [mode, setMode] = useState<'appointment' | 'block'>('appointment');

  // Appointment fields
  const [selectedServiceId, setSelectedServiceId] = useState<string>(business.services[0]?.id || '');
  const [date, setDate] = useState<string>(defaultDate);
  const [locationId, setLocationId] = useState<string>(business.locations[0]?.id || '');
  const [professionalId, setProfessionalId] = useState<string>(''); // empty = any
  const [chosenSlot, setChosenSlot] = useState<CalculatedSlot | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Agenda block fields
  const [blockStartTime, setBlockStartTime] = useState('14:00');
  const [blockEndTime, setBlockEndTime] = useState('15:00');
  const [blockReason, setBlockReason] = useState('Descanso / Pausa personal');
  const [blockStaffId, setBlockStaffId] = useState<string>(business.professionals[0]?.id || '');
  const [blockType, setBlockType] = useState<AgendaBlock['type']>('break');

  const [error, setError] = useState<string | null>(null);

  const selectedService = business.services.find(s => s.id === selectedServiceId);

  // Available slots for the selected service & date
  const availableSlots = selectedService
    ? calculateAvailableSlotsForServices(
        business,
        [selectedService],
        date,
        locationId,
        appointments,
        agendaBlocks,
        professionalId || undefined
      )
    : [];

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenSlot || !selectedService) {
      setError('Por favor selecciona un horario disponible.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Por favor indica nombre y teléfono del cliente.');
      return;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingCode = `MAE-${randomSuffix}`;

    const newApt: Appointment = {
      id: `apt_manual_${Date.now()}`,
      bookingCode,
      businessId: business.id,
      customer: {
        name: customerName,
        phone: customerPhone,
        notes: notes || undefined
      },
      date,
      startTime: chosenSlot.startTime,
      endTime: chosenSlot.endTime,
      totalDurationMinutes: selectedService.durationMinutes,
      status: 'confirmed',
      locationId,
      estimatedPrice: selectedService.price || 0,
      internalNotes: 'Creado manualmente desde Estudio Propietario',
      segments: chosenSlot.segmentsPlan.map((sp, idx) => ({
        id: `seg_man_${Date.now()}_${idx}`,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    saveAppointment(newApt);
    onSuccess();
  };

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const newBlock: AgendaBlock = {
      id: `blk_${Date.now()}`,
      businessId: business.id,
      professionalId: blockStaffId || undefined,
      locationId,
      date,
      startTime: blockStartTime,
      endTime: blockEndTime,
      reason: blockReason,
      type: blockType
    };

    addAgendaBlock(newBlock);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-xl p-6 sm:p-8 shadow-xl relative my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Cerrar ventana"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab switch between manual appointment & block */}
        <div className="flex items-center gap-2 border-b border-[#E5DDD3] pb-3 mb-6">
          <button
            type="button"
            onClick={() => { setMode('appointment'); setError(null); }}
            className={`pb-2 text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'appointment'
                ? 'text-[#302C29] border-b-2 border-[#302C29]'
                : 'text-[#80766E] hover:text-[#302C29]'
            }`}
          >
            Nuevo Turno Manual
          </button>
          <button
            type="button"
            onClick={() => { setMode('block'); setError(null); }}
            className={`pb-2 text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'block'
                ? 'text-[#302C29] border-b-2 border-[#302C29]'
                : 'text-[#80766E] hover:text-[#302C29]'
            }`}
          >
            Bloquear Horario / Pausa
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#CEAAA3] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'appointment' ? (
          <form onSubmit={handleCreateAppointment} className="space-y-4 text-xs">
            {/* Service & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Servicio</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => {
                    setSelectedServiceId(e.target.value);
                    setChosenSlot(null);
                  }}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                >
                  {business.services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setChosenSlot(null);
                  }}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                />
              </div>
            </div>

            {/* Staff filter */}
            {business.professionals.length > 1 && (
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Profesional asignado</label>
                <select
                  value={professionalId}
                  onChange={(e) => {
                    setProfessionalId(e.target.value);
                    setChosenSlot(null);
                  }}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                >
                  <option value="">Cualquier profesional disponible</option>
                  {business.professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Slot selector */}
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">
                Horario disponible ({availableSlots.length} encontrados)
              </label>
              {availableSlots.length === 0 ? (
                <div className="p-3 bg-[#FAF8F4] border border-[#E5DDD3] rounded-lg text-[#80766E] text-center">
                  No hay disponibilidad para esta fecha y servicio.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4]">
                  {availableSlots.map(slot => {
                    const isPicked = chosenSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setChosenSlot(slot)}
                        className={`p-2 rounded text-center border cursor-pointer ${
                          isPicked
                            ? 'bg-[#302C29] text-white border-[#302C29]'
                            : 'bg-white text-[#302C29] border-[#E5DDD3] hover:border-[#B69A70]'
                        }`}
                      >
                        <span className="font-semibold block">{slot.startTime}</span>
                        <span className="text-[10px] opacity-75">{slot.endTime}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Customer info */}
            <div className="pt-2 border-t border-[#E5DDD3] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#302C29] mb-1">Nombre del cliente *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej. Paula Rossi"
                    className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#302C29] mb-1">Teléfono *</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+54 9 11 ..."
                    className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Notas internas</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles sobre preferencias o requerimientos"
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E5DDD3] text-[#302C29] rounded-lg hover:bg-[#FAF8F4]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!chosenSlot}
                className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-50 text-white font-medium rounded-lg shadow-xs cursor-pointer"
              >
                Guardar Turno
              </button>
            </div>
          </form>
        ) : (
          /* BLOCK FORM */
          <form onSubmit={handleCreateBlock} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Profesional afectado</label>
                <select
                  value={blockStaffId}
                  onChange={(e) => setBlockStaffId(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                >
                  <option value="">Todo el establecimiento</option>
                  {business.professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Desde (HH:MM)</label>
                <input
                  type="time"
                  value={blockStartTime}
                  onChange={(e) => setBlockStartTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Hasta (HH:MM)</label>
                <input
                  type="time"
                  value={blockEndTime}
                  onChange={(e) => setBlockEndTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Motivo del bloqueo</label>
              <input
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Ej. Capacitación, descanso, mantenimiento, etc."
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Tipo de bloqueo</label>
              <select
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as AgendaBlock['type'])}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="break">Pausa / Descanso</option>
                <option value="personal">Asunto personal</option>
                <option value="maintenance">Mantenimiento de espacio</option>
                <option value="vacation">Vacaciones</option>
              </select>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E5DDD3] text-[#302C29] rounded-lg hover:bg-[#FAF8F4]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg shadow-xs cursor-pointer"
              >
                Bloquear Período
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
