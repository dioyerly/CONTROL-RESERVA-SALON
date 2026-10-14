import React, { useState } from 'react';
import { 
  BusinessConfig, 
  BusinessMode, 
  Service, 
  Professional, 
  Resource, 
  ServiceCategory 
} from '../../types';
import { saveBusinessConfig, setActiveBusinessId } from '../../services/storage';
import { 
  Check, 
  ArrowRight, 
  ChevronLeft, 
  Sparkles, 
  Clock, 
  Plus, 
  Trash2,
  X
} from 'lucide-react';

interface OnboardingWizardProps {
  // Sin onClose no se muestra la X: es el caso de un espacio sin negocio todavía
  onClose?: () => void;
  onFinish: (newBiz: BusinessConfig) => void;
}

// Asistente de alta de negocio. Todo arranca vacío y se edita luego en el Estudio.
export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onClose, onFinish }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Business basic info
  const [businessName, setBusinessName] = useState('');
  // Nombre personal de la dueña/o o profesional: no es el nombre del negocio
  const [ownerPersonName, setOwnerPersonName] = useState('');
  const [mode, setMode] = useState<BusinessMode>('independent');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  // Owner access credentials (required, no default fallback)
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState('');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Step 2 categories selected
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<string[]>([]);

  // Step 3 services list (vacío: se completa a gusto)
  const [services, setServices] = useState<Service[]>([]);

  // Step 4 hours
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('19:00');
  const [slotInterval, setSlotInterval] = useState(30);

  const CATEGORY_OPTIONS = [
    { key: 'manicura', label: 'Manicura y pedicura' },
    { key: 'peluqueria', label: 'Peluquería, peinados y colorimetría' },
    { key: 'depilacion', label: 'Depilación' },
    { key: 'facial', label: 'Limpieza facial y tratamientos' },
    { key: 'corporal', label: 'Masajes y tratamientos corporales' },
    { key: 'cejas', label: 'Cejas y pestañas' },
    { key: 'maquillaje', label: 'Maquillaje profesional' },
    { key: 'otros', label: 'Otros servicios de autor' }
  ];

  const handleToggleCategory = (key: string) => {
    setSelectedCategoryKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleAddService = () => {
    const newS: Service = {
      id: `serv_${Date.now()}`,
      categoryId: 'cat_1',
      name: 'Nuevo Servicio',
      description: 'Descripción del tratamiento.',
      durationMinutes: 45,
      bufferCleanupMinutes: 10,
      minAdvanceHours: 2,
      price: 30000,
      priceType: 'fixed',
      enabledProfessionalIds: ['*'],
      requiredResourceTypes: [],
      locationIds: ['loc_main'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    };
    setServices([...services, newS]);
  };

  const handleUpdateService = (idx: number, field: keyof Service, val: any) => {
    const updated = [...services];
    updated[idx] = { ...updated[idx], [field]: val };
    setServices(updated);
  };

  const handleRemoveService = (idx: number) => {
    setServices(services.filter((_, i) => i !== idx));
  };

  const handleGoToStep2 = () => {
    const email = ownerEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStep1Error('Ingresa un correo válido para el acceso del propietario.');
      return;
    }
    if (!ownerPersonName.trim()) {
      setStep1Error('Ingresa tu nombre personal (dueña/o o profesional).');
      return;
    }
    if (ownerPassword.length < 8) {
      setStep1Error('La contraseña del propietario debe tener al menos 8 caracteres.');
      return;
    }
    if (ownerPassword !== ownerPasswordConfirm) {
      setStep1Error('Las contraseñas no coinciden.');
      return;
    }
    setStep1Error(null);
    setStep(2);
  };

  const handleCompleteSetup = () => {
    const bizId = `biz_user_${Date.now()}`;
    const categories: ServiceCategory[] = selectedCategoryKeys.map((k, idx) => ({
      id: `cat_${k}`,
      name: CATEGORY_OPTIONS.find(c => c.key === k)?.label || k,
      order: idx + 1
    }));

    const mainLocation = {
      id: 'loc_main',
      name: 'Sede Principal',
      address: address || 'Ubicación central',
      isMain: true
    };

    // Freelance: el propietario es también el único profesional. Salón: el equipo se carga en el Estudio.
    const mainStaff: Professional | null = mode !== 'independent' ? null : {
      id: 'prof_owner_1',
      name: ownerPersonName.trim() || 'Profesional Independiente',
      role: 'Profesional Independiente',
      email: ownerEmail.trim().toLowerCase(),
      pin: String(1000 + Math.floor(Math.random() * 9000)),
      enabledServiceIds: ['*'],
      locationIds: ['loc_main'],
      canManageOwnBreaks: true,
      color: '#B69A70',
      weeklySchedule: {
        1: { start: openTime, end: closeTime, breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        2: { start: openTime, end: closeTime, breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        3: { start: openTime, end: closeTime, breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        4: { start: openTime, end: closeTime, breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        5: { start: openTime, end: closeTime, breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        6: { start: '10:00', end: '16:00', breaks: [] },
        0: null
      }
    };

    const resources: Resource[] = [];

    const newBusinessConfig: BusinessConfig = {
      id: bizId,
      name: businessName || 'Mi Nuevo Espacio de Belleza',
      slug: (businessName || 'mi-espacio').toLowerCase().replace(/\s+/g, '-'),
      mode,
      tagline: 'Atención personalizada y armonía para el bienestar.',
      description: 'Reserva tu cita online con disponibilidad en tiempo real.',
      address: address || 'Buenos Aires',
      phone: phone || '+54 11 0000-0000',
      whatsapp: phone || '+54 9 11 0000-0000',
      email: 'reservas@negocio.com',
      heroImage: '/src/assets/images/independent_studio_atelier_1791506153368.jpg',
      pricingDisplayMode: 'approximate',
      slotIntervalMinutes: slotInterval,
      minAdvanceNoticeHours: 2,
      maxAdvanceDays: 45,
      minBufferBetweenAppointments: 10,
      timezone: 'America/Argentina/Buenos_Aires',
      cancellationPolicyHours: 24,
      locations: [mainLocation],
      resources,
      categories,
      services,
      professionals: mainStaff ? [mainStaff] : [],
      simultaneousRules: [],
      bundlePricingRules: [],
      weeklyBusinessHours: {
        1: { start: openTime, end: closeTime, breaks: [] },
        2: { start: openTime, end: closeTime, breaks: [] },
        3: { start: openTime, end: closeTime, breaks: [] },
        4: { start: openTime, end: closeTime, breaks: [] },
        5: { start: openTime, end: closeTime, breaks: [] },
        6: { start: '10:00', end: '16:00', breaks: [] },
        0: null
      },
      holidaysAndVacations: [],
      ownerCredentials: {
        email: ownerEmail.trim().toLowerCase(),
        password: ownerPassword
      }
    };

    saveBusinessConfig(newBusinessConfig);
    setActiveBusinessId(newBusinessConfig.id);
    onFinish(newBusinessConfig);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-2xl p-6 sm:p-10 shadow-2xl relative my-8 text-xs">

        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}


        {/* Header */}
        <div className="mb-6">
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Asistente de Puesta en Marcha · Paso {step} de 4
          </span>
          <h2 className="font-serif-editorial text-2xl sm:text-3xl font-normal text-[#302C29]">
            {step === 1 && '¿Cómo trabajas en tu negocio?'}
            {step === 2 && '¿Qué tipo de servicios ofreces?'}
            {step === 3 && 'Configura tus primeros servicios'}
            {step === 4 && 'Define tus horarios de atención'}
          </h2>
          <p className="text-[#80766E] mt-1">
            {step === 1 && 'Selecciona tu modelo de atención. Esto adaptará la lógica del motor de turnos.'}
            {step === 2 && 'Elige las categorías principales para organizar tu menú de atención.'}
            {step === 3 && 'Define duraciones y tiempos de higiene para evitar sobreocupación.'}
            {step === 4 && 'Establece tu jornada de trabajo y los intervalos entre turnos.'}
          </p>
        </div>

        {/* STEP 1: BUSINESS MODE & BASICS */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Nombre de tu salón o estudio *</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ej. Serena Studio o Bella Atelier"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Tu nombre (dueña/o o profesional) *</label>
              <input
                type="text"
                required
                value={ownerPersonName}
                onChange={(e) => setOwnerPersonName(e.target.value)}
                placeholder="Ej. Camila Morales"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
              <span className="text-[11px] text-[#80766E] mt-1 block">
                Es tu nombre personal, no el del negocio. Así aparece en la agenda y en la lista del equipo.
              </span>
            </div>

            <div className="p-4 rounded-xl border border-[#E5DDD3] bg-[#FAF8F4] space-y-3">
              <div>
                <span className="block font-semibold text-[#302C29]">Acceso del propietario</span>
                <span className="text-[11px] text-[#80766E]">Con estos datos ingresarás al Estudio. Guárdalos en un lugar seguro.</span>
              </div>
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Correo del propietario *</label>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-white text-xs text-[#302C29]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#302C29] mb-1">Contraseña * (mín. 8)</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-white text-xs text-[#302C29]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#302C29] mb-1">Repetir contraseña *</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={ownerPasswordConfirm}
                    onChange={(e) => setOwnerPasswordConfirm(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-white text-xs text-[#302C29]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-2">Modalidad operativa</label>
              <div className="space-y-2">
                {[
                  { id: 'independent', title: '1. Trabajo de manera independiente', desc: 'Atención individual uno a uno con agenda personal sin empleados ficticios.' },
                  { id: 'salon_employees', title: '2. Tengo un salón con empleados', desc: 'Múltiples agendas individuales, puestos de trabajo y recursos compartidos.' },
                  { id: 'multi_staff_capacity', title: '3. Personal intercambiable por disponibilidad', desc: 'Los clientes no eligen profesional; el sistema asigna según cupos libres.' },
                  { id: 'multi_location', title: '4. Trabajo en diferentes ubicaciones', desc: 'Contempla traslados entre sedes y horarios por ubicación.' },
                  { id: 'home_visit', title: '5. Atiendo a domicilio', desc: 'Reserva con tiempos de viaje y zonas de cobertura.' }
                ].map(opt => (
                  <label
                    key={opt.id}
                    onClick={() => setMode(opt.id as BusinessMode)}
                    className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                      mode === opt.id
                        ? 'border-[#302C29] bg-[#FAF8F4] ring-1 ring-[#302C29]'
                        : 'border-[#E5DDD3] hover:border-[#B69A70]'
                    }`}
                  >
                    <div className="font-semibold text-[#302C29]">{opt.title}</div>
                    <div className="text-[11px] text-[#80766E] mt-0.5">{opt.desc}</div>
                  </label>
                ))}
              </div>
            </div>

            {step1Error && (
              <p className="text-xs text-[#b37a70]">{step1Error}</p>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleGoToStep2}
                className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CATEGORIES */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CATEGORY_OPTIONS.map(cat => {
                const isSelected = selectedCategoryKeys.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => handleToggleCategory(cat.key)}
                    className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FAF8F4] border-[#302C29] font-semibold text-[#302C29]'
                        : 'bg-white border-[#E5DDD3] text-[#80766E] hover:border-[#B69A70]'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[#302C29] border-[#302C29] text-white' : 'border-[#E5DDD3]'}`}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-[#E5DDD3] rounded-lg text-[#80766E]"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 bg-[#302C29] text-white font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <span>Siguiente Paso</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CONFIGURE SERVICES */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
              {services.map((serv, idx) => (
                <div key={serv.id} className="p-3.5 bg-[#FAF8F4] border border-[#E5DDD3] rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[#302C29]">Servicio #{idx + 1}</span>
                    {services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveService(idx)}
                        className="text-[#CEAAA3] hover:text-[#9A7F54]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#80766E] mb-0.5">Nombre</label>
                      <input
                        type="text"
                        value={serv.name}
                        onChange={(e) => handleUpdateService(idx, 'name', e.target.value)}
                        className="w-full p-2 bg-white border border-[#E5DDD3] rounded text-xs text-[#302C29]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#80766E] mb-0.5">Precio ($)</label>
                      <input
                        type="number"
                        value={serv.price || ''}
                        onChange={(e) => handleUpdateService(idx, 'price', Number(e.target.value))}
                        className="w-full p-2 bg-white border border-[#E5DDD3] rounded text-xs text-[#302C29]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#80766E] mb-0.5">Duración (minutos)</label>
                      <input
                        type="number"
                        value={serv.durationMinutes}
                        onChange={(e) => handleUpdateService(idx, 'durationMinutes', Number(e.target.value))}
                        className="w-full p-2 bg-white border border-[#E5DDD3] rounded text-xs text-[#302C29]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#80766E] mb-0.5">Buffer limpieza post-turno (min)</label>
                      <input
                        type="number"
                        value={serv.bufferCleanupMinutes}
                        onChange={(e) => handleUpdateService(idx, 'bufferCleanupMinutes', Number(e.target.value))}
                        className="w-full p-2 bg-white border border-[#E5DDD3] rounded text-xs text-[#302C29]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddService}
              className="w-full py-2 border border-dashed border-[#B69A70] text-[#B69A70] hover:bg-[#FAF8F4] rounded-lg font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Otro Servicio</span>
            </button>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-[#E5DDD3] rounded-lg text-[#80766E]"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2.5 bg-[#302C29] text-white font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <span>Último Paso</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: SCHEDULE & LAUNCH */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Hora apertura general</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#302C29] mb-1">Hora cierre general</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Intervalo de turnos (frecuencia de slots)</label>
              <select
                value={slotInterval}
                onChange={(e) => setSlotInterval(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4]"
              >
                <option value={15}>Cada 15 minutos</option>
                <option value={30}>Cada 30 minutos (Recomendado)</option>
                <option value={45}>Cada 45 minutos</option>
                <option value={60}>Cada 60 minutos</option>
              </select>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 border border-[#E5DDD3] rounded-lg text-[#80766E]"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCompleteSetup}
                className="px-6 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-[#B69A70]" />
                <span>Finalizar y Activar Negocio</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
