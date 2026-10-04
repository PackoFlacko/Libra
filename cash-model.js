(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibraCashModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Bizum'];
  const CASH_CATEGORIES = ['Fondo adicional', 'Gasto', 'Retirada', 'Otro'];
  const list = value => Array.isArray(value) ? value : [];
  const active = visit => visit && !['cancelled', 'noShow'].includes(visit.state);
  const closed = (model, day) => list(model?.closedDays).some(record => record.day === day);
  const sameId = (left, right) => left != null && right != null && String(left) === String(right);

  // Toda operación usa céntimos enteros. Los importes públicos siguen en euros.
  function toCents(value) {
    if (typeof value === 'string') {
      if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
      value = Number(value);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const scaled = value * 100, cents = Math.round(scaled);
    if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > 1e-7) return null;
    return cents;
  }
  const euros = cents => cents / 100;
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  }
  function priceCents(model, visit) {
    if (!visit || !Array.isArray(visit.services) || !visit.services.length) return null;
    let total = 0;
    for (const id of visit.services) {
      const service = list(model?.services).find(item => sameId(item.id, id));
      const cents = toCents(service?.price);
      if (cents == null || cents < 0 || !Number.isSafeInteger(total + cents)) return null;
      total += cents;
    }
    return total;
  }
  function netCents(model, id, method) {
    return list(model?.payments).filter(record => sameId(record.appointmentId, id) && (!method || record.method === method)).reduce((sum, record) => sum + (record.type === 'refund' ? -1 : 1) * (toCents(record.amount) ?? 0), 0);
  }
  function balanceForVisit(model, id) {
    const visit = list(model?.appointments).find(item => sameId(item.id, id));
    const total = priceCents(model, visit) ?? 0, net = netCents(model, id);
    return { total: euros(total), net: euros(net), pending: euros(Math.max(0, total - net)) };
  }
  function refundableCents(model, payment) {
    if (!payment || payment.type !== 'payment') return 0;
    const refunded = list(model?.payments).filter(record => record.type === 'refund' && sameId(record.ref, payment.id)).reduce((sum, record) => sum + (toCents(record.amount) ?? 0), 0);
    return Math.max(0, (toCents(payment.amount) ?? 0) - refunded);
  }
  function refundableAmount(model, paymentId) {
    return euros(refundableCents(model, list(model?.payments).find(record => sameId(record.id, paymentId))));
  }
  function validateIdBase(payload, errors) {
    if (payload?.idBase != null && !((typeof payload.idBase === 'string' && /^[A-Za-z0-9_-]+$/.test(payload.idBase)) || (typeof payload.idBase === 'number' && Number.isSafeInteger(payload.idBase) && payload.idBase >= 0))) errors.push('El identificador del movimiento no es válido.');
  }
  function result(errors) { return { ok: !errors.length, errors }; }
  function validatePayment(model, payload) {
    const errors = [];
    const visit = list(model?.appointments).find(item => sameId(item.id, payload?.appointmentId));
    if (!visit) errors.push('Selecciona una cita para registrar el cobro.');
    else {
      if (!active(visit)) errors.push('No se puede cobrar una cita cancelada o marcada como no asistida.');
      if (closed(model, visit.day) || list(model?.payments).some(record => record.type === 'payment' && sameId(record.appointmentId, visit.id) && closed(model, record.day))) errors.push('La caja de la cita o de un cobro anterior está cerrada.');
      if (priceCents(model, visit) == null) errors.push('Revisa los servicios y sus precios antes de cobrar esta cita.');
    }
    if (!Array.isArray(payload?.parts) || !payload.parts.length || payload.parts.length > PAYMENT_METHODS.length) errors.push('Indica al menos un método de pago con su importe.');
    const methods = new Set();
    let total = 0, cash = 0;
    for (const part of list(payload?.parts)) {
      if (!PAYMENT_METHODS.includes(part?.method)) errors.push('Selecciona Efectivo, Tarjeta o Bizum.');
      else if (methods.has(part.method)) errors.push('Utiliza una sola línea por método de pago.');
      methods.add(part?.method);
      const cents = toCents(part?.amount);
      if (cents == null || cents <= 0) errors.push('Cada importe debe ser positivo y tener como máximo dos decimales.');
      else {
        if (!Number.isSafeInteger(total + cents)) errors.push('El importe del cobro es demasiado grande.');
        total += cents;
        if (part.method === 'Efectivo') cash += cents;
      }
    }
    if (visit && priceCents(model, visit) != null && total > Math.max(0, priceCents(model, visit) - netCents(model, visit.id))) errors.push('El cobro supera el importe pendiente de esta cita.');
    if (payload?.cashTendered != null) {
      const tendered = toCents(payload.cashTendered);
      if (tendered == null || tendered < 0) errors.push('El efectivo entregado debe ser un importe válido de hasta dos decimales.');
      else if (!cash && tendered > 0) errors.push('Indica un pago en efectivo antes de registrar efectivo entregado.');
      else if (cash && tendered < cash) errors.push('El efectivo entregado no alcanza el importe a cobrar en efectivo.');
    }
    validateIdBase(payload, errors);
    return result(errors);
  }
  function validateRefund(model, payload) {
    const errors = [];
    const payment = list(model?.payments).find(record => sameId(record.id, payload?.paymentId));
    if (!payment || payment.type !== 'payment') errors.push('Selecciona un cobro original para devolverlo.');
    else if (closed(model, payment.day)) errors.push('La caja del cobro original está cerrada.');
    const cents = toCents(payload?.amount);
    if (cents == null || cents <= 0) errors.push('La devolución debe ser positiva y tener como máximo dos decimales.');
    else if (payment?.type === 'payment' && cents > refundableCents(model, payment)) errors.push('La devolución supera el saldo disponible de ese cobro.');
    if (typeof payload?.reason !== 'string' || !payload.reason.trim()) errors.push('Indica el motivo de la devolución.');
    validateIdBase(payload, errors);
    return result(errors);
  }
  function validateCashEntry(model, payload) {
    const errors = [];
    if (!model || typeof model !== 'object' || Array.isArray(model)) errors.push('No se han recibido los datos de caja.');
    if (!Number.isInteger(payload?.day) || payload.day < 0) errors.push('Selecciona un día válido para el movimiento de efectivo.');
    else if (closed(model, payload.day)) errors.push('La caja de ese día está cerrada.');
    if (!['in', 'out'].includes(payload?.type)) errors.push('Selecciona entrada o salida de efectivo.');
    if (!CASH_CATEGORIES.includes(payload?.category)) errors.push('Selecciona una categoría válida para el movimiento.');
    if (typeof payload?.note !== 'string' || !payload.note.trim()) errors.push('Explica el motivo del movimiento de efectivo.');
    const cents = toCents(payload?.amount);
    if (cents == null || cents <= 0) errors.push('El movimiento debe ser positivo y tener como máximo dos decimales.');
    validateIdBase(payload, errors);
    return result(errors);
  }
  function uniqueBase(model, prefix, idBase) {
    const records = [...list(model?.payments), ...list(model?.cashEntries)];
    const used = new Set(records.flatMap(record => [String(record.id), String(record.groupId)]));
    const occupied = base => used.has(base) || [...used].some(id => id.startsWith(base + '-'));
    if (idBase != null) {
      const base = `${prefix}-${idBase}`;
      if (!occupied(base)) return base;
      let suffix = 2;
      while (occupied(`${base}-${suffix}`)) suffix++;
      return `${base}-${suffix}`;
    }
    let serial = 1;
    while (occupied(`${prefix}-${serial}`)) serial++;
    return `${prefix}-${serial}`;
  }
  function updateVisitFlag(model, id) {
    const visit = list(model.appointments).find(item => sameId(item.id, id));
    if (!visit) return;
    const total = priceCents(model, visit);
    visit.paid = total != null && netCents(model, id) >= total;
    const methods = PAYMENT_METHODS.filter(method => netCents(model, id, method) > 0);
    if (methods.length) visit.method = methods.join(' + ');
    else delete visit.method;
  }
  function applyPayment(model, payload) {
    const checked = validatePayment(model, payload);
    if (!checked.ok) return { ...checked, model: null, change: 0 };
    const next = clone(model), visit = list(next.appointments).find(item => sameId(item.id, payload.appointmentId));
    next.payments ||= [];
    const base = uniqueBase(next, 'cash-payment', payload.idBase);
    let change = 0;
    payload.parts.forEach((part, index) => {
      const cents = toCents(part.amount);
      const record = { id: `${base}-${index + 1}`, groupId: base, appointmentId: visit.id, client: visit.client, day: visit.day, amount: euros(cents), method: part.method, type: 'payment' };
      if (payload.createdAt) record.createdAt = payload.createdAt;
      if (part.method === 'Efectivo') {
        const tendered = payload.cashTendered == null ? cents : toCents(payload.cashTendered);
        change = euros(tendered - cents);
        record.cashTendered = euros(tendered);
        record.cashChange = change;
      }
      next.payments.push(record);
    });
    updateVisitFlag(next, visit.id);
    return { ...checked, model: next, change };
  }
  function applyRefund(model, payload) {
    const checked = validateRefund(model, payload);
    if (!checked.ok) return { ...checked, model: null, change: 0 };
    const next = clone(model), payment = next.payments.find(record => sameId(record.id, payload.paymentId));
    const record = { id: uniqueBase(next, 'cash-refund', payload.idBase), appointmentId: payment.appointmentId, client: payment.client, day: payment.day, amount: euros(toCents(payload.amount)), method: payment.method, type: 'refund', ref: payment.id, reason: payload.reason.trim() };
    if (payload.createdAt) record.createdAt = payload.createdAt;
    next.payments.push(record);
    updateVisitFlag(next, payment.appointmentId);
    return { ...checked, model: next, change: 0 };
  }
  function applyCashEntry(model, payload) {
    const checked = validateCashEntry(model, payload);
    if (!checked.ok) return { ...checked, model: null, change: 0 };
    const next = clone(model);
    next.cashEntries ||= [];
    const record = { id: uniqueBase(next, 'cash-entry', payload.idBase), day: payload.day, type: payload.type, category: payload.category, note: payload.note.trim(), amount: euros(toCents(payload.amount)) };
    if (payload.createdAt) record.createdAt = payload.createdAt;
    next.cashEntries.push(record);
    return { ...checked, model: next, change: 0 };
  }
  function dayTotals(model, day) {
    const visits = list(model?.appointments).filter(visit => visit.day === day && active(visit));
    const records = list(model?.payments).filter(record => record.day === day);
    const entries = list(model?.cashEntries).filter(record => record.day === day);
    const paid = method => records.filter(record => !method || record.method === method).reduce((sum, record) => sum + (record.type === 'refund' ? -1 : 1) * (toCents(record.amount) ?? 0), 0);
    const cashIn = entries.filter(record => record.type === 'in').reduce((sum, record) => sum + (toCents(record.amount) ?? 0), 0);
    const cashOut = entries.filter(record => record.type === 'out').reduce((sum, record) => sum + (toCents(record.amount) ?? 0), 0);
    return {
      planned: euros(visits.reduce((sum, visit) => sum + (priceCents(model, visit) ?? 0), 0)),
      pending: euros(visits.reduce((sum, visit) => sum + Math.max(0, (priceCents(model, visit) ?? 0) - netCents(model, visit.id)), 0)),
      received: euros(paid()), cash: euros(paid('Efectivo')), card: euros(paid('Tarjeta')), bizum: euros(paid('Bizum')),
      cashIn: euros(cashIn), cashOut: euros(cashOut), drawerNet: euros(paid('Efectivo') + cashIn - cashOut),
      count: records.length + entries.length
    };
  }
  return { PAYMENT_METHODS, CASH_CATEGORIES, toCents, balanceForVisit, refundableAmount, validatePayment, applyPayment, validateRefund, applyRefund, validateCashEntry, applyCashEntry, dayTotals };
});
