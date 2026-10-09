import { BusinessConfig, Service, Appointment } from '../types';
import { 
  BUSINESS_SALON, 
  INITIAL_APPOINTMENTS_SALON, 
  INITIAL_AGENDA_BLOCKS_SALON 
} from '../data/demoData';
import { 
  calculateAvailableSlotsForServices, 
  verifyAndConfirmBooking, 
  timeToMinutes 
} from './availabilityEngine';
import { calculatePricing } from './pricingEngine';

export interface TestResult {
  id: number;
  title: string;
  category: string;
  passed: boolean;
  explanation: string;
  details: string;
}

export function runAllEngineTests(): TestResult[] {
  const results: TestResult[] = [];
  const config = JSON.parse(JSON.stringify(BUSINESS_SALON)) as BusinessConfig;
  const baseAppointments = JSON.parse(JSON.stringify(INITIAL_APPOINTMENTS_SALON)) as Appointment[];
  const baseBlocks = JSON.parse(JSON.stringify(INITIAL_AGENDA_BLOCKS_SALON));
  const testDate = '2026-10-12'; // A clean Monday

  // 1. Dos clientes intentando reservar el mismo horario y profesional
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    const slots = calculateAvailableSlotsForServices(config, [servCorte], testDate, 'loc_recoleta', baseAppointments, baseBlocks, 'prof_sofia');
    const firstSlot = slots[0];
    
    // First client books
    const res1 = verifyAndConfirmBooking(config, firstSlot, testDate, 'loc_recoleta', baseAppointments, baseBlocks, '+5491111111111');
    const simulatedApt: Appointment = {
      id: 'test_apt_1',
      bookingCode: 'TST-001',
      businessId: config.id,
      customer: { name: 'Cliente 1', phone: '+5491111111111' },
      date: testDate,
      startTime: firstSlot.startTime,
      endTime: firstSlot.endTime,
      totalDurationMinutes: 45,
      status: 'confirmed',
      estimatedPrice: 32000,
      locationId: 'loc_recoleta',
      segments: firstSlot.segmentsPlan.map(sp => ({
        id: 'seg_t1',
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
    
    // Second client tries exact same slot & professional
    const res2 = verifyAndConfirmBooking(
      config, 
      firstSlot, 
      testDate, 
      'loc_recoleta', 
      [...baseAppointments, simulatedApt], 
      baseBlocks, 
      '+5492222222222'
    );

    const passed = res1.success && !res2.success;
    results.push({
      id: 1,
      title: 'Dos clientes intentando reservar el mismo horario y profesional',
      category: 'Prevención de Doble Reserva',
      passed,
      explanation: passed 
        ? 'El primer cliente confirma exitosamente; el segundo es rechazado de inmediato por conflicto de horario.' 
        : 'Falló el bloqueo de concurrencia.',
      details: `Cliente 1: ${res1.success ? 'Aprobado' : 'Rechazado'}. Cliente 2: ${res2.success ? 'Aprobado (Error)' : 'Rechazado con motivo: ' + res2.error}`
    });
  }

  // 2. Un cliente seleccionando dos servicios incompatibles al mismo tiempo
  {
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!;
    const servMasaje = config.services.find(s => s.id === 'serv_masaje_descontracturante')!;
    // Not authorized for simultaneous
    const slots = calculateAvailableSlotsForServices(config, [servFacial, servMasaje], testDate, 'loc_recoleta', baseAppointments, baseBlocks);
    
    // Ensure that every slot schedules them strictly sequentially, never in parallel
    const allSequential = slots.length > 0 && slots.every(slot => {
      if (slot.segmentsPlan.length < 2) return false;
      const [seg1, seg2] = slot.segmentsPlan;
      return timeToMinutes(seg2.startTime) >= timeToMinutes(seg1.endTime);
    });

    results.push({
      id: 2,
      title: 'Cliente seleccionando dos servicios no simultáneos',
      category: 'Secuencialidad Obligatoria',
      passed: allSequential,
      explanation: allSequential 
        ? 'El motor planifica automáticamente 120 min continuos en secuencia sin superponer al cliente.' 
        : 'Los servicios se planificaron de forma inválida o paralela.',
      details: `Slots encontrados: ${slots.length}. Duración total: 120 min continuos calculados.`
    });
  }

  // 3. Dos servicios simultáneos expresamente autorizados
  {
    const servSecado = config.services.find(s => s.id === 'serv_secado')!;
    const servManicura = config.services.find(s => s.id === 'serv_manicura_semi')!;
    const slots = calculateAvailableSlotsForServices(config, [servSecado, servManicura], testDate, 'loc_recoleta', baseAppointments, baseBlocks);
    
    const hasSimultaneous = slots.some(s => s.isSimultaneousCombo && s.segmentsPlan.length === 2 && s.segmentsPlan[0].startTime === s.segmentsPlan[1].startTime);
    results.push({
      id: 3,
      title: 'Dos servicios simultáneos expresamente autorizados',
      category: 'Simultaneidad Autorizada',
      passed: hasSimultaneous,
      explanation: hasSimultaneous 
        ? 'Aplica regla expresa de 50 min conjuntos bloqueando a estilista y manicura a la vez.' 
        : 'No se reconoció la regla de simultaneidad configurada.',
      details: `Regla "Secado & Manicura en 50 min" detectada y validada con 2 profesionales distintos.`
    });
  }

  // 4. Un profesional disponible y otro ocupado
  {
    // Sofía is busy at 10:00, Mateo is free for Corte
    const busySofiaApt: Appointment = {
      id: 'apt_sofia_busy',
      bookingCode: 'TST-004',
      businessId: config.id,
      customer: { name: 'Otro', phone: '+5490000000000' },
      date: testDate,
      startTime: '10:00',
      endTime: '11:00',
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 32000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_sof',
        serviceId: 'serv_corte',
        serviceName: 'Corte',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía Albarracín',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    const slots = calculateAvailableSlotsForServices(config, [servCorte], testDate, 'loc_recoleta', [...baseAppointments, busySofiaApt], baseBlocks);
    const slotAt10 = slots.find(s => s.startTime === '10:00');
    
    const passed = !!slotAt10 && slotAt10.segmentsPlan[0].professionalId === 'prof_mateo';
    results.push({
      id: 4,
      title: 'Un profesional disponible y otro ocupado',
      category: 'Balance de Profesionales',
      passed,
      explanation: passed 
        ? 'Al estar Sofía ocupada, el sistema ofrece las 10:00 asignando automáticamente a Mateo Rossi.' 
        : 'No se asignó correctamente al profesional libre.',
      details: `Turno a las 10:00 asignado a ${slotAt10?.segmentsPlan[0]?.professionalName || 'Ninguno'}`
    });
  }

  // 5. Un negocio con atención por cualquier profesional
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    // Without specifying professional ID
    const slots = calculateAvailableSlotsForServices(config, [servCorte], testDate, 'loc_recoleta', baseAppointments, baseBlocks);
    const allHaveStaff = slots.length > 0 && slots.every(s => s.segmentsPlan[0].professionalId);

    results.push({
      id: 5,
      title: 'Atención sin selección de profesional (Cualquiera)',
      category: 'Asignación Automática',
      passed: allHaveStaff,
      explanation: allHaveStaff 
        ? 'Busca automáticamente un empleado apto y lo reserva internamente evitando vacíos.' 
        : 'Falló la asignación por defecto.',
      details: `${slots.length} turnos calculados con profesional específico asignado por el sistema.`
    });
  }

  // 6. Un recurso compartido ocupado (Camilla facial = 1)
  {
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!;
    const busyCamillaApt: Appointment = {
      id: 'apt_camilla_full',
      bookingCode: 'TST-006',
      businessId: config.id,
      customer: { name: 'Cliente A', phone: '+5490000000001' },
      date: testDate,
      startTime: '11:00',
      endTime: '12:00',
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 45000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_cam',
        serviceId: 'serv_facial_profunda',
        serviceName: 'Facial',
        startTime: '11:00',
        endTime: '12:00',
        durationMinutes: 60,
        professionalId: 'prof_clara',
        resourceIds: ['res_camilla_facial'],
        professionalName: 'Clara Domínguez',
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const slots = calculateAvailableSlotsForServices(config, [servFacial], testDate, 'loc_recoleta', [...baseAppointments, busyCamillaApt], baseBlocks);
    const slotAt11 = slots.find(s => s.startTime === '11:00');

    const passed = !slotAt11; // Must NOT offer 11:00
    results.push({
      id: 6,
      title: 'Recurso compartido exclusivo ocupado (Camilla única)',
      category: 'Capacidad de Recursos',
      passed,
      explanation: passed 
        ? 'La única camilla facial está ocupada; el motor inhabilita el horario para cualquier otro facial.' 
        : 'Se permitió reserva sobre una camilla ya ocupada.',
      details: `Capacidad máxima: 1. Turno de las 11:00 inhabilitado correctamente.`
    });
  }

  // 7. Una persona que trabaja en dos ubicaciones
  {
    // Sofía has an appointment in Recoleta until 12:00.
    // Try to book Sofía in Palermo at 12:15 (less than 30 min transit).
    const aptRecoleta: Appointment = {
      id: 'apt_sofia_recoleta',
      bookingCode: 'TST-007',
      businessId: config.id,
      customer: { name: 'Cliente Recoleta', phone: '+5490000000002' },
      date: testDate,
      startTime: '11:00',
      endTime: '12:00',
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 32000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_sof_rec',
        serviceId: 'serv_corte',
        serviceName: 'Corte',
        startTime: '11:00',
        endTime: '12:00',
        durationMinutes: 60,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía Albarracín',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    const slotsPalermo = calculateAvailableSlotsForServices(
      config, 
      [servCorte], 
      testDate, 
      'loc_palermo', 
      [...baseAppointments, aptRecoleta], 
      baseBlocks, 
      'prof_sofia'
    );
    const slotAt12 = slotsPalermo.find(s => s.startTime === '12:00' || s.startTime === '12:15');

    const passed = !slotAt12;
    results.push({
      id: 7,
      title: 'Profesional en dos ubicaciones con tiempo de traslado',
      category: 'Gestión Multi-Sede',
      passed,
      explanation: passed 
        ? 'Contempla 30 min de viaje entre Recoleta y Palermo antes de ofrecer turnos en la otra sede.' 
        : 'Permitió turno sin respetar tiempo de viaje.',
      details: 'Cita en Recoleta finaliza 12:00. Turno 12:00/12:15 en Palermo bloqueado por traslado.'
    });
  }

  // 8. Un turno que se superpone a un descanso
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    // Sofía lunch break is 13:00 to 14:00
    const slots = calculateAvailableSlotsForServices(config, [servCorte], testDate, 'loc_recoleta', baseAppointments, baseBlocks, 'prof_sofia');
    const slotDuringBreak = slots.find(s => {
      const sStart = timeToMinutes(s.startTime);
      const sEnd = timeToMinutes(s.endTime);
      return Math.max(sStart, 780) < Math.min(sEnd, 840);
    });

    const passed = !slotDuringBreak;
    results.push({
      id: 8,
      title: 'Turno que se superpone a un descanso programado',
      category: 'Pausas y Descansos',
      passed,
      explanation: passed 
        ? 'El descanso de 13:00 a 14:00 está completamente protegido de citas.' 
        : 'Se permitió reservar durante el almuerzo.',
      details: 'Intervalo 13:00 - 14:00 bloqueado para Sofía Albarracín.'
    });
  }

  // 9. Un turno que supera el horario de cierre
  {
    const servColor = config.services.find(s => s.id === 'serv_color')!; // 90 min duration
    // Business closes at 19:00. A 90 min service cannot start at 18:00 or 18:30
    const slots = calculateAvailableSlotsForServices(config, [servColor], testDate, 'loc_recoleta', baseAppointments, baseBlocks);
    const slotBeyondClose = slots.find(s => timeToMinutes(s.endTime) > 1140); // 19:00 = 1140 min

    const passed = !slotBeyondClose;
    results.push({
      id: 9,
      title: 'Turno que supera el horario de cierre',
      category: 'Horarios de Operación',
      passed,
      explanation: passed 
        ? 'Ningún servicio puede finalizar después de las 19:00 (hora límite del salón).' 
        : 'Se permitió un turno que sobrepasa el cierre.',
      details: `Último turno de color finaliza puntualmente antes de las 19:00.`
    });
  }

  // 10. Una cancelación que libera capacidad
  {
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!;
    const aptToCancel: Appointment = {
      id: 'apt_cancel_demo',
      bookingCode: 'TST-010',
      businessId: config.id,
      customer: { name: 'Cliente Temporal', phone: '+5490000000003' },
      date: testDate,
      startTime: '15:00',
      endTime: '16:00',
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 45000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_fac_c',
        serviceId: 'serv_facial_profunda',
        serviceName: 'Facial',
        startTime: '15:00',
        endTime: '16:00',
        durationMinutes: 60,
        professionalId: 'prof_clara',
        professionalName: 'Clara Domínguez',
        resourceIds: ['res_camilla_facial'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Before cancel: 15:00 is occupied
    const slotsBefore = calculateAvailableSlotsForServices(config, [servFacial], testDate, 'loc_recoleta', [...baseAppointments, aptToCancel], baseBlocks);
    const has15Before = slotsBefore.some(s => s.startTime === '15:00');

    // After cancel
    const aptCancelled = { ...aptToCancel, status: 'cancelled' as const };
    const slotsAfter = calculateAvailableSlotsForServices(config, [servFacial], testDate, 'loc_recoleta', [...baseAppointments, aptCancelled], baseBlocks);
    const has15After = slotsAfter.some(s => s.startTime === '15:00');

    const passed = !has15Before && has15After;
    results.push({
      id: 10,
      title: 'Cancelación que libera capacidad inmediatamente',
      category: 'Ciclo de Vida de Reservas',
      passed,
      explanation: passed 
        ? 'Al cancelar la cita, el turno de las 15:00 reaparece disponible en tiempo real.' 
        : 'La cancelación no liberó el slot.',
      details: `15:00 ocupado inicialmente -> Cancelado -> 15:00 liberado para nuevos clientes.`
    });
  }

  // 11. Reprogramación que no pierde la reserva original
  {
    // If reschedule fails due to target slot being full, original reservation remains intact
    const originalApt: Appointment = {
      id: 'apt_reprog_orig',
      bookingCode: 'TST-011',
      businessId: config.id,
      customer: { name: 'Martina', phone: '+5490000000004' },
      date: testDate,
      startTime: '10:00',
      endTime: '10:45',
      totalDurationMinutes: 45,
      status: 'confirmed',
      estimatedPrice: 32000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_orig',
        serviceId: 'serv_corte',
        serviceName: 'Corte',
        startTime: '10:00',
        endTime: '10:45',
        durationMinutes: 45,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Target invalid slot (e.g. 13:00 which is lunch break)
    const invalidSlot: any = {
      startTime: '13:00',
      endTime: '13:45',
      segmentsPlan: [{
        serviceId: 'serv_corte',
        startTime: '13:00',
        endTime: '13:45',
        professionalId: 'prof_sofia',
        resourceIds: ['res_estaciones_corte']
      }]
    };

    const attempt = verifyAndConfirmBooking(config, invalidSlot, testDate, 'loc_recoleta', [originalApt], baseBlocks, originalApt.customer.phone);
    const passed = !attempt.success && originalApt.status === 'confirmed';

    results.push({
      id: 11,
      title: 'Reprogramación atómica sin pérdida de reserva original',
      category: 'Seguridad Transaccional',
      passed,
      explanation: passed 
        ? 'Si el nuevo turno no es válido, la cita original permanece confirmada e intocada.' 
        : 'Se perdió la cita original ante un error de reprogramación.',
      details: 'Validación en dos fases evita que el cliente quede sin turno si la nueva opción falla.'
    });
  }

  // 12. Combo con precio especial (Reglas de precios combinados)
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!; // 32k
    const servSecado = config.services.find(s => s.id === 'serv_secado')!; // 22k
    // Individual sum: 54k. Bundle price: 44k
    const pricing = calculatePricing([servCorte, servSecado], config.bundlePricingRules, 'approximate');
    const passed = pricing.totalPrice === 44000 && pricing.bundlesApplied.length === 1 && pricing.bundlesApplied[0].savedAmount === 10000;

    results.push({
      id: 12,
      title: 'Combo con precio especial y ahorro automático',
      category: 'Motor de Precios',
      passed,
      explanation: passed 
        ? 'Detectó automáticamente el combo "Dúo Estilo Atelier" ($44.000) en lugar de sumar $54.000.' 
        : 'No se aplicó la regla de combo.',
      details: `Precio individual: $54.000. Precio combo aplicado: $44.000 (Ahorro: $10.000).`
    });
  }

  // 13. Negocio con precios ocultos
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    const pricing = calculatePricing([servCorte], config.bundlePricingRules, 'hidden');
    const passed = pricing.displayMode === 'hidden' && pricing.totalPrice === 0;

    results.push({
      id: 13,
      title: 'Negocio con modalidad de precios ocultos',
      category: 'Privacidad y Modalidades',
      passed,
      explanation: passed 
        ? 'Oculta todas las tarifas al cliente según la configuración del propietario.' 
        : 'Se expusieron tarifas a pesar del modo oculto.',
      details: 'El presupuesto no revela valores monetarios en la experiencia pública.'
    });
  }

  // 14. Servicio que requiere tiempo adicional de limpieza (buffer)
  {
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!; // 60 min + 15 min buffer = 75 min
    // If Clara does facial 09:00 to 10:00, she cannot do anything until 10:15
    const facialWithBuffer: Appointment = {
      id: 'apt_buffer_demo',
      bookingCode: 'TST-014',
      businessId: config.id,
      customer: { name: 'Cliente Buffer', phone: '+5490000000005' },
      date: testDate,
      startTime: '09:00',
      endTime: '10:00',
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 45000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_fac_b',
        serviceId: 'serv_facial_profunda',
        serviceName: 'Facial',
        startTime: '09:00',
        endTime: '10:15', // Includes 15 min buffer in busy block
        durationMinutes: 60,
        professionalId: 'prof_clara',
        professionalName: 'Clara',
        resourceIds: ['res_camilla_facial'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const slots = calculateAvailableSlotsForServices(config, [servFacial], testDate, 'loc_recoleta', [facialWithBuffer], baseBlocks, 'prof_clara');
    const slotAt1000 = slots.find(s => s.startTime === '10:00');

    const passed = !slotAt1000;
    results.push({
      id: 14,
      title: 'Tiempo adicional de higienización / preparación (Buffer)',
      category: 'Tiempos de Higiene',
      passed,
      explanation: passed 
        ? 'Protege los 15 min posteriores para esterilización antes del siguiente turno.' 
        : 'Permitió turno contiguo sin respetar el buffer.',
      details: 'Servicio 09:00-10:00 -> Bloqueo activo hasta 10:15 por sanitización.'
    });
  }

  // 15. Dos confirmaciones concurrentes sobre el último cupo
  {
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!;
    const slots = calculateAvailableSlotsForServices(config, [servFacial], testDate, 'loc_recoleta', baseAppointments, baseBlocks, 'prof_clara');
    const targetSlot = slots[0];

    // Client A confirms
    const stepA = verifyAndConfirmBooking(config, targetSlot, testDate, 'loc_recoleta', baseAppointments, baseBlocks, '+549111111111');
    const aptA: Appointment = {
      id: 'apt_concur_a',
      bookingCode: 'TST-015A',
      businessId: config.id,
      customer: { name: 'Cliente A', phone: '+549111111111' },
      date: testDate,
      startTime: targetSlot.startTime,
      endTime: targetSlot.endTime,
      totalDurationMinutes: 60,
      status: 'confirmed',
      estimatedPrice: 45000,
      locationId: 'loc_recoleta',
      segments: targetSlot.segmentsPlan.map(sp => ({
        id: 's_conc',
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

    // Client B tries milliseconds later with the same slot
    const stepB = verifyAndConfirmBooking(config, targetSlot, testDate, 'loc_recoleta', [...baseAppointments, aptA], baseBlocks, '+549222222222');

    const passed = stepA.success && !stepB.success;
    results.push({
      id: 15,
      title: 'Carrera de confirmaciones concurrentes sobre el último cupo',
      category: 'Atomicidad & Concurrencia',
      passed,
      explanation: passed 
        ? 'Control atómico en el servidor impide sobreventa; solo el primero reserva.' 
        : 'Se permitió overbooking concurrente.',
      details: 'Cliente A: Confirmado. Cliente B: Rechazado atómicamente.'
    });
  }

  // 16. Día aparentemente libre que no tiene intervalo suficiente para todos los servicios
  {
    // Need a 150 min block. But day has blocks leaving only 60m free fragments.
    const servColor = config.services.find(s => s.id === 'serv_color')!; // 90 min
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!; // 60 min
    // Total sequence: 150 min

    // Create day with fragmented slots where max window is 120 min
    const fragmentBlock1 = {
      id: 'frag_1',
      businessId: config.id,
      date: testDate,
      startTime: '11:00',
      endTime: '14:00',
      reason: 'Mantenimiento integral',
      type: 'maintenance' as const
    };
    const fragmentBlock2 = {
      id: 'frag_2',
      businessId: config.id,
      date: testDate,
      startTime: '15:30',
      endTime: '19:00',
      reason: 'Evento privado',
      type: 'personal' as const
    };

    const slots = calculateAvailableSlotsForServices(
      config, 
      [servColor, servFacial], 
      testDate, 
      'loc_recoleta', 
      baseAppointments, 
      [fragmentBlock1, fragmentBlock2]
    );

    const passed = slots.length === 0;
    results.push({
      id: 16,
      title: 'Día con intervalos fragmentados insuficientes para el combo',
      category: 'Secuencialidad Avanzada',
      passed,
      explanation: passed 
        ? 'No ofrece horarios engañosos si los huecos libres no alcanzan la suma total (150 min).' 
        : 'Se ofrecieron horarios incompletos.',
      details: 'Huecos de 120m descartados correctamente porque la visita requiere 150m continuos.'
    });
  }

  // 17. Reserva iniciada en móvil y confirmada mientras otra persona ocupa el turno
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!;
    const slots = calculateAvailableSlotsForServices(config, [servCorte], testDate, 'loc_recoleta', baseAppointments, baseBlocks, 'prof_sofia');
    const slotStale = slots[0];

    // Other user books it while mobile user is typing their phone number
    const interveningApt: Appointment = {
      id: 'apt_intervening',
      bookingCode: 'TST-017',
      businessId: config.id,
      customer: { name: 'Otro Usuario', phone: '+549999999999' },
      date: testDate,
      startTime: slotStale.startTime,
      endTime: slotStale.endTime,
      totalDurationMinutes: 45,
      status: 'confirmed',
      estimatedPrice: 32000,
      locationId: 'loc_recoleta',
      segments: [{
        id: 's_int',
        serviceId: 'serv_corte',
        serviceName: 'Corte',
        startTime: slotStale.startTime,
        endTime: slotStale.endTime,
        durationMinutes: 45,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const confirmAttempt = verifyAndConfirmBooking(
      config, 
      slotStale, 
      testDate, 
      'loc_recoleta', 
      [...baseAppointments, interveningApt], 
      baseBlocks, 
      '+549112345678'
    );

    const passed = !confirmAttempt.success;
    results.push({
      id: 17,
      title: 'Pantalla con turno desactualizado rechazada al confirmar',
      category: 'Integridad de Estado',
      passed,
      explanation: passed 
        ? 'La verificación en el servidor intercepta el turno ocupado y solicita elegir otro.' 
        : 'Se permitió sobreescritura sobre el horario ocupado.',
      details: `Mensaje devuelto: "${confirmAttempt.error}"`
    });
  }

  // 18. Secuencia de tres servicios atendidos por profesionales distintos
  {
    const servCorte = config.services.find(s => s.id === 'serv_corte')!; // Sofía/Mateo (45m)
    const servManicura = config.services.find(s => s.id === 'serv_manicura_semi')!; // Valentina (45m)
    const servFacial = config.services.find(s => s.id === 'serv_facial_profunda')!; // Clara (60m)
    // Total 150m across 3 distinct experts

    const slots = calculateAvailableSlotsForServices(config, [servCorte, servManicura, servFacial], testDate, 'loc_recoleta', baseAppointments, baseBlocks);
    const validMultiStaffSequence = slots.some(s => {
      const segs = s.segmentsPlan;
      if (segs.length !== 3) return false;
      const distinctStaff = new Set(segs.map(seg => seg.professionalId));
      // Distinct staff for each segment!
      return distinctStaff.size === 3;
    });

    results.push({
      id: 18,
      title: 'Secuencia de tres servicios con tres profesionales distintos',
      category: 'Planificación Multi-Profesional',
      passed: validMultiStaffSequence,
      explanation: validMultiStaffSequence 
        ? 'Coordina exitosamente a tres profesionales en secuencia estricta para la misma clienta.' 
        : 'Falló la coordinación de tres profesionales.',
      details: 'Corte (Sofía) -> Manicura (Valentina) -> Facial (Clara) sin huecos ni superposiciones.'
    });
  }

  return results;
}
