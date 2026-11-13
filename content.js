(() => {
  'use strict';
  if (document.getElementById('ugr-panel')) return;
  const C = UGCore, CFG = C.CONFIG, MODS = C.mods, ORIGIN = location.origin;
  const VERSION = chrome.runtime?.getManifest?.()?.version ?? '2.3.0';
  const session = C.identity(document);
  const prefix = `ugr2:${ORIGIN}:${session.userId}:`;
  const historyKey=prefix+'history', lockName='campus-ug-revamp:'+session.userId;
  const manualLockName=lockName+':manual';
  const stampKey=prefix+'verification', queued=new Map();
  const presentationKey=prefix+'presentation';
  let stamps={}, calendarTimes={}, calendarRefreshes={}, exhaustiveAt=0, history={schema:1,changes:[]};
  let failures={}, incidents=[], lastRun={};
  const TABS = C.categories.map((id,index)=>({id,label:['Próximas','Atrasadas','Entregadas','Pendientes','Sin verificar'][index]}));
  const state = {items:[],tab:'proximas',loading:false,progress:'',error:'',store:{auto:{},manual:{}}};
  let preferences=C.presentation(), savedPreferences=preferences, pendingPreferences={};
  let presentationReady=false, savingPreferences=false, preferenceTimer;
  let cache=C.empty(), stopped=false, running=null, runningTarget, renderTimer, timer;
  let runningMode, waitingLock, cancelled=false, cancelSerial=0;
  let periodicTimer, periodicAnchor=null, nextPeriodicRun=null, lastPeriodicRun=0, lastPeriodicResult=null;
  let periodicInterrupted=false;
  const controllers=new Set(), inflight=new Map();
  const metrics={requests:0,cacheHits:0,checks:0,renders:0,firstContentMs:null,syncMs:null};
  const started=performance.now();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=it=>it.mod+':'+it.cmid;
  function fail(message){state.error=message; schedule();}
  function assertSession(){
    if(stopped || C.identity(document).userId!==session.userId) throw C.problem('ACCOUNT_CHANGED');
  }
  function stop(message='La sesión cambió o caducó. Recarga el campus.'){
    stopped=true;waitingLock?.abort();controllers.forEach(c=>c.abort());clearInterval(timer);schedulePeriodic();
    state.items=[];state.store={auto:{},manual:{}};
    preferences=C.presentation({schema:1,position:preferences.position});
    updateAppearance();
    fail(message);
  }
  async function request(url, options={}, timeoutMs=CFG.timeout) {
    assertSession();
    if(cancelled)throw C.problem('CANCELLED');
    if(!C.allowsRequest(url,options,ORIGIN))throw C.problem('DESTINATION');
    const id=url+(options.body||'');
    if(inflight.has(id)) return inflight.get(id);
    const job=(async()=>{
      const controller=new AbortController();controllers.add(controller);
      const requestStart=performance.now();
      let phase='headers', headersMs, http;
      let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      const concurrency=controllers.size;
      try{
        metrics.requests++;
        const response=await fetch(url,{...options,credentials:'same-origin',redirect:'manual',signal:controller.signal});
        if(response.type==='opaqueredirect' || (response.status>=300 && response.status<400))throw C.problem('REDIRECT');
        if(!response.ok) throw C.problem('HTTP',{http:response.status,...C.retryAfter(response.headers.get('Retry-After'))});
        phase='body';
        headersMs=Math.round(performance.now()-requestStart);
        http=response.status;
        const text=await response.text();
        assertSession();
        if(cancelled)throw C.problem('CANCELLED');
        return text;
      }catch(e){
        if(Object.hasOwn(C.ERROR_LABELS,e.code))throw e;
        if(timedOut)throw C.problem('TIMEOUT',{phase,elapsedMs:Math.round(performance.now()-requestStart),headersMs,http,timeoutMs,concurrency});
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
    lastPeriodicRun=Number.isFinite(stored?.lastPeriodicRun)&&stored.lastPeriodicRun>0&&stored.lastPeriodicRun<=Date.now()
      ? stored.lastPeriodicRun:0;
    exhaustiveAt=Number.isFinite(stored?.exhaustiveAt)&&stored.exhaustiveAt<=performance.timeOrigin+performance.now()
      ? stored.exhaustiveAt:0;
    calendarRefreshes={};
    const observedNow=performance.timeOrigin+performance.now();
    for(const {key,historical} of months()){
      const t=stored?.calendarRefreshes?.[key];
      if(!historical && Number.isFinite(t) && t>0 && t<=observedNow)calendarRefreshes[key]=t;
    }
    calendarTimes={};
    for(const [month,t] of Object.entries(stored?.calendar??{})){
      if(!cache.months[month]||!Number.isFinite(t)||t>Date.now())continue;
      calendarTimes[month]=Math.max(t,cache.months[month].t);
    }
    for(const [id,v] of Object.entries(stored?.records??{})){
      if(!/^(assign|quiz|feedback):\d+$/.test(id)||!Number.isFinite(v?.t)||v.t>Date.now()||!Number.isFinite(v.stateAt)||v.stateAt>v.t)continue;
      const grade=id.startsWith('assign:')&&C.gradeText(v.grade);
      stamps[id]={t:v.t,stateAt:v.stateAt,closedAt:Number.isSafeInteger(v.closedAt)&&v.closedAt>0?v.closedAt:null,
        observedAt:Number.isFinite(v.observedAt)?v.observedAt:0,...(grade?{grade}:{})};
    }
    state.store={auto:cache.auto,manual:saved.manual};
    collect();
  }
  function months(){
    const now=new Date();return Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()+i-3,1);return {year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${d.getMonth()+1}`,historical:i<3};});
  }
  const titleEntity=document.createElement('textarea');
  let plainTitles=new Map();
  function collect(){
    const map=new Map(), windows=new Map();
    for(const month of Object.values(cache.months)){
      const active=month.activeIds?new Set(month.activeIds):null;
      for(const it of month.items){
        const id=key(it);
        if(!map.has(id)||map.get(id).synced<=it.synced)map.set(id,it);
        if(it.mod!=='feedback'||(active&&!active.has(it.id)))continue;
        if(!windows.has(id))windows.set(id,{open:new Set(),close:new Set()});
        if(it.openAt!=null)windows.get(id).open.add(it.openAt);
        if(it.closeAt!=null)windows.get(id).close.add(it.closeAt);
      }
    }
    const nextTitles=new Map();
    state.items=[...map.values()].map(it=>{
      if(it.mod==='feedback'){
        const dates=windows.get(key(it));
        const [openAt=null]=dates?.open??[], [closeAt=null]=dates?.close??[];
        const conflict=dates?.open.size>1||dates?.close.size>1||(openAt!=null&&closeAt!=null&&openAt>=closeAt);
        it={...it,openAt:conflict?null:openAt,closeAt:conflict?null:closeAt,due:conflict||closeAt==null?null:closeAt/1000,conflict};
      }
      const name=nextTitles.get(it.name)??plainTitles.get(it.name)??it.name.replace(
        /&(?:#[0-9]{1,10}|#x[0-9a-f]{1,8}|[a-z][a-z0-9]{1,31});/gi,entity=>{
          titleEntity.innerHTML=entity;
          return titleEntity.textContent;
        });
      nextTitles.set(it.name,name);
      return name===it.name?it:{...it,name};
    });
    plainTitles=nextTitles;
    if(state.items.length && metrics.firstContentMs===null) metrics.firstContentMs=Math.round(performance.now()-started);
  }
  // Both callers hold the account lock and read the history before appending.
  async function append(changes,saveStamps=false){
    if(!changes.length&&!saveStamps)return;
    assertSession();
    const next={...history,changes:[...history.changes,...changes]};
    const values={};
    if(changes.length)values[historyKey]=next;
    if(saveStamps)values[stampKey]={schema:1,records:stamps,calendar:calendarTimes,exhaustiveAt,
      ...(Object.keys(calendarRefreshes).length?{calendarRefreshes}:{}),...(lastPeriodicRun?{lastPeriodicRun}:{})};
    try{await chrome.storage.local.set(values);}
    catch{throw C.problem('STORAGE');}
    history=next;
  }
  async function pool(list,fn,proceed=()=>true,checkPriority){
    let next=0;
    await Promise.all(Array.from({length:Math.min(CFG.concurrency,list.length)},async()=>{
      while(next<list.length&&!stopped&&!cancelled&&proceed()){
        if(checkPriority)await checkPriority();
        if(next>=list.length||stopped||cancelled||!proceed())break;
        await fn(list[next++]);
      }
    }));
  }
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
  async function checkDone(it,timeoutMs=CFG.timeout){
    if(it.mod==='forum')throw C.problem('DESTINATION');
    metrics.checks++;
    const html=await request(it.url,{},timeoutMs);
    if(!/<(?:html|body|main|div|table|script|form)\b/i.test(html))throw C.problem('HTML_INCOMPATIBLE');
    const doc=new DOMParser().parseFromString(html,'text/html');
    if(it.mod==='feedback'){
      const feedback=C.recognizeFeedback(doc,{origin:ORIGIN,userId:session.userId,cmid:it.cmid,window:it});
      return {done:feedback.done,source:'moodle',t:Date.now(),closed:feedback.state==='closed',...(feedback.done?{}:{feedbackState:feedback.state})};
    }
    const status=C.recognize(doc,it.mod,session.userId,ORIGIN,it.cmid);
    return {...status,closed:C.closeEvidence(doc,it.mod)};
  }
  function recordFailure(changes,k,e,stage,module='none',round='initial') {
    const previous=failures[k], failure=C.failureRecord(e,previous);
    if(stage==='activity'&&(round==='recovery'||previous?.recoveryFailed))failure.recoveryFailed=true;
    failures[k]=failure;
    changes.push({type:'failure',key:k,value:failure});
    incidents.push({stage,module,round,code:failure.code,details:failure.details});
    if(incidents.length>100)incidents.shift();
    if(['ACCOUNT_CHANGED','SESSION_EXPIRED'].includes(failure.code))stop(C.ERROR_LABELS[failure.code]+'. Recarga el campus.');
  }
  function resolveFailure(changes,id){
    if(!Object.hasOwn(failures,id))return;
    delete failures[id];
    changes.push({type:'failure',key:id,value:null});
  }
  function candidates(mode,target){
    const dates=new Map();
    for(const month of months()){
      if(mode==='periodic'&&month.historical)continue;
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
      return {it,closeAt:it.mod==='feedback'?it.closeAt:values?.size===1?[...values][0]:null};
    });
  }
  const serverWaiting=f=>f?.code==='HTTP'&&Number.isFinite(f.details?.retryAfterMs)&&Date.now()<f.t+f.details.retryAfterMs;

  async function synchronize(mode,target,requestedAt,trigger){
    const force=mode==='all', refresh=mode==='refresh', periodic=mode==='periodic';
    const recentOnly=periodic&&trigger!=='visible';
    const manual=force||refresh||mode==='one';
    const proceed=()=>!periodic||(canRunPeriodic()&&!periodicInterrupted);
    let checkingPriority;
    const checkPriority=periodic?()=>{
      // Manual work in another tab advertises its intent while waiting for the account lock.
      checkingPriority??=navigator.locks.query().then(({held})=>{
        if(held.some(lock=>lock.name===manualLockName))periodicInterrupted=true;
      }).finally(()=>{checkingPriority=undefined;});
      return checkingPriority;
    }:null;
    const start=performance.now();state.loading=true;state.error='';
    state.progress=periodic?'Actualización periódica en curso…':mode==='one'?'Consultando actividad…':'Comprobando sesión…';render();
    let errors=0, calendarErrors=0, skipped=0, checked=0, calendarWaiting=0;
    let calendarRequested=0, calendarReused=0, calendarShared=0, newActivities=0;
    const refreshedRecent=[];
    const changes=[];
    const retryQueue=new Map(), timeoutPhase={headers:0,body:0};
    let recoveryBlocked=false;
    let initialErrors=0, retriesAttempted=0, recoveredAfterRetry=0, persistentErrors=0, initialDurationMs=0, recoveryDurationMs=0;
    let finalMessage='';
    let archived=0, reactivated=0, cacheHits=0, changed=0, detected=0, unknownClose=0, shared=false, saveStamps=periodic;
    const recovered={forum:0,assign:0,quiz:0,feedback:0};
    const recognizedAbsences={quiz_no_attempts:0,quiz_unavailable:0};
    lastRun={mode,trigger,manual,checked:0,activityErrors:0,calendarErrors:0,skipped:0,recovered,recognizedAbsences};
    try{
      assertSession();
      if(cancelled){finalMessage='Reverificación cancelada.';return;}
      if(checkPriority)await checkPriority();
      if(!proceed()){finalMessage='Actualización periódica interrumpida.';return;}
      if(force && exhaustiveAt>=requestedAt){
        shared=true;finalMessage='Actualización finalizada. Se reutilizó la reverificación de otra pestaña.';
        return;
      }
      if(mode!=='one'){
        if(!session.sesskey) throw C.problem('SESSION_EXPIRED');
        if(!force && failures.session && (Date.now()<failures.session.retryAt||(periodic&&serverWaiting(failures.session)))){
          finalMessage='Comprobación de sesión en espera por un fallo anterior.';return;
        }
        // Confirms the current cookie account before storing any remote data.
        const page=new DOMParser().parseFromString(await request(`${ORIGIN}/my/`),'text/html');
        C.checkIdentity(page,session.userId);resolveFailure(changes,'session');
        const known=new Set(state.items.map(key));
        if(!periodic){state.progress='Sincronizando calendario…';schedule();}
        const windowMonths=months();
        await pool(recentOnly?windowMonths.filter(m=>!m.historical):windowMonths,async m=>{
          const old=cache.months[m.key], fk='calendar:'+m.key;
          if(!force && failures[fk] && (Date.now()<failures[fk].retryAt||(periodic&&serverWaiting(failures[fk])))){calendarWaiting++;return;}
          const freshEnough=old && Date.now()-(calendarTimes[m.key]??old.t)<(m.historical?CFG.history:CFG.calendar);
          const refreshMonth=refresh&&!m.historical;
          const sharedMonth=refreshMonth && (calendarRefreshes[m.key]??0)>=requestedAt;
          if(!force && !(periodic&&!m.historical) && freshEnough && (!refreshMonth||sharedMonth)){
            calendarReused++;
            if(refreshMonth)calendarShared++;
            metrics.cacheHits++;
            return;
          }
          calendarRequested++;
          try{
            const fresh=await fetchMonth(m);assertSession();
            const previousItems=new Map((old?.items||[]).map(it=>[it.id,it]));
            const changed=[];
            for(const it of fresh.items){
              const previous=previousItems.get(it.id);
              const metadataChanged=!previous||['due','name','cmid','mod','course','courseId','closeAt','openAt'].some(field=>previous[field]!==it[field]);
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
            if(!m.historical)refreshedRecent.push(m.key);
            saveStamps=true;
            resolveFailure(changes,fk);collect();schedule();
          }
          catch(e){if(!cancelled&&!stopped){calendarErrors++;recordFailure(changes,fk,e,'calendar');}}
        },proceed,checkPriority);
        for(const it of state.items)if(!known.has(key(it)))newActivities++;
      }
      assertSession();
      const unique=candidates(periodic&&!recentOnly?'normal':mode,target)
        .sort((a,b)=>Math.abs(a.it.due-Date.now()/1000)-Math.abs(b.it.due-Date.now()/1000));
      detected=unique.length;
      unknownClose=unique.filter(candidate=>candidate.closeAt===null).length;
      const verify=async (candidate,round='initial',timeoutMs=CFG.timeout)=>{
        const {it,closeAt}=candidate;
        const id=key(it), previous=cache.auto[id], stamp=stamps[id], failure=failures[id];
        if(round==='initial'){
          if(mode==='one' && stamp?.observedAt>=requestedAt){shared=true;return;}
          const policy=C.verificationDecision({item:it,status:previous,manual:state.store.manual[id],failure,stamp,closeAt,mode});
          const decision=!force&&mode!=='one'&&policy==='check'&&serverWaiting(failure)?'backoff':policy;
          if(decision!=='check'){
            metrics.cacheHits++;
            if(decision==='cache')cacheHits++;
            if(decision==='backoff')skipped++;
            if(decision==='archive')archived++;
            return;
          }
          if(checkPriority){await checkPriority();if(!proceed())return;}
          checked++;
        }else{
          retriesAttempted++;
        }
        try{
          let status=await checkDone(it,timeoutMs);
          assertSession();
          if(cancelled)return;
          if(round==='recovery'){recoveredAfterRetry++;errors--;}
          if(failures[key(it)])recovered[it.mod]++;
          if(it.mod==='feedback'&&previous?.done&&previous.source==='moodle')status={...previous,t:status.t,closed:status.closed};
          if(Object.hasOwn(recognizedAbsences,status.absence))recognizedAbsences[status.absence]++;
          const closedAt=!status.absence && status.closed && closeAt && (status.t>closeAt||it.mod==='feedback'&&status.t===closeAt) ? closeAt:null;
          if(stamp?.closedAt && stamp.closedAt!==closedAt)reactivated++;
          if(!previous||previous.done!==status.done||previous.source!==status.source||previous.absence!==status.absence||previous.available!==status.available||previous.feedbackState!==status.feedbackState){
            const value={done:status.done,source:status.source,t:status.t,...(status.absence?{absence:status.absence}:{}),
              ...(status.available?{available:true}:{}),...(status.feedbackState?{feedbackState:status.feedbackState}:{})};
            cache.auto[id]=value;
            changes.push({type:'auto',key:id,value});
            changed++;
          }
          if((stamp?.closedAt??null)!==closedAt){
            changes.push({type:"closure",key:id,value:{closedAt,t:status.t}});
            if(previous && previous.done===status.done && previous.source===status.source)changed++;
          }
          stamps[id]={t:status.t,stateAt:cache.auto[id].t,closedAt,observedAt:performance.timeOrigin+performance.now(),
            ...(status.grade?{grade:status.grade}:{})};
          saveStamps=true;
          resolveFailure(changes,id);
        }
        catch(e){
          if(cancelled||stopped)return;
          if(round==='initial'){errors++;initialErrors++;}
          else persistentErrors++;
          if(e.code==='TIMEOUT'&&Object.hasOwn(timeoutPhase,e.details?.phase))timeoutPhase[e.details.phase]++;
          recordFailure(changes,id,e,'activity',it.mod,round);
          if(e.code==='IDENTITY_CONFLICT'){
            recoveryBlocked=true;
            if(force||periodic)stop();
          }
          const delay=mode!=='one'&&round==='initial'?C.recoveryWait(e):null;
          if(delay!==null&&!stopped)retryQueue.set(id,{candidate,readyAt:performance.now()+delay});
          stamps[id]={...(stamp??{t:0,stateAt:0,closedAt:null}),observedAt:performance.timeOrigin+performance.now()};
          saveStamps=true;
        }
        if(!stopped&&!cancelled&&(!periodic||round==='recovery')){
          state.progress=round==='initial'?`Revisando estados… ${checked}/${detected}`:
            `Recuperando verificaciones… ${retriesAttempted}/${retryQueue.size} intentadas · ${recoveredAfterRetry} recuperadas.`;
          schedule();
        }
      };
      await pool(unique,candidate=>verify(candidate),proceed);
      initialDurationMs=Math.round(performance.now()-start);
      const canRecover=()=>!recoveryBlocked&&!stopped&&!cancelled&&proceed();
      if(retryQueue.size&&canRecover()){
        const recoveryStart=performance.now();
        const deadline=recoveryStart+(periodic?CFG.periodicRecoveryBudget:CFG.recoveryBudget);
        const limit=periodic?CFG.periodicRecoveryLimit:CFG.recoveryLimit;
        state.progress=`Recuperando verificaciones fallidas… ${retryQueue.size} actividades elegibles.`;
        render();
        try{
          const work=[...retryQueue.values()].sort((a,b)=>a.readyAt-b.readyAt);
          for(const {candidate,readyAt} of work){
            if(!canRecover()||retriesAttempted>=limit||readyAt>=deadline)break;
            const wait=Math.max(0,readyAt-performance.now());
            if(wait)await new Promise(resolve=>setTimeout(resolve,Math.ceil(wait)));
            if(checkPriority)await checkPriority();
            const remaining=Math.floor(deadline-performance.now());
            if(!canRecover()||remaining<=0)break;
            await verify(candidate,'recovery',Math.min(CFG.recoveryTimeout,remaining));
          }
        }finally{recoveryDurationMs=Math.round(performance.now()-recoveryStart);}
      }
      assertSession();
      if(cancelled)finalMessage=`Reverificación cancelada. ${checked} consultas iniciales iniciadas · ${recoveredAfterRetry} recuperadas.`;
      else if(mode==='one'){
        const result=shared?'Se reutilizó la comprobación en curso.':errors?'Error al comprobar la actividad.':!checked?'Actividad no disponible.':changed?'Estado o cierre actualizado.':'Actividad verificada. Sin cambios.';
        finalMessage='Actualización finalizada. '+result;
      }else if(force){
        finalMessage=`Actualización finalizada. ${checked} actividades revisadas · ${retriesAttempted} reintentos · ${recoveredAfterRetry} recuperadas · ${errors} fallos pendientes de esta revisión · ${calendarErrors} fallos de calendario.`;
        exhaustiveAt=performance.timeOrigin+performance.now();
        saveStamps=true;
      }else{
        const sharedNote=calendarShared?` (${calendarShared} de otra pestaña)`:'';
        const waitingNote=calendarWaiting?` · ${calendarWaiting} meses en espera por fallos previos`:'';
        const heading=periodic?(proceed()?'Actualización periódica finalizada.':'Actualización periódica interrumpida.'):'Actualización finalizada.';
        const recoveryNote=initialErrors?` · ${initialErrors} fallos iniciales · ${retriesAttempted} reintentos · ${recoveredAfterRetry} recuperadas`:'';
        finalMessage=`${heading} ${calendarRequested} meses consultados · ${calendarReused} meses desde caché${sharedNote} · ${newActivities} actividades nuevas · ${checked} comprobaciones${recoveryNote} · ${errors} fallos de actividad · ${calendarErrors} fallos de calendario${waitingNote} · ${skipped} actividades en espera · ${archived} archivadas.`;
      }
    }catch(e){
      if(cancelled)finalMessage='Reverificación cancelada.';
      else if(!stopped){
        recordFailure(changes,'session',e,'session');
        if(periodic&&e.code==='IDENTITY_CONFLICT')stop();
        fail(C.ERROR_LABELS[e.code]||C.ERROR_LABELS.INTERNAL);
      }
    }
    finally{
      if(!periodic)runningMode=undefined;
      if(!stopped){
        if(force){state.progress='Finalizando sincronización…';render();}
        const finishedAt=performance.timeOrigin+performance.now();
        if(!cancelled)for(const month of refreshedRecent)calendarRefreshes[month]=finishedAt;
        try{await append(changes,saveStamps);}catch{fail('No se guardaron los cambios de esta ejecución. Comprueba el espacio disponible.');}
        state.progress=finalMessage||'Sincronización detenida. Consulta Diagnóstico.';
      }else state.progress='Sincronización detenida.';
      metrics.syncMs=Math.round(performance.now()-start);
      lastRun={mode,trigger,manual,checked,activityErrors:errors,calendarErrors,skipped,calendarWaiting,
        calendarRequested,calendarReused,calendarShared,newActivities,recovered,recognizedAbsences,detected,unknownClose,changed,archived,reactivated,cacheHits,shared,reverified:force||mode==='one'?checked:0,durationMs:metrics.syncMs,
        initialChecked:checked,initialErrors,retriesAttempted,recoveredAfterRetry,persistentErrors,
        initialDurationMs,recoveryDurationMs,retryConcurrency:retriesAttempted?1:0,timeoutPhase,recoveryDeferred:retryQueue.size-retriesAttempted,cancelled};
      if(periodic)lastPeriodicResult={...lastRun,startedAt:lastPeriodicRun,interrupted:!proceed()};
      state.loading=false;render();
    }
  }
  function load(mode='normal',target,requestedAt=performance.timeOrigin+performance.now(),trigger=mode,queuedManual=false){
    if(stopped)return;
    const manual=mode==='one'||mode==='refresh'||mode==='all';
    if(running){
      const interrupts=manual&&runningMode==='periodic';
      if(!interrupts&&!queuedManual&&(mode!=='one'||runningTarget===target))return running;
      if(runningMode===mode&&(mode!=='one'||runningTarget===target))return running;
      if(interrupts)periodicInterrupted=true;
      const queueKey=mode==='one'?target:mode;
      if(!queued.has(queueKey)){
        const serial=cancelSerial;
        queued.set(queueKey,running.then(()=>{
          queued.delete(queueKey);
          if(serial===cancelSerial)return load(mode,target,requestedAt,trigger,interrupts||queuedManual);
        }));
      }
      return queued.get(queueKey);
    }
    const periodic=mode==='periodic';
    if(periodic&&!canRunPeriodic())return;
    runningMode=mode;cancelled=false;periodicInterrupted=false;
    state.loading=true;
    if(!periodic)state.progress='Esperando turno para actualizar…';
    render();
    runningTarget=target;
    running=(async()=>{
      if(!navigator.locks){fail('El navegador no permite coordinar pestañas. Actualiza Chrome.');return;}
      if(!periodic)waitingLock=new AbortController();
      try{
        const options=periodic?{ifAvailable:true}:{signal:waitingLock.signal};
        const acquire=()=>navigator.locks.request(lockName,options,async lock=>{
          waitingLock=undefined;
          if(!lock)return;
          try{
            await readCache();
            if(periodic){
              const now=Date.now();
              if(!canRunPeriodic()||periodicInterrupted||lastPeriodicRun&&now-lastPeriodicRun<periodicInterval())return;
              lastPeriodicRun=now;
            }
            render();
            await synchronize(mode,target,requestedAt,trigger);
          }catch(e){if(e.code==='ACCOUNT_CHANGED')stop();else fail(e.message);}
        });
        if(manual)await navigator.locks.request(manualLockName,{mode:'shared',signal:options.signal},acquire);
        else await acquire();
      }catch(e){
        if(cancelled){
          state.progress='Reverificación cancelada antes de iniciar las consultas.';
          lastRun={mode,cancelled:true,checked:0,retriesAttempted:0};
        }else if(!stopped)fail(e.message);
      }finally{waitingLock=undefined;}
    })().finally(()=>{running=null;runningTarget=undefined;runningMode=undefined;state.loading=false;schedulePeriodic();render();});return running;
  }

  const periodicInterval=()=>preferences.autoRefreshMinutes*60e3;
  const canRunPeriodic=()=>!stopped&&!document.hidden&&periodicAnchor!==null&&periodicInterval()>0;
  const periodicDue=()=>Math.max(periodicAnchor,lastPeriodicRun)+periodicInterval();

  function schedulePeriodic(){
    clearTimeout(periodicTimer);
    nextPeriodicRun=null;
    if(!canRunPeriodic())return;
    nextPeriodicRun=periodicDue();
    periodicTimer=setTimeout(()=>runPeriodic('timer'),Math.max(0,nextPeriodicRun-Date.now()));
  }

  function runPeriodic(trigger){
    if(canRunPeriodic()&&Date.now()>=periodicDue()){
      periodicAnchor=Date.now();
      if(!running)void load('periodic',undefined,undefined,trigger);
    }
    schedulePeriodic();
    schedule();
  }

  function applyPresentation(next){
    const previous=preferences;
    preferences=next;
    if(next.appearance!==previous.appearance)updateAppearance();
    if(next.autoRefreshMinutes!==previous.autoRefreshMinutes&&periodicAnchor!==null){
      periodicAnchor=Date.now();
      if(!periodicInterval()&&runningMode==='periodic')periodicInterrupted=true;
      schedulePeriodic();
    }
    if(next.position!==previous.position)displayStatus(statusRecords);
    return Object.keys(next).some(field=>!['appearance','position','restoreStatusBelow'].includes(field)&&
      JSON.stringify(next[field])!==JSON.stringify(previous[field]));
  }
  /* ---------- clasificación ---------- */

  const completion=it=>C.completion(it,state.store.manual[key(it)],state.store.auto[key(it)]);
  const staleDelivered=it=>state.store.manual[key(it)]===undefined &&
    state.store.auto[key(it)]?.source==='moodle' && state.store.auto[key(it)].done && !!failures[key(it)];
  const dueBucket=it=>it.due * 1000 < Date.now() ? 'atrasadas' : 'proximas';
  const feedbackClosed=it=>it.closeAt!=null&&Date.now()>=it.closeAt&&stamps[key(it)]?.closedAt===it.closeAt;
  const showFeedbackChoice=it=>it.mod==='feedback'&&feedbackClosed(it)&&
    (state.store.manual[key(it)]!==undefined||!completion(it).done);

  const bucket = (it) => {
    const status=completion(it);
    if(it.mod==='forum')return status.done?'entregadas':dueBucket(it);
    if(it.mod==='feedback'){
      if(status.done)return 'entregadas';
      if(status.source==='manual')return feedbackClosed(it)?'atrasadas':it.due==null?'pendientes':dueBucket(it);
      if(failures[key(it)]||it.conflict||feedbackClosed(it))return 'desconocidas';
      const feedback=state.store.auto[key(it)]?.feedbackState;
      if(it.openAt!=null&&Date.now()<it.openAt)return feedback==='not_yet_open'&&it.due!=null?'proximas':'desconocidas';
      if(['available','in_progress'].includes(feedback))return it.due==null?'pendientes':dueBucket(it);
      return 'desconocidas';
    }
    if(staleDelivered(it))return 'entregadas';
    const auto=state.store.auto[key(it)];
    if(status.source!=='manual' && (failures[key(it)]||status.source==='unknown'||(auto?.absence&&!auto.available)))return 'desconocidas';
    if(status.done)return 'entregadas';
    return dueBucket(it);
  };

  function visible(course) {
    return state.items
      .filter((it) => course === 'all' || String(it.courseId) === course)
      .map((it) => ({ it, b: bucket(it) }));
  }

  async function savePresentation() {
    if(savingPreferences || !Object.keys(pendingPreferences).length)return;
    savingPreferences=true;
    const changes=pendingPreferences;
    pendingPreferences={};
    try {
      await navigator.locks.request(presentationKey,async()=>{
        assertSession();
        const stored=(await chrome.storage.local.get(presentationKey))[presentationKey];
        assertSession();
        const next=C.presentation({...C.presentation(stored),...changes});
        if(JSON.stringify(next)!==JSON.stringify(stored))await chrome.storage.local.set({[presentationKey]:next});
        savedPreferences=next;
      });
      if(!stopped){
        ui('[data-presentation-error]').textContent='';
        const next=C.presentation({...savedPreferences,...pendingPreferences});
        if(applyPresentation(next))render();
      }
    } catch {
      if(!stopped)ui('[data-presentation-error]').textContent='No se pudo guardar la personalización en Chrome.';
    } finally {
      savingPreferences=false;
      if(!stopped && !preferenceTimer && Object.keys(pendingPreferences).length)void savePresentation();
    }
  }

  function flushPresentation(){
    clearTimeout(preferenceTimer);
    preferenceTimer=null;
    void savePresentation();
  }

  function updatePresentation(changes, delayed=false) {
    if(!presentationReady || stopped)return;
    const next=C.presentation({...preferences,...changes});
    for(const field of Object.keys(changes)){
      if(JSON.stringify(next[field])!==JSON.stringify(preferences[field]) ||
         JSON.stringify(next[field])!==JSON.stringify(savedPreferences[field]))pendingPreferences[field]=next[field];
    }
    applyPresentation(next);
    if(delayed)displayTitle();
    else if(Object.keys(changes).some(field=>!['appearance','position','restoreStatusBelow'].includes(field)))render();
    clearTimeout(preferenceTimer);
    if(delayed)preferenceTimer=setTimeout(flushPresentation,220);
    else flushPresentation();
  }

  /* ---------- presentación ---------- */

  function rel(ts) {
    if(ts==null)return 'Sin fecha límite confirmada';
    const diff = ts * 1000 - Date.now();
    const m = Math.floor(Math.abs(diff) / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const t = d >= 1 ? `${d} d ${h % 24} h` : h >= 1 ? `${h} h ${m % 60} min` : `${m} min`;
    return diff < 0 ? `venció hace ${t}` : `vence en ${t}`;
  }

  const fmtDate = (ts) =>
    ts==null?'':new Date(ts * 1000).toLocaleString('es-EC', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  function itemHtml(it) {
    const classification=bucket(it);
    const done=classification==='entregadas';
    const unknown=classification==='desconocidas';
    const id=key(it), auto=state.store.auto[id], stamp=stamps[id];
    const grade=done&&it.mod==='assign'&&auto?.source==='moodle'&&auto.done&&!failures[id]&&
      stamp?.stateAt===auto.t&&Date.now()-stamp.t<CFG.completed?stamp.grade:null;
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
          ${unknown ? `<div class="ugr-rel">Sin verificar · ${esc(rel(it.due))}</div>` : done ? `<div class="ugr-rel">Entregada${grade?` · <span class="ugr-grade">Calificación: ${esc(grade)}</span>`:''}</div>` : `<div class="ugr-rel">${esc(rel(it.due))}</div>`}
        </div>
        <div class="ugr-actions">
        ${it.mod==='forum'?'':`<button type="button" class="ugr-toggle" data-reverify="${esc(key(it))}" title="Reverificar esta actividad" aria-label="Reverificar esta actividad">⟳</button>`}
        ${it.mod==='feedback'? (showFeedbackChoice(it)?`<label class="ugr-feedback-choice"><span>Participación</span>
          <select data-feedback-choice aria-label="${esc('Confirmación manual: '+it.name)}">
            <option value=""${state.store.manual[id]===undefined?' selected':''}>Dejar sin verificar</option>
            <option value="completed"${state.store.manual[id]===true?' selected':''}>Sí, la completé</option>
            <option value="not_completed"${state.store.manual[id]===false?' selected':''}>No la completé</option>
          </select></label>`:'') : `<button type="button" class="ugr-toggle" data-toggle="${esc(key(it))}"
          title="${done ? 'Marcar como no entregada' : 'Marcar como entregada'}"
          aria-label="${done ? 'Marcar como no entregada' : 'Marcar como entregada'}">${done ? '↺' : '✓'}</button>`}
        </div>
      </li>`;
  }

  function sourceLabel(it){
    const status=completion(it);
    if(it.mod==='feedback'&&status.source==='manual')return status.done?'Completada · Confirmación manual':
      feedbackClosed(it)?'Encuesta cerrada · No completada (manual)':'No completada (manual)';
    if(it.mod==='forum'&&!status.done)return 'Requiere confirmación manual';
    if(status.source==='manual')return failures[key(it)]&&it.mod!=='forum'
      ? 'Estado manual · última consulta fallida'
      : 'Estado manual';
    if(status.source==='historical')return 'Completada · confirmación automática histórica';
    if(status.source==='historical_unknown')return 'Completada · origen histórico desconocido';
    const s=state.store.auto[key(it)];
    const f=failures[key(it)];
    if(it.mod==='feedback'){
      if(status.done)return 'Entregada · Confirmada por Moodle';
      if(feedbackClosed(it))return 'Encuesta cerrada · No se pudo comprobar la participación';
      if(f||it.conflict)return 'Sin verificar · Estado de la encuesta sin confirmar';
      if(s?.feedbackState==='not_yet_open'&&Date.now()<it.openAt)return 'Todavía no disponible · Abre '+fmtDate(it.openAt/1000);
      if(it.openAt!=null&&Date.now()<it.openAt)return 'Sin verificar · Abre '+fmtDate(it.openAt/1000);
      return {available:'Disponible para responder',in_progress:'Disponible para continuar',
        restricted:'Acceso restringido'}[s?.feedbackState]??'Sin verificar · Participación sin confirmar';
    }
    if(staleDelivered(it)){
      const t=stamps[key(it)]?.t??s.t;
      return `Último estado confirmado: entregada · ${t>0?new Date(t).toLocaleString('es-EC')+' · ':''}Reconfirmación pendiente (${C.ERROR_LABELS[f.code]}).`;
    }
    if(it.mod==='quiz'&&(f||!s||s.source==='unknown'))return 'Sin verificar · Moodle no proporcionó un estado reconocible';
    if(s?.absence==='quiz_no_attempts')return s.available?'No iniciado · Disponible para realizar':
      'No iniciado · No se han registrado intentos del cuestionario';
    if(s?.absence==='quiz_unavailable')return 'Todavía no disponible · El cuestionario aún no permite iniciar un intento';
    if(f)return `Desconocido por error: ${C.ERROR_LABELS[f.code]}. ${s ? 'Último estado: '+(s.done?'entregada':'no entregada')+'. ' : ''}Reintento automático desde ${new Date(f.retryAt).toLocaleTimeString('es-EC')}. Puedes reverificar esta actividad.`;
    if(!s || s.source==='unknown') return 'Sin verificar · origen del estado anterior desconocido';
    const label=s.done?'Entrega confirmada por Moodle':'No entregada según Moodle';
    const time=stamps[key(it)]?.t??s.t;
    return time>0?`${label} · ${new Date(time).toLocaleString('es-EC')}`:label;
  }
  const panel=document.createElement('section');panel.id='ugr-panel';panel.className='ugr-panel';panel.hidden=true;
  panel.setAttribute('aria-labelledby','ugr-title');
  panel.innerHTML=`
    <div class="ugr-head">
      <h3 id="ugr-title"></h3>
      <div class="ugr-tools">
        <select data-course aria-label="Filtrar por curso"></select>
        <button type="button" data-refresh>Actualizar</button>
        <button type="button" data-reverify-all>Reverificar todo</button>
        <button type="button" data-personalize aria-expanded="false" aria-controls="ugr-preferences"><span aria-hidden="true">⚙</span> Personalizar</button>
      </div>
    </div>
    <div id="ugr-preferences" class="ugr-preferences" hidden>
      <div class="ugr-title-setting">
        <label>Título del panel <input type="text" data-title maxlength="${C.titleLimit}"></label>
        <button type="button" data-reset-title>Restablecer título</button>
      </div>
      <div class="ugr-preference-fields">
        <label>Ubicación del estado <select data-position><option value="top">Arriba</option><option value="bottom">Abajo</option><option value="hidden">Oculto</option></select></label>
        <div class="ugr-status-visibility"><span>Visibilidad</span><button type="button" data-toggle-status aria-controls="ugr-status" aria-expanded="true">Ocultar estado</button></div>
        <label>Tamaño del panel <select data-size><option value="compact">Compacto</option><option value="normal">Normal</option><option value="wide">Amplio</option></select></label>
        <label>Actividades visibles <select data-limit><option value="5">5</option><option value="10">10</option><option value="30">30</option><option value="">Sin límite</option></select></label>
        <label>Vista de categorías <select data-mode><option value="tabs">Pestañas rápidas</option><option value="custom">Filtros personalizados</option></select></label>
      </div>
      <div class="ugr-preference-fields">
        <label>Actualización automática <select data-auto-refresh-minutes><option value="0">Desactivada</option><option value="10">Cada 10 minutos</option><option value="15">Cada 15 minutos</option><option value="30">Cada 30 minutos</option></select></label>
        <label>Apariencia <select data-appearance><option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
      </div>
      <fieldset data-categories hidden>
        <legend>Categorías visibles</legend>
        <div class="ugr-category-options">
          ${TABS.map(t=>`<label><input type="checkbox" data-category value="${t.id}"> ${t.label}</label>`).join('')}
        </div>
        <div class="ugr-preference-actions">
          <button type="button" data-select-all>Seleccionar todas</button>
          <button type="button" data-reset-categories>Restablecer filtros</button>
        </div>
      </fieldset>
      <button type="button" data-reset-presentation>Restaurar configuración predeterminada</button>
      <div data-presentation-error role="alert"></div>
      <a class="ugr-credits-link" href="#ugr-credits" aria-haspopup="dialog" aria-controls="ugr-credits">Créditos</a>
    </div>
    <div class="ugr-tabs" role="tablist" aria-label="Categorías de actividades">${TABS.map(t=>`<button type="button" role="tab" data-tab="${t.id}">${t.label} <span class="ugr-count ugr-count-${t.id}"></span></button>`).join('')}</div>
    <div class="ugr-list-toolbar">
      <div><span data-list-info aria-live="polite" aria-atomic="true"></span><span class="ugr-active-filters" data-active-filters hidden></span></div>
      <div class="ugr-status-actions">
        <button type="button" data-cancel hidden>Cancelar verificación</button>
      </div>
    </div>
    <div id="ugr-status">
      <div class="ugr-note" role="status" aria-live="polite"></div>
      <div data-state-summary class="ugr-note"></div>
      <div class="ugr-error" role="alert"></div>
      <details class="ugr-diagnostic"><summary>Diagnóstico de verificaciones</summary><div data-diagnostic-summary></div><pre id="ugr-diagnostics" tabindex="0"></pre></details>
    </div>
    <div class="ugr-warning" hidden>
      <span data-minimal-warning role="alert"></span>
      <button type="button" data-show-diagnostic>Ver diagnóstico</button>
    </div>
    <div data-list-body>
      <ul class="ugr-list" tabindex="0" aria-label="Actividades filtradas"></ul>
      <div class="ugr-empty"><span data-empty-message></span><button type="button" data-reset-categories hidden>Restablecer filtros</button></div>
    </div>
    <div class="ugr-foot">Confirma los foros en Pendientes con ✓ o ↺. En tareas y cuestionarios, haz doble clic en un estado manual para volver a la verificación automática.</div>
    <dialog id="ugr-credits" class="ugr-credits-dialog" aria-labelledby="ugr-credits-title">
      <button class="ugr-credits-close" type="button" aria-label="Cerrar créditos" autofocus>×</button>
      <h4 id="ugr-credits-title">Créditos:</h4>
      <p class="ugr-credits-authors">Hecho por: Daniel Abel y Jonathan Peñafiel<br><a href="https://github.com/danieIabel" target="_blank" rel="noopener noreferrer">https://github.com/danieIabel</a><br><a href="https://github.com/Jonathan-hue-sudo" target="_blank" rel="noopener noreferrer">https://github.com/Jonathan-hue-sudo</a><br>Revamp por los GOATS ChatGPT y Codex<br>Dirigido y optimizado por Kleber Arteaga<br><a href="https://github.com/RealMarshy" target="_blank" rel="noopener noreferrer">https://github.com/RealMarshy</a></p>
      <p><strong>#RipMoodle</strong></p>
      <p><em>Si no nos quieren dar las herramientas...</em></p>
      <img class="ugr-credits-card" alt="Ilustración Hágalo Usted Mismo" width="480" height="683">
    </dialog>`;
  const ui=selector=>panel.querySelector(selector);
  const creditsLink=ui('.ugr-credits-link'), credits=ui('#ugr-credits'), card=ui('.ugr-credits-card');
  creditsLink.addEventListener('click',e=>{
    e.preventDefault();
    if(!card.hasAttribute('src'))card.src=chrome.runtime.getURL('assets/hagalo-usted-mismo.png');
    if(!credits.open)credits.showModal();
  });
  ui('.ugr-credits-close').addEventListener('click',()=>credits.close());
  credits.addEventListener('close',()=>creditsLink.focus({preventScroll:true}));
  const settings=ui('#ugr-preferences'), statusBlock=ui('#ugr-status'), listBody=ui('[data-list-body]');
  const courseSelect=ui('[data-course]'), titleInput=ui('[data-title]'), ul=ui('.ugr-list');
  const warning=ui('.ugr-warning'), statusButton=ui('[data-toggle-status]'), cancelButton=ui('[data-cancel]');
  const appearanceSelect=ui('[data-appearance]'), systemDark=matchMedia('(prefers-color-scheme: dark)');
  const themeAttributes=['class','style','data-bs-theme','data-theme','data-color-scheme','data-darkreader-mode','data-darkreader-scheme'];
  let appearanceFrame=0, appearanceSampleTimer, colorCanvas, watchedThemeNodes=[];
  const sampledColors=new WeakMap();

  function hostAppearance(){
    for(let node=panel.parentElement;node;node=node.parentElement){
      const color=colorValue(getComputedStyle(node).backgroundColor);
      if(color)return colorTone(color);
    }
    const scheme=getComputedStyle(document.documentElement).colorScheme;
    return scheme==='dark'||(scheme!=='light'&&systemDark.matches)?'dark':'light';
  }

  function darkReaderFilter(){
    const root=document.documentElement;
    if(root.dataset.darkreaderMode!=='filter'&&!document.getElementById('dark-reader-style'))return {filter:'none'};
    const filter=getComputedStyle(root).filter;
    const values=filter.includes('#dark-reader-filter')?
      document.querySelector('#dark-reader-filter feColorMatrix')?.getAttribute('values')?.trim().split(/[\s,]+/).map(Number):null;
    const matrix=values?.length===20&&values.every(value=>Number.isFinite(value)&&Math.abs(value)<=16)?values:null;
    const inverted=/\binvert\((?:1|100%)\)/.test(filter)||(matrix&&matrix.slice(0,3).reduce((sum,v)=>sum+v,0)<0);
    return {filter,matrix,inverted:!!inverted};
  }

  function colorValue(value){
    const hex=value?.trim().match(/^#([\da-f]{6})$/i);
    if(hex)return hex[1].match(/../g).map(channel=>parseInt(channel,16));
    const rgb=value?.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
    if(rgb&&(rgb[4]===undefined||Number(rgb[4])===1))return rgb.slice(1,4).map(Number);
    const srgb=value?.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if(srgb&&(srgb[4]===undefined||Number(srgb[4])===1)){
      const channels=srgb.slice(1,4).map(Number);
      if(channels.every(v=>v>=0&&v<=1))return channels.map(v=>v*255);
    }
    return null;
  }

  const cssColor=rgb=>`rgb(${rgb.map(v=>Math.round(v)).join(', ')})`;
  const mixColor=(from,to,amount)=>from.map((value,i)=>value+(to[i]-value)*amount);
  const colorTone=rgb=>(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])<128?'dark':'light';
  function luminance(rgb){
    const [r,g,b]=rgb.map(channel=>{
      const v=channel/255;
      return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    });
    return .2126*r+.7152*g+.0722*b;
  }
  function contrast(a,b){
    const x=luminance(a), y=luminance(b);
    return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
  }
  function readableColor(preferred,backgrounds,ratio,fallback){
    if(!preferred)return fallback;
    for(let step=0;step<10;step++){
      const candidate=mixColor(preferred,fallback,step/10).map(Math.round);
      if(backgrounds.every(bg=>contrast(candidate,bg)>=ratio))return candidate;
    }
    return fallback;
  }

  function campusSamples(){
    const parent=panel.parentElement, region=document.getElementById('region-main');
    const scopes=[...new Set([parent,region,document.body].filter(Boolean))];
    const find=(selector,roots=scopes)=>{
      for(const root of roots)for(const node of root.querySelectorAll(`:is(${selector}):not(#ugr-panel *)`)){
        if(node.getClientRects().length>0&&getComputedStyle(node).visibility==='visible')return node;
      }
    };
    const block=find('.block, .card');
    const nearby=block?[block,...scopes]:scopes;
    const surface=find('.card-body, .block-content, .card',block?[block]:[])??block;
    const muted=find('.text-muted, .text-secondary, small',nearby);
    const button=find('.btn-secondary, .btn-outline-secondary',nearby)??find('button:not([disabled]), select',nearby);
    const ancestors=[];
    for(let node=parent;node;node=node.parentElement)ancestors.push(node);
    const backgrounds=[...new Set([parent,region,...ancestors].filter(Boolean))];
    const styles=new Map();
    const style=node=>{
      if(!node)return null;
      if(!styles.has(node))styles.set(node,getComputedStyle(node));
      return styles.get(node);
    };
    const background=node=>style(node)?.backgroundImage==='none'?colorValue(style(node).backgroundColor):null;
    const foreground=node=>colorValue(style(node)?.color);
    const border=node=>style(node)?.borderTopStyle!=='none'&&parseFloat(style(node)?.borderTopWidth)>0
      ?colorValue(style(node).borderTopColor):null;
    return {nodes:[...new Set([...backgrounds,block,surface,muted,button].filter(Boolean))],
      backgrounds:backgrounds.map(node=>({bg:background(node),text:foreground(node),border:border(node)})),
      surface:background(surface)??background(block),border:border(surface)??border(block),
      muted:foreground(muted),buttonBg:background(button),buttonText:foreground(button),buttonBorder:border(button)};
  }

  function campusPalette(samples,node,tone,transform=color=>color){
    const convert=color=>color&&transform(color);
    const source=samples.backgrounds.find(({bg})=>{
      const color=convert(bg);
      return color&&colorTone(color)===tone;
    });
    if(!source)return {};
    const bg=convert(source.bg);
    const black=[0,0,0],white=[255,255,255];
    const against=color=>contrast(color,white)>=contrast(color,black)?white:black;
    const text=readableColor(convert(source.text),[bg],4.5,against(bg));
    const surfaceSample=convert(samples.surface);
    const separator=mixColor(bg,text,.05).map(Math.round);
    const surface=surfaceSample&&contrast(bg,surfaceSample)>=1.04&&contrast(bg,surfaceSample)<1.5&&contrast(text,surfaceSample)>=4.5
      ?surfaceSample:contrast(text,separator)>=4.5?separator:bg;
    const backgrounds=[bg,surface];
    const muted=readableColor(convert(samples.muted)??mixColor(text,bg,.22),backgrounds,4.5,text);
    const borderSample=convert(samples.border??source.border);
    const border=borderSample&&contrast(borderSample,bg)>=1.14&&contrast(borderSample,surface)>=1.1?borderSample:mixColor(bg,text,.2);
    const buttonSample=convert(samples.buttonBg);
    const buttonBg=buttonSample&&colorTone(buttonSample)===tone&&contrast(buttonSample,bg)<2?buttonSample:surface;
    const buttonText=readableColor(convert(samples.buttonText)??text,[buttonBg],4.5,against(buttonBg));
    const buttonBorder=readableColor(convert(samples.buttonBorder)??mixColor(buttonBg,text,.45),
      [bg,surface,buttonBg],3,text);
    const colors={bg,surface,text,muted,border,row:mixColor(bg,surface,.55),'button-bg':buttonBg,'button-text':buttonText,
      'button-border':buttonBorder,'control-border':buttonBorder,neutral:surface};
    const baseStyle=getComputedStyle(node);
    for(const name of ['blue','red','green','amber','purple']){
      const accent=readableColor(colorValue(baseStyle.getPropertyValue(`--ugr-base-${name}`)),backgrounds,4.5,text);
      const tint=mixColor(bg,accent,.12).map(Math.round);
      colors[name]=accent;
      colors[name+'-bg']=contrast(accent,tint)>=4.5?tint:surface;
    }
    return Object.fromEntries(Object.entries(colors).map(([name,rgb])=>[`--ugr-${name}`,cssColor(rgb)]));
  }

  function filterColorTransform({filter,matrix}){
    if(matrix)return color=>[0,5,10].map(i=>Math.max(0,Math.min(255,
      Math.round(color.reduce((sum,v,j)=>sum+v*matrix[i+j],matrix[i+3]*255+matrix[i+4]*255)))));
    // Only standard color functions are safe here. A page-supplied URL must never be loaded.
    if(!/^(?:(?:invert|hue-rotate|brightness|contrast|saturate|grayscale|sepia)\(-?[\d.]+(?:%|deg|rad|turn)?\)\s*)+$/.test(filter))return null;
    if(!colorCanvas){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      colorCanvas=canvas.getContext('2d',{willReadFrequently:true});
    }
    if(!colorCanvas)return null;
    return color=>{
      colorCanvas.clearRect(0,0,1,1);
      colorCanvas.filter=filter;
      colorCanvas.fillStyle=cssColor(color);
      colorCanvas.fillRect(0,0,1,1);
      const pixel=colorCanvas.getImageData(0,0,1,1).data;
      return pixel[3]===255?Array.from(pixel.slice(0,3)):null;
    };
  }

  function applyCampusPalette(node,colors){
    const previous=sampledColors.get(node)??{};
    for(const name of Object.keys(previous))if(!Object.hasOwn(colors,name))node.style.removeProperty(name);
    for(const [name,value] of Object.entries(colors))if(previous[name]!==value)node.style.setProperty(name,value);
    sampledColors.set(node,colors);
  }

  function updateAppearance(){
    const scheme=document.documentElement.dataset.darkreaderScheme;
    const filter=darkReaderFilter(), {inverted}=filter;
    const effective=preferences.appearance==='auto'
      ? (inverted||scheme==='dark'?'dark':scheme==='dimmed'?'light':hostAppearance())
      : preferences.appearance;
    const palette=inverted?(effective==='dark'?'light':'dark'):effective;
    if(panel.dataset.ugrTheme!==effective)panel.dataset.ugrTheme=effective;
    if(panel.dataset.ugrPalette!==palette)panel.dataset.ugrPalette=palette;
    panel.toggleAttribute('data-ugr-filter',inverted);
    // Chromium paints the top-layer dialog outside the root filter.
    if(credits.dataset.ugrPalette!==effective)credits.dataset.ugrPalette=effective;
    const samples=preferences.appearance==='auto'?campusSamples():null;
    const colors=samples?campusPalette(samples,panel,palette):{};
    const transform=samples&&filter.filter!=='none'?filterColorTransform(filter):null;
    applyCampusPalette(panel,colors);
    applyCampusPalette(credits,transform?campusPalette(samples,credits,effective,transform):filter.filter==='none'?colors:{});
    watchAppearance(samples?.nodes??[]);
    // Dynamic Dark Reader can rewrite CSS rules without a DOM mutation.
    clearTimeout(appearanceSampleTimer);
    if(samples&&scheme&&!document.hidden)appearanceSampleTimer=setTimeout(scheduleAppearance,1500);
    if(appearanceSelect.value!==preferences.appearance)appearanceSelect.value=preferences.appearance;
  }

  function scheduleAppearance(){
    if(!appearanceFrame&&!document.hidden)appearanceFrame=requestAnimationFrame(()=>{appearanceFrame=0;updateAppearance();});
  }

  function onAppearanceVisibility(){
    if(document.hidden){
      clearTimeout(appearanceSampleTimer);
      cancelAnimationFrame(appearanceFrame);
      appearanceFrame=0;
    }else scheduleAppearance();
  }

  document.addEventListener('visibilitychange',onAppearanceVisibility);
  const appearanceObserver=new MutationObserver(records=>{
    if(records.some(record=>record.target!==document.head||
      [...record.addedNodes,...record.removedNodes].some(node=>node.matches?.('style, link[rel="stylesheet"]'))))scheduleAppearance();
  });
  function watchAppearance(samples){
    const nodes=new Set(samples);
    for(let node=panel.parentElement;node;node=node.parentElement)nodes.add(node);
    const next=[...nodes];
    if(next.length===watchedThemeNodes.length&&next.every((node,i)=>node===watchedThemeNodes[i]))return;
    watchedThemeNodes=next;
    appearanceObserver.disconnect();
    for(const node of next)appearanceObserver.observe(node,{attributes:true,attributeFilter:themeAttributes,childList:true});
    if(document.head)appearanceObserver.observe(document.head,{childList:true,subtree:true,characterData:true});
  }
  let courseSignature='';const nodes=new Map();
  let statusRecords=[];
  function displayStatus(records) {
    statusRecords=records;
    const show=preferences.position!=='hidden';
    ui('[data-position]').value=preferences.position;
    statusBlock.hidden=!show;
    if(preferences.position==='bottom'){
      if(listBody.nextElementSibling!==statusBlock)listBody.after(statusBlock);
    }else if(warning.previousElementSibling!==statusBlock)warning.before(statusBlock);
    statusButton.textContent=show?'Ocultar estado':'Mostrar estado';
    statusButton.setAttribute('aria-expanded',String(show));
    const count=records.filter(record=>record.recoveryFailed).length;
    const persistentNotice=count===1?'1 actividad con un fallo persistente.':count>1?`${count} actividades con fallos persistentes.`:'';
    const identityNotice=records.some(record=>['IDENTITY_MISSING','IDENTITY_CONFLICT'].includes(record.code))
      ? 'No se pudo confirmar la identidad en una consulta. Recarga Moodle si el problema continúa.':'';
    const notice=[state.error||identityNotice,persistentNotice].filter(Boolean).join(' ');
    const statusError=ui('.ugr-error');
    if(statusError.textContent!==notice)statusError.textContent=notice;
    warning.hidden=show||(!notice&&!records.length);
    const message=warning.hidden?'':notice;
    if(ui('[data-minimal-warning]').textContent!==message)ui('[data-minimal-warning]').textContent=message;
  }

  function displayTitle() {
    const title=ui('#ugr-title');
    if(title.textContent!==preferences.title)title.textContent=preferences.title;
    if(document.activeElement!==titleInput)titleInput.value=preferences.title;
  }

  function displayPreferences() {
    const custom=preferences.mode==='custom';
    displayTitle();
    panel.dataset.size=preferences.size;
    for(const field of ['position','mode','size','limit'])ui(`[data-${field}]`).value=preferences[field]??'';
    ui('[data-auto-refresh-minutes]').value=preferences.autoRefreshMinutes;
    ui('[data-categories]').hidden=!custom;
    for(const input of settings.querySelectorAll('[data-category]'))input.checked=preferences.categories.includes(input.value);
    ui('.ugr-tabs').hidden=custom;
    ui('[data-personalize]').disabled=!presentationReady||stopped;
    courseSelect.disabled=!presentationReady||stopped;
    if(stopped && !settings.hidden){
      settings.hidden=true;
      ui('[data-personalize]').setAttribute('aria-expanded','false');
    }
  }

  function schedule(){if(!renderTimer) renderTimer=setTimeout(()=>{renderTimer=null;render();},100);}
  function render(){
    metrics.renders++;
    displayPreferences();
    const courses=[...new Map(state.items.map(i=>[String(i.courseId),i.course])).entries()];
    const course=courses.some(([id])=>id===preferences.course)?preferences.course:'all';
    const signature=JSON.stringify(courses);
    if(signature!==courseSignature){courseSelect.innerHTML='<option value="all">Todos los cursos</option>'+courses.map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join('');courseSignature=signature;}
    courseSelect.value=course;
    const custom=preferences.mode==='custom', selected=custom?preferences.categories:[state.tab];
    const rows=visible(course), matching=C.presentationList(rows,selected);
    const list=preferences.limit===null?matching:matching.slice(0,preferences.limit);
    for(const button of panel.querySelectorAll('[data-refresh], [data-reverify-all]'))
      button.disabled=(state.loading&&runningMode!=='periodic')||stopped||!session.userId;
    const hideCancel=runningMode!=='all'||stopped||cancelled;
    if(cancelButton.hidden!==hideCancel){
      const restoreFocus=hideCancel&&document.activeElement===cancelButton;
      cancelButton.hidden=hideCancel;
      if(restoreFocus)ui('[data-personalize]').focus({preventScroll:true});
    }
    panel.querySelector('.ugr-note').textContent=state.progress;
    const countsByTab=Object.fromEntries(TABS.map(t=>[t.id,0]));
    for(const {b} of rows)for(const t of TABS)if(C.matchesCategory(t.id,b))countsByTab[t.id]++;
    for(const t of TABS){const b=ui(`[data-tab="${t.id}"]`);b.classList.toggle('active',t.id===state.tab);b.setAttribute('aria-selected',String(t.id===state.tab));b.querySelector('span').textContent=countsByTab[t.id];}
    const scrollTop=ul.scrollTop, wanted=new Set(list.map(key));
    for(const [id,n] of nodes) if(!wanted.has(id)){n.remove();nodes.delete(id);}
    list.forEach((it,index)=>{
      const id=key(it), html=itemHtml(it);let n=nodes.get(id);
      if(!n || n.dataset.signature!==html){const template=document.createElement('template');template.innerHTML=html;const fresh=template.content.firstElementChild;fresh.dataset.id=id;fresh.dataset.signature=html;if(n)n.replaceWith(fresh);nodes.set(id,fresh);n=fresh;}
      if(ul.children[index]!==n) ul.insertBefore(n,ul.children[index]||null);
    });
    ul.scrollTop=scrollTop;
    ul.hidden=!list.length;
    const empty=ui('.ugr-empty'), noCategories=custom&&!selected.length;
    empty.hidden=!!list.length;
    empty.querySelector('[data-reset-categories]').hidden=!noCategories;
    ui('[data-empty-message]').textContent=noCategories?'Selecciona al menos una categoría para ver actividades.':state.loading?'Cargando…':'Nada por aquí.';
    const listInfo=ui('[data-list-info]'), info=`Mostrando ${list.length} de ${matching.length} actividades`;
    if(listInfo.textContent!==info)listInfo.textContent=info;
    const activeFilters=ui('[data-active-filters]');
    activeFilters.hidden=!custom||noCategories;
    const filterLabels=custom?TABS.filter(t=>selected.includes(t.id)).map(t=>t.label).join(' · '):'';
    if(activeFilters.textContent!==filterLabels)activeFilters.textContent=filterLabels;
    panel.dataset.metrics=JSON.stringify(metrics);
    const records=[], historicalForumFailures=[];
    for(const [k,f] of Object.entries(failures)){
      const record={stage:k.startsWith('calendar:')?'calendar':k==='session'?'session':'activity',module:k.split(':')[0],code:f.code,attempts:f.attempts,details:f.details};
      if(record.module==='forum')historicalForumFailures.push(record);
      else records.push({...record,...(record.stage==='activity'?{recoveryFailed:f.recoveryFailed===true}:{}),
        ...(state.store.manual[k]!==undefined?{manualOverride:true}:{}),retryInMinutes:Math.max(0,Math.ceil((f.retryAt-Date.now())/60000))});
    }
    const effective={manualPending:0,unknown:0,persistentActivityFailures:0,completed:{automatic:0,manual:0,historical:0,historicalUnknown:0,staleAutomatic:0}};
    for(const {it,b} of rows){
      const status=completion(it);
      if(it.mod==='forum'&&!status.done)effective.manualPending++;
      if(b==='desconocidas'){
        effective.unknown++;
      }
      if(it.mod!=='forum'&&failures[key(it)]?.recoveryFailed)effective.persistentActivityFailures++;
      if(b==='entregadas'){
        const category=staleDelivered(it)?'staleAutomatic':status.source==='historical_unknown'?'historicalUnknown':status.source==='moodle'||status.source==='heuristic'?'automatic':status.source;
        effective.completed[category]++;
      }
    }
    panel.querySelector('[data-state-summary]').textContent=`Filtro actual · ${effective.unknown} sin verificar · ${effective.completed.staleAutomatic} entregas por reconfirmar · ${effective.persistentActivityFailures} con fallos persistentes · ${effective.manualPending} foros por confirmar.`;
    const counts={};for(const f of records)counts[f.code]=(counts[f.code]||0)+1;
    const activeSummary=records.length ? Object.entries(counts).map(([code,n])=>`${C.ERROR_LABELS[code]}: ${n}`).join(' · ') : 'Sin fallos activos.';
    displayStatus(records);
    panel.querySelector('[data-diagnostic-summary]').textContent=`${activeSummary} · ${historicalForumFailures.length} fallos históricos de foro conservados.`;
    panel.querySelector('#ugr-diagnostics').textContent=JSON.stringify({version:VERSION,lastRun,
      autoRefreshEnabled:preferences.autoRefreshMinutes>0,autoRefreshIntervalMinutes:preferences.autoRefreshMinutes,
      lastPeriodicRun:lastPeriodicRun||null,nextPeriodicRun,lastPeriodicResult,
      effective,activeFailures:records,historicalForumFailures,recentIncidents:incidents},null,2);
  }
  async function changeManual(id, reset=false, participation){
    try{
      assertSession();
      await navigator.locks.request(lockName,async()=>{
        await readCache();
        const it=state.items.find(item=>key(item)===id);
        if(!it || (reset && (it.mod==='forum'||state.store.manual[id]===undefined)))return;
        if(it.mod==='feedback'&&!showFeedbackChoice(it)){render();return;}
        const value=reset?null:it.mod==='feedback'?
          {participation,done:participation==='completed',t:Date.now()}:{done:bucket(it)!=='entregadas',t:Date.now()};
        await append([{type:'manual',key:id,value}]);
        if(reset)delete state.store.manual[id];
        else state.store.manual[id]=value.done;
        render();
        if(it.mod==='feedback'){
          const select=nodes.get(id)?.querySelector('[data-feedback-choice]');
          (select||ui('[data-tab][aria-selected="true"]:not([hidden])')||listBody.querySelector('.ugr-list')).focus();
        }
      });
      if(reset&&!id.startsWith('feedback:'))load();
    }catch{
      const select=nodes.get(id)?.querySelector('[data-feedback-choice]');
      if(select)select.value=state.store.manual[id]===undefined?'':state.store.manual[id]?'completed':'not_completed';
      fail('No se pudo guardar el estado manual.');
    }
  }
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-personalize]')){
      settings.hidden=!settings.hidden;
      ui('[data-personalize]').setAttribute('aria-expanded',String(!settings.hidden));
      return;
    }
    if(e.target.closest('[data-toggle-status]')){
      if(statusBlock.hidden)updatePresentation({position:preferences.restoreStatusBelow?'bottom':'top',restoreStatusBelow:false});
      else updatePresentation({position:'hidden',restoreStatusBelow:preferences.position==='bottom'});
      return;
    }
    if(e.target.closest('[data-show-diagnostic]')){
      updatePresentation({position:preferences.restoreStatusBelow?'bottom':'top',restoreStatusBelow:false});
      ui('.ugr-diagnostic').open=true;
      ui('.ugr-diagnostic summary').focus();
      return;
    }
    if(e.target.closest('[data-reset-title]')){updatePresentation({title:C.presentation().title});return;}
    if(e.target.closest('[data-select-all]')){updatePresentation({categories:C.categories});return;}
    const resetCategories=e.target.closest('[data-reset-categories]');
    if(resetCategories){
      updatePresentation({categories:C.presentation().categories});
      if(!settings.contains(resetCategories))ui('[data-personalize]').focus();
      return;
    }
    if(e.target.closest('[data-reset-presentation]')){
      state.tab='proximas';
      updatePresentation({...C.presentation(),restoreStatusBelow:false});
      return;
    }
    if(e.target.closest('[data-cancel]')){
      if(runningMode!=='all'||cancelled||stopped)return;
      cancelled=true;
      cancelSerial++;
      waitingLock?.abort();
      controllers.forEach(controller=>controller.abort());
      state.progress='Cancelando reverificación…';render();
      return;
    }
    const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;render();return;}
    if(e.target.closest('[data-refresh]')){load('refresh');return;}
    if(e.target.closest('[data-reverify-all]')){
      if((running&&runningMode!=='periodic')||stopped)return;
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
    if(id && !/^(forum|feedback):/.test(id) && state.store.manual[id]!==undefined)changeManual(id,true);
  });
  panel.addEventListener('change',e=>{
    const input=e.target;
    if(input.matches('[data-feedback-choice]')){
      const id=input.closest('li')?.dataset.id;
      if(!stopped&&id?.startsWith('feedback:')&&['','completed','not_completed'].includes(input.value))
        changeManual(id,input.value==='',input.value);
      return;
    }
    if(input===appearanceSelect){
      updatePresentation({appearance:input.value});
      return;
    }
    if(input.matches('[data-auto-refresh-minutes]')){
      updatePresentation({autoRefreshMinutes:Number(input.value)});
      return;
    }
    if(input.matches('[data-category]')){
      const categories=[...settings.querySelectorAll('[data-category]:checked')].map(box=>box.value);
      updatePresentation({categories});
      return;
    }
    const field=['course','mode','position','size','limit'].find(name=>input.hasAttribute(`data-${name}`));
    if(!field)return;
    if(field==='position'){
      updatePresentation({position:input.value,restoreStatusBelow:input.value==='hidden'&&preferences.position==='bottom'});
      return;
    }
    updatePresentation({[field]:field==='limit'?Number(input.value):input.value});
  });
  titleInput.addEventListener('input',()=>updatePresentation({title:titleInput.value},true));
  titleInput.addEventListener('blur',()=>{titleInput.value=preferences.title;flushPresentation();});
  titleInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.isComposing){e.preventDefault();flushPresentation();}
  });
  settings.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    e.stopPropagation();
    ui('[data-personalize]').click();
    ui('[data-personalize]').focus();
  });
  const ref=document.querySelector('[data-block="calendar_upcoming"], .block_calendar_upcoming');
  if(ref?.parentNode)ref.before(panel);else(document.querySelector('#region-main')||document.querySelector('main')||document.body).prepend(panel);
  updateAppearance();
  systemDark.addEventListener('change',scheduleAppearance);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||stopped)return;
    if(presentationReady && !savingPreferences && Object.hasOwn(changes,presentationKey)){
      try{
        assertSession();
        savedPreferences=C.presentation(changes[presentationKey].newValue);
        if(applyPresentation(C.presentation({...savedPreferences,...pendingPreferences})))render();
      }catch{stop();}
    }
    if(running||(!Object.hasOwn(changes,historyKey)&&!Object.hasOwn(changes,stampKey)))return;
    navigator.locks?.request(lockName,async()=>{await readCache();schedulePeriodic();schedule();}).catch(()=>{});
  });
  window.addEventListener('pagehide',()=>{
    stopped=true;waitingLock?.abort();controllers.forEach(c=>c.abort());clearInterval(timer);clearTimeout(renderTimer);clearTimeout(preferenceTimer);schedulePeriodic();
    appearanceObserver.disconnect();
    cancelAnimationFrame(appearanceFrame);
    clearTimeout(appearanceSampleTimer);
    document.removeEventListener('visibilitychange',onAppearanceVisibility);
    systemDark.removeEventListener('change',scheduleAppearance);
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{
    if(stopped||!presentationReady)return;
    if(document.hidden){
      if(runningMode==='periodic')periodicInterrupted=true;
      schedulePeriodic();schedule();
      return;
    }
    try{
      assertSession();
      if(canRunPeriodic()&&Date.now()>=periodicDue())runPeriodic('visible');
      else{schedulePeriodic();load('normal',undefined,undefined,'visible');}
    }catch{stop();}
  });
  (async()=>{
    render();
    if(!session.userId){
      panel.hidden=false;
      fail('No se pudo identificar de forma fiable la cuenta. No se mostrará información guardada. Recarga Moodle.');
      return;
    }
    try{
      const data=await chrome.storage.local.get(presentationKey);
      assertSession();
      savedPreferences=C.presentation(data[presentationKey]);
      applyPresentation(savedPreferences);
    }catch(error){
      if(error.code==='ACCOUNT_CHANGED'){panel.hidden=false;stop();return;}
      ui('[data-presentation-error]').textContent='No se pudo leer la personalización guardada en Chrome.';
    }
    panel.hidden=false;
    presentationReady=true;
    try{
      await readCache();render();await load('normal',undefined,undefined,'startup');
      if(!stopped){periodicAnchor=Date.now();schedulePeriodic();render();}
    }catch(e){fail(e.message||'No se pudo leer el almacenamiento local.');}
    timer=setInterval(()=>{if(!stopped){try{assertSession();schedule();}catch{stop();}}},60000);
  })();
})();

