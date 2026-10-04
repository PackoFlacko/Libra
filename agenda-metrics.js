// Reglas de ocupación de agenda. No añade paneles ni navegación.
(() => {
  'use strict';

  const isActive = visit => !['cancelled', 'noShow'].includes(visit.state);
  const intersect = (start, end, lower, upper) => [Math.max(start, lower), Math.min(end, upper)];
  const length = interval => Math.max(0, interval[1] - interval[0]);

  function mergedIntervals(intervals) {
    const sorted = intervals.filter(interval => length(interval) > 0).sort((a, b) => a[0] - b[0]);
    return sorted.reduce((merged, interval) => {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
      return merged;
    }, []);
  }

  /**
   * Pure summary, suitable for checking occupancy and payment rules without a DOM.
   * All inputs are supplied by the caller; the source collections stay untouched.
   */
  function summarizeDay(model) {
    const {
      day: selectedDay, appointments: visits = [], workingHours: hours = [], daySchedules: schedules = [],
      extraBlocks: reserved = [], services: catalogue = [], payments: records = [], people: team = []
    } = model;
    const catalogueById = new Map(catalogue.map(item => [item.id, item]));
    const visitLength = visit => visit.duration ?? (visit.services || []).reduce((sum, id) => sum + (catalogueById.get(id)?.min || 0), 0);
    const visitPrice = visit => (visit.services || []).reduce((sum, id) => sum + (catalogueById.get(id)?.price || 0), 0);
    const netForVisit = id => records.filter(record => record.appointmentId === id).reduce((sum, record) => sum + (record.type === 'refund' ? -record.amount : record.amount), 0);
    const activeVisits = visits.filter(visit => visit.day === selectedDay && isActive(visit));
    const professionalCount = Math.max(team.length, hours.length, schedules.length);
    const professionals = Array.from({ length: professionalCount }, (_, person) => {
      const schedule = mergedIntervals((schedules[person] ?? [hours[person] || { start: 0, end: 0 }]).map(interval => [interval.start, interval.end]));
      const span = schedule.reduce((sum, interval) => sum + length(interval), 0);
      const blockIntervals = mergedIntervals(reserved.filter(block => block.day === selectedDay && block.person === person).flatMap(block => schedule.map(interval => intersect(block.start, block.start + block.duration, interval[0], interval[1]))));
      const blockedMinutes = blockIntervals.reduce((sum, interval) => sum + length(interval), 0);
      const personVisits = activeVisits.filter(visit => visit.person === person).sort((a, b) => a.start - b.start);
      const bookedIntervals = mergedIntervals(personVisits.flatMap(visit => schedule.map(interval => intersect(visit.start, visit.start + visitLength(visit), interval[0], interval[1]))));
      const bookedDuringBlocks = bookedIntervals.reduce((sum, visitInterval) => sum + blockIntervals.reduce((overlap, blockInterval) => overlap + length(intersect(visitInterval[0], visitInterval[1], blockInterval[0], blockInterval[1])), 0), 0);
      const bookedMinutes = Math.max(0, bookedIntervals.reduce((sum, interval) => sum + length(interval), 0) - bookedDuringBlocks);
      const capacityMinutes = Math.max(0, span - blockedMinutes);
      return {
        person, name: team[person] || `Profesional ${person + 1}`, visits: personVisits.length,
        bookedMinutes, blockedMinutes, capacityMinutes, freeMinutes: Math.max(0, capacityMinutes - bookedMinutes),
        occupancy: capacityMinutes ? Math.round(bookedMinutes / capacityMinutes * 100) : 0,
        next: personVisits.find(visit => visit.state !== 'finished') || null,
        finished: personVisits.filter(visit => visit.state === 'finished').length
      };
    });
    const capacityMinutes = professionals.reduce((sum, person) => sum + person.capacityMinutes, 0);
    const bookedMinutes = professionals.reduce((sum, person) => sum + person.bookedMinutes, 0);
    const dayRecords = records.filter(record => record.day === selectedDay);
    const paid = method => dayRecords.filter(record => !method || record.method === method).reduce((sum, record) => sum + (record.type === 'refund' ? -record.amount : record.amount), 0);
    return {
      day: selectedDay, visits: activeVisits.length, bookedMinutes, capacityMinutes,
      blockedMinutes: professionals.reduce((sum, person) => sum + person.blockedMinutes, 0),
      freeMinutes: Math.max(0, capacityMinutes - bookedMinutes),
      occupancy: capacityMinutes ? Math.round(bookedMinutes / capacityMinutes * 100) : 0,
      finished: activeVisits.filter(visit => visit.state === 'finished').length,
      professionals,
      finance: {
        planned: activeVisits.reduce((sum, visit) => sum + visitPrice(visit), 0),
        pending: activeVisits.reduce((sum, visit) => sum + Math.max(0, visitPrice(visit) - netForVisit(visit.id)), 0),
        received: paid(), cash: paid('Efectivo'), card: paid('Tarjeta'), count: dayRecords.length
      }
    };
  }

  window.LibraMetrics = { summarizeDay };
})();
