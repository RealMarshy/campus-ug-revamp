(() => {
  'use strict';
  if (document.getElementById('ugr-panel')) return;
  const C = UGCore, CFG = C.CONFIG, MODS = C.mods, ORIGIN = location.origin;
  const VERSION = chrome.runtime?.getManifest?.()?.version ?? '2.0.4';
  const session = C.identity(document);
  const prefix = `ugr2:${ORIGIN}:${session.userId}:`;
  const historyKey=prefix+'history', lockName='campus-ug-revamp:'+session.userId;
  const stampKey=prefix+'verification', queued=new Map();
  let stamps={}, calendarTimes={}, history={schema:1,changes:[]};
  let failures={}, incidents=[], lastRun={};
  const TABS = [{id:'proximas',label:'Próximas'},{id:'atrasadas',label:'Atrasadas'},{id:'entregadas',label:'Entregadas'},{id:'pendientes',label:'Pendientes'},{id:'desconocidas',label:'Sin verificar'}];
  const state = {items:[],tab:'proximas',course:'all',loading:false,progress:'',error:'',store:{auto:{},manual:{}}};
  let cache=C.empty(), stopped=false, running=null, runningTarget, renderTimer, timer;
  const controllers=new Set(), inflight=new Map();
  const metrics={requests:0,cacheHits:0,checks:0,renders:0,firstContentMs:null,syncMs:null};
  const started=performance.now();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=it=>it.mod+':'+it.cmid;
  function fail(message){state.error=message; schedule();}
  function assertSession(){
    if(stopped || C.identity(document).userId!==session.userId) throw C.problem('ACCOUNT_CHANGED');
  }
  function stop(){stopped=true;controllers.forEach(c=>c.abort());clearInterval(timer);state.items=[];state.store={auto:{},manual:{}};fail('La sesión cambió o caducó. Recarga el campus.');}
  async function request(url, options={}) {
    assertSession();
    if(!C.allowsRequest(url,options,ORIGIN))throw C.problem('DESTINATION');
    const id=url+(options.body||'');
    if(inflight.has(id)) return inflight.get(id);
    const job=(async()=>{
      const controller=new AbortController();controllers.add(controller);
      const requestStart=performance.now();
      let phase='headers', headersMs, http;
      let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},CFG.timeout);
      try{
        metrics.requests++;
        const response=await fetch(url,{...options,credentials:'same-origin',redirect:'manual',signal:controller.signal});
        if(response.type==='opaqueredirect' || (response.status>=300 && response.status<400))throw C.problem('REDIRECT');
        if(!response.ok) throw C.problem('HTTP',{http:response.status});
        phase='body';
        headersMs=Math.round(performance.now()-requestStart);
        http=response.status;
        const text=await response.text();assertSession();return text;
      }catch(e){
        if(Object.hasOwn(C.ERROR_LABELS,e.code))throw e;
        if(timedOut)throw C.problem('TIMEOUT',{phase,elapsedMs:Math.round(performance.now()-requestStart),headersMs,http});
        if(controller.signal.aborted)throw C.problem('CANCELLED');
        if(e instanceof TypeError)throw C.problem('NETWORK');
        throw e;
      }finally{clearTimeout(timeout);controllers.delete(controller);}
    })();
    inflight.set(id,job);
    try{return await job;}finally{inflight.delete(id);}
  }
  async function readCache(){
    const data=await chrome.storage.local.get(null);
    assertSession();
    const saved=C.readState(data,prefix,ORIGIN);
    ({cache,failures,history}=saved);
    const stored=data[stampKey];
    if(stored!==undefined && (stored?.schema!==1||!stored.records||typeof stored.records!=='object'||Array.isArray(stored.records)))throw new Error('Formato de verificaciones no compatible.');
    stamps={};
    calendarTimes={};
    for(const [month,t] of Object.entries(stored?.calendar??{})){
      if(!cache.months[month]||!Number.isFinite(t)||t>Date.now())continue;
      calendarTimes[month]=Math.max(t,cache.months[month].t);
    }
    for(const [id,v] of Object.entries(stored?.records??{})){
      if(!/^(assign|quiz):\d+$/.test(id)||!Number.isFinite(v?.t)||v.t>Date.now()||!Number.isFinite(v.stateAt)||v.stateAt>v.t)continue;
      stamps[id]={t:v.t,stateAt:v.stateAt,closedAt:Number.isSafeInteger(v.closedAt)&&v.closedAt>0?v.closedAt:null,observedAt:Number.isFinite(v.observedAt)?v.observedAt:0};
    }
    state.store={auto:cache.auto,manual:saved.manual};
    collect();
  }
  function months(){
    const now=new Date();return Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()+i-3,1);return {year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${d.getMonth()+1}`,historical:i<3};});
  }
  function collect(){
    const map=new Map();
    for(const month of Object.values(cache.months))for(const it of month.items){
      const id=key(it);
      if(!map.has(id)||map.get(id).synced<=it.synced)map.set(id,it);
    }
    state.items=[...map.values()];
    if(state.items.length && metrics.firstContentMs===null) metrics.firstContentMs=Math.round(performance.now()-started);
  }
  // Both callers hold the account lock and read the history before appending.
  async function append(changes,saveStamps=false){
    if(!changes.length&&!saveStamps)return;
    assertSession();
    const next={...history,changes:[...history.changes,...changes]};
    const values={};
    if(changes.length)values[historyKey]=next;
    if(saveStamps)values[stampKey]={schema:1,records:stamps,calendar:calendarTimes};
    try{await chrome.storage.local.set(values);}
    catch{throw C.problem('STORAGE');}
    history=next;
  }
  async function pool(list,fn){let next=0;await Promise.all(Array.from({length:Math.min(CFG.concurrency,list.length)},async()=>{while(next<list.length && !stopped) await fn(list[next++]);}));}
  async function fetchMonth(m){
    const methodname='core_calendar_get_calendar_monthly_view';
    const text=await request(`${ORIGIN}/lib/ajax/service.php?sesskey=${encodeURIComponent(session.sesskey)}&info=${methodname}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{index:0,methodname,args:{year:m.year,month:m.month,courseid:1,categoryid:0,includenavigation:false,mini:false,day:1}}])});
    let result;try{result=JSON.parse(text);}catch{throw C.problem('HTML_INCOMPATIBLE');}
    const r=result?.[0];
    if(r?.error){if(/session|sesskey|login/i.test(r.exception?.errorcode||''))throw C.problem('SESSION_EXPIRED');throw C.problem('API_ERROR');}
    if(!Array.isArray(r?.data?.weeks)) throw C.problem('HTML_INCOMPATIBLE');
    const events=r.data.weeks.flatMap(w=>w.days.flatMap(d=>d.events||[]));
    const t=Date.now();return {t,items:events.map(ev=>C.item(ev,ORIGIN)).filter(Boolean).map(i=>({...i,synced:t}))};
  }
  async function checkDone(it){
    if(it.mod==='forum')throw C.problem('DESTINATION');
    metrics.checks++;
    const html=await request(it.url);
    if(!/<(?:html|body|main|div|table|script|form)\b/i.test(html))throw C.problem('HTML_INCOMPATIBLE');
    const doc=new DOMParser().parseFromString(html,'text/html');
    const status=C.recognize(doc,it.mod,session.userId,ORIGIN,it.cmid);
    return {...status,closed:C.closeEvidence(doc,it.mod)};
  }
  function recordFailure(changes,k,e,stage,module='none') {
    const failure=C.failureRecord(e,failures[k]);failures[k]=failure;
    changes.push({type:'failure',key:k,value:failure});
    incidents.push({stage,module,code:failure.code,details:failure.details});
    if(incidents.length>100)incidents.shift();
    if(['ACCOUNT_CHANGED','SESSION_EXPIRED'].includes(failure.code))stop();
  }
  function resolveFailure(changes,id){
    if(!Object.hasOwn(failures,id))return;
    delete failures[id];
    changes.push({type:'failure',key:id,value:null});
  }
  function candidates(mode,target){
    const dates=new Map();
    for(const month of months()){
      const snapshot=cache.months[month.key];
      if(!snapshot)continue;
      const ids=new Set(snapshot.activeIds??snapshot.items.map(it=>it.id));
      for(const it of snapshot.items){
        if(mode!=='all'&&!ids.has(it.id))continue;
        const id=key(it);
        if(!dates.has(id))dates.set(id,new Set());
        dates.get(id).add(it.closeAt??null);
      }
    }
    return state.items.filter(it=>it.mod!=='forum'&&(mode==='one'?key(it)===target:dates.has(key(it)))).map(it=>{
      const values=dates.get(key(it));
      return {it,closeAt:values?.size===1?[...values][0]:null};
    });
  }
  async function synchronize(mode,target,requestedAt){
    const force=mode==='all';
    const start=performance.now();state.loading=true;state.error='';state.progress=mode==='one'?'Consultando actividad…':'Comprobando sesión…';render();
    let errors=0, calendarErrors=0, skipped=0, checked=0, calendarWaiting=0;
    const changes=[];
    let archived=0, reactivated=0, cacheHits=0, changed=0, detected=0, unknownClose=0, shared=false, saveStamps=false;
    const recovered={forum:0,assign:0,quiz:0};
    const recognizedAbsences={quiz_no_attempts:0};
    lastRun={manual:force,checked:0,activityErrors:0,calendarErrors:0,skipped:0,recovered,recognizedAbsences};
    try{
      assertSession();
      if(mode!=='one'){
        if(!session.sesskey) throw C.problem('SESSION_EXPIRED');
        if(!force && failures.session && Date.now()<failures.session.retryAt){state.progress='Comprobación de sesión en espera por un fallo anterior. Consulta Diagnóstico o pulsa Actualizar.';return;}
        // Confirms the current cookie account before storing any remote data.
        const page=new DOMParser().parseFromString(await request(`${ORIGIN}/my/`),'text/html');
        C.checkIdentity(page,session.userId);resolveFailure(changes,'session');
        state.progress='Sincronizando calendario…';schedule();
        await pool(months(),async m=>{
          const old=cache.months[m.key], fk='calendar:'+m.key;
          if(!force && failures[fk] && Date.now()<failures[fk].retryAt){calendarWaiting++;return;}
          if(!force && old && Date.now()-(calendarTimes[m.key]??old.t)<(m.historical?CFG.history:CFG.calendar)){metrics.cacheHits++;return;}
          try{
            const fresh=await fetchMonth(m);assertSession();
            const previousItems=new Map((old?.items||[]).map(it=>[it.id,it]));
            const changed=[];
            for(const it of fresh.items){
              const previous=previousItems.get(it.id);
              const metadataChanged=!previous||['due','name','cmid','mod','course','courseId','closeAt'].some(field=>previous[field]!==it[field]);
              if(!metadataChanged)continue;
              changed.push(it);
            }
            const activeIds=[...new Set(fresh.items.map(it=>it.id))];
            const previousIds=new Set(old?.activeIds??old?.items.map(it=>it.id)??[]);
            const membershipChanged=activeIds.length!==previousIds.size||activeIds.some(id=>!previousIds.has(id));
            const snapshot={t:fresh.t,items:changed,...(membershipChanged?{activeIds}:{})};
            C.mergeMonth(cache,m.key,snapshot);
            if(!old||changed.length||membershipChanged)changes.push({type:'month',key:m.key,value:snapshot});
            calendarTimes[m.key]=fresh.t;
            saveStamps=true;
            resolveFailure(changes,fk);collect();schedule();
          }
          catch(e){calendarErrors++;recordFailure(changes,fk,e,'calendar');}
        });
      }
      assertSession();
      const unique=candidates(mode,target).sort((a,b)=>Math.abs(a.it.due-Date.now()/1000)-Math.abs(b.it.due-Date.now()/1000));
      detected=unique.length;
      unknownClose=unique.filter(candidate=>candidate.closeAt===null).length;
      await pool(unique,async ({it,closeAt})=>{
        const id=key(it), previous=cache.auto[id], stamp=stamps[id], failure=failures[id];
        if(mode==='one' && stamp?.observedAt>=requestedAt){shared=true;return;}
        const decision=C.verificationDecision({item:it,status:previous,manual:state.store.manual[id],failure,stamp,closeAt,mode});
        if(decision!=='check'){
          metrics.cacheHits++;
          if(decision==='cache')cacheHits++;
          if(decision==='backoff')skipped++;
          if(decision==='archive')archived++;
          return;
        }
        try{
          const status=await checkDone(it);
          assertSession();
          if(failures[key(it)])recovered[it.mod]++;
          if(Object.hasOwn(recognizedAbsences,status.absence))recognizedAbsences[status.absence]++;
          const closedAt=status.closed && closeAt && status.t>closeAt ? closeAt:null;
          if(stamp?.closedAt && stamp.closedAt!==closedAt)reactivated++;
          if(!previous||previous.done!==status.done||previous.source!==status.source){
            const value={done:status.done,source:status.source,t:status.t};
            cache.auto[id]=value;
            changes.push({type:'auto',key:id,value});
            changed++;
          }
          if((stamp?.closedAt??null)!==closedAt){
            changes.push({type:"closure",key:id,value:{closedAt,t:status.t}});
            if(previous && previous.done===status.done && previous.source===status.source)changed++;
          }
          stamps[id]={t:status.t,stateAt:cache.auto[id].t,closedAt,observedAt:performance.timeOrigin+performance.now()};
          saveStamps=true;
          resolveFailure(changes,id);
        }
        catch(e){
          errors++;recordFailure(changes,id,e,'activity',it.mod);
          stamps[id]={...(stamp??{t:0,stateAt:0,closedAt:null}),observedAt:performance.timeOrigin+performance.now()};
          saveStamps=true;
        }
        state.progress=`Revisando estados… ${++checked}`;schedule();
      });
      assertSession();
      if(mode==='one'){
        const result=shared?'Se reutilizó la comprobación en curso.':errors?'Error al comprobar la actividad.':!checked?'Actividad no disponible.':changed?'Estado o cierre actualizado.':'Actividad verificada. Sin cambios.';
        state.progress='Actualización finalizada. '+result;
      }else state.progress=`Actualización finalizada. ${checked} comprobaciones · ${errors} fallos de actividad · ${calendarErrors} fallos de calendario · ${skipped} actividades en espera · ${archived} archivadas.`;
      if(errors||calendarErrors) fail('Hay nuevas verificaciones fallidas. Revisa Diagnóstico para conocer sus causas. Se conservan los estados anteriores.');
    }catch(e){if(!stopped)recordFailure(changes,'session',e,'session');fail(C.ERROR_LABELS[e.code]||C.ERROR_LABELS.INTERNAL);}
    finally{
      if(!stopped)try{await append(changes,saveStamps);}catch{fail('No se guardaron los cambios de esta ejecución. Comprueba el espacio disponible.');}
      metrics.syncMs=Math.round(performance.now()-start);
      lastRun={mode,manual:mode!=='normal',checked,activityErrors:errors,calendarErrors,skipped,calendarWaiting,recovered,recognizedAbsences,detected,unknownClose,changed,archived,reactivated,cacheHits,shared,reverified:mode==='normal'?0:checked,durationMs:metrics.syncMs};
      state.loading=false;render();
    }
  }
  function load(mode='normal',target,requestedAt=performance.timeOrigin+performance.now()){
    if(stopped)return;
    if(running){
      if(mode!=='one'||runningTarget===target)return running;
      if(!queued.has(target)){
        const deferred=running.then(()=>load(mode,target,requestedAt));
        queued.set(target,deferred);
        deferred.then(()=>queued.delete(target),()=>queued.delete(target));
      }
      return queued.get(target);
    }
    state.loading=true;state.progress='Esperando turno para actualizar…';render();
    runningTarget=target;
    running=(async()=>{
      if(!navigator.locks){fail('El navegador no permite coordinar pestañas. Actualiza Chrome.');return;}
      await navigator.locks.request(lockName,async()=>{
        try{await readCache();render();await synchronize(mode,target,requestedAt);}catch(e){fail(e.message);}
      });
    })().finally(()=>{running=null;runningTarget=undefined;state.loading=false;render();});return running;
  }
  /* ---------- clasificación ---------- */

  const completion=it=>C.completion(it,state.store.manual[key(it)],state.store.auto[key(it)]);

  const bucket = (it) => {
    const status=completion(it);
    if(it.mod==='forum')return status.done?'entregadas':'manuales';
    if(status.source!=='manual' && (failures[key(it)]||status.source==='unknown'))return 'desconocidas';
    if(status.done)return 'entregadas';
    return it.due * 1000 < Date.now() ? 'atrasadas' : 'proximas';
  };

  function visible() {
    return state.items
      .filter((it) => state.course === 'all' || String(it.courseId) === state.course)
      .map((it) => ({ it, b: bucket(it) }));
  }

  function listFor(tab, rows) {
    const out = rows.filter(({ b }) => (tab === 'pendientes' ? ['proximas','atrasadas','manuales'].includes(b) : b === tab)).map((r) => r.it);
    const asc = tab === 'proximas' || tab === 'pendientes';
    return out.sort((a, b) => (asc ? a.due - b.due : b.due - a.due));
  }

  /* ---------- presentación ---------- */

  function rel(ts) {
    const diff = ts * 1000 - Date.now();
    const m = Math.floor(Math.abs(diff) / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const t = d >= 1 ? `${d} d ${h % 24} h` : h >= 1 ? `${h} h ${m % 60} min` : `${m} min`;
    return diff < 0 ? `venció hace ${t}` : `vence en ${t}`;
  }

  const fmtDate = (ts) =>
    new Date(ts * 1000).toLocaleString('es-EC', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  function itemHtml(it) {
    const classification=bucket(it);
    const done=classification==='entregadas';
    const unknown=classification==='desconocidas';
    const soon=classification==='proximas' && it.due * 1000 - Date.now() < 24 * 3600 * 1000;
    const cls = unknown ? 'ugr-unknown' : done ? 'ugr-done' : classification==='atrasadas' ? 'ugr-late' : soon ? 'ugr-soon' : '';
    return `
      <li class="ugr-item ${cls}">
        <span class="ugr-badge ugr-${it.mod}">${MODS[it.mod]}</span>
        <div class="ugr-main">
          <a href="${esc(it.url)}">${esc(it.name)}</a>
          <div class="ugr-course">${esc(it.course)}</div><div class="ugr-source">${esc(sourceLabel(it))}</div>
        </div>
        <div class="ugr-when">
          <div>${esc(fmtDate(it.due))}</div>
          ${unknown ? `<div class="ugr-rel">Sin verificar · ${esc(rel(it.due))}</div>` : done ? '<div class="ugr-rel">Entregada</div>' : classification==='manuales' ? '<div class="ugr-rel">Pendiente manual</div>' : `<div class="ugr-rel">${esc(rel(it.due))}</div>`}
        </div>
        <div class="ugr-actions">
        ${it.mod==='forum'?'':`<button type="button" class="ugr-toggle" data-reverify="${esc(key(it))}" title="Reverificar esta actividad" aria-label="Reverificar esta actividad">⟳</button>`}
        <button type="button" class="ugr-toggle" data-toggle="${esc(key(it))}"
          title="${done ? 'Marcar como no entregada' : 'Marcar como entregada'}"
          aria-label="${done ? 'Marcar como no entregada' : 'Marcar como entregada'}">${done ? '↺' : '✓'}</button>
        </div>
      </li>`;
  }

  function sourceLabel(it){
    const status=completion(it);
    if(status.source==='manual') return 'Estado manual';
    if(status.source==='historical')return 'Completada · confirmación automática histórica';
    if(status.source==='historical_unknown')return 'Completada · origen histórico desconocido';
    if(status.source==='manual_pending')return 'Requiere confirmación manual';
    const s=state.store.auto[key(it)];
    const f=failures[key(it)];
    if(f)return `Desconocido por error: ${C.ERROR_LABELS[f.code]}. ${s ? 'Último estado: '+(s.done?'entregada':'no entregada')+'. ' : ''}Reintento automático desde ${new Date(f.retryAt).toLocaleTimeString('es-EC')}. Puedes reverificar esta actividad.`;
    if(!s || s.source==='unknown') return 'Sin verificar · origen del estado anterior desconocido';
    const label=s.done?'Entrega confirmada por Moodle':'No entregada según Moodle';
    const time=stamps[key(it)]?.t??s.t;
    return time>0?`${label} · ${new Date(time).toLocaleString('es-EC')}`:label;
  }
  const panel=document.createElement('section');panel.id='ugr-panel';panel.className='ugr-panel';
  panel.innerHTML=`<div class="ugr-head"><h3>Mis actividades · Campus UG Revamp</h3><div class="ugr-tools"><select data-course aria-label="Filtrar por curso"></select><button type="button" data-refresh>Actualizar</button><button type="button" data-reverify-all>Reverificar todo</button></div></div><div class="ugr-tabs" role="tablist">${TABS.map(t=>`<button role="tab" data-tab="${t.id}">${t.label} <span class="ugr-count ugr-count-${t.id}"></span></button>`).join('')}</div><div class="ugr-note" role="status" aria-live="polite"></div><div data-state-summary class="ugr-note"></div><div class="ugr-error" role="alert"></div><details class="ugr-diagnostic"><summary>Diagnóstico de verificaciones</summary><div data-diagnostic-summary></div><pre id="ugr-diagnostics" tabindex="0"></pre></details><ul class="ugr-list"></ul><div class="ugr-empty"></div><div class="ugr-foot">Confirma los foros en Pendientes con ✓ o ↺. En tareas y cuestionarios, haz doble clic en un estado manual para volver a la verificación automática.</div>`;
  let courseSignature='';const nodes=new Map();
  function schedule(){if(!renderTimer) renderTimer=setTimeout(()=>{renderTimer=null;render();},100);}
  function render(){
    metrics.renders++;
    const rows=visible(),list=listFor(state.tab,rows);
    const courses=[...new Map(state.items.map(i=>[String(i.courseId),i.course])).entries()];
    if(state.course!=='all' && !courses.some(([id])=>id===state.course)){state.course='all';return render();}
    const signature=JSON.stringify(courses);
    if(signature!==courseSignature){panel.querySelector('select').innerHTML='<option value="all">Todos los cursos</option>'+courses.map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join('');courseSignature=signature;}
    panel.querySelector('select').value=state.course;
    for(const button of panel.querySelectorAll('[data-refresh], [data-reverify-all]'))button.disabled=state.loading||stopped||!session.userId;
    panel.querySelector('.ugr-note').textContent=state.progress;
    panel.querySelector('.ugr-error').textContent=state.error;
    for(const t of TABS){const b=panel.querySelector(`[data-tab="${t.id}"]`);b.classList.toggle('active',t.id===state.tab);b.setAttribute('aria-selected',String(t.id===state.tab));b.querySelector('span').textContent=listFor(t.id,rows).length;}
    const ul=panel.querySelector('ul'), wanted=new Set(list.map(key));
    for(const [id,n] of nodes) if(!wanted.has(id)){n.remove();nodes.delete(id);}
    list.forEach((it,index)=>{
      const id=key(it), html=itemHtml(it);let n=nodes.get(id);
      if(!n || n.dataset.signature!==html){const template=document.createElement('template');template.innerHTML=html;const fresh=template.content.firstElementChild;fresh.dataset.id=id;fresh.dataset.signature=html;if(n)n.replaceWith(fresh);nodes.set(id,fresh);n=fresh;}
      if(ul.children[index]!==n) ul.insertBefore(n,ul.children[index]||null);
    });
    panel.querySelector('.ugr-empty').textContent=list.length?'':state.loading?'Cargando…':'Nada por aquí.';
    panel.dataset.metrics=JSON.stringify(metrics);
    const records=[], historicalForumFailures=[];
    for(const [k,f] of Object.entries(failures)){
      const record={stage:k.startsWith('calendar:')?'calendar':k==='session'?'session':'activity',module:k.split(':')[0],code:f.code,attempts:f.attempts,details:f.details};
      if(record.module==='forum')historicalForumFailures.push(record);
      else if(state.store.manual[k]===undefined)records.push({...record,retryInMinutes:Math.max(0,Math.ceil((f.retryAt-Date.now())/60000))});
    }
    const effective={manualPending:0,unknown:0,persistentActivityFailures:0,completed:{automatic:0,manual:0,historical:0,historicalUnknown:0}};
    for(const {it,b} of rows){
      const status=completion(it);
      if(b==='manuales' && status.source==='manual_pending')effective.manualPending++;
      if(b==='desconocidas'){
        effective.unknown++;
        if(failures[key(it)])effective.persistentActivityFailures++;
      }
      if(b==='entregadas'){
        const category=status.source==='historical_unknown'?'historicalUnknown':status.source==='moodle'||status.source==='heuristic'?'automatic':status.source;
        effective.completed[category]++;
      }
    }
    panel.querySelector('[data-state-summary]').textContent=`Filtro actual · ${effective.unknown} sin verificar, ${effective.persistentActivityFailures} con fallos pendientes y ${effective.manualPending} foros por confirmar.`;
    const counts={};for(const f of records)counts[f.code]=(counts[f.code]||0)+1;
    const activeSummary=records.length ? Object.entries(counts).map(([code,n])=>`${C.ERROR_LABELS[code]}: ${n}`).join(' · ') : 'Sin fallos activos.';
    panel.querySelector('[data-diagnostic-summary]').textContent=`${activeSummary} · ${historicalForumFailures.length} fallos históricos de foro conservados.`;
    panel.querySelector('#ugr-diagnostics').textContent=JSON.stringify({version:VERSION,lastRun,effective,activeFailures:records,historicalForumFailures,recentIncidents:incidents},null,2);
  }
  async function changeManual(id, reset=false){
    try{
      assertSession();
      await navigator.locks.request(lockName,async()=>{
        await readCache();
        const it=state.items.find(item=>key(item)===id);
        if(!it || (reset && (it.mod==='forum'||state.store.manual[id]===undefined)))return;
        const value=reset?null:{done:bucket(it)!=='entregadas',t:Date.now()};
        await append([{type:'manual',key:id,value}]);
        if(reset)delete state.store.manual[id];
        else state.store.manual[id]=value.done;
        render();
      });
      if(reset)load();
    }catch{fail('No se pudo guardar el estado manual.');}
  }
  panel.addEventListener('click',e=>{
    const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;render();return;}
    if(e.target.closest('[data-refresh]')){load();return;}
    if(e.target.closest('[data-reverify-all]')){
      if(running||stopped)return;
      const count=candidates('all').length;
      if(window.confirm(`Se revisarán seis meses del calendario y aproximadamente ${count} tareas o cuestionarios conocidos. ¿Continuar?`))load('all');
      return;
    }
    const control=e.target.closest('[data-reverify]');
    if(control){load('one',control.dataset.reverify);return;}
    const toggle=e.target.closest('[data-toggle]');if(!toggle || stopped) return;
    changeManual(toggle.dataset.toggle);
  });
  panel.addEventListener('dblclick',e=>{
    if(!e.target.closest('.ugr-source') || stopped)return;
    const id=e.target.closest('li')?.dataset.id;
    if(id && !id.startsWith('forum:') && state.store.manual[id]!==undefined)changeManual(id,true);
  });
  panel.addEventListener('change',e=>{if(e.target.matches('[data-course]')){state.course=e.target.value;render();}});
  const ref=document.querySelector('[data-block="calendar_upcoming"], .block_calendar_upcoming');
  if(ref?.parentNode)ref.before(panel);else(document.querySelector('#region-main')||document.querySelector('main')||document.body).prepend(panel);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||stopped||running||(!Object.hasOwn(changes,historyKey)&&!Object.hasOwn(changes,stampKey)))return;
    navigator.locks?.request(lockName,async()=>{await readCache();schedule();}).catch(()=>{});
  });
  window.addEventListener('pagehide',()=>{stopped=true;controllers.forEach(c=>c.abort());clearInterval(timer);clearTimeout(renderTimer);});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!stopped){try{assertSession();load();}catch{stop();}}});
  (async()=>{
    render();
    if(!session.userId){fail('No se pudo identificar de forma fiable la cuenta. No se mostrará información guardada. Recarga Moodle.');return;}
    try{await readCache();render();await load();}catch(e){fail(e.message||'No se pudo leer el almacenamiento local.');}
    timer=setInterval(()=>{if(!stopped){try{assertSession();schedule();}catch{stop();}}},60000);
  })();
})();

