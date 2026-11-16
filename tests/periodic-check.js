async (page,baseline)=>{
  const openDeveloper=async()=>{
    const section=page.locator('[data-developer]');
    if(await section.count() && await section.getAttribute('open')===null)await section.locator(':scope > summary').click();
  };
  const origin='http://127.0.0.1:8765', context=page.context(), minute=60000, start=Date.UTC(2026,10,11,15);
  const wire=[], cases=new Set(), measurements={};
  const accounts=new Map(), expired=new Set(), activityErrors=new Map(), calendarErrors=new Map();
  const active=new Map();
  let published=false, eventName='', calendarGate, activityGate, retryGate, peak=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const pass=(n,ok,label)=>{check(ok,n+' · '+label);cases.add(n);};
  const account=p=>accounts.get(p)??42;
  const identity=id=>'<script>window.M={cfg:{"userId":'+id+'}};</script>';
  const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
  const hold=(count=1)=>({left:count,entered:defer(),release:defer(),completed:[]});
  const delay=async gate=>{
    if(!gate||gate.left<=0)return;
    if(--gate.left===0)gate.entered.resolve();
    await gate.release.promise;
  };
  const reply=async(route,options)=>{
    try{await route.fulfill(options);}catch{}
    finally{const user=account(route.request().frame().page());active.set(user,active.get(user)-1);}
  };
  const record=(kind,route,extra={})=>{
    const p=route.request().frame().page();
    const user=account(p), count=(active.get(user)??0)+1;
    wire.push({kind,user,...extra});
    active.set(user,count);peak=Math.max(peak,count);
    return p;
  };
  const event=(id,mod='assign')=>({id,name:id===3&&eventName?eventName:'Actividad ficticia '+id,
    eventtype:'due',modulename:mod,timesort:start/1000+86400+id*60+(id===3&&eventName?3600:0),
    url:origin+'/mod/'+mod+'/view.php?id='+id,course:{id:id%2+1,fullname:'Curso ficticio '+(id%2+1)}});
  await context.route(origin+'/',async route=>{
    const id=account(route.request().frame().page());
    if(id===42)return route.fallback();
    const fixture=await route.fetch();
    return route.fulfill({response:fixture,body:(await fixture.text()).replace('"userId":42','"userId":'+id)});
  });
  await context.route(origin+'/my/',route=>{
    const p=record('session',route);
    return reply(route,{body:expired.has(p)?'<body id="page-login-index"><form id="login"></form></body>':identity(account(p))});
  });
  await context.route(origin+'/lib/ajax/service.php?*',async route=>{
    const req=route.request(), calls=req.postDataJSON();
    check(req.method()==='POST'&&calls.length===1&&calls[0].methodname==='core_calendar_get_calendar_monthly_view','Operación de calendario permitida');
    const month=calls[0].args.month;
    record('calendar',route,{month});
    const gate=calendarGate;
    if(gate?.month===month)await delay(gate);
    const fault=calendarErrors.get(month);
    const events=month===11?[event(1),event(2,'quiz'),event(3),event(4,'forum'),...(published?[event(5),event(6)]:[])]:[];
    await reply(route,fault?{status:fault.status,headers:fault.headers,body:'Fallo ficticio'}:
      {json:[{data:{weeks:[{days:[{events}]}]}}]});
    gate?.completed.push(month);
  });
  await context.route(origin+'/mod/*/view.php?*',async route=>{
    const req=route.request(), url=req.url(), id=Number(url.split('id=')[1]);
    check(req.method()==='GET'&&!url.includes('/forum/')&&Number.isSafeInteger(id),'Solo comprobaciones HTML de lectura');
    const p=record('activity',route,{id});
    await delay(activityGate);
    const fault=activityErrors.get(id);
    if(fault?.once)activityErrors.delete(id);
    if(!fault&&retryGate)await delay(retryGate);
    const status=id===1?'<div class="submissionstatussubmitted"></div>':id===2?
      '<table class="quizattemptsummary"><thead><tr><th>Estado</th></tr></thead><tbody><tr><td>Finalizado</td></tr></tbody></table>':'<div class="submissionstatusnew"></div>';
    await reply(route,fault?{status:fault.status,headers:fault.headers,body:'Fallo ficticio'}:{body:identity(account(p))+status});
  });
  await context.addInitScript(()=>{
    let hidden=false;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    document.addEventListener('visibilitychange',event=>{if(event.isTrusted)event.stopImmediatePropagation();},true);
    window.setFixtureHidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
  });
  const diag=async(p=page)=>JSON.parse(await p.locator('#ugr-diagnostics').textContent());
  const idle=async(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
    document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'),null,{timeout:10000});
  const periodic=async(previous=0,p=page)=>p.waitForFunction(previous=>{
    const d=JSON.parse(document.querySelector('#ugr-diagnostics').textContent);
    return d.lastPeriodicRun>previous&&d.lastPeriodicResult?.startedAt===d.lastPeriodicRun;
  },previous,{timeout:10000});
  const setting=(name,p=page)=>p.locator('[data-'+name+']');
  const button=(mode,p=page)=>p.evaluate(mode=>{
    window.confirm=()=>true;
    document.querySelector(mode==='all'?'[data-reverify-all]':'[data-refresh]').click();
  },mode);
  const finished=async(mode,p=page)=>p.waitForFunction(mode=>{
    const d=JSON.parse(document.querySelector('#ugr-diagnostics').textContent);
    return d.lastRun.mode===mode&&d.lastRun.durationMs!==undefined&&!document.querySelector('[data-refresh]').disabled;
  },mode,{timeout:10000});
  const jump=ms=>page.clock.fastForward(ms);
  const visibility=(hidden,p=page)=>p.evaluate(hidden=>window.setFixtureHidden(hidden),hidden);
  const store=(p=page)=>p.evaluate(()=>JSON.parse(localStorage.fixture));
  const metrics=async(p=page)=>JSON.parse(await p.locator('#ugr-panel').getAttribute('data-metrics'));
  const delta=from=>{const log=wire.slice(from);return {http:log.length,calendar:log.filter(x=>x.kind==='calendar').length,
    checks:log.filter(x=>x.kind==='activity').length,sessions:log.filter(x=>x.kind==='session').length};};
  const shown=(id,p=page)=>p.locator('.ugr-list a[href$="?id='+id+'"]').count();
  const init=async(p=page,who=42)=>{
    accounts.set(p,who);
    if(p===page)await page.clock.install({time:start});
    await p.goto(origin);await idle(p);
  };
  const reset=async()=>{
    published=false;eventName='';calendarGate=activityGate=retryGate=null;activityErrors.clear();calendarErrors.clear();expired.clear();
    await page.evaluate(()=>localStorage.removeItem('fixture'));
    await page.clock.setSystemTime(start);
    await page.reload();await idle();
  };
  const open=async()=>{
    if(await setting('personalize').getAttribute('aria-expanded')==='false')await setting('personalize').click();
  };
  const frequency=async n=>{
    await open();
    await openDeveloper();
    await setting('auto-refresh-minutes').selectOption(String(n));
    await page.waitForFunction(n=>JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':42:presentation']?.autoRefreshMinutes===n,n);
  };
  const tick=async(ms,p=page)=>{
    const prior=(await diag(p)).lastPeriodicRun??0;
    await jump(ms);await periodic(prior,p);
    return (await diag(p)).lastPeriodicResult;
  };

  await init();
  const hourly=async minutes=>{
    const initial=await metrics();
    if(!baseline&&minutes!==10)await frequency(minutes);
    const before=wire.length;
    await jump(5*minute);published=true;
    const firstAppearance=await shown(5);
    if(baseline)await jump(55*minute);
    let firstRun;
    if(!baseline)for(let t=minutes;t<=60;t+=minutes){
      const result=await tick((t===minutes?t-5:minutes)*minute);
      firstRun??=result;
    }
    const hour=delta(before), beforeManual=wire.length;
    const completedReads=wire.slice(before).filter(x=>x.kind==='activity'&&[1,2].includes(x.id)).length;
    const newRows=await shown(5)+await shown(6);
    await button('refresh');await finished('refresh');
    return {initialHttp:initial.requests,initialContentMs:initial.firstContentMs,hour,newRows,firstAppearance,firstRun,completedReads,
      manual:{...delta(beforeManual),durationMs:(await diag()).lastRun.durationMs}};
  };
  if(baseline){
    const result=await hourly(10);
    check(result.hour.http===0&&result.newRows===0&&result.manual.calendar===3,'2.0.7 sin temporizador y con actualización manual');
    return {passed:1,reference:result};
  }

  const startup=await diag();
  pass(1,startup.autoRefreshEnabled&&startup.autoRefreshIntervalMinutes===10&&startup.nextPeriodicRun!==null&&startup.lastRun.trigger==='startup','Configuración inicial de diez minutos');
  measurements[10]=await hourly(10);
  const ten=measurements[10];
  pass(5,ten.firstAppearance===0,'Publicación a los cinco minutos sin consulta inmediata');
  pass(6,ten.newRows===2&&ten.firstRun.newActivities===2&&ten.firstRun.calendarRequested===3,'Descubrimiento en el primer ciclo');
  pass(7,ten.hour.calendar===18&&(await diag()).lastPeriodicResult.newActivities===0,'Seis ciclos recientes y calendario sin cambios al final');
  pass(8,ten.completedReads===0&&ten.firstRun.checked===3,'Entregas vigentes reutilizadas, sin revisar foros');
  pass(9,ten.firstRun.checked===3,'Pendiente caducada y dos altas verificadas');
  pass(12,ten.firstRun.mode==='periodic'&&ten.firstRun.trigger==='timer'&&!ten.firstRun.manual,'Modo periódico en pestaña visible');
  await reset();measurements[15]=await hourly(15);
  pass(2,measurements[15].hour.calendar===12&&measurements[15].newRows===2,'Cuatro ciclos de quince minutos');
  await reset();measurements[30]=await hourly(30);
  pass(3,measurements[30].hour.calendar===6&&measurements[30].newRows===2,'Dos ciclos de treinta minutos');

  await reset();
  await frequency(0);
  const disabled=wire.length;await jump(60*minute);
  pass(4,wire.length===disabled&&(await diag()).nextPeriodicRun===null&&!(await diag()).autoRefreshEnabled,'Desactivar evita solicitudes periódicas');
  await page.reload();await idle();await open();
  pass(27,await setting('auto-refresh-minutes').inputValue()==='0'&&(await diag()).nextPeriodicRun===null,'Recarga conserva desactivación');
  await frequency(15);
  const preserved=(await store())['ugr2:'+origin+':42:presentation'];
  await page.reload();await idle();await open();
  pass(28,await setting('auto-refresh-minutes').inputValue()==='15'&&preserved.schema===1,'Frecuencia persistida en el esquema anterior');
  const beforeVisual=wire.length;
  await page.getByLabel('Tamaño del panel').selectOption('wide');
  await setting('course').selectOption('2');
  await setting('limit').selectOption('5');
  pass(33,wire.length===beforeVisual&&(await diag()).autoRefreshIntervalMinutes===15,'Preferencias visuales sin red y un temporizador de la frecuencia vigente');

  await reset();
  await visibility(true);const hidden=wire.length;published=true;
  await jump(60*minute);
  pass(13,wire.length===hidden&&(await diag()).nextPeriodicRun===null,'Pestaña oculta durante una hora');
  await visibility(false);await periodic();
  pass(14,delta(hidden).calendar===3&&(await diag()).lastPeriodicResult.trigger==='visible','Regreso ejecuta una sola evaluación');
  const afterShow=wire.length;await jump(minute);
  pass(34,wire.length===afterShow,'Sin ciclos acumulados al regresar');
  const beforeSuspension=wire.length;
  await tick(60*minute);
  pass(15,delta(beforeSuspension).calendar===3,'Salto del reloj visible ejecuta un solo ciclo');
  await visibility(true);const beforeHistorical=wire.length;
  await jump(24*60*minute+minute);
  const lastVisible=(await diag()).lastPeriodicRun;
  await visibility(false);await periodic(lastVisible);
  check(delta(beforeHistorical).calendar===6&&delta(beforeHistorical).sessions===1,
    'El retorno vencido comparte una evaluación con los meses históricos que caducaron');

  await reset();
  const beforeHistory=(await store())['ugr2:'+origin+':42:history'].changes;
  const fault={status:503};
  activityErrors.set(3,fault);
  calendarErrors.set(12,{status:429,headers:{'Retry-After':'1200'}});
  const failed=await tick(10*minute);
  calendarErrors.clear();activityErrors.clear();
  eventName='Metadatos ficticios modificados';
  const recovered=await tick(10*minute);
  pass(10,failed.activityErrors===1&&recovered.recovered.assign===1,'Estado con HTTP 503 recuperado en el siguiente ciclo');
  pass(11,recovered.calendarWaiting===1&&recovered.calendarRequested===2,'Retry-After mantiene el mes en espera');
  pass(24,failed.calendarErrors===1&&failed.activityErrors===1&&await page.getByRole('link',{name:eventName}).count()===1,'HTTP clasificado y metadatos actualizados');
  const history=(await store())['ugr2:'+origin+':42:history'].changes;
  pass(29,JSON.stringify(history.slice(0,beforeHistory.length))===JSON.stringify(beforeHistory),'Historial previo conservado');
  const forum=page.getByRole('tab',{name:/Pendientes/});
  await forum.click();
  pass(30,await shown(4)===1&&!wire.some(x=>x.kind==='activity'&&x.id===4),'Foro manual sin consultas HTML');

  await reset();
  let other=await context.newPage();
  await init(other,42);
  const twoTabs=wire.length;
  await jump(10*minute);
  await Promise.race([periodic(),periodic(0,other)]);
  pass(16,delta(twoTabs).calendar===3&&delta(twoTabs).sessions===1,'Dos pestañas visibles realizan un solo ciclo');
  measurements.twoTabs=delta(twoTabs);
  await other.close();await reset();
  other=await context.newPage();
  await init(other,99);
  const twoUsers=wire.length;
  await jump(10*minute);
  await Promise.all([periodic(),periodic(0,other)]);
  pass(17,[42,99].every(id=>wire.slice(twoUsers).filter(x=>x.user===id&&x.kind==='calendar').length===3),
    'Cuentas distintas coordinan por separado');
  await other.close();await reset();

  const interrupt=async mode=>{
    const gate=hold();activityGate=gate;
    const before=wire.length;
    await jump(10*minute);await gate.entered.promise;
    check(!(await setting(mode==='all'?'reverify-all':'refresh').isDisabled()),'Botón manual activo durante el ciclo');
    await button(mode);
    gate.release.resolve();activityGate=null;
    await finished(mode);
    return {d:await diag(),cost:delta(before)};
  };
  let manual=await interrupt('refresh');
  pass(18,manual.d.lastPeriodicResult.interrupted&&manual.d.lastRun.calendarShared===3&&manual.cost.calendar===3,
    'Actualizar cede prioridad y reutiliza calendario ya descargado');
  await reset();manual=await interrupt('all');
  pass(19,manual.d.lastPeriodicResult.interrupted&&manual.d.lastRun.mode==='all'&&manual.d.lastRun.calendarRequested===6,
    'Reverificar todo se ejecuta después del ciclo interrumpido');

  await reset();
  other=await context.newPage();
  await init(other,42);
  await visibility(true,other);
  const priority=hold(), beforePriority=wire.length;
  calendarGate={...priority,month:11};
  await jump(10*minute);await priority.entered.promise;
  // Give both documents the same instant after earlier cases rewound Playwright's clock.
  const instant=await page.evaluate(()=>Date.now()+100);
  const useInstant=at=>Promise.all([page,other].map(tab=>tab.evaluate(at=>{
    Date.now=()=>at;
    Object.defineProperties(performance,{
      timeOrigin:{configurable:true,value:at},
      now:{configurable:true,value:()=>0},
    });
  },at)));
  await useInstant(instant);
  await visibility(false,other);
  await button('refresh',other);
  await other.waitForFunction(async()=> (await navigator.locks.query()).held.some(lock=>lock.name==='campus-ug-revamp:42:manual'));
  await useInstant(instant+1000);
  priority.release.resolve();
  await finished('refresh',other);
  const waitingManual=await diag(other), yielded=await diag();
  check(yielded.lastPeriodicResult.interrupted&&yielded.lastPeriodicResult.checked===0&&
    waitingManual.lastRun.calendarShared===3&&delta(beforePriority).calendar===3,
  'Una petición manual en otra pestaña recibe prioridad: '+JSON.stringify({
    interrupted:yielded.lastPeriodicResult.interrupted,checked:yielded.lastPeriodicResult.checked,
    shared:waitingManual.lastRun.calendarShared,calendar:delta(beforePriority).calendar,
  }));
  measurements.crossTabManual=delta(beforePriority);
  await other.close();

  await reset();
  const inFlight=hold();calendarGate={...inFlight,month:11};
  const ordering=calendarGate;
  await jump(10*minute);await inFlight.entered.promise;
  await frequency(15);published=true;
  await setting('course').selectOption('2');
  await page.waitForFunction(()=>document.querySelector('[data-course]').value==='2');
  await page.waitForTimeout(40);
  inFlight.release.resolve();
  await periodic();calendarGate=null;
  const reordered=(await diag()).lastPeriodicResult;
  pass(20,(await diag()).autoRefreshIntervalMinutes===15&&reordered.calendarRequested===3,'Cambio de frecuencia con consulta activa');
  pass(25,ordering.completed.length===3&&ordering.completed.at(-1)===11,'Respuestas fuera de orden');
  pass(35,await setting('course').inputValue()==='2'&&reordered.mode==='periodic','Filtro conservado durante el ciclo');
  const beforeChanged=wire.length;await jump(10*minute);
  check(wire.length===beforeChanged,'El temporizador anterior fue sustituido');
  await tick(5*minute);

  await reset();
  const pending=hold();calendarGate={...pending,month:11};
  await jump(10*minute);await pending.entered.promise;
  await frequency(0);
  pending.release.resolve();await periodic();
  const off=wire.length;await jump(30*minute);
  pass(21,wire.length===off&&(await diag()).nextPeriodicRun===null,'Desactivar durante una consulta elimina la siguiente ejecución');
  pass(26,(await diag()).lastPeriodicResult.interrupted&&(await diag()).lastPeriodicResult.checked===0,'Cancelar el trabajo pendiente del ciclo');

  await reset();
  await page.evaluate(()=>{const script=[...document.scripts].find(s=>s.textContent.includes('"userId":42'));
    script.textContent=script.textContent.replace('"userId":42','"userId":99');});
  const accountChanged=wire.length;
  await jump(10*minute);
  await page.waitForFunction(()=>document.querySelector('.ugr-error').textContent.includes('sesión'));
  pass(22,wire.length===accountChanged&&(await diag()).nextPeriodicRun===null,'Cambio de cuenta detiene el temporizador antes de la red');

  await reset();expired.add(page);
  const session=wire.length;await jump(10*minute);
  await page.waitForFunction(()=>document.querySelector('.ugr-error').textContent.includes('Sesión caducada'));
  pass(23,delta(session).sessions===1&&delta(session).calendar===0&&(await diag()).nextPeriodicRun===null,'Sesión caducada evita consultas académicas');

  await reset();activityErrors.set(3,{status:503,once:true});
  await button('all');await finished('all');
  const exhaustive=(await diag()).lastRun;
  pass(31,exhaustive.retriesAttempted===1&&exhaustive.recoveredAfterRetry===1,'La recuperación exhaustiva se conserva');
  pass(32,!wire.some(x=>x.kind==='activity'&&x.id===4)&&peak<=3,'Métodos de lectura y límite de concurrencia');
  await reset();
  for(const id of [3,5,6])activityErrors.set(id,{status:503,once:true});
  published=true;
  const recoveryStart=wire.length, bounded=await tick(10*minute);
  pass(36,bounded.retriesAttempted===2&&bounded.recoveredAfterRetry===2&&bounded.recoveryDeferred===1&&
    delta(recoveryStart).calendar===3&&delta(recoveryStart).checks===5,'Recuperación periódica limitada a dos, sin calendario adicional');
  await reset();
  for(const id of [3,5,6])activityErrors.set(id,{status:503,once:true});
  published=true;
  const manualGate=hold();retryGate=manualGate;
  await jump(10*minute);await manualGate.entered.promise;
  await button('refresh');manualGate.release.resolve();retryGate=null;
  await finished('refresh');
  const manualRecovery=await diag();
  pass(38,manualRecovery.lastPeriodicResult.interrupted&&manualRecovery.lastPeriodicResult.retriesAttempted===1&&
    manualRecovery.lastRun.calendarShared===3,'Actualizar recibe prioridad durante la recuperación periódica');
  await reset();
  for(const id of [3,5,6])activityErrors.set(id,{status:503,once:true});
  published=true;
  const gate=hold();retryGate=gate;
  const hiddenRecovery=wire.length;
  await jump(10*minute);await gate.entered.promise;
  await visibility(true);gate.release.resolve();await periodic();
  const stoppedRecovery=(await diag()).lastPeriodicResult;
  pass(37,stoppedRecovery.interrupted&&stoppedRecovery.retriesAttempted===1&&
    delta(hiddenRecovery).checks===4,'Ocultar durante la recuperación detiene nuevos reintentos');
  check(cases.size===38,'Cobertura completa: '+[...cases].sort((a,b)=>a-b).join(','));
  return {passed:cases.size+2,cases:[...cases].sort((a,b)=>a-b),measurements,peak};
}
