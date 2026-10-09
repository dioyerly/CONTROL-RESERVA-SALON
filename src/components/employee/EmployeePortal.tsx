import React, { useState } from 'react';
import { 
  BusinessConfig, 
  Appointment, 
  Professional, 
  AgendaBlock 
} from '../../types';
import { 
  saveAppointment, 
  addAgendaBlock, 
  updateAppointmentStatus,
  addOwnerNotification 
} from '../../services/storage';
import { timeToMinutes, minutesToTime } from '../../services/availabilityEngine';
import { 
  Lock, 
  Calendar, 
  Clock, 
  CheckCircle, 
  Play, 
  Check, 
  Coffee, 
  LogOut,
  AlertCircle,
  Plus,
  User
} from 'lucide-react';

interface EmployeePortalProps {
  business: BusinessConfig;
  appointments: Appointment[];
  agendaBlocks: AgendaBlock[];
  onRefresh: () => void;
}

export const EmployeePortal: React.FC<EmployeePortalProps> = ({
  business,
  appointments,
  agendaBlocks,
  onRefresh
}) => {
  const [selectedStaffId, setSelectedStaffId] = useState<string>(business.professionals[0]?.id || '');
  const [pinInput, setPinInput] = useState<string>('');
  const [loggedInStaff, setLoggedInStaff] = useState<Professional | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeDate, setActiveDate] = useState<string>('2026-10-10');

  // Break blocking form state
  const [breakStart, setBreakStart] = useState('14:30');
  const [breakEnd, setBreakEnd] = useState('15:00');
  const [breakTitle, setBreakTitle] = useState('Descanso personal');
  const [showBreakModal, setShowBreakModal] = useState(false);

  // New appointment by employee state
  const [showNewAptModal, setShowNewAptModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newAptStartTime, setNewAptStartTime] = useState('10:00');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const prof = business.professionals.find(p => p.id === selectedStaffId);
    if (!prof) {
      setLoginError('Profesional no encontrado.');
      return;
    }

    if (prof.pin === pinInput.trim()) {
      setLoggedInStaff(prof);
      setPinInput('');
    } else {
      setLoginError(`PIN incorrecto para ${prof.name}. (Pista demo: PIN ${prof.pin})`);
    }
  };

  const handleLogout = () => {
    setLoggedInStaff(null);
    setPinInput('');
  };

  // Filter appointments for THIS professional only (strict RBAC privacy: no other staff agendas, no financial totals)
  const staffAppointmentsForDate = appointments
    .filter(apt => apt.date === activeDate && apt.status !== 'cancelled')
    .filter(apt => apt.segments.some(seg => seg.professionalId === loggedInStaff?.id))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleUpdateSegmentStatus = (aptId: string, segmentId: string, status: 'scheduled' | 'in_service' | 'completed') => {
    const apt = appointments.find(a => a.id === aptId);
    if (!apt) return;

    const updatedSegments = apt.segments.map(seg => {
      if (seg.id === segmentId) {
        return { ...seg, status };
      }
      return seg;
    });

    const allCompleted = updatedSegments.every(s => s.status === 'completed');
    const newAptStatus = allCompleted ? 'completed' : apt.status;

    saveAppointment({
      ...apt,
      status: newAptStatus,
      segments: updatedSegments,
      updatedAt: new Date().toISOString()
    });

    onRefresh();
  };

  const handleCreateOwnBreak = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInStaff) return;

    const block: AgendaBlock = {
      id: `blk_staff_${Date.now()}`,
      businessId: business.id,
      professionalId: loggedInStaff.id,
      date: activeDate,
      startTime: breakStart,
      endTime: breakEnd,
      reason: breakTitle,
      type: 'break'
    };

    addAgendaBlock(block);
    setShowBreakModal(false);
    onRefresh();
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInStaff || !newCustName.trim() || !newCustPhone.trim()) return;

    const serv = business.services.find(s => s.id === newServiceId) || availableServicesForStaff[0];
    if (!serv) return;

    const startMin = timeToMinutes(newAptStartTime);
    const endMin = startMin + serv.durationMinutes;
    const endTimeStr = minutesToTime(endMin);

    const bookingCode = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newApt: Appointment = {
      id: `apt_emp_${Date.now()}`,
      bookingCode,
      businessId: business.id,
      customer: {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        notes: newCustNotes.trim() || undefined
      },
      date: activeDate,
      startTime: newAptStartTime,
      endTime: endTimeStr,
      totalDurationMinutes: serv.durationMinutes,
      status: 'confirmed',
      locationId: loggedInStaff.locationIds[0] || business.locations[0]?.id || 'loc_main',
      estimatedPrice: serv.price || 0,
      segments: [
        {
          id: `seg_${Date.now()}_0`,
          serviceId: serv.id,
          serviceName: serv.name,
          startTime: newAptStartTime,
          endTime: endTimeStr,
          durationMinutes: serv.durationMinutes,
          professionalId: loggedInStaff.id,
          professionalName: loggedInStaff.name,
          resourceIds: [],
          status: 'scheduled'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    saveAppointment(newApt);

    // Send notification to owner (notificación al propietario)
    addOwnerNotification({
      id: `notif_${Date.now()}`,
      businessId: business.id,
      title: `Turno agendado por ${loggedInStaff.name}`,
      message: `${loggedInStaff.name} agendó a ${newCustName.trim()} (${newCustPhone.trim()}) para "${serv.name}" el ${activeDate} a las ${newAptStartTime} hs.`,
      createdAt: new Date().toISOString(),
      read: false,
      appointmentId: newApt.id
    });

    setShowNewAptModal(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustNotes('');
    setBookingSuccessMsg(`Turno ${bookingCode} registrado con éxito y notificado al propietario.`);
    setTimeout(() => setBookingSuccessMsg(null), 5000);
    onRefresh();
  };

  const availableServicesForStaff = loggedInStaff
    ? business.services.filter(s => 
        loggedInStaff.enabledServiceIds.includes('*') || 
        loggedInStaff.enabledServiceIds.includes(s.id) ||
        s.enabledProfessionalIds.includes('*') ||
        s.enabledProfessionalIds.includes(loggedInStaff.id)
      )
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
      {!loggedInStaff ? (
        /* Login Card */
        <div className="max-w-md mx-auto bg-white border border-[#E5DDD3] rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-[#FAF8F4] border border-[#E5DDD3] rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-[#B69A70]" />
            </div>
            <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-1">
              Acceso Restringido
            </span>
            <h2 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
              Portal del Profesional
            </h2>
            <p className="text-xs text-[#80766E] mt-1">
              Consulta tu agenda individual, registra inicio y fin de servicios y gestiona tus descansos.
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-xs text-[#302C29] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#CEAAA3] shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Selecciona tu perfil</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                {business.professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">PIN personal de 4 dígitos</label>
              <input
                type="password"
                maxLength={4}
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="****"
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-center font-mono text-base tracking-widest text-[#302C29]"
              />
              <span className="text-[11px] text-[#80766E] mt-1 block text-center">
                (Pistas demo: Sofía: 1001, Mateo: 1002, Valentina: 1003, Clara: 1004)
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#302C29] hover:bg-[#1a1715] text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Ingresar a Mi Agenda
            </button>
          </form>
        </div>
      ) : (
        /* Logged In View */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: loggedInStaff.color }}
              >
                {loggedInStaff.name.charAt(0)}
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[#80766E] block">
                  Profesional en turno
                </span>
                <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
                  {loggedInStaff.name}
                </h3>
                <span className="text-xs text-[#B69A70] font-medium">{loggedInStaff.role}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewServiceId(availableServicesForStaff[0]?.id || '');
                  setShowNewAptModal(true);
                }}
                className="px-3.5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#B69A70]" />
                <span>+ Agendar Turno</span>
              </button>

              {loggedInStaff.canManageOwnBreaks && (
                <button
                  type="button"
                  onClick={() => setShowBreakModal(true)}
                  className="px-3.5 py-2 bg-[#FAF8F4] hover:bg-[#F0EAE2] text-[#302C29] border border-[#E5DDD3] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Coffee className="w-3.5 h-3.5 text-[#B69A70]" />
                  <span>Programar Pausa</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="px-3.5 py-2 text-[#80766E] hover:text-[#302C29] text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </div>
          </div>

          {bookingSuccessMsg && (
            <div className="p-3 bg-[#A3B6A5]/20 border border-[#A3B6A5] rounded-xl text-xs text-[#302C29] flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#5e7761] shrink-0" />
              <span>{bookingSuccessMsg}</span>
            </div>
          )}

          {/* Date Selector & Free/Occupied Spaces Ribbon */}
          <div className="bg-white border border-[#E5DDD3] rounded-xl p-4 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[#80766E] font-medium">Fecha de trabajo:</span>
              <input
                type="date"
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                className="font-serif-editorial text-base text-[#302C29] bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Espacios libres y ocupados (como en Google Calendar) */}
            <div className="pt-2 border-t border-[#E5DDD3]/60">
              <span className="text-[11px] uppercase tracking-wider text-[#80766E] font-medium block mb-2">
                Disponibilidad horaria del día:
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(hourStr => {
                  const hourMin = timeToMinutes(hourStr);
                  const isBusyWithApt = staffAppointmentsForDate.some(a => {
                    const aStart = timeToMinutes(a.startTime);
                    const aEnd = timeToMinutes(a.endTime);
                    return hourMin >= aStart && hourMin < aEnd;
                  });

                  const isBusyWithBlock = agendaBlocks.some(b => {
                    if (b.date !== activeDate) return false;
                    if (b.professionalId && b.professionalId !== loggedInStaff.id) return false;
                    const bStart = timeToMinutes(b.startTime);
                    const bEnd = timeToMinutes(b.endTime);
                    return hourMin >= bStart && hourMin < bEnd;
                  });

                  const isFree = !isBusyWithApt && !isBusyWithBlock;

                  return (
                    <button
                      key={hourStr}
                      type="button"
                      onClick={() => {
                        if (isFree) {
                          setNewAptStartTime(hourStr);
                          setNewServiceId(availableServicesForStaff[0]?.id || '');
                          setShowNewAptModal(true);
                        }
                      }}
                      disabled={!isFree}
                      className={`p-1.5 rounded border text-center transition-all ${
                        isBusyWithApt
                          ? 'bg-[#302C29] text-white border-[#302C29] opacity-90 cursor-default'
                          : isBusyWithBlock
                          ? 'bg-[#F0EAE2] text-[#80766E] border-[#D7BE93] cursor-default'
                          : 'bg-[#FAF8F4] hover:bg-white text-[#302C29] border-[#A3B6A5] cursor-pointer hover:border-[#302C29]'
                      }`}
                    >
                      <span className="font-mono text-[11px] font-bold block">{hourStr}</span>
                      <span className={`text-[9px] block ${isFree ? 'text-[#5e7761] font-semibold' : ''}`}>
                        {isBusyWithApt ? 'Ocupado' : isBusyWithBlock ? 'Pausa' : 'Libre +'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Individual Agenda List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#80766E]">
              <span className="uppercase tracking-wider font-semibold">Tus servicios para hoy:</span>
              <span>{staffAppointmentsForDate.length} {staffAppointmentsForDate.length === 1 ? 'visita asignada' : 'visitas asignadas'}</span>
            </div>

            {staffAppointmentsForDate.length === 0 ? (
              <div className="bg-white border border-[#E5DDD3] rounded-xl p-12 text-center text-sm text-[#80766E]">
                No tienes servicios asignados para esta fecha.
              </div>
            ) : (
              staffAppointmentsForDate.map(apt => {
                // Relevant segments for this staff
                const mySegments = apt.segments.filter(s => s.professionalId === loggedInStaff.id);

                return (
                  <div key={apt.id} className="bg-white border border-[#E5DDD3] rounded-xl p-5 space-y-4 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-[#80766E]">
                          {apt.bookingCode}
                        </span>
                        <h4 className="font-serif-editorial text-xl font-medium text-[#302C29] mt-0.5">
                          {apt.customer.name}
                        </h4>
                        <span className="text-xs text-[#80766E]">
                          Teléfono: {apt.customer.phone}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-semibold text-sm tabular-nums text-[#302C29]">
                          {apt.startTime} - {apt.endTime} hs
                        </span>
                        {apt.customer.notes && (
                          <span className="block text-[11px] text-[#80766E] italic mt-0.5">
                            «{apt.customer.notes}»
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Segment actions */}
                    <div className="pt-3 border-t border-[#E5DDD3]/60 space-y-2">
                      {mySegments.map(seg => (
                        <div key={seg.id} className="p-3 bg-[#FAF8F4] rounded-lg border border-[#E5DDD3]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-semibold text-[#302C29]">{seg.serviceName}</span>
                            <span className="text-[#80766E] block text-[11px]">
                              Horario asignado: {seg.startTime} a {seg.endTime} ({seg.durationMinutes} min)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {seg.status === 'scheduled' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateSegmentStatus(apt.id, seg.id, 'in_service')}
                                className="px-3 py-1.5 bg-[#302C29] hover:bg-[#1a1715] text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                <span>Iniciar Servicio</span>
                              </button>
                            )}

                            {seg.status === 'in_service' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateSegmentStatus(apt.id, seg.id, 'completed')}
                                className="px-3 py-1.5 bg-[#A3B6A5] hover:bg-[#8ea490] text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Finalizar Servicio</span>
                              </button>
                            )}

                            {seg.status === 'completed' && (
                              <span className="px-2.5 py-1 bg-[#A3B6A5]/20 text-[#302C29] rounded text-[11px] font-medium flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-[#5e7761]" />
                                <span>Completado</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Break modal */}
      {showBreakModal && (
        <div className="fixed inset-0 z-50 bg-[#302C29]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 max-w-sm w-full shadow-lg text-xs space-y-4">
            <h4 className="font-serif-editorial text-xl font-normal text-[#302C29]">
              Programar Descanso Personal
            </h4>
            <p className="text-[#80766E]">
              El período quedará protegido contra nuevas reservas para tu perfil.
            </p>

            <form onSubmit={handleCreateOwnBreak} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Motivo</label>
                <input
                  type="text"
                  value={breakTitle}
                  onChange={(e) => setBreakTitle(e.target.value)}
                  className="w-full p-2 border border-[#E5DDD3] rounded bg-[#FAF8F4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1 text-[#302C29]">Desde</label>
                  <input
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-full p-2 border border-[#E5DDD3] rounded bg-[#FAF8F4]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-[#302C29]">Hasta</label>
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-full p-2 border border-[#E5DDD3] rounded bg-[#FAF8F4]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBreakModal(false)}
                  className="px-3 py-1.5 border border-[#E5DDD3] rounded text-[#80766E]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#302C29] text-white rounded font-medium"
                >
                  Confirmar Pausa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Appointment Modal by Employee */}
      {showNewAptModal && (
        <div className="fixed inset-0 z-50 bg-[#302C29]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-xl text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#B69A70] font-semibold block">
                  Autogestión de Equipo
                </span>
                <h4 className="font-serif-editorial text-xl font-normal text-[#302C29]">
                  Agendar Turno Personal
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowNewAptModal(false)}
                className="text-[#80766E] hover:text-[#302C29] p-1 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-[#80766E] leading-relaxed">
              El turno se asignará a tu agenda para el <strong>{activeDate}</strong> y enviará una notificación automática al propietario del salón.
            </p>

            <form onSubmit={handleCreateAppointment} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Nombre del Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Martina Castro"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full p-2.5 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Teléfono / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  placeholder="+54 9 11 5555-4444"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full p-2.5 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Servicio a Realizar *</label>
                <select
                  required
                  value={newServiceId}
                  onChange={(e) => setNewServiceId(e.target.value)}
                  className="w-full p-2.5 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                >
                  {availableServicesForStaff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Horario de Inicio *</label>
                <input
                  type="time"
                  required
                  value={newAptStartTime}
                  onChange={(e) => setNewAptStartTime(e.target.value)}
                  className="w-full p-2.5 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4] text-xs font-mono text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#302C29]">Notas Internas (Opcional)</label>
                <input
                  type="text"
                  placeholder="Detalles sobre preferencia o diseño..."
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  className="w-full p-2.5 border border-[#E5DDD3] rounded-lg bg-[#FAF8F4] text-xs text-[#302C29] focus:outline-none focus:ring-1 focus:ring-[#B69A70]"
                />
              </div>

              <div className="pt-3 border-t border-[#E5DDD3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAptModal(false)}
                  className="px-4 py-2 border border-[#E5DDD3] hover:bg-[#FAF8F4] rounded-lg text-[#80766E] text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Confirmar y Notificar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
