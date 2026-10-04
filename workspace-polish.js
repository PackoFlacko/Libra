// Refinamiento de interfaz. Usa el mismo modelo ficticio y no persiste datos.
(() => {
  const filters = {query:'', person:'all', status:'all', unpaid:false};
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  function filterAppointments(records, options={}) {
    const q=normalize(options.query||'');
    return records.filter(a => active(a)
      && (options.day===undefined || a.day===options.day)
      && (options.person===undefined || options.person==='all' || a.person===Number(options.person))
      && (!options.status || options.status==='all' || (a.state||'confirmed')===options.status)
      && (!options.unpaid || netPaid(a.id)<price(a))
      && (!q || normalize([a.client,people[a.person],...a.services.map(id=>service(id).name)].join(' ')).includes(q)))
      .sort((a,b)=>a.day-b.day||a.start-b.start||a.person-b.person);
  }
  const isMobile=()=>window.matchMedia('(max-width:560px)').matches;
  const visibleAppointments=()=>filterAppointments(appointments,{...filters,day,person:isMobile()?mobilePerson:filters.person});
  // La próxima cita forma parte del encabezado y deja más espacio a la agenda.
  $('#view-agenda .heading-row>div').appendChild($('#next-appointment'));
  $('.calendar-toolbar').insertAdjacentHTML('afterend', `
    <div class="agenda-filterbar">
      <label class="agenda-search">${icon('search')}<span class="sr-only">Buscar en la agenda</span><input id="agenda-search" type="search" aria-label="Buscar en la agenda" placeholder="Clienta o servicio…" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
      <label class="agenda-filter-person"><span class="sr-only">Filtrar por profesional</span><select id="agenda-person"><option value="all">Todo el equipo</option>${people.map((name,i)=>`<option value="${i}">${esc(name)}</option>`).join('')}</select></label>
      <label><span class="sr-only">Filtrar por estado de atención</span><select id="agenda-status"><option value="all">Todos los estados</option>${['confirmed','arrived','attending','finished'].map(state=>`<option value="${state}">${stateNames[state]}</option>`).join('')}</select></label>
      <button id="agenda-unpaid" class="filter-chip" aria-pressed="false">${icon('wallet')}Sin cobrar</button>
    </div>
    <div class="agenda-filter-summary"><span id="agenda-result-count" role="status" aria-live="polite" aria-atomic="true"></span><button id="agenda-clear" hidden>Limpiar filtros ${icon('close')}</button></div>`);
  $('#calendar-scroll').insertAdjacentHTML('afterend', '<div id="agenda-empty" class="agenda-filter-empty" hidden><span class="empty-orb">'+icon('search')+'</span><strong id="agenda-empty-title">No hay citas con estos filtros.</strong><p id="agenda-empty-copy">Prueba otro nombre, servicio o estado.</p><button class="secondary" id="agenda-empty-action">Limpiar filtros</button></div>');
  $('#calendar-scroll').setAttribute('tabindex','0');
  $('#calendar-scroll').setAttribute('aria-label','Agenda de citas; usa las flechas para desplazarte');
  function syncControls(){
    $('#agenda-search').value=filters.query;
    $('#agenda-person').value=filters.person;
    $('#agenda-status').value=filters.status;
    $('#agenda-unpaid').setAttribute('aria-pressed',String(filters.unpaid));
  }
  function hasFilters(){return !!(filters.query||(!isMobile()&&filters.person!=='all')||filters.status!=='all'||filters.unpaid);}
  function applyFilters(){
    const visible=visibleAppointments(), ids=new Set(visible.map(a=>a.id));
    $$('[data-appointment]').forEach(card=>card.hidden=!ids.has(+card.dataset.appointment));
    $$('[data-list-id]').forEach(row=>row.hidden=!ids.has(+row.dataset.listId));
    const person=isMobile()?mobilePerson:filters.person;
    $$('.time-column,.person-head').forEach(col=>{
      const p=col.dataset.person!==undefined?+col.dataset.person:[...col.parentElement.children].indexOf(col)-1;
      col.hidden=person!=='all'&&p!==Number(person);
    });
    const template=person==='all'?'50px repeat(3,minmax(0,1fr))':`${isMobile()?40:50}px minmax(0,1fr)`;
    $('#time-grid').style.gridTemplateColumns=template;
    $('#team-header').style.gridTemplateColumns=template;
    $('#agenda-clear').hidden=!hasFilters();
    const total=filterAppointments(appointments,{day,person:isMobile()?mobilePerson:'all'}).length;
    $('#agenda-result-count').textContent=`${visible.length}${hasFilters()?' de '+total:''} citas · ${days[day]}${person==='all'?' · todo el equipo':' · '+people[Number(person)]}`;
    const empty=!visible.length;
    $('#agenda-empty').hidden=!empty;
    $('#agenda-list').querySelector('.empty-state')?.remove();
    $('#agenda-empty-title').textContent=hasFilters()?'No hay citas con estos filtros.':'Un día con espacio para ti.';
    $('#agenda-empty-copy').textContent=hasFilters()?'Prueba otro nombre, servicio o estado.':'Busca un hueco compatible o prepara una nueva visita.';
    $('#agenda-empty-action').textContent=hasFilters()?'Limpiar filtros':'Encontrar un hueco';
    $('#agenda-empty-action').onclick=()=>hasFilters()?clearFilters():openFinder({day,person:person==='all'?'any':person});
    if(empty&&!hasFilters())$('#agenda-empty').classList.add('empty-day');
    else $('#agenda-empty').classList.remove('empty-day');
    // Los huecos y los movimientos siguen comprobándose contra TODAS las citas.
    const next=visible.find(a=>a.state!=='finished'), nextButton=$('#next-appointment');
    nextButton.hidden=!next;
    if(next){nextButton.innerHTML=`${icon('arrow')}<span>Siguiente por atender <strong>${esc(next.client)}</strong> · ${time(next.start)} · ${people[next.person]}</span><span class="next-state">${stateLabel(next)}</span>`;nextButton.onclick=()=>revealAppointment(next);}
  }
  function updateFilters(){
    filters.query=$('#agenda-search').value;
    filters.person=$('#agenda-person').value;
    if(filters.person!=='all')mobilePerson=Number(filters.person);
    filters.status=$('#agenda-status').value;
    const list=visibleAppointments();
    if(!list.some(a=>a.id===selected))selected=list[0]?.id;
    render();
  }
  function clearFilters(){Object.assign(filters,{query:'',person:'all',status:'all',unpaid:false});syncControls();selected=visibleAppointments()[0]?.id;render();}
  $('#agenda-search').oninput=updateFilters;
  $('#agenda-person').onchange=updateFilters;
  $('#agenda-status').onchange=updateFilters;
  $('#agenda-unpaid').onclick=()=>{filters.unpaid=!filters.unpaid;$('#agenda-unpaid').setAttribute('aria-pressed',String(filters.unpaid));updateFilters();};
  $('#agenda-clear').onclick=clearFilters;
  const previousCalendar=renderCalendar;
  renderCalendar=function(){previousCalendar();applyFilters();};
  const previousRender=render;
  render=function(){const list=visibleAppointments();if(current()&&active(current())&&!list.some(a=>a.id===selected))selected=list[0]?.id;previousRender();applyFilters();};
  const previousReveal=revealAppointment;
  revealAppointment=function(a){Object.assign(filters,{query:'',person:'all',status:'all',unpaid:false});syncControls();previousReveal(a);};
  const previousView=setView;
  setView=function(view){const oldView=$('.view:not([hidden])')?.id;previousView(view);$$('[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(oldView!==`view-${view}`)window.scrollTo?.({top:0,behavior:'instant'});};
  window.LibraUI={filterAppointments,openAgenda(options={}){
    if(options.day!==undefined)day=options.day;
    Object.assign(filters,{query:'',person:options.person===undefined?'all':String(options.person),status:options.status||'all',unpaid:!!options.unpaid});
    if(options.person!==undefined)mobilePerson=Number(options.person);
    syncControls();selected=visibleAppointments()[0]?.id;setView('agenda');render();
  }};
  $('#mobile-person').onchange=()=>{mobilePerson=+$('#mobile-person').value;filters.person=String(mobilePerson);syncControls();selected=visibleAppointments()[0]?.id;render();};
  window.matchMedia('(max-width:560px)').addEventListener?.('change',()=>render());
  const previousFormTimes=updateFormTimes;
  updateFormTimes=function(preferred){previousFormTimes(preferred);$('#form-summary').insertAdjacentHTML('beforeend',`<small class="form-all-services">${formDraft().services.map(id=>esc(service(id).name)).join(' + ')}</small>`);};

  // El buscador global reúne acciones, citas y fichas de clientas.
  let searchResults=[];
  renderCommands=function(){
    const q=normalize($('#command-input').value);
    const actions=commands.filter(c=>!q||normalize(c.label).includes(q));
    const visits=q?appointments.filter(a=>normalize(a.client+' '+a.services.map(id=>service(id).name).join(' ')).includes(q)).slice(0,6).map(a=>({label:a.client,icon:'calendar',hint:days[a.day]+' · '+time(a.start)+' · '+stateLabel(a),run:()=>revealAppointment(a)})):[];
    const clients=q?clientNames().filter(name=>normalize(name).includes(q)).slice(0,4).map(name=>({label:'Ficha de '+name,icon:'person',hint:'Historial',run:()=>openProfile(name)})):[];
    searchResults=[...actions,...visits,...clients];
    $('#command-results').innerHTML=searchResults.map((result,i)=>`<button class="command-result" data-search-result="${i}">${icon(result.icon)}<span>${esc(result.label)}</span><span>${esc(result.hint)}</span></button>`).join('')||'<p class="empty-state">No encontramos resultados. Prueba una clienta, un servicio o «cita».</p>';
    $$('[data-search-result]').forEach(button=>button.onclick=()=>{$('#command-dialog').close();searchResults[+button.dataset.searchResult].run();});
  };
  $('#command-input').placeholder='Busca acciones, clientas o servicios…';
  $('#command-input').oninput=renderCommands;
  $('#command-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#command-results button')?.click();}else if(e.key==='ArrowDown'){e.preventDefault();$('#command-results button')?.focus();}};
  $('#command-results').addEventListener('keydown',e=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    const buttons=$$('[data-search-result]'),index=buttons.indexOf(document.activeElement);
    e.preventDefault();
    if(e.key==='ArrowUp'&&index<=0){$('#command-input').focus();return;}
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));
    buttons[next]?.focus();
  });
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable="true"]')||$('dialog[open]'))return;
    if(e.key==='/'){e.preventDefault();setView('agenda');$('#agenda-search').focus();}
    if(e.key.toLowerCase()==='n'){e.preventDefault();openForm();}
  });
  $('#agenda-search').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();clearFilters();$('#agenda-search').focus();}});
  const shortcut=$('.command-trigger kbd');if(shortcut)shortcut.textContent='Ctrl K';
  $('#command-button').title='Busca citas y acciones · Ctrl/⌘ K';
  $('#new-button').title='Crear una cita · N';
  syncControls();setView('agenda');render();
})();
