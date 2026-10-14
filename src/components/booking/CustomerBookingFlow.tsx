import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Service, 
  CalculatedSlot, 
  Appointment, 
  AgendaBlock, 
  CustomerData 
} from '../../types';
import { MonthCalendar } from './MonthCalendar';
import heroBackground from '../../assets/images/hero-background.png';
import { calculatePricing, formatCurrency } from '../../services/pricingEngine';
import { verifyAndConfirmBooking } from '../../services/availabilityEngine';
import { saveAppointment } from '../../services/storage';
import { 
  Check, 
  Clock, 
  MapPin, 
  Calendar as CalendarIcon, 
  Sparkles, 
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Share2,
  ExternalLink
} from 'lucide-react';

interface CustomerBookingFlowProps {
  business: BusinessConfig;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  onBookingComplete: (bookingCode: string) => void;
  onGoToSelfService: (code: string) => void;
}

export const CustomerBookingFlow: React.FC<CustomerBookingFlowProps> = ({
  business,
  appointments,
  agendaBlocks,
  onBookingComplete,
  onGoToSelfService
}) => {
  // Step tracking: 1 = Services, 2 = Date & Slot, 3 = Details & Estimate, 4 = Confirmation
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Selected state
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    business.locations[0]?.id || ''
  );
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>(''); // empty = Any
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CalculatedSlot | null>(null);

  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    phone: '',
    email: '',
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAppointment, setCompletedAppointment] = useState<Appointment | null>(null);

  // Selected services list
  const selectedServices = business.services.filter(s => selectedServiceIds.includes(s.id));

  // Pricing evaluation
  const pricingEval = calculatePricing(
    selectedServices,
    business.bundlePricingRules,
    business.pricingDisplayMode
  );

  const totalDurationMinutes = selectedServices.reduce((acc, s) => acc + s.durationMinutes, 0);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds(prev => {
      const exists = prev.includes(serviceId);
      const updated = exists ? prev.filter(id => id !== serviceId) : [...prev, serviceId];
      // Reset selected slot if service combination changes
      setSelectedDate(null);
      setSelectedSlot(null);
      return updated;
    });
  };

  const handleSelectSlot = (date: string, slot: CalculatedSlot) => {
    setSelectedDate(date);
    setSelectedSlot(slot);
    setErrorMessage(null);
  };

  const handleProceedToDetails = () => {
    if (!selectedDate || !selectedSlot) {
      setErrorMessage('Por favor selecciona una fecha y horario para continuar.');
      return;
    }
    setErrorMessage(null);
    setCurrentStep(3);
  };

  const handleConfirmReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerData.name.trim() || !customerData.phone.trim()) {
      setErrorMessage('Por favor ingresa tu nombre y un teléfono de contacto.');
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setErrorMessage('Falta seleccionar fecha y horario.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Atomic server-level double validation (Regla 7)
    const verification = verifyAndConfirmBooking(
      business,
      selectedSlot,
      selectedDate,
      selectedLocationId,
      appointments,
      agendaBlocks,
      customerData.phone
    );

    if (!verification.success) {
      setIsSubmitting(false);
      setErrorMessage(verification.error || 'El turno ya no está disponible. Por favor elige otro horario.');
      return;
    }

    // Generate unique booking code
    const randomCodeSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingCode = `MAE-${randomCodeSuffix}`;

    const newAppointment: Appointment = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      bookingCode,
      businessId: business.id,
      customer: customerData,
      date: selectedDate,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      totalDurationMinutes,
      status: 'confirmed',
      locationId: selectedLocationId,
      estimatedPrice: pricingEval.totalPrice,
      bundleAppliedName: pricingEval.bundlesApplied[0]?.name,
      priceNote: pricingEval.variableNote,
      segments: selectedSlot.segmentsPlan.map((sp, idx) => ({
        id: `seg_${Date.now()}_${idx}`,
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

    // Save to persistent storage and broadcast
    saveAppointment(newAppointment);

    setCompletedAppointment(newAppointment);
    setIsSubmitting(false);
    setCurrentStep(4);
    onBookingComplete(bookingCode);
  };

  const filteredServices = business.services.filter(s => {
    if (!s.isOnlineBookingEnabled) return false;
    if (selectedLocationId && !s.locationIds.includes(selectedLocationId)) return false;
    if (activeCategoryFilter === 'all') return true;
    return s.categoryId === activeCategoryFilter;
  });

  const generateWhatsAppMessage = () => {
    if (!completedAppointment) return '';
    const loc = business.locations.find(l => l.id === completedAppointment.locationId);
    const dateFormatted = new Date(completedAppointment.date + 'T12:00:00').toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    
    return encodeURIComponent(
      `Hola ${business.name}, acabo de reservar el turno *${completedAppointment.bookingCode}* para el ${dateFormatted} a las ${completedAppointment.startTime} hs.\n` +
      `Servicios: ${completedAppointment.segments.map(s => s.serviceName).join(', ')}.\n` +
      `Nombre: ${completedAppointment.customer.name}`
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
      {/* Brand Hero Showcase: fondo marmolado con el nombre del negocio encima */}
      <div
        className="relative mb-10 rounded-2xl overflow-hidden text-center min-h-[320px] flex flex-col items-center justify-center px-6 py-12 bg-cover bg-center border border-[#E5DDD3]"
        style={{ backgroundImage: `url(${heroBackground})` }}
      >
        <div className="relative">
        <span className="text-xs uppercase tracking-widest text-[#B69A70] font-medium block mb-2">
          {business.mode === 'independent' ? 'Estudio Independiente' : 'Espacio de Belleza & Bienestar'}
        </span>
        <h1 className="font-brand text-4xl sm:text-5xl lg:text-6xl font-medium text-[#302C29] tracking-tight">
          {business.name}
        </h1>
        <p className="max-w-xl mx-auto text-sm text-[#80766E] mt-3 font-normal leading-relaxed">
          {business.tagline}
        </p>

        {/* Location badge if multiple */}
        {business.locations.length > 1 && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 bg-[#F0EAE2] rounded text-xs text-[#302C29]">
            <MapPin className="w-3.5 h-3.5 text-[#B69A70]" />
            <span>Sede seleccionada:</span>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="bg-transparent font-semibold border-none p-0 focus:ring-0 cursor-pointer text-[#302C29]"
            >
              {business.locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        )}
        </div>
      </div>

      {/* Progress stepper: clean editorial typography without candy pills */}
      {currentStep < 4 && (
        <div className="flex items-center justify-between border-b border-[#E5DDD3] pb-4 mb-8 text-xs font-medium text-[#80766E]">
          <button 
            type="button" 
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2 cursor-pointer ${currentStep === 1 ? 'text-[#302C29] font-bold' : ''}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep >= 1 ? 'bg-[#302C29] text-white' : 'bg-[#E5DDD3] text-[#80766E]'}`}>
              1
            </span>
            <span>Elegir Servicios</span>
          </button>

          <span className="text-[#E5DDD3]">/</span>

          <button 
            type="button" 
            onClick={() => selectedServiceIds.length > 0 && setCurrentStep(2)}
            disabled={selectedServiceIds.length === 0}
            className={`flex items-center gap-2 ${selectedServiceIds.length === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${currentStep === 2 ? 'text-[#302C29] font-bold' : ''}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep >= 2 ? 'bg-[#302C29] text-white' : 'bg-[#E5DDD3] text-[#80766E]'}`}>
              2
            </span>
            <span>Fecha y Horario</span>
          </button>

          <span className="text-[#E5DDD3]">/</span>

          <button 
            type="button" 
            onClick={() => selectedSlot && setCurrentStep(3)}
            disabled={!selectedSlot}
            className={`flex items-center gap-2 ${!selectedSlot ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${currentStep === 3 ? 'text-[#302C29] font-bold' : ''}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep >= 3 ? 'bg-[#302C29] text-white' : 'bg-[#E5DDD3] text-[#80766E]'}`}>
              3
            </span>
            <span>Tus Datos</span>
          </button>
        </div>
      )}

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-white border border-[#CEAAA3] rounded-lg text-sm text-[#302C29] flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-[#CEAAA3] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Aviso del sistema:</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* STEP 1: SELECT SERVICES */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Category Filter Bar */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-[#E5DDD3]/60">
            <button
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                activeCategoryFilter === 'all'
                  ? 'bg-[#302C29] text-white'
                  : 'text-[#80766E] hover:text-[#302C29] hover:bg-[#F0EAE2]'
              }`}
            >
              Todos los servicios
            </button>
            {business.categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategoryFilter === cat.id
                    ? 'bg-[#302C29] text-white'
                    : 'text-[#80766E] hover:text-[#302C29] hover:bg-[#F0EAE2]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Optional Professional Selector */}
          {business.professionals.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#80766E]">
              <span className="font-medium text-[#302C29]">
                Preferencia de profesional:
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedProfessionalId}
                  onChange={(e) => {
                    setSelectedProfessionalId(e.target.value);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                  className="bg-[#FAF8F4] border border-[#E5DDD3] rounded px-2.5 py-1 text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                >
                  <option value="">Cualquier profesional disponible (Recomendado)</option>
                  {business.professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Service Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServices.map(service => {
              const isSelected = selectedServiceIds.includes(service.id);
              return (
                <div
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  className={`relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col h-full ${
                    isSelected
                      ? 'bg-white border-[#302C29] shadow-sm ring-1 ring-[#302C29]'
                      : 'bg-white border-[#E5DDD3] hover:border-[#B69A70]/60 hover:bg-[#FAF8F4]/50'
                  }`}
                >
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif-editorial text-xl font-medium leading-snug text-[#302C29]">
                        {service.name}
                      </h3>
                      <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-[#302C29] border-[#302C29] text-white' : 'border-[#E5DDD3] bg-white'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                    <p className="text-xs text-[#80766E] mt-2 leading-relaxed line-clamp-3">
                      {service.description}
                    </p>
                  </div>

                  <div className="mt-auto pt-3 border-t border-[#E5DDD3]/50 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-[#80766E]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{service.durationMinutes} min</span>
                      {service.bufferCleanupMinutes > 0 && (
                        <span className="text-[10px] text-[#80766E]/70">
                          (+{service.bufferCleanupMinutes}m higienización)
                        </span>
                      )}
                    </span>

                    <span className="text-[11px] text-[#80766E] uppercase tracking-wider font-medium">
                      Atención personalizada
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Summary & Next Step Trigger */}
          {selectedServices.length > 0 && (
            <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md border border-[#E5DDD3] rounded-xl p-4 sm:p-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs text-[#80766E]">
                  Resumen de selección:
                </div>
                <div className="text-sm font-semibold text-[#302C29] mt-0.5">
                  {selectedServices.length} {selectedServices.length === 1 ? 'servicio' : 'servicios seleccionados'} · {totalDurationMinutes} min de visita estimada
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="w-full sm:w-auto px-6 py-3 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-medium uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Continuar a Fecha y Horario</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: MONTH CALENDAR & SLOT SELECTION */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-xs text-[#80766E] hover:text-[#302C29] flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Modificar servicios</span>
            </button>
            <span className="text-xs text-[#80766E]">
              Duración requerida: <strong className="text-[#302C29]">{totalDurationMinutes} min</strong>
            </span>
          </div>

          <MonthCalendar
            config={business}
            selectedServices={selectedServices}
            locationId={selectedLocationId}
            appointments={appointments}
            agendaBlocks={agendaBlocks}
            selectedProfessionalId={selectedProfessionalId || undefined}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSelectSlot}
          />

          {/* If slot chosen, continue */}
          {selectedSlot && (
            <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md border border-[#E5DDD3] rounded-xl p-4 sm:p-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs text-[#80766E]">
                  Horario elegido:
                </div>
                <div className="text-sm font-semibold text-[#302C29] tabular-nums mt-0.5">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} · {selectedSlot.startTime} a {selectedSlot.endTime} hs
                </div>
              </div>

              <button
                type="button"
                onClick={handleProceedToDetails}
                className="w-full sm:w-auto px-6 py-3 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-medium uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Confirmar Datos y Presupuesto</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: CUSTOMER DETAILS & ESTIMATE SUMMARY */}
      {currentStep === 3 && selectedSlot && (
        <div className="space-y-8">
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className="text-xs text-[#80766E] hover:text-[#302C29] flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Volver a elegir horario</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Form */}
            <div className="lg:col-span-7 bg-white border border-[#E5DDD3] rounded-xl p-6 sm:p-8 shadow-xs">
              <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29] mb-1">
                Datos de la reserva
              </h3>
              <p className="text-xs text-[#80766E] mb-6">
                Solicitamos únicamente los datos necesarios para coordinar y confirmar tu visita.
              </p>

              <form onSubmit={handleConfirmReservation} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#302C29] mb-1">
                    Nombre y Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerData.name}
                    onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                    placeholder="Ej. Camila Morales"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD3] text-sm text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70] bg-[#FAF8F4]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#302C29] mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerData.phone}
                    onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                    placeholder="Ej. +54 9 11 1234-5678"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD3] text-sm text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70] bg-[#FAF8F4]"
                  />
                  <span className="text-[11px] text-[#80766E] mt-1 block">
                    Recibirás recordatorios y el enlace para autogestionar o reprogramar tu turno.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#302C29] mb-1">
                    Correo electrónico (Opcional)
                  </label>
                  <input
                    type="email"
                    value={customerData.email}
                    onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                    placeholder="camila@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD3] text-sm text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70] bg-[#FAF8F4]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#302C29] mb-1">
                    Notas o preferencias particulares (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={customerData.notes}
                    onChange={(e) => setCustomerData({ ...customerData, notes: e.target.value })}
                    placeholder="Ej. Alergias a ciertos productos, necesidad de finalizar puntual, etc."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD3] text-sm text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70] bg-[#FAF8F4]"
                  />
                </div>

                <div className="pt-4 border-t border-[#E5DDD3]/60">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-60 text-white text-xs font-medium uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <span>Verificando disponibilidad atómica...</span>
                    ) : (
                      <>
                        <span>Confirmar Reserva de Turno</span>
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Visit Summary & Optional Budget Breakdown */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#F0EAE2]/70 border border-[#E5DDD3] rounded-xl p-6">
                <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-semibold block mb-1">
                  Tu Visita Planificada
                </span>
                <h4 className="font-serif-editorial text-2xl font-normal text-[#302C29] mb-4">
                  Resumen de la cita
                </h4>

                <div className="space-y-3 text-xs border-b border-[#E5DDD3] pb-4 mb-4">
                  <div className="flex items-center gap-2 text-[#302C29]">
                    <CalendarIcon className="w-4 h-4 text-[#B69A70] shrink-0" />
                    <span>
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[#302C29]">
                    <Clock className="w-4 h-4 text-[#B69A70] shrink-0" />
                    <span className="tabular-nums font-semibold">
                      {selectedSlot.startTime} a {selectedSlot.endTime} hs ({totalDurationMinutes} min)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[#302C29]">
                    <MapPin className="w-4 h-4 text-[#B69A70] shrink-0" />
                    <span>
                      {business.locations.find(l => l.id === selectedLocationId)?.name || business.address}
                    </span>
                  </div>
                </div>

                {/* Planned Segments */}
                <div className="space-y-3 mb-4">
                  <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block">
                    Cronograma de atención:
                  </span>
                  {selectedSlot.segmentsPlan.map((seg, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-[#E5DDD3] text-xs">
                      <div className="flex items-center justify-between font-semibold text-[#302C29]">
                        <span>{seg.serviceName}</span>
                        <span className="tabular-nums">{seg.startTime} - {seg.endTime}</span>
                      </div>
                      <div className="text-[#80766E] mt-0.5 text-[11px]">
                        Atendido por: <strong className="text-[#302C29] font-medium">{seg.professionalName}</strong>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pricing / Budget section (Module 7) */}
                {pricingEval.displayMode !== 'hidden' && (
                  <div className="pt-4 border-t border-[#E5DDD3] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#80766E]">
                      <span>Presupuesto estimado:</span>
                      <span className="text-base font-bold text-[#302C29] tabular-nums">
                        {pricingEval.displayMode === 'consult' ? 'A consultar' : formatCurrency(pricingEval.totalPrice)}
                      </span>
                    </div>

                    {pricingEval.bundlesApplied.length > 0 && (
                      <div className="p-2 bg-[#FAF8F4] border border-[#B69A70]/40 rounded text-[11px] text-[#302C29] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#B69A70] shrink-0" />
                        <span>Combo aplicado: <strong>{pricingEval.bundlesApplied[0].name}</strong></span>
                      </div>
                    )}

                    {pricingEval.variableNote && (
                      <p className="text-[11px] text-[#80766E] italic mt-1 leading-relaxed">
                        «{pricingEval.variableNote}»
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION VIEW */}
      {currentStep === 4 && completedAppointment && (
        <div className="max-w-2xl mx-auto bg-white border border-[#E5DDD3] rounded-2xl p-8 sm:p-10 shadow-sm text-center">
          <div className="w-14 h-14 bg-[#A3B6A5]/20 text-[#302C29] rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-[#5e7761]" />
          </div>

          <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-1">
            Reserva Confirmada
          </span>
          <h2 className="font-serif-editorial text-3xl sm:text-4xl font-normal text-[#302C29] mb-2">
            ¡Te esperamos, {completedAppointment.customer.name}!
          </h2>
          <p className="text-sm text-[#80766E] max-w-md mx-auto mb-6">
            Tu turno ha sido bloqueado en el sistema con todos los recursos y profesionales asignados.
          </p>

          {/* Booking Code Display */}
          <div className="inline-block bg-[#FAF8F4] border border-[#E5DDD3] px-6 py-3 rounded-xl mb-8">
            <span className="text-xs uppercase tracking-wider text-[#80766E] block mb-0.5">
              Código de seguimiento de reserva:
            </span>
            <span className="font-mono text-2xl font-bold tracking-widest text-[#302C29]">
              {completedAppointment.bookingCode}
            </span>
          </div>

          {/* Details breakdown */}
          <div className="bg-[#F0EAE2]/50 rounded-xl p-5 text-left text-xs space-y-2 mb-8 max-w-md mx-auto border border-[#E5DDD3]/70">
            <div className="flex justify-between">
              <span className="text-[#80766E]">Fecha:</span>
              <span className="font-medium text-[#302C29]">
                {new Date(completedAppointment.date + 'T12:00:00').toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#80766E]">Horario:</span>
              <span className="font-semibold tabular-nums text-[#302C29]">
                {completedAppointment.startTime} a {completedAppointment.endTime} hs
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#80766E]">Servicios:</span>
              <span className="font-medium text-[#302C29] text-right">
                {completedAppointment.segments.map(s => s.serviceName).join(' + ')}
              </span>
            </div>
            {completedAppointment.estimatedPrice > 0 && (
              <div className="flex justify-between pt-2 border-t border-[#E5DDD3]">
                <span className="text-[#80766E]">Presupuesto estimado:</span>
                <span className="font-bold text-[#302C29] tabular-nums">
                  {formatCurrency(completedAppointment.estimatedPrice)}
                </span>
              </div>
            )}
          </div>

          {/* WhatsApp & Self Service Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}?text=${generateWhatsAppMessage()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-5 py-3 bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar Confirmación por WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => onGoToSelfService(completedAppointment.bookingCode)}
              className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-[#FAF8F4] text-[#302C29] border border-[#E5DDD3] text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Ver en Portal de Autogestión</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
