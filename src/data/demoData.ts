import { BusinessConfig, Appointment, AgendaBlock } from '../types';

export const BUSINESS_SALON: BusinessConfig = {
  id: 'biz_salon_atelier',
  name: "L'Atelier Beauté — Salón & Spa",
  slug: 'atelier-beaute',
  mode: 'salon_employees',
  tagline: 'Espacio de cuidado consciente, alta peluquería y tratamientos holísticos.',
  description: 'Un refugio de bienestar donde convergen la precisión técnica del estilismo y la serenidad de los rituales de autor.',
  address: 'Av. Quintana 492, Recoleta, Buenos Aires',
  phone: '+54 11 4801-9230',
  whatsapp: '+54 9 11 3928-1100',
  email: 'reservas@atelierbeaute.com',
  heroImage: '/src/assets/images/salon_interior_studio_1791506143873.jpg',
  pricingDisplayMode: 'approximate',
  slotIntervalMinutes: 30,
  minAdvanceNoticeHours: 2,
  maxAdvanceDays: 45,
  minBufferBetweenAppointments: 10,
  timezone: 'America/Argentina/Buenos_Aires',
  cancellationPolicyHours: 24,

  locations: [
    {
      id: 'loc_recoleta',
      name: 'Atelier Recoleta (Principal)',
      address: 'Av. Quintana 492, Recoleta',
      isMain: true,
      transitMinutesToLocation: {
        'loc_palermo': 30
      }
    },
    {
      id: 'loc_palermo',
      name: 'Atelier Palermo Soho',
      address: 'Gurruchaga 1680, Palermo Soho',
      isMain: false,
      transitMinutesToLocation: {
        'loc_recoleta': 30
      }
    }
  ],

  resources: [
    {
      id: 'res_cabina_masaje',
      name: 'Cabina de Masajes y Relajación (Recoleta)',
      type: 'cabina',
      totalQuantity: 1,
      locationId: 'loc_recoleta'
    },
    {
      id: 'res_camilla_facial',
      name: 'Camilla Facial de Cosmiatría (Recoleta)',
      type: 'camilla',
      totalQuantity: 1,
      locationId: 'loc_recoleta'
    },
    {
      id: 'res_puestos_manicura',
      name: 'Puestos de Manicura Ergonómicos (Recoleta)',
      type: 'puesto_manicura',
      totalQuantity: 2,
      locationId: 'loc_recoleta'
    },
    {
      id: 'res_estaciones_corte',
      name: 'Estaciones de Estilismo y Lavacabezas (Recoleta)',
      type: 'estacion_corte',
      totalQuantity: 3,
      locationId: 'loc_recoleta'
    },
    {
      id: 'res_cabina_masaje_pal',
      name: 'Cabina de Masajes (Palermo)',
      type: 'cabina',
      totalQuantity: 1,
      locationId: 'loc_palermo'
    },
    {
      id: 'res_camilla_facial_pal',
      name: 'Camilla Facial (Palermo)',
      type: 'camilla',
      totalQuantity: 1,
      locationId: 'loc_palermo'
    },
    {
      id: 'res_puestos_manicura_pal',
      name: 'Puestos de Manicura (Palermo)',
      type: 'puesto_manicura',
      totalQuantity: 2,
      locationId: 'loc_palermo'
    },
    {
      id: 'res_estaciones_corte_pal',
      name: 'Estaciones de Estilismo (Palermo)',
      type: 'estacion_corte',
      totalQuantity: 2,
      locationId: 'loc_palermo'
    }
  ],

  categories: [
    { id: 'cat_cabello', name: 'Peluquería y Estilismo', order: 1 },
    { id: 'cat_manos', name: 'Manicura y Uñas', order: 2 },
    { id: 'cat_facial', name: 'Cosmiatría y Cuidado Facial', order: 3 },
    { id: 'cat_corporal', name: 'Bienestar y Masajes', order: 4 }
  ],

  services: [
    {
      id: 'serv_corte',
      categoryId: 'cat_cabello',
      name: 'Corte de Autor & Asesoramiento',
      description: 'Diagnóstico morfológico, lavado tratante con aceites botánicos y corte personalizado.',
      durationMinutes: 45,
      bufferCleanupMinutes: 10,
      minAdvanceHours: 2,
      price: 32000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_sofia', 'prof_mateo'],
      requiredResourceTypes: ['estacion_corte'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_secado',
      categoryId: 'cat_cabello',
      name: 'Secado & Styling Natural',
      description: 'Secado térmico con cepillo de cerdas naturales y finalización con serum nutritivo.',
      durationMinutes: 30,
      bufferCleanupMinutes: 5,
      minAdvanceHours: 2,
      price: 22000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_sofia', 'prof_mateo'],
      requiredResourceTypes: ['estacion_corte'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: true, // Puede combinarse simultáneamente con manicura
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_color',
      categoryId: 'cat_cabello',
      name: 'Colorimetría Orgánica & Baño de Brillo',
      description: 'Coloración libre de amoníaco con pigmentos botánicos y nutrición capilar profunda.',
      durationMinutes: 90,
      bufferCleanupMinutes: 15,
      minAdvanceHours: 4,
      price: 58000,
      priceType: 'starting_at',
      enabledProfessionalIds: ['prof_sofia'],
      requiredResourceTypes: ['estacion_corte'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: true, // Durante el tiempo de exposición puede recibir manicura
      requiresConsultation: true,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_manicura_semi',
      categoryId: 'cat_manos',
      name: 'Manicura Rusa & Semipermanente',
      description: 'Limpieza profunda de cutículas con torno diamantado y esmaltado de alta duración.',
      durationMinutes: 45,
      bufferCleanupMinutes: 10,
      minAdvanceHours: 2,
      price: 28000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_valentina'],
      requiredResourceTypes: ['puesto_manicura'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: true, // Puede hacerse simultáneamente con secado o exposición de color
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_facial_profunda',
      categoryId: 'cat_facial',
      name: 'Limpieza Facial Profunda & Mascarilla Regenerante',
      description: 'Higiene dérmica con espátula ultrasónica, extracción cuidadosa y terapia de luz calmante.',
      durationMinutes: 60,
      bufferCleanupMinutes: 15,
      minAdvanceHours: 4,
      price: 45000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_clara'],
      requiredResourceTypes: ['camilla'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_masaje_descontracturante',
      categoryId: 'cat_corporal',
      name: 'Masaje Descontracturante & Aromaterapia',
      description: 'Presiones profundas y aceites tibios de lavanda francesa para liberar tensión muscular.',
      durationMinutes: 60,
      bufferCleanupMinutes: 15,
      minAdvanceHours: 3,
      price: 42000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_clara'],
      requiredResourceTypes: ['cabina'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    }
  ],

  professionals: [
    {
      id: 'prof_sofia',
      name: 'Sofía Albarracín',
      role: 'Master Stylist & Colorista',
      email: 'sofia@atelierbeaute.com',
      pin: '1001',
      enabledServiceIds: ['serv_corte', 'serv_secado', 'serv_color'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      canManageOwnBreaks: true,
      color: '#B69A70',
      weeklySchedule: {
        1: { start: '09:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        2: { start: '09:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        3: { start: '09:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        4: { start: '09:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        5: { start: '09:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        6: { start: '10:00', end: '17:00', breaks: [{ start: '13:30', end: '14:15', title: 'Pausa té' }] },
        0: null // Domingo cerrado
      }
    },
    {
      id: 'prof_mateo',
      name: 'Mateo Rossi',
      role: 'Estilista & Peinados',
      email: 'mateo@atelierbeaute.com',
      pin: '1002',
      enabledServiceIds: ['serv_corte', 'serv_secado'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      canManageOwnBreaks: true,
      color: '#A3B6A5',
      weeklySchedule: {
        1: { start: '10:00', end: '19:00', breaks: [{ start: '14:00', end: '15:00', title: 'Almuerzo' }] },
        2: { start: '10:00', end: '19:00', breaks: [{ start: '14:00', end: '15:00', title: 'Almuerzo' }] },
        3: { start: '10:00', end: '19:00', breaks: [{ start: '14:00', end: '15:00', title: 'Almuerzo' }] },
        4: { start: '10:00', end: '19:00', breaks: [{ start: '14:00', end: '15:00', title: 'Almuerzo' }] },
        5: { start: '10:00', end: '19:00', breaks: [{ start: '14:00', end: '15:00', title: 'Almuerzo' }] },
        6: { start: '10:00', end: '18:00', breaks: [{ start: '14:00', end: '14:45', title: 'Almuerzo' }] },
        0: null
      }
    },
    {
      id: 'prof_valentina',
      name: 'Valentina Gómez',
      role: 'Especialista en Uñas & Manicura',
      email: 'valentina@atelierbeaute.com',
      pin: '1003',
      enabledServiceIds: ['serv_manicura_semi'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      canManageOwnBreaks: true,
      color: '#D7BE93',
      weeklySchedule: {
        1: { start: '09:30', end: '18:30', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        2: { start: '09:30', end: '18:30', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        3: { start: '09:30', end: '18:30', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        4: { start: '09:30', end: '18:30', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        5: { start: '09:30', end: '18:30', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        6: { start: '10:00', end: '16:00', breaks: [] },
        0: null
      }
    },
    {
      id: 'prof_clara',
      name: 'Clara Domínguez',
      role: 'Cosmiatra & Terapeuta Holística',
      email: 'clara@atelierbeaute.com',
      pin: '1004',
      enabledServiceIds: ['serv_facial_profunda', 'serv_masaje_descontracturante'],
      locationIds: ['loc_recoleta', 'loc_palermo'],
      canManageOwnBreaks: true,
      color: '#CEAAA3',
      weeklySchedule: {
        1: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        2: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        3: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        4: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        5: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', title: 'Almuerzo' }] },
        6: { start: '10:00', end: '15:00', breaks: [] },
        0: null
      }
    }
  ],

  simultaneousRules: [
    {
      id: 'sim_secado_manicura',
      serviceAId: 'serv_secado',
      serviceBId: 'serv_manicura_semi',
      jointDurationMinutes: 50, // Bloque conjunto optimizado: estilista y manicura atienden al mismo tiempo
      description: 'Secado & Styling junto con Manicura Semipermanente en puesto adaptado.',
      requiresDistinctStaff: true,
      requiredResourceTypes: ['estacion_corte', 'puesto_manicura']
    }
  ],

  bundlePricingRules: [
    {
      id: 'bundle_corte_secado',
      name: 'Dúo Estilo Atelier (Corte + Secado)',
      serviceIds: ['serv_corte', 'serv_secado'],
      bundlePrice: 44000, // En vez de 32k + 22k = 54k (Ahorro $10.000)
      priority: 1,
      description: 'Combinación armoniosa de corte personalizado y secado profesional.'
    },
    {
      id: 'bundle_ritual_bienestar',
      name: 'Ritual Serenidad Integral (Facial + Masaje)',
      serviceIds: ['serv_facial_profunda', 'serv_masaje_descontracturante'],
      bundlePrice: 74000, // En vez de 45k + 42k = 87k (Ahorro $13.000)
      priority: 1,
      description: 'Experiencia dual de renovación facial y descontracturación muscular en cabina.'
    }
  ],

  weeklyBusinessHours: {
    1: { start: '09:00', end: '19:00', breaks: [] },
    2: { start: '09:00', end: '19:00', breaks: [] },
    3: { start: '09:00', end: '19:00', breaks: [] },
    4: { start: '09:00', end: '19:00', breaks: [] },
    5: { start: '09:00', end: '19:00', breaks: [] },
    6: { start: '10:00', end: '18:00', breaks: [] },
    0: null
  },

  holidaysAndVacations: ['2026-12-25', '2026-01-01', '2026-05-01', '2026-07-09'],
  ownerCredentials: {
    email: 'admin@atelierbeaute.com',
    password: 'admin123'
  }
};

export const BUSINESS_INDEPENDENT: BusinessConfig = {
  id: 'biz_independent_elena',
  name: 'Elena Mansilla Studio',
  slug: 'elena-mansilla',
  mode: 'independent',
  tagline: 'Estudio privado de manicura de autor y cuidado de uñas naturales.',
  description: 'Atención personalizada uno a uno en un entorno íntimo y silencioso, donde cada detalle se realiza con tiempo y devoción.',
  address: 'Estudio Privado — Palermo Chico, Buenos Aires (Dirección exacta tras confirmar)',
  phone: '+54 11 5500-4321',
  whatsapp: '+54 9 11 5500-4321',
  email: 'contacto@elenamansilla.com',
  heroImage: '/src/assets/images/independent_studio_atelier_1791506153368.jpg',
  pricingDisplayMode: 'approximate',
  slotIntervalMinutes: 30,
  minAdvanceNoticeHours: 3,
  maxAdvanceDays: 30,
  minBufferBetweenAppointments: 15, // 15 min de desinfección entre clientes
  timezone: 'America/Argentina/Buenos_Aires',
  cancellationPolicyHours: 24,

  locations: [
    {
      id: 'loc_elena_studio',
      name: 'Estudio Privado Palermo',
      address: 'Palermo Chico (Ubicación enviada tras reservar)',
      isMain: true
    }
  ],

  resources: [
    {
      id: 'res_elena_puesto',
      name: 'Puesto de Manicura Ergonómico',
      type: 'puesto_manicura',
      totalQuantity: 1, // Capacidad exacta de 1 cliente simultáneo
      locationId: 'loc_elena_studio'
    }
  ],

  categories: [
    { id: 'cat_manos_elena', name: 'Manicura de Autor', order: 1 },
    { id: 'cat_pies_elena', name: 'Pedicura Terapéutica', order: 2 }
  ],

  services: [
    {
      id: 'serv_manicura_rusa_elena',
      categoryId: 'cat_manos_elena',
      name: 'Manicura Combinada Rusa & Esmaltado',
      description: 'Limpieza minuciosa de eponiquio con fresas de precisión y nivelación con base de goma.',
      durationMinutes: 75,
      bufferCleanupMinutes: 15,
      minAdvanceHours: 3,
      price: 34000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_elena'],
      requiredResourceTypes: ['puesto_manicura'],
      locationIds: ['loc_elena_studio'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_pedicura_spa_elena',
      categoryId: 'cat_pies_elena',
      name: 'Pedicura Spa & Exfoliación Orgánica',
      description: 'Baño de sales minerales, remoción suave de durezas, exfoliación de arroz y esmaltado impecable.',
      durationMinutes: 60,
      bufferCleanupMinutes: 15,
      minAdvanceHours: 3,
      price: 36000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_elena'],
      requiredResourceTypes: ['puesto_manicura'],
      locationIds: ['loc_elena_studio'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    },
    {
      id: 'serv_reconstruccion_elena',
      categoryId: 'cat_manos_elena',
      name: 'Tratamiento Restaurador de Keratina',
      description: 'Terapia intensiva para uñas frágiles con queratina pura y masaje térmico de cutículas.',
      durationMinutes: 30,
      bufferCleanupMinutes: 10,
      minAdvanceHours: 3,
      price: 18000,
      priceType: 'fixed',
      enabledProfessionalIds: ['prof_elena'],
      requiredResourceTypes: ['puesto_manicura'],
      locationIds: ['loc_elena_studio'],
      allowSimultaneous: false,
      requiresConsultation: false,
      isOnlineBookingEnabled: true
    }
  ],

  professionals: [
    {
      id: 'prof_elena',
      name: 'Elena Mansilla',
      role: 'Especialista Independiente',
      email: 'elena@elenamansilla.com',
      pin: '2026',
      enabledServiceIds: ['serv_manicura_rusa_elena', 'serv_pedicura_spa_elena', 'serv_reconstruccion_elena'],
      locationIds: ['loc_elena_studio'],
      canManageOwnBreaks: true,
      color: '#B69A70',
      weeklySchedule: {
        1: { start: '10:00', end: '18:00', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        2: { start: '10:00', end: '18:00', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        3: { start: '10:00', end: '18:00', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        4: { start: '10:00', end: '18:00', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        5: { start: '10:00', end: '18:00', breaks: [{ start: '13:30', end: '14:30', title: 'Almuerzo' }] },
        6: { start: '11:00', end: '16:00', breaks: [] },
        0: null
      }
    }
  ],

  simultaneousRules: [], // Sin simultaneidad (una sola profesional)

  bundlePricingRules: [
    {
      id: 'bundle_elena_manos_pies',
      name: 'Experiencia Integral Manos & Pies',
      serviceIds: ['serv_manicura_rusa_elena', 'serv_pedicura_spa_elena'],
      bundlePrice: 62000, // En vez de 34k + 36k = 70k
      priority: 1,
      description: 'Secuencia completa de manicura rusa y pedicura spa en visita continua.'
    }
  ],

  weeklyBusinessHours: {
    1: { start: '10:00', end: '18:00', breaks: [] },
    2: { start: '10:00', end: '18:00', breaks: [] },
    3: { start: '10:00', end: '18:00', breaks: [] },
    4: { start: '10:00', end: '18:00', breaks: [] },
    5: { start: '10:00', end: '18:00', breaks: [] },
    6: { start: '11:00', end: '16:00', breaks: [] },
    0: null
  },

  holidaysAndVacations: ['2026-12-25', '2026-01-01', '2026-05-01'],
  ownerCredentials: {
    email: 'elena@elenamansilla.com',
    password: 'elena123'
  }
};

export const INITIAL_APPOINTMENTS_SALON: Appointment[] = [
  {
    id: 'apt_101',
    bookingCode: 'MAE-4912',
    businessId: 'biz_salon_atelier',
    customer: {
      name: 'Camila Mendizábal',
      phone: '+54 9 11 6721-4433',
      email: 'camila.m@example.com',
      notes: 'Prefiere tonos naturales y café negro'
    },
    date: '2026-10-10',
    startTime: '10:00',
    endTime: '11:15',
    totalDurationMinutes: 75,
    status: 'confirmed',
    estimatedPrice: 44000,
    bundleAppliedName: 'Dúo Estilo Atelier (Corte + Secado)',
    locationId: 'loc_recoleta',
    segments: [
      {
        id: 'seg_101_1',
        serviceId: 'serv_corte',
        serviceName: 'Corte de Autor & Asesoramiento',
        startTime: '10:00',
        endTime: '10:45',
        durationMinutes: 45,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía Albarracín',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      },
      {
        id: 'seg_101_2',
        serviceId: 'serv_secado',
        serviceName: 'Secado & Styling Natural',
        startTime: '10:45',
        endTime: '11:15',
        durationMinutes: 30,
        professionalId: 'prof_sofia',
        professionalName: 'Sofía Albarracín',
        resourceIds: ['res_estaciones_corte'],
        status: 'scheduled'
      }
    ],
    internalNotes: 'Cliente habitual, cabello fino con ondas.',
    createdAt: '2026-10-07T12:00:00.000Z',
    updatedAt: '2026-10-07T12:00:00.000Z'
  },
  {
    id: 'apt_102',
    bookingCode: 'MAE-6104',
    businessId: 'biz_salon_atelier',
    customer: {
      name: 'Lucía Benítez',
      phone: '+54 9 11 4109-8812',
      email: 'lucia.b@example.com'
    },
    date: '2026-10-10',
    startTime: '11:30',
    endTime: '12:30',
    totalDurationMinutes: 60,
    status: 'confirmed',
    estimatedPrice: 45000,
    locationId: 'loc_recoleta',
    segments: [
      {
        id: 'seg_102_1',
        serviceId: 'serv_facial_profunda',
        serviceName: 'Limpieza Facial Profunda & Mascarilla Regenerante',
        startTime: '11:30',
        endTime: '12:30',
        durationMinutes: 60,
        professionalId: 'prof_clara',
        professionalName: 'Clara Domínguez',
        resourceIds: ['res_camilla_facial'],
        status: 'scheduled'
      }
    ],
    createdAt: '2026-10-07T14:30:00.000Z',
    updatedAt: '2026-10-07T14:30:00.000Z'
  },
  {
    id: 'apt_103',
    bookingCode: 'MAE-8831',
    businessId: 'biz_salon_atelier',
    customer: {
      name: 'Florencia Varela',
      phone: '+54 9 11 5092-3377',
      email: 'flor.varela@example.com'
    },
    date: '2026-10-10',
    startTime: '14:00',
    endTime: '14:45',
    totalDurationMinutes: 45,
    status: 'confirmed',
    estimatedPrice: 28000,
    locationId: 'loc_recoleta',
    segments: [
      {
        id: 'seg_103_1',
        serviceId: 'serv_manicura_semi',
        serviceName: 'Manicura Rusa & Semipermanente',
        startTime: '14:00',
        endTime: '14:45',
        durationMinutes: 45,
        professionalId: 'prof_valentina',
        professionalName: 'Valentina Gómez',
        resourceIds: ['res_puestos_manicura'],
        status: 'scheduled'
      }
    ],
    createdAt: '2026-10-08T09:15:00.000Z',
    updatedAt: '2026-10-08T09:15:00.000Z'
  }
];

export const INITIAL_AGENDA_BLOCKS_SALON: AgendaBlock[] = [
  {
    id: 'blk_1',
    businessId: 'biz_salon_atelier',
    professionalId: 'prof_sofia',
    locationId: 'loc_recoleta',
    date: '2026-10-10',
    startTime: '15:00',
    endTime: '16:00',
    reason: 'Capacitación en técnicas botánicas',
    type: 'personal'
  }
];
