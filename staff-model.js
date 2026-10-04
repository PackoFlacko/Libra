(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibraStaffModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const OPEN_MINUTES = 540;
  const CLOSE_MINUTES = 1020;
  const STEP_MINUTES = 15;
  const ABSENCE_TYPES = ['holiday', 'dayOff', 'leave'];

  // Las fechas son días de calendario; no pasan por la zona horaria del equipo.
  function parseISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  function isValidISODate(value) { return parseISODate(value) !== null; }
  function weekdayForDate(value) {
    const date = parseISODate(value);
    return date ? (date.getUTCDay() + 6) % 7 : -1;
  }
  function isoDate(date) {
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function weekDates(startISO = '2026-10-05', count = 7) {
    const date = parseISODate(startISO);
    if (!date || !Number.isInteger(count) || count < 0 || count > 366) return [];
    const result = [];
    for (let i = 0; i < count; i++) {
      if (date.getUTCFullYear() > 9999) return [];
      result.push(isoDate(date));
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return result;
  }

  function validPerson(model, person) {
    return Number.isInteger(person) && person >= 0 && Array.isArray(model?.employees) && person < model.employees.length;
  }
  function copyShifts(shifts) {
    return Array.isArray(shifts) ? shifts.map(shift => ({ start: shift?.start, end: shift?.end })).sort((a, b) => a.start - b.start) : [];
  }
  function scheduleForDate(model, person, date) {
    if (!validPerson(model, person) || !isValidISODate(date)) return [];
    if ((model.absences || []).some(record => record.person === person && isValidISODate(record.from) && isValidISODate(record.to) && record.from <= date && date <= record.to)) return [];
    const override = (model.dateOverrides || []).findLast(record => record.person === person && record.date === date);
    if (override) return copyShifts(override.shifts);
    return copyShifts(model.weeklySchedules?.[person]?.[weekdayForDate(date)]);
  }
  function fitsSchedule(shifts, start, duration) {
    if (!Array.isArray(shifts) || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return false;
    return shifts.some(shift => Number.isFinite(shift?.start) && Number.isFinite(shift?.end) && start >= shift.start && start + duration <= shift.end);
  }

  function shiftErrors(shifts, label) {
    if (!Array.isArray(shifts) || shifts.length > 2) return [`${label}: utiliza un máximo de dos turnos, o ninguno para un día libre.`];
    const errors = [];
    shifts.forEach((shift, index) => {
      const start = shift?.start, end = shift?.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start % STEP_MINUTES !== 0 || end % STEP_MINUTES !== 0 || start < OPEN_MINUTES || end > CLOSE_MINUTES || start >= end) {
        errors.push(`${label}, turno ${index + 1}: indica inicio y fin entre las 09:00 y las 17:00, en intervalos de 15 minutos y con fin posterior al inicio.`);
      }
    });
    if (!errors.length) {
      const ordered = copyShifts(shifts);
      if (ordered.some((shift, index) => index > 0 && shift.start < ordered[index - 1].end)) errors.push(`${label}: los turnos no pueden solaparse.`);
    }
    return errors;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  }
  function newId(records, prefix) {
    let id = prefix, counter = 1;
    while (records.some(record => record.id === id)) id = `${prefix}-${counter++}`;
    return id;
  }
  function changedModel(model, change) {
    const next = clone(model);
    if (change.kind === 'weekly') {
      next.weeklySchedules ||= [];
      next.weeklySchedules[change.person] = change.schedule.map(copyShifts);
    } else if (change.kind === 'date') {
      next.dateOverrides ||= [];
      const index = next.dateOverrides.findIndex(record => record.person === change.person && record.date === change.date);
      const record = { id: index < 0 ? newId(next.dateOverrides, `override-${change.person}-${change.date}`) : next.dateOverrides[index].id, person: change.person, date: change.date, shifts: copyShifts(change.shifts) };
      if (index < 0) next.dateOverrides.push(record);
      else next.dateOverrides[index] = record;
    } else if (change.kind === 'absence') {
      next.absences ||= [];
      const record = clone(change.record);
      const index = record.id == null ? -1 : next.absences.findIndex(item => item.id === record.id);
      if (record.id == null) record.id = newId(next.absences, `absence-${record.person}-${record.from}-${record.to}`);
      if (index < 0) next.absences.push(record);
      else next.absences[index] = record;
    }
    return next;
  }
  function appointmentDate(model, appointment) {
    if (isValidISODate(appointment?.date)) return appointment.date;
    const date = Number.isInteger(appointment?.day) ? model?.agendaDates?.[appointment.day] : null;
    return isValidISODate(date) ? date : null;
  }
  function appointmentDuration(model, appointment) {
    if (appointment.duration != null) return appointment.duration;
    if (!Array.isArray(appointment.services) || !appointment.services.length) return NaN;
    return appointment.services.reduce((sum, id) => {
      const service = (model.services || []).find(item => item.id === id);
      return sum + (Number.isFinite(service?.min) && service.min > 0 ? service.min : NaN);
    }, 0);
  }

  function validateScheduleChange(model, change) {
    const errors = [], conflicts = [];
    if (!model || typeof model !== 'object' || !change || typeof change !== 'object') return { ok: false, errors: ['No se ha recibido un cambio de horario válido.'], conflicts };
    if (!['weekly', 'date', 'absence'].includes(change.kind)) return { ok: false, errors: ['Selecciona un cambio de horario, un día concreto o una ausencia.'], conflicts };
    const person = change.kind === 'absence' ? change.record?.person : change.person;
    if (!validPerson(model, person)) errors.push('Selecciona una empleada del equipo.');
    if (change.kind === 'weekly') {
      if (!Array.isArray(change.schedule) || change.schedule.length !== 7) errors.push('El horario habitual debe incluir los siete días de la semana.');
      else change.schedule.forEach((shifts, index) => errors.push(...shiftErrors(shifts, ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][index])));
    } else if (change.kind === 'date') {
      if (!isValidISODate(change.date)) errors.push('Indica una fecha válida para el cambio de horario.');
      errors.push(...shiftErrors(change.shifts, 'Horario del día'));
    } else {
      const record = change.record;
      if (!record || !isValidISODate(record.from) || !isValidISODate(record.to)) errors.push('Indica fechas válidas para el inicio y el fin de la ausencia.');
      else if (record.from > record.to) errors.push('El fin de la ausencia debe ser igual o posterior a su inicio.');
      if (!ABSENCE_TYPES.includes(record?.type)) errors.push('Selecciona vacaciones, día libre u otra ausencia.');
      if (record?.id != null && (typeof record.id !== 'string' && typeof record.id !== 'number' || record.id === '' || typeof record.id === 'number' && !Number.isFinite(record.id))) errors.push('El identificador de la ausencia no es válido.');
      if (record?.note != null && typeof record.note !== 'string') errors.push('La nota de la ausencia debe ser texto.');
      if (record && isValidISODate(record.from) && isValidISODate(record.to) && record.from <= record.to && (model.absences || []).some(existing => existing.person === person && !(record.id != null && existing.id === record.id) && isValidISODate(existing.from) && isValidISODate(existing.to) && record.from <= existing.to && record.to >= existing.from)) errors.push('La ausencia coincide con otra ya registrada para esa empleada.');
    }
    if (errors.length) return { ok: false, errors, conflicts };
    const next = changedModel(model, change);
    for (const appointment of model.appointments || []) {
      if (appointment.person !== person || ['cancelled', 'noShow'].includes(appointment.state)) continue;
      const date = appointmentDate(model, appointment);
      if (!date || change.kind === 'date' && date !== change.date || change.kind === 'absence' && (date < change.record.from || date > change.record.to)) continue;
      const duration = appointmentDuration(model, appointment);
      if (!fitsSchedule(scheduleForDate(next, person, date), appointment.start, duration)) {
        conflicts.push({ id: appointment.id, client: appointment.client || 'Clienta', person, employee: model.employees[person].name, date, start: appointment.start, end: Number.isFinite(duration) ? appointment.start + duration : null });
      }
    }
    return { ok: !conflicts.length, errors, conflicts };
  }
  function applyScheduleChange(model, change) {
    const result = validateScheduleChange(model, change);
    return { ...result, model: result.ok ? changedModel(model, change) : null };
  }

  return { OPEN_MINUTES, CLOSE_MINUTES, STEP_MINUTES, isValidISODate, weekdayForDate, weekDates, scheduleForDate, fitsSchedule, appointmentDate, validateScheduleChange, applyScheduleChange };
});
