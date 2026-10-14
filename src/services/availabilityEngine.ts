import { 
  BusinessConfig, 
  Service, 
  Appointment, 
  AgendaBlock, 
  CalculatedSlot, 
  DayAvailabilitySummary, 
  Professional
} from '../types';
import { isSamePhone } from './phone';

// Time utility functions
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks if two time intervals overlap: [startA, endA) and [startB, endB)
 */
export function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

interface ProfessionalAvailabilitySlot {
  professionalId: string;
  professionalName: string;
}

/**
 * Validates whether a professional is working and free during [startMin, endMin) on date
 */
export function isProfessionalAvailable(
  prof: Professional,
  dateStr: string,
  startMin: number,
  endMin: number,
  locationId: string,
  appointments: Appointment[],
  agendaBlocks: AgendaBlock[],
  transitRules?: { fromLocationId: string; transitMin: number }[]
): boolean {
  const dateObj = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 1 is Monday...

  const schedule = prof.weeklySchedule[dayOfWeek];
  if (!schedule) return false; // Not working this day

  const workStart = timeToMinutes(schedule.start);
  const workEnd = timeToMinutes(schedule.end);

  // Must be strictly within working hours
  if (startMin < workStart || endMin > workEnd) return false;

  // Check breaks
  for (const b of schedule.breaks) {
    const breakStart = timeToMinutes(b.start);
    const breakEnd = timeToMinutes(b.end);
    if (intervalsOverlap(startMin, endMin, breakStart, breakEnd)) {
      return false; // Overlaps with break
    }
  }

  // Check agenda blocks / vacations
  const profBlocks = agendaBlocks.filter(b => 
    b.date === dateStr && (!b.professionalId || b.professionalId === prof.id)
  );
  for (const blk of profBlocks) {
    const bStart = timeToMinutes(blk.startTime);
    const bEnd = timeToMinutes(blk.endTime);
    if (intervalsOverlap(startMin, endMin, bStart, bEnd)) {
      return false; // Overlaps with absence or custom block
    }
  }

  // Check existing appointments on this date
  const activeAppointments = appointments.filter(a => 
    a.date === dateStr && a.status !== 'cancelled'
  );

  for (const apt of activeAppointments) {
    for (const seg of apt.segments) {
      if (seg.professionalId === prof.id) {
        const segStart = timeToMinutes(seg.startTime);
        // Note: each service has buffer cleanup time in mind when scheduled
        const segEnd = timeToMinutes(seg.endTime);

        if (intervalsOverlap(startMin, endMin, segStart, segEnd)) {
          return false; // Professional busy
        }

        // Check transit time if appointment was in another location
        if (apt.locationId !== locationId) {
          const transitTime = 30; // standard 30 min transit between different branches
          if (intervalsOverlap(startMin, endMin, segStart - transitTime, segEnd + transitTime)) {
            return false; // In transit
          }
        }
      }
    }
  }

  return true;
}

/**
 * Checks if required physical resources are available at the given location for [startMin, endMin)
 */
export function areResourcesAvailable(
  config: BusinessConfig,
  requiredResourceTypes: string[],
  locationId: string,
  dateStr: string,
  startMin: number,
  endMin: number,
  appointments: Appointment[],
  excludeAppointmentId?: string
): { available: boolean; allocatedResourceIds: string[] } {
  if (!requiredResourceTypes || requiredResourceTypes.length === 0) {
    return { available: true, allocatedResourceIds: [] };
  }

  const allocatedResourceIds: string[] = [];
  const activeAppointments = appointments.filter(a => 
    a.date === dateStr && 
    a.locationId === locationId && 
    a.status !== 'cancelled' &&
    (!excludeAppointmentId || a.id !== excludeAppointmentId)
  );

  for (const resType of requiredResourceTypes) {
    // 1. Check resources for this location
    let businessResources = config.resources.filter(
      r => (r.locationId === locationId || !r.locationId) && r.type === resType
    );

    // 2. If no location-specific resources found, check if business has any of this type
    if (businessResources.length === 0) {
      businessResources = config.resources.filter(r => r.type === resType);
    }

    // 3. If the business has not configured ANY physical resource of this type,
    // do not block booking because the business does not enforce that physical bottleneck
    if (businessResources.length === 0) {
      continue;
    }

    const totalCapacity = businessResources.reduce((sum, r) => sum + r.totalQuantity, 0);

    // Count concurrent usages during [startMin, endMin)
    let maxOccupiedAtAnyMoment = 0;

    // Check in 5-minute increments for precise sub-interval overlap
    for (let t = startMin; t < endMin; t += 5) {
      let occupiedCount = 0;
      for (const apt of activeAppointments) {
        for (const seg of apt.segments) {
          const sStart = timeToMinutes(seg.startTime);
          const sEnd = timeToMinutes(seg.endTime);
          if (t >= sStart && t < sEnd) {
            // Check if this segment uses resources of this type
            const service = config.services.find(s => s.id === seg.serviceId);
            if (service && service.requiredResourceTypes.includes(resType)) {
              occupiedCount++;
            }
          }
        }
      }
      if (occupiedCount > maxOccupiedAtAnyMoment) {
        maxOccupiedAtAnyMoment = occupiedCount;
      }
    }

    if (maxOccupiedAtAnyMoment >= totalCapacity) {
      return { available: false, allocatedResourceIds: [] };
    }

    // Allocate first available resource ID
    allocatedResourceIds.push(businessResources[0].id);
  }

  return { available: true, allocatedResourceIds };
}

/**
 * Checks if a specific client has another overlapping appointment
 * (Client cannot receive multiple services in parallel unless explicitly authorized simultaneous combo)
 */
export function isClientBusy(
  clientPhoneOrEmail: string,
  dateStr: string,
  startMin: number,
  endMin: number,
  appointments: Appointment[],
  excludeAppointmentId?: string
): boolean {
  if (!clientPhoneOrEmail) return false;
  // Teléfono: comparación normalizada (mismo número, cualquier formato). Email: comparación exacta.
  const isEmail = clientPhoneOrEmail.includes('@');
  const active = appointments.filter(a =>
    a.date === dateStr &&
    a.status !== 'cancelled' &&
    (!excludeAppointmentId || a.id !== excludeAppointmentId) &&
    (isEmail
      ? !!a.customer.email && a.customer.email === clientPhoneOrEmail
      : isSamePhone(a.customer.phone, clientPhoneOrEmail))
  );

  for (const a of active) {
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    if (intervalsOverlap(startMin, endMin, aStart, aEnd)) {
      return true;
    }
  }
  return false;
}

/**
 * CORE ALGORITHM: Calculates all bookable slots for a selected list of services on a given date.
 */
export function calculateAvailableSlotsForServices(
  config: BusinessConfig,
  selectedServices: Service[],
  dateStr: string,
  locationId: string,
  appointments: Appointment[],
  agendaBlocks: AgendaBlock[],
  selectedProfessionalId?: string // Optional specific professional
): CalculatedSlot[] {
  if (selectedServices.length === 0) return [];

  const dateObj = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();

  // 1. Business open check
  const bizSchedule = config.weeklyBusinessHours[dayOfWeek];
  if (!bizSchedule) return []; // Business closed

  // 2. Check holidays
  if (config.holidaysAndVacations.includes(dateStr)) return [];

  const bizOpenMin = timeToMinutes(bizSchedule.start);
  const bizCloseMin = timeToMinutes(bizSchedule.end);

  const slotInterval = config.slotIntervalMinutes || 30;
  const slots: CalculatedSlot[] = [];

  // Check if current time + minAdvanceHours restricts today's slots
  const now = new Date();
  const isToday = formatDateIso(now) === dateStr;
  const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();

  // Determine if this set of services matches an authorized simultaneous rule
  let isSimultaneousRuleApplicable = false;
  let matchingSimRule = null;

  if (selectedServices.length === 2 && !selectedProfessionalId) {
    matchingSimRule = config.simultaneousRules.find(rule => 
      (rule.serviceAId === selectedServices[0].id && rule.serviceBId === selectedServices[1].id) ||
      (rule.serviceAId === selectedServices[1].id && rule.serviceBId === selectedServices[0].id)
    );
    if (matchingSimRule) {
      isSimultaneousRuleApplicable = true;
    }
  }

  // Iterate over each candidate start time within business hours
  for (let candidateStart = bizOpenMin; candidateStart < bizCloseMin; candidateStart += slotInterval) {
    // Check advance notice
    if (isToday) {
      const minAdvance = Math.max(...selectedServices.map(s => s.minAdvanceHours || config.minAdvanceNoticeHours));
      if (candidateStart < currentMinutesFromMidnight + minAdvance * 60) {
        continue;
      }
    }

    if (isSimultaneousRuleApplicable && matchingSimRule) {
      // SIMULTANEOUS FLOW (Regla 5: Simultaneidad autorizada)
      const jointDuration = matchingSimRule.jointDurationMinutes;
      const candidateEnd = candidateStart + jointDuration;

      if (candidateEnd > bizCloseMin) continue; // Exceeds closing time

      // Need 2 distinct staff members
      const servA = selectedServices[0];
      const servB = selectedServices[1];

      const qualifiedForA = config.professionals.filter(p => 
        (servA.enabledProfessionalIds.includes('*') || servA.enabledProfessionalIds.includes(p.id)) &&
        p.locationIds.includes(locationId)
      );
      const qualifiedForB = config.professionals.filter(p => 
        (servB.enabledProfessionalIds.includes('*') || servB.enabledProfessionalIds.includes(p.id)) &&
        p.locationIds.includes(locationId)
      );

      let foundStaffPair: { profA: Professional; profB: Professional } | null = null;

      for (const pA of qualifiedForA) {
        if (!isProfessionalAvailable(pA, dateStr, candidateStart, candidateEnd + servA.bufferCleanupMinutes, locationId, appointments, agendaBlocks)) {
          continue;
        }
        for (const pB of qualifiedForB) {
          if (pA.id === pB.id) continue; // Must be distinct professionals!
          if (!isProfessionalAvailable(pB, dateStr, candidateStart, candidateEnd + servB.bufferCleanupMinutes, locationId, appointments, agendaBlocks)) {
            continue;
          }
          foundStaffPair = { profA: pA, profB: pB };
          break;
        }
        if (foundStaffPair) break;
      }

      if (foundStaffPair) {
        // Check resources for both services
        const resCheckA = areResourcesAvailable(config, servA.requiredResourceTypes, locationId, dateStr, candidateStart, candidateEnd, appointments);
        const resCheckB = areResourcesAvailable(config, servB.requiredResourceTypes, locationId, dateStr, candidateStart, candidateEnd, appointments);

        if (resCheckA.available && resCheckB.available) {
          const period = candidateStart < 720 ? 'morning' : candidateStart < 960 ? 'midday' : 'afternoon';

          slots.push({
            startTime: minutesToTime(candidateStart),
            endTime: minutesToTime(candidateEnd),
            isSimultaneousCombo: true,
            period,
            segmentsPlan: [
              {
                serviceId: servA.id,
                serviceName: servA.name,
                durationMinutes: jointDuration,
                startTime: minutesToTime(candidateStart),
                endTime: minutesToTime(candidateEnd),
                professionalId: foundStaffPair.profA.id,
                professionalName: foundStaffPair.profA.name,
                resourceIds: resCheckA.allocatedResourceIds
              },
              {
                serviceId: servB.id,
                serviceName: servB.name,
                durationMinutes: jointDuration,
                startTime: minutesToTime(candidateStart),
                endTime: minutesToTime(candidateEnd),
                professionalId: foundStaffPair.profB.id,
                professionalName: foundStaffPair.profB.name,
                resourceIds: resCheckB.allocatedResourceIds
              }
            ]
          });
          continue; // Successfully scheduled as simultaneous combo
        }
      }
      // If simultaneous could not be fulfilled at this start time, fall through to sequential check!
    }

    // SEQUENTIAL FLOW (Regla 4: Servicios múltiples de una misma persona en secuencia)
    {
      let currentPointer = candidateStart;
      let sequenceValid = true;
      const plannedSegments: CalculatedSlot['segmentsPlan'] = [];

      for (let i = 0; i < selectedServices.length; i++) {
        const serv = selectedServices[i];
        const segDuration = serv.durationMinutes;
        const segEnd = currentPointer + segDuration;

        // Must not exceed closing time
        if (segEnd > bizCloseMin) {
          sequenceValid = false;
          break;
        }

        // Find an eligible and available professional for this segment
        const qualifiedProfessionals = config.professionals.filter(p => {
          const isEligible = serv.enabledProfessionalIds.includes('*') || serv.enabledProfessionalIds.includes(p.id);
          const worksAtLocation = p.locationIds.includes(locationId);
          if (!isEligible || !worksAtLocation) return false;

          // If a specific professional was preferred by the customer:
          // Check if that preferred professional is actually qualified for this specific service.
          // If they are qualified, prefer/require them; if not, allow other qualified specialists.
          if (selectedProfessionalId) {
            const requestedCanDoThis = serv.enabledProfessionalIds.includes('*') || serv.enabledProfessionalIds.includes(selectedProfessionalId);
            if (requestedCanDoThis && p.id !== selectedProfessionalId) {
              return false;
            }
          }
          return true;
        });

        // Determine if next service is with same professional to avoid unnecessary buffer between services of same client
        const isLastSegment = i === selectedServices.length - 1;
        const nextService = !isLastSegment ? selectedServices[i + 1] : null;

        let chosenProf: Professional | null = null;
        for (const prof of qualifiedProfessionals) {
          // If next service could be done by the same prof, buffer is only required at the end of the customer's session
          const nextCanUseSameProf = nextService && (nextService.enabledProfessionalIds.includes('*') || nextService.enabledProfessionalIds.includes(prof.id));
          const bufferToApply = nextCanUseSameProf ? 0 : serv.bufferCleanupMinutes;
          const totalBusyBlockEnd = segEnd + bufferToApply;

          if (isProfessionalAvailable(prof, dateStr, currentPointer, totalBusyBlockEnd, locationId, appointments, agendaBlocks)) {
            chosenProf = prof;
            break;
          }
        }

        if (!chosenProf) {
          sequenceValid = false;
          break;
        }

        // Check resources for this segment
        const resCheck = areResourcesAvailable(
          config, 
          serv.requiredResourceTypes, 
          locationId, 
          dateStr, 
          currentPointer, 
          segEnd + serv.bufferCleanupMinutes, 
          appointments
        );

        if (!resCheck.available) {
          sequenceValid = false;
          break;
        }

        plannedSegments.push({
          serviceId: serv.id,
          serviceName: serv.name,
          durationMinutes: segDuration,
          startTime: minutesToTime(currentPointer),
          endTime: minutesToTime(segEnd),
          professionalId: chosenProf.id,
          professionalName: chosenProf.name,
          resourceIds: resCheck.allocatedResourceIds
        });

        // Next service in the sequence begins right after this one finishes
        currentPointer = segEnd;
      }

      if (sequenceValid && plannedSegments.length === selectedServices.length) {
        const totalEnd = currentPointer;
        const period = candidateStart < 720 ? 'morning' : candidateStart < 960 ? 'midday' : 'afternoon';

        slots.push({
          startTime: minutesToTime(candidateStart),
          endTime: minutesToTime(totalEnd),
          isSimultaneousCombo: false,
          period,
          segmentsPlan: plannedSegments
        });
      }
    }
  }

  return slots;
}

/**
 * Calculates day availability summaries for an entire month view.
 * States:
 * - 'high' (> 4 available slots) -> Salvia (#A3B6A5)
 * - 'limited' (1 to 4 available slots) -> Champagne (#D7BE93)
 * - 'none' (0 available slots) -> Rosa arcilla (#CEAAA3)
 * - 'closed' (closed day or holiday or past) -> Gris suave (#E5DDD3)
 */
export function calculateMonthAvailability(
  config: BusinessConfig,
  selectedServices: Service[],
  year: number,
  month: number, // 0-indexed (0 = Jan, 9 = Oct)
  locationId: string,
  appointments: Appointment[],
  agendaBlocks: AgendaBlock[],
  selectedProfessionalId?: string
): Record<string, DayAvailabilitySummary> {
  const result: Record<string, DayAvailabilitySummary> = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (config.maxAdvanceDays || 60));

  for (let d = 1; d <= daysInMonth; d++) {
    const current = new Date(year, month, d);
    const dateStr = formatDateIso(current);
    const dayOfWeek = current.getDay();

    // Check if past
    if (current < today) {
      result[dateStr] = {
        date: dateStr,
        level: 'closed',
        totalSlotsCount: 0,
        isClosed: true,
        reason: 'Fecha anterior'
      };
      continue;
    }

    // Check if beyond max advance days
    if (current > maxDate) {
      result[dateStr] = {
        date: dateStr,
        level: 'closed',
        totalSlotsCount: 0,
        isClosed: true,
        reason: 'Fuera de ventana de reserva'
      };
      continue;
    }

    // Check holiday
    if (config.holidaysAndVacations.includes(dateStr)) {
      result[dateStr] = {
        date: dateStr,
        level: 'closed',
        totalSlotsCount: 0,
        isClosed: true,
        reason: 'Feriado / Cerrado'
      };
      continue;
    }

    // Check business day schedule
    const bizSchedule = config.weeklyBusinessHours[dayOfWeek];
    if (!bizSchedule) {
      result[dateStr] = {
        date: dateStr,
        level: 'closed',
        totalSlotsCount: 0,
        isClosed: true,
        reason: 'Día de descanso'
      };
      continue;
    }

    // Calculate real slots for this date
    const slots = calculateAvailableSlotsForServices(
      config,
      selectedServices,
      dateStr,
      locationId,
      appointments,
      agendaBlocks,
      selectedProfessionalId
    );

    const count = slots.length;

    let level: DayAvailabilitySummary['level'] = 'none';
    if (count > 4) {
      level = 'high';
    } else if (count > 0) {
      level = 'limited';
    } else {
      level = 'none';
    }

    result[dateStr] = {
      date: dateStr,
      level,
      totalSlotsCount: count,
      isClosed: false
    };
  }

  return result;
}

/**
 * ATOMIC RESERVATION VERIFICATION:
 * Re-validates slot availability at final confirmation time to prevent double-booking race condition.
 */
export function verifyAndConfirmBooking(
  config: BusinessConfig,
  slot: CalculatedSlot,
  dateStr: string,
  locationId: string,
  appointments: Appointment[],
  agendaBlocks: AgendaBlock[],
  customerPhone: string
): { success: boolean; error?: string } {
  // Check if client is already booked at that time
  const startMin = timeToMinutes(slot.startTime);
  const endMin = timeToMinutes(slot.endTime);

  if (isClientBusy(customerPhone, dateStr, startMin, endMin, appointments)) {
    return {
      success: false,
      error: 'Ya posees una cita registrada en este mismo horario.'
    };
  }

  // Check each planned segment for staff or resource conflict
  for (const seg of slot.segmentsPlan) {
    const sStart = timeToMinutes(seg.startTime);
    const sEnd = timeToMinutes(seg.endTime);
    const prof = config.professionals.find(p => p.id === seg.professionalId);

    if (!prof) {
      return { success: false, error: 'El profesional seleccionado ya no está disponible.' };
    }

    const service = config.services.find(s => s.id === seg.serviceId);
    const buffer = service ? service.bufferCleanupMinutes : 0;

    const available = isProfessionalAvailable(
      prof,
      dateStr,
      sStart,
      sEnd + buffer,
      locationId,
      appointments,
      agendaBlocks
    );

    if (!available) {
      return {
        success: false,
        error: `El profesional ${prof.name} acaba de ser reservado en este horario por otro cliente.`
      };
    }

    // Check resources
    if (service && service.requiredResourceTypes.length > 0) {
      const resCheck = areResourcesAvailable(
        config,
        service.requiredResourceTypes,
        locationId,
        dateStr,
        sStart,
        sEnd + buffer,
        appointments
      );

      if (!resCheck.available) {
        return {
          success: false,
          error: 'El espacio o recurso exclusivo ya no se encuentra disponible.'
        };
      }
    }
  }

  return { success: true };
}
