// Ampliación del prototipo. Todos los datos siguen siendo ficticios y en memoria.
paths.person='M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 22v-3c0-6 16-6 16 0v3';
paths.lock='M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4';
paths.list='M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01';
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches;
let finderContext={},profileClient=null,reviewAction=null,refundContext=null,editingBlock=null;
const initials=name=>name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const profileFor=name=>clientProfiles[name]||{preference:'',notes:''};
const clientNames=()=>[...new Set([...appointments.map(a=>a.client),...waiting.map(w=>w.client),...Object.keys(clientProfiles)])].sort((a,b)=>a.localeCompare(b,'es'));
const refundable=p=>window.LibraCashModel.refundableAmount(cashModel(),p.id);
function changeAppointmentState(a,next){
 if(!a||!Object.prototype.hasOwnProperty.call(stateNames,next))return false;
 if(!active(a)&&!['cancelled','noShow'].includes(next)&&!fits(a.day,a.person,a.start,duration(a),a.id)){toast('No se puede recuperar la cita en ese horario. Cambia su hora antes de reactivarla.');return false;}
 if((a.state||'confirmed')===next)return true;
 mutate(()=>a.state=next,'Estado actualizado: '+stateNames[next]);return true;
}
function dayTotals(d){return window.LibraCashModel.dayTotals(cashModel(),d);}
function registerPayment(a,method,amount){
 if(!a)return false;
 const pending=window.LibraCashModel.balanceForVisit(cashModel(),a.id).pending;
 return applyCashResult(window.LibraCashModel.applyPayment(cashModel(),{appointmentId:a.id,parts:[{method,amount:amount??pending}],idBase:newRecordId(),createdAt:new Date().toISOString()}));
}
function recordRefund(p,reason,amount){
 if(!p)return false;
 return applyCashResult(window.LibraCashModel.applyRefund(cashModel(),{paymentId:p.id,amount:amount??refundable(p),reason,idBase:newRecordId(),createdAt:new Date().toISOString()}));
}
function compatibleOptions(ids,person,startDay,after){
 const len=ids.reduce((n,id)=>n+service(id).min,0),options=[];if(!ids.length)return options;
 for(let d=startDay;d<days.length;d++)for(let p=0;p<people.length;p++)if(person==='any'||+person===p){const start=slots(d,p,len).find(t=>d>startDay||t>=after);if(start!==undefined)options.push({day:d,person:p,start,duration:len});}
 return options.sort((a,b)=>a.day-b.day||a.start-b.start||a.person-b.person);
}
function validateBlock(b,exclude){
 if(!Number.isFinite(b.start)||!Number.isFinite(b.duration)||b.duration<=0||b.start<540||b.start+b.duration>1020)return 'El bloqueo debe estar entre las 09:00 y las 17:00 y tener duración positiva.';
 if(appointments.some(a=>active(a)&&a.day===b.day&&a.person===b.person&&b.start<a.start+duration(a)&&b.start+b.duration>a.start))return 'Hay una cita en ese intervalo. Muévela antes de bloquearlo.';
 if(extraBlocks.some(x=>x.id!==exclude&&x.day===b.day&&x.person===b.person&&b.start<x.start+x.duration&&b.start+b.duration>x.start))return 'El bloqueo coincide con otro descanso o ausencia.';
 return '';
}
function validateHours(person,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<540||end>1020||end<=start)return 'El horario de esta maqueta debe quedar entre 09:00 y 17:00.';
 if(appointments.some(a=>active(a)&&a.person===person&&(a.start<start||a.start+duration(a)>end)))return 'Hay citas fuera de ese horario. Recolócalas primero.';return '';
}
function recordClosing(d,opening,counted,reason){
 if(financeLocked(d)||window.LibraCashModel.toCents(opening)===null||window.LibraCashModel.toCents(counted)===null||opening<0||counted<0)return false;
 const totals=dayTotals(d),expected=Math.round((opening+totals.drawerNet)*100)/100,difference=Math.round((counted-expected)*100)/100;
 if(difference!==0&&!reason.trim())return false;
 closedDays.push({id:newRecordId(),day:d,opening,counted,expected,difference,reason:reason.trim(),totals:structuredClone(totals),createdAt:new Date().toISOString()});return true;
}
function revealAppointment(a){selected=a.id;day=a.day;mobilePerson=a.person;setView('agenda');render();requestAnimationFrame(()=>{const card=$(`[data-appointment="${a.id}"]`);card?.scrollIntoView({block:'nearest',behavior:reducedMotion()?'instant':'smooth'});card?.focus({preventScroll:true});});}

$('#navigation').insertAdjacentHTML('beforeend','<button class="rail-btn" data-view="clients" aria-label="Clientas" title="Clientas"></button><button class="rail-btn" data-view="cash" aria-label="Caja del día" title="Caja del día"></button>');
[['clients','person'],['cash','wallet']].forEach(([view,i])=>{const b=$(`[data-view="${view}"]`);b.innerHTML=icon(i);b.onclick=()=>setView(view);});
$('main').insertAdjacentHTML('beforeend',`
 <section id="view-clients" class="view" hidden><div class="heading-row"><div><p class="eyebrow">CADA VISITA TIENE HISTORIA</p><h1>Clientas<span>.</span></h1><p class="subtitle">Encuentra, recuerda y prepara la próxima visita.</p></div><button class="primary" id="new-client-visit">${icon('plus')}Nueva visita</button></div><div class="directory-bar glass"><label>${icon('search')}<input id="client-search" type="search" aria-label="Buscar una clienta" placeholder="Busca una clienta…"></label><span id="client-count"></span></div><div class="client-grid" id="client-grid"></div></section>
 <section id="view-cash" class="view" hidden><div class="heading-row"><div><p class="eyebrow">LAS CIFRAS, CON SU SIGNIFICADO</p><h1>Caja del día<span>.</span></h1><p class="subtitle">Lo previsto, lo recibido y lo pendiente, a simple vista.</p></div><div class="cash-header-actions"><select id="cash-day" aria-label="Día de caja"></select><button class="primary" id="close-day-button">${icon('lock')}Revisar cierre</button></div></div><div id="cash-status"></div><div class="cash-metrics" id="cash-metrics"></div><div class="cash-layout"><section class="glass cash-panel"><div class="panel-heading"><div><h2>Movimientos</h2><p>El importe registrado conserva el valor del momento del cobro.</p></div><span id="movement-count" class="mini-badge"></span></div><div id="cash-movements"></div></section><section class="glass cash-panel"><div class="panel-heading"><div><h2>Pendiente de cobro</h2><p>Selecciona una visita para revisar y cobrar.</p></div></div><div id="cash-pending"></div><p class="micro-hint">Esta caja es de ejemplo. No procesa dinero ni emite documentos fiscales.</p></section></div></section>`);
$('.calendar-toolbar').insertAdjacentHTML('beforeend',`<button id="availability-button" class="secondary small-control" title="Editar horarios, descansos y bloqueos">${icon('clock')}Disponibilidad</button>`);
$('.heading-row').insertAdjacentHTML('afterend','<button id="next-appointment" class="next-appointment" hidden></button>');
['agenda','clients','cash','booking','concept'].forEach(view=>{const b=$(`[data-view="${view}"]`);b.dataset.navLabel={agenda:'Agenda',clients:'Clientas',cash:'Caja',booking:'Reservar',concept:'Concepto'}[view];$('#navigation').appendChild(b);});
$('#form-client').setAttribute('list','known-clients');
document.body.insertAdjacentHTML('beforeend',`
 <datalist id="known-clients"></datalist>
 <dialog id="finder-dialog" class="wide-dialog" aria-labelledby="finder-title"><div class="dialog-head"><div><p class="eyebrow">ENCUENTRA EL ENCAJE</p><h2 id="finder-title">Un hueco que te va bien.</h2></div><button class="icon-button" data-feature-close="finder-dialog" aria-label="Cerrar buscador de huecos">${icon('close')}</button></div><p class="dialog-description">Combina servicios y te proponemos opciones entre profesionales y días.</p><div id="finder-services" class="finder-services"></div><div class="finder-filters"><label class="field">Profesional<select id="finder-person"><option value="any">Primera disponible</option>${people.map((p,i)=>`<option value="${i}">${p}</option>`).join('')}</select></label><label class="field">Desde el día<select id="finder-day">${days.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label><label class="field">Desde la hora<select id="finder-after">${Array.from({length:9},(_,i)=>`<option value="${540+i*60}">${time(540+i*60)}</option>`).join('')}</select></label></div><div class="finder-total" id="finder-total"></div><div class="slot-options" id="finder-results"></div><p class="micro-hint">Se propone el primer hueco compatible de cada profesional y día, dentro de esta semana de ejemplo.</p></dialog>
 <dialog id="client-dialog" class="client-drawer" aria-labelledby="client-drawer-title"><div class="dialog-head"><div><p class="eyebrow">CERCA DE CADA CLIENTA</p><h2 id="client-drawer-title"></h2></div><button class="icon-button" data-feature-close="client-dialog" aria-label="Cerrar ficha de clienta">${icon('close')}</button></div><div id="client-profile-body"></div></dialog>
 <dialog id="review-dialog" aria-labelledby="review-title"><form id="review-form"><div class="dialog-head"><h2 id="review-title"></h2><button type="button" class="icon-button" data-feature-close="review-dialog" aria-label="Cerrar revisión">${icon('close')}</button></div><p id="review-description" class="dialog-description"></p><label class="field">Motivo o nota<input id="review-reason" maxlength="200" placeholder="Opcional"></label><div class="dialog-actions"><button type="button" class="secondary" data-feature-close="review-dialog">Volver</button><button type="submit" class="primary">Confirmar</button></div></form></dialog>
 <dialog id="availability-dialog" class="wide-dialog" aria-labelledby="availability-title"><div class="dialog-head"><div><p class="eyebrow">TIEMPO BIEN ORGANIZADO</p><h2 id="availability-title">Horarios y bloqueos.</h2></div><button class="icon-button" data-feature-close="availability-dialog" aria-label="Cerrar disponibilidad">${icon('close')}</button></div><div class="availability-columns"><form id="hours-form"><h3>Horario de una profesional</h3><p class="dialog-description">Se aplica a los seis días del ejemplo. Las citas existentes deben caber.</p><label class="field">Profesional<select id="hours-person">${people.map((p,i)=>`<option value="${i}">${p}</option>`).join('')}</select></label><div class="form-row"><label class="field">Empieza<input id="hours-start" type="time" step="900" required></label><label class="field">Termina<input id="hours-end" type="time" step="900" required></label></div><p class="form-error" id="hours-error" role="alert" hidden></p><button class="secondary" type="submit">Guardar horario</button></form><form id="block-form"><h3 id="block-form-title">Nuevo bloqueo</h3><label class="field">Tipo<select id="block-label"><option>Descanso</option><option>Ausencia</option><option>Tiempo reservado</option></select></label><div class="form-row"><label class="field">Profesional<select id="block-person">${people.map((p,i)=>`<option value="${i}">${p}</option>`).join('')}</select></label><label class="field">Día<select id="block-day">${days.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label></div><div class="form-row"><label class="field">Desde<input id="block-start" type="time" step="900" required value="15:00"></label><label class="field">Hasta<input id="block-end" type="time" step="900" required value="16:00"></label></div><p class="form-error" id="block-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="secondary" id="block-clear">Nuevo</button><button type="submit" class="primary">Guardar bloqueo</button></div></form></div><div id="block-list" class="block-list"></div><p class="micro-hint">Ventana de trabajo de esta maqueta: 09:00–17:00. Calendario completo, festivos y horarios por fecha quedan para la aplicación.</p></dialog>
 <dialog id="closing-dialog" aria-labelledby="closing-title"><form id="closing-form"><div class="dialog-head"><div><p class="eyebrow">UN CIERRE CLARO</p><h2 id="closing-title">Revisar caja.</h2></div><button type="button" class="icon-button" data-feature-close="closing-dialog" aria-label="Cerrar revisión de caja">${icon('close')}</button></div><div id="closing-summary" class="closing-summary"></div><div class="form-row"><label class="field">Fondo inicial en efectivo<input id="closing-opening" type="number" min="0" step="0.01" value="0" required></label><label class="field">Efectivo contado<input id="closing-counted" type="number" min="0" step="0.01" required></label></div><div id="closing-difference" class="form-summary"></div><label class="field">Explicación de la diferencia<textarea id="closing-reason" rows="2" maxlength="300" placeholder="Obligatoria si el contado no coincide"></textarea></label><p id="closing-error" class="form-error" role="alert" hidden></p><p class="micro-hint">El cierre conserva los totales y bloquea nuevos cobros y devoluciones de este día. En la maqueta se puede deshacer.</p><div class="dialog-actions"><button type="button" class="secondary" data-feature-close="closing-dialog">Volver</button><button type="submit" class="primary">Confirmar cierre de ejemplo</button></div></form></dialog>`);
$$('[data-feature-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.featureClose).close());

function renderInspectorFeatures(){
 const a=current();if(!a)return;
 $('.client-orb').textContent=initials(a.client);
 $('.inspector-meta').insertAdjacentHTML('afterend',`<div class="visit-state-control"><label for="visit-state">Estado de atención</label><select id="visit-state">${Object.entries(stateNames).map(([key,label])=>`<option value="${key}" ${key===(a.state||'confirmed')?'selected':''}>${label}</option>`).join('')}</select><span class="payment-state">${a.paid?'Cobrado · '+money(netPaid(a.id)):netPaid(a.id)>0?'Pagado '+money(netPaid(a.id))+' · pendiente '+money(Math.round((price(a)-netPaid(a.id))*100)/100):'Pago pendiente'}</span></div><button class="secondary profile-shortcut" id="open-client-profile">${icon('person')}Ver ficha e historial ${icon('arrow')}</button>`);
 $('#open-client-profile').onclick=()=>openProfile(a.client);
 $('#visit-state').onchange=()=>{const next=$('#visit-state').value;if(['cancelled','noShow'].includes(next)){openReview(a,next);return;}if(!changeAppointmentState(a,next))renderInspector();};
 if(!active(a))$('#pay-selected').disabled=true;
}
const baseInspector=renderInspector;
renderInspector=function(){baseInspector();renderInspectorFeatures();};
const baseCalendar=renderCalendar;
renderCalendar=function(){
 baseCalendar();$('#mobile-person').value=mobilePerson;
 $$('.time-column').forEach(col=>{const p=+col.dataset.person;staffUnavailable(day,p).filter(([s,e])=>e>s).forEach(([s,e])=>col.insertAdjacentHTML('beforeend',`<div class="blocked outside-hours" style="top:${(s-540)*4/3}px;height:${(e-s)*4/3}px">Fuera de horario</div>`));col.ondblclick=e=>{if(e.target.closest('.appointment,.blocked'))return;openForm({day,person:p,start:dropTime(e,col)});};});
};
function renderExtras(){
 const next=appointments.filter(a=>a.day===day&&active(a)&&a.state!=='finished').sort((a,b)=>a.start-b.start)[0],b=$('#next-appointment');b.hidden=!next;if(next){b.innerHTML=`${icon('arrow')}<span>Siguiente por atender <strong>${esc(next.client)}</strong> · ${time(next.start)} · ${people[next.person]}</span><span class="next-state">${stateLabel(next)}</span>`;b.onclick=()=>revealAppointment(next);}
 $('#known-clients').innerHTML=clientNames().map(name=>`<option value="${esc(name)}"></option>`).join('');
 if(!$('#view-clients').hidden)renderClients();if(!$('#view-cash').hidden)renderCash();
 if($('#client-dialog').open&&profileClient)renderProfile();
}
const baseRender=render;
render=function(){baseRender();renderExtras();};
const baseSetView=setView;
setView=function(view){baseSetView(view);if(view==='clients')renderClients();if(view==='cash')renderCash();};

function openFinder(ctx={}){
 finderContext={...ctx,services:[...(ctx.services||['semi'])]};$('#finder-person').value=ctx.person??'any';$('#finder-day').value=ctx.day??day;$('#finder-after').value='540';renderFinder();$('#finder-dialog').showModal();
}
function renderFinder(){
 $('#finder-services').innerHTML=services.map(s=>`<button class="finder-service" aria-pressed="${finderContext.services.includes(s.id)}" data-find-service="${s.id}"><strong>${s.name}</strong><span>${s.min} min · ${money(s.price)}</span>${icon('check')}</button>`).join('');
 $$('[data-find-service]').forEach(b=>b.onclick=()=>{const id=b.dataset.findService;finderContext.services=finderContext.services.includes(id)?finderContext.services.filter(s=>s!==id):[...finderContext.services,id];renderFinder();});
 const ids=finderContext.services,options=compatibleOptions(ids,$('#finder-person').value,+$('#finder-day').value,+$('#finder-after').value).slice(0,9),draft={services:ids};$('#finder-total').innerHTML=`<span>${ids.length} servicios · ${duration(draft)} minutos</span><strong>${money(price(draft))}</strong>`;
 $('#finder-results').innerHTML=options.map((o,i)=>`<button class="slot-option" data-slot-option="${i}"><span>${days[o.day]}</span><strong>${time(o.start)}</strong><small>${people[o.person]} · hasta ${time(o.start+o.duration)}</small>${icon('arrow')}</button>`).join('')||`<p class="empty-state">${ids.length?'No encontramos huecos con esta combinación. Prueba otro día o profesional.':'Selecciona al menos un servicio.'}</p>`;
 $$('[data-slot-option]').forEach(b=>b.onclick=()=>{const option=options[+b.dataset.slotOption];$('#finder-dialog').close();openForm({...finderContext,...option,services:[...ids]});});
}
['person','day','after'].forEach(k=>$('#finder-'+k).onchange=renderFinder);
$('#find-button').onclick=()=>openFinder();
commands[1].run=()=>openFinder();
const baseTray=renderTray;
renderTray=function(){baseTray();if(tray==='waiting')$$('[data-tray-id]').forEach(el=>el.querySelector('button').onclick=()=>{const w=waiting.find(w=>w.id===el.dataset.trayId);openFinder({...w,waitingId:w.id});});};

function renderClients(){
 const q=$('#client-search').value.trim().toLocaleLowerCase('es'),names=clientNames().filter(n=>n.toLocaleLowerCase('es').includes(q));$('#client-count').textContent=names.length+' clientas de ejemplo';
 $('#client-grid').innerHTML=names.map(name=>{const visits=appointments.filter(a=>a.client===name),next=visits.filter(a=>active(a)&&a.state!=='finished').sort((a,b)=>a.day-b.day||a.start-b.start)[0];return `<button class="client-tile glass" data-profile-name="${esc(name)}"><span class="profile-avatar">${esc(initials(name))}</span><h2>${esc(name)}</h2><p>${next?`${days[next.day]} · ${time(next.start)} · ${people[next.person]}`:'En espera · aún sin cita'}</p><span>${visits.length} visitas en el ejemplo</span>${icon('arrow')}</button>`;}).join('')||'<div class="empty-state glass">No aparece esa clienta. Puedes preparar una nueva visita.</div>';
 $$('[data-profile-name]').forEach(b=>b.onclick=()=>openProfile(b.dataset.profileName));
}
$('#client-search').oninput=renderClients;$('#new-client-visit').onclick=()=>openForm();
function openProfile(name){profileClient=name;renderProfile();if(!$('#client-dialog').open)$('#client-dialog').showModal();}
function renderProfile(){
 const name=profileClient,p=profileFor(name),visits=appointments.filter(a=>a.client===name).sort((a,b)=>a.day-b.day||a.start-b.start),next=visits.find(a=>active(a)&&a.state!=='finished'),last=visits.findLast(a=>a.state==='finished');$('#client-drawer-title').textContent=name;
 $('#client-profile-body').innerHTML=`<div class="profile-hero"><span class="profile-avatar">${esc(initials(name))}</span><div><strong>${visits.length} visitas en la maqueta</strong><p>Datos ficticios · sin comunicaciones reales</p></div></div><div class="profile-next"><p class="eyebrow">PRÓXIMA VISITA</p><h3>${next?days[next.day]+' · '+time(next.start):'Todavía sin cita'}</h3><p>${next?esc(next.services.map(id=>service(id).name).join(' + ')):'Encontramos un hueco para su servicio.'}</p><button class="primary" id="profile-book">${icon('repeat')}${last?'Repetir última visita':'Preparar otra visita'}</button></div><form id="profile-form"><label class="field">Preferencias<input id="profile-preference" maxlength="160" value="${esc(p.preference)}" placeholder="Acabado, forma o preferencias de atención"></label><label class="field">Notas para atender<textarea id="profile-notes" maxlength="500" rows="3" placeholder="Solo información útil para su visita">${esc(p.notes)}</textarea></label><button class="secondary" type="submit">${icon('check')}Guardar preferencias</button></form><div class="profile-timeline"><h3>Historial del ejemplo</h3>${visits.map(a=>`<button class="history-visit" data-history-id="${a.id}"><span class="timeline-dot"></span><span><strong>${days[a.day]} · ${time(a.start)}</strong><small>${esc(a.services.map(id=>service(id).name).join(' + '))}</small><small>${stateLabel(a)} · ${a.paid?'Cobrado '+money(netPaid(a.id)):netPaid(a.id)>0?'Pago parcial '+money(netPaid(a.id)):'Pago pendiente'}</small></span>${icon('arrow')}</button>`).join('')||'<p class="empty-state">Aún no hay visitas registradas en el ejemplo.</p>'}</div>`;
 $('#profile-form').onsubmit=e=>{e.preventDefault();const values={preference:$('#profile-preference').value.trim(),notes:$('#profile-notes').value.trim()};mutate(()=>clientProfiles[name]=values,'Preferencias guardadas en el ejemplo');};
 $('#profile-book').onclick=()=>{const a=last||next||visits.at(-1),services=a?.services||waiting.find(w=>w.client===name)?.services||['semi'];$('#client-dialog').close();openFinder({client:name,services,day:a?Math.min(5,a.day+1):day});};
 $$('[data-history-id]').forEach(b=>b.onclick=()=>{const a=appointments.find(a=>a.id===+b.dataset.historyId);$('#client-dialog').close();revealAppointment(a);});
}
function openReview(a,state){
 reviewAction={a,state};$('#review-title').textContent=state==='cancelled'?'Cancelar esta visita':'Registrar que no asistió';$('#review-description').textContent=`${a.client} · ${days[a.day]} · ${time(a.start)}. La visita se conservará en su historial.${netPaid(a.id)>0?' El cobro se mantiene; devolverlo es una acción separada en Caja.':''}`;$('#review-reason').required=false;$('#review-reason').value='';$('#review-dialog').showModal();
}
cancelAppointment=a=>openReview(a,'cancelled');
$('#review-form').onsubmit=e=>{e.preventDefault();if(refundContext){const p=refundContext,reason=$('#review-reason').value;snapshot();if(!recordRefund(p,reason)){history.pop();toast('No se puede devolver este movimiento.');return;}refundContext=null;render();toast('Devolución de ejemplo registrada',true);}else if(reviewAction){const {a,state}=reviewAction;const reason=$('#review-reason').value;mutate(()=>{a.state=state;a.stateReason=reason;},stateNames[state]+'. La visita queda en el historial.');reviewAction=null;}$('#review-dialog').close();};
$('#review-dialog').addEventListener('close',()=>{reviewAction=null;refundContext=null;renderInspector();});

function renderCash(){
 $('#cash-day').innerHTML=days.map((d,i)=>`<option value="${i}" ${i===day?'selected':''}>${d} de octubre</option>`).join('');const totals=dayTotals(day),closing=closedDays.find(c=>c.day===day),records=payments.filter(p=>p.day===day).toReversed();
 $('#cash-status').innerHTML=closing?`<div class="closure-banner">${icon('lock')}<span>Caja cerrada · contado ${money(closing.counted)} · diferencia ${money(closing.difference)}${closing.reason?' · '+esc(closing.reason):''}</span></div>`:'<p class="cash-open-label">Caja abierta · revisa los movimientos antes del cierre.</p>';$('#close-day-button').disabled=!!closing;
 $('#cash-metrics').innerHTML=[['Previsto en citas',totals.planned,'Servicios de visitas activas'],['Cobrado neto',totals.received,`${money(totals.cash)} efectivo · ${money(totals.card)} tarjeta`],['Pendiente',totals.pending,'Visitas activas sin completar el cobro'],['Movimientos',totals.count,'Cobros y devoluciones registrados']].map(([label,value,detail],i)=>`<article class="cash-metric glass"><span>${label}</span><strong>${i===3?value:money(value)}</strong><small>${detail}</small></article>`).join('');$('#movement-count').textContent=records.length+' movimientos';
 $('#cash-movements').innerHTML=records.map(p=>`<div class="movement-row"><span class="movement-icon">${icon(p.type==='refund'?'undo':'wallet')}</span><div><strong>${esc(p.client)}</strong><p>${p.type==='refund'?'Devolución':'Cobro'} · ${esc(p.method)}${p.reason?' · '+esc(p.reason):''}</p></div><strong>${p.type==='refund'?'−':''}${money(p.amount)}</strong>${p.type==='payment'&&refundable(p)>0&&!closing?`<button class="secondary" data-refund-id="${p.id}" aria-label="Revisar devolución de ${esc(p.client)}">Devolver</button>`:''}</div>`).join('')||'<div class="empty-state"><strong>Todavía sin movimientos.</strong><p>Los cobros de la agenda aparecerán aquí al confirmarlos.</p></div>';
 const pending=appointments.filter(a=>a.day===day&&active(a)&&netPaid(a.id)<price(a));$('#cash-pending').innerHTML=pending.map(a=>`<button class="pending-visit" data-pending-id="${a.id}" ${closing?'disabled':''}><span><strong>${esc(a.client)}</strong><small>${time(a.start)} · ${people[a.person]}</small></span><strong>${money(price(a)-netPaid(a.id))}</strong>${icon('arrow')}</button>`).join('')||'<div class="empty-state">Todo lo previsto está cobrado.</div>';
 $$('[data-pending-id]').forEach(b=>b.onclick=()=>openPayment(appointments.find(a=>a.id===+b.dataset.pendingId)));
 $$('[data-refund-id]').forEach(b=>b.onclick=()=>{refundContext=payments.find(p=>p.id===+b.dataset.refundId);reviewAction=null;$('#review-title').textContent='Revisar devolución';$('#review-description').textContent=`${refundContext.client} · ${money(refundable(refundContext))} · ${refundContext.method}. El cobro original se conserva y se añade un movimiento de devolución.`;$('#review-reason').required=true;$('#review-reason').placeholder='Motivo de la devolución';$('#review-reason').value='';$('#review-dialog').showModal();});
}
$('#cash-day').onchange=()=>{day=+$('#cash-day').value;selected=appointments.find(a=>a.day===day&&active(a))?.id;render();};
$('#payment-form').onsubmit=e=>{e.preventDefault();const a=appointments.find(a=>a.id===paymentId);snapshot();if(!registerPayment(a,$('input[name="method"]:checked').value)){history.pop();toast('El cobro ya está registrado o la caja está cerrada.');return;}$('#payment-dialog').close();render();toast('Cobro de ejemplo registrado en caja',true);};
$('#close-day-button').onclick=()=>{const totals=dayTotals(day);$('#closing-title').textContent='Revisar caja · '+days[day];$('#closing-opening').value='0';$('#closing-counted').value=totals.cash;$('#closing-reason').value='';$('#closing-error').hidden=true;$('#closing-summary').innerHTML=`<span>Tarjeta ${money(totals.card)}</span><span>Efectivo recibido ${money(totals.cash)}</span><span>Pendiente ${money(totals.pending)}</span>`;updateClosingDifference();$('#closing-dialog').showModal();};
function updateClosingDifference(){const expected=+$('#closing-opening').value+dayTotals(day).cash,difference=Math.round((+$('#closing-counted').value-expected)*100)/100;$('#closing-difference').innerHTML=`<span>Efectivo esperado ${money(expected)} · diferencia</span><strong>${money(difference)}</strong>`;$('#closing-reason').required=difference!==0;}
['opening','counted'].forEach(k=>$('#closing-'+k).oninput=updateClosingDifference);
$('#closing-form').onsubmit=e=>{e.preventDefault();snapshot();if(!recordClosing(day,+$('#closing-opening').value,+$('#closing-counted').value,$('#closing-reason').value)){history.pop();$('#closing-error').textContent='Revisa los importes y explica cualquier diferencia.';$('#closing-error').hidden=false;return;}$('#closing-dialog').close();render();toast('Caja de ejemplo cerrada; nuevos cobros bloqueados',true);};

const minutes=value=>{const parts=value.split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN;};
function openAvailability(){editingBlock=null;$('#block-form-title').textContent='Nuevo bloqueo';$('#block-day').value=day;$('#block-person').value=mobilePerson;$('#hours-person').value=mobilePerson;syncHours();renderBlocks();$('#availability-dialog').showModal();}
function syncHours(){const h=workingHours[+$('#hours-person').value];$('#hours-start').value=time(h.start);$('#hours-end').value=time(h.end);$('#hours-error').hidden=true;}
function renderBlocks(){
 $('#block-list').innerHTML=extraBlocks.toSorted((a,b)=>a.day-b.day||a.start-b.start).map(b=>`<div class="block-row"><span>${icon('clock')}</span><div><strong>${esc(b.label)}</strong><small>${people[b.person]} · ${days[b.day]} · ${time(b.start)}–${time(b.start+b.duration)}</small></div><button class="secondary" data-edit-block="${b.id}">Editar</button><button class="icon-button" data-remove-block="${b.id}" aria-label="Eliminar bloqueo ${esc(b.label)} de ${people[b.person]}">${icon('trash')}</button></div>`).join('')||'<div class="empty-state">Sin descansos ni bloqueos en esta semana de ejemplo.</div>';
 $$('[data-edit-block]').forEach(button=>button.onclick=()=>{const b=extraBlocks.find(b=>String(b.id)===button.dataset.editBlock);editingBlock=b.id;$('#block-form-title').textContent='Editar bloqueo';$('#block-label').value=b.label;$('#block-person').value=b.person;$('#block-day').value=b.day;$('#block-start').value=time(b.start);$('#block-end').value=time(b.start+b.duration);$('#block-error').hidden=true;});
 $$('[data-remove-block]').forEach(button=>button.onclick=()=>{mutate(()=>extraBlocks=extraBlocks.filter(b=>String(b.id)!==button.dataset.removeBlock),'Bloqueo eliminado');renderBlocks();});
}
$('#availability-button').onclick=openAvailability;$('#hours-person').onchange=syncHours;
$('#hours-form').onsubmit=e=>{e.preventDefault();const p=+$('#hours-person').value,start=minutes($('#hours-start').value),end=minutes($('#hours-end').value),error=validateHours(p,start,end);$('#hours-error').hidden=!error;if(error){$('#hours-error').textContent=error;return;}mutate(()=>{workingHours[p]={start,end};weeklySchedules[p]=weeklySchedules[p].map((shifts,i)=>i<6?[{start,end}]:shifts);},'Horario actualizado en la semana de ejemplo');};
$('#block-clear').onclick=()=>{editingBlock=null;$('#block-form-title').textContent='Nuevo bloqueo';$('#block-error').hidden=true;};
$('#block-form').onsubmit=e=>{e.preventDefault();const start=minutes($('#block-start').value),b={id:editingBlock??newRecordId(),day:+$('#block-day').value,person:+$('#block-person').value,start,duration:minutes($('#block-end').value)-start,label:$('#block-label').value},error=validateBlock(b,editingBlock);$('#block-error').hidden=!error;if(error){$('#block-error').textContent=error;return;}mutate(()=>{extraBlocks=extraBlocks.filter(x=>x.id!==b.id);extraBlocks.push(b);},'Bloqueo guardado');editingBlock=null;$('#block-form-title').textContent='Nuevo bloqueo';renderBlocks();};
commands.push({label:'Abrir ficha de clientas',icon:'person',hint:'Historial',run:()=>setView('clients')},{label:'Ver caja del día',icon:'wallet',hint:'Cobros',run:()=>setView('cash')},{label:'Editar horarios y bloqueos',icon:'clock',hint:'Agenda',run:openAvailability});
render();
