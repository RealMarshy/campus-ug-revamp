async (page, baseline=false)=>{
  const origin='http://127.0.0.1:8765', context=page.context();
  const identity='<script>M.cfg={"userId":42};</script>';
  const valid=identity+'<div class="submissionstatussubmitted">Enviado</div>';
  const login='<body id="page-login-index"><form id="login"></form></body>';
  const calls=new Map(), held=[];
  let faults={}, requests=0, calendar=0, passed=0, activityCount=46, pendingTimeout;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const diag=async()=>JSON.parse(await page.locator('#ugr-diagnostics').textContent());
  const final=()=>page.waitForFunction(()=>{
    const node=document.querySelector('#ugr-diagnostics');
    return node&&JSON.parse(node.textContent).lastRun.durationMs!==undefined&&
      (!document.querySelector('[data-refresh]').disabled||document.querySelector('.ugr-note').textContent.startsWith('Sincronización detenida'));
  },null,{timeout:85000});
  const reset=async(next,count=46)=>{
    for(const release of held.splice(0))release();
    if(page.url().startsWith(origin))await page.evaluate(()=>localStorage.removeItem('fixture'));
    calls.clear();requests=0;calendar=0;faults=next;activityCount=count;
    await page.goto(origin);
    await final();
    const d=await diag(), metrics=JSON.parse(await page.locator('#ugr-panel').getAttribute('data-metrics'));
    return {d,metrics,run:d.lastRun,requests,calendar,activity:[...calls.values()].reduce((sum,n)=>sum+n,0)};
  };
  await context.route(origin+'/my/',route=>{
    requests++;
    return route.fulfill({body:faults.session?login:identity});
  });
  await context.route(origin+'/lib/ajax/service.php?*',route=>{
    const req=route.request(), [call]=req.postDataJSON();
    if(req.method()!=='POST'||call.methodname!=='core_calendar_get_calendar_monthly_view')throw Error('Operación no permitida');
    requests++;calendar++;
    const now=new Date(), events=call.args.month===now.getMonth()+1?Array.from({length:activityCount},(_,i)=>{
      const id=i+1, mod=activityCount===46&&id>42?'forum':'assign';
      return {id,name:'Actividad ficticia '+id,modulename:mod,eventtype:'due',timesort:Math.floor(Date.now()/1000)+3600+id,
        url:origin+'/mod/'+mod+'/view.php?id='+id,course:{id:1,fullname:'Curso ficticio'}};
    }):[];
    return route.fulfill({json:[{data:{weeks:[{days:[{events}]}]}}]});
  });
  await context.route(origin+'/mod/assign/view.php?*',async route=>{
    const req=route.request(), id=Number(req.url().split('id=')[1]);
    if(req.method()!=='GET'||!Number.isInteger(id))throw Error('Operación no permitida');
    requests++;
    const attempt=(calls.get(id)??0)+1;calls.set(id,attempt);
    const failure=faults[id]?.[attempt-1];
    try{
      if(failure==='timeout'){
        await new Promise(resolve=>{held.push(resolve);pendingTimeout?.();});
        return await route.abort();
      }
      if(failure==='network')return await route.abort('internetdisconnected');
      if(failure==='conflict')return await route.fulfill({body:valid+'<script>M.cfg={"userId":99};</script>'});
      if(failure==='unknown')return await route.fulfill({body:identity+'<main>Estado nuevo</main>'});
      if(failure)return await route.fulfill({status:failure.status??failure,headers:failure.headers,body:'Fallo ficticio'});
      await route.fulfill({body:valid});
    }catch{}
  });
  const sample=x=>({requests:x.requests,initial:x.run.checked,retries:x.run.retriesAttempted,recovered:x.run.recoveredAfterRetry,
    persistent:x.run.persistentErrors,initialMs:x.run.initialDurationMs,recoveryMs:x.run.recoveryDurationMs,
    totalMs:x.run.durationMs,firstContentMs:x.metrics.firstContentMs});
  const cold=await reset({1:['timeout']});
  check(cold.run.newActivities===46&&cold.run.checked===42&&cold.calendar===6,'Carga limpia de 46 actividades y 42 comprobaciones');
  check(cold.run.retriesAttempted===(baseline?0:1)&&cold.run.recoveredAfterRetry===(baseline?0:1)&&
    cold.run.persistentErrors===(baseline?1:0)&&calls.get(1)===(baseline?1:2)&&cold.requests===(baseline?49:50),'Solo se repite el timeout inicial');
  check(cold.d.recentIncidents.some(x=>x.code==='TIMEOUT'&&x.round==='initial')&&cold.d.activeFailures.length===(baseline?1:0),
    'La incidencia histórica se conserva aunque el fallo activo se resuelva');
  const healthy=await reset({});
  check(healthy.activity===42&&healthy.requests===49&&healthy.run.retriesAttempted===0,'Cero solicitudes adicionales sin errores');
  const comparison={cold:sample(cold),healthy:sample(healthy)};
  if(baseline)return {passed,comparison};

  const three=await reset({1:['timeout'],2:['timeout'],3:['timeout']});
  check(three.run.timeoutPhase.headers===3&&three.run.recoveredAfterRetry===3&&three.activity===45,'Tres timeouts simultáneos se recuperan de forma selectiva');
  const partial=await reset({1:[502],2:[503,504],3:[504]},5);
  check(partial.run.retriesAttempted===3&&partial.run.recoveredAfterRetry===2&&partial.run.persistentErrors===1,'502, 503 y 504 permiten recuperación parcial');
  const failed=await reset({1:['network','network'],2:[503,503],3:['unknown']},4);
  check(failed.run.retriesAttempted===2&&failed.run.persistentErrors===3&&failed.d.activeFailures.length===3,'Solo los fallos transitorios persistentes reciben un reintento');
  const beforeBackoff=requests;
  await page.locator('[data-refresh]').click();await final();
  check((await diag()).lastRun.skipped===3&&requests-beforeBackoff===4&&calls.get(1)===2,'Actualizar respeta backoff y reutiliza entregas');
  const limited=await reset(Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,[503]])),8);
  check(limited.run.retriesAttempted===6&&limited.run.recoveryDeferred===2&&limited.run.persistentErrors===2,'Máximo de seis actividades por ejecución');
  const rate=await reset({1:[{status:429,headers:{'Retry-After':'1'}}],2:[{status:429,headers:{'Retry-After':'600'}}],
    3:[429],4:[{status:429,headers:{'Retry-After':'incorrecto'}}]},4);
  check(rate.run.retriesAttempted===1&&rate.run.recoveryDurationMs>=900&&rate.run.persistentErrors===3,'429 solo con Retry-After válido y corto');
  const conflict=await reset({1:[503],2:['conflict']},2);
  check(conflict.run.retriesAttempted===0&&conflict.d.activeFailures.some(x=>x.code==='IDENTITY_CONFLICT'),'Conflicto de identidad impide despachar la cola');
  await reset({session:true},2);
  check(requests===1&&calls.size===0,'Sesión caducada impide consultas de actividades');
  await reset({},2);
  activityCount=3;faults[3]=['timeout'];
  await page.locator('[data-refresh]').click();await final();
  const refresh=(await diag()).lastRun;
  check(refresh.mode==='refresh'&&refresh.recoveredAfterRetry===1&&calls.get(3)===2&&calls.get(1)===1,
    'Actualizar recupera un timeout sin releer la entrega vigente');
  faults[1]=[null,503];
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  await page.locator('[data-reverify="assign:1"]').click();await final();
  const individual=(await diag()).lastRun;
  check(individual.mode==='one'&&individual.persistentErrors===1&&individual.retriesAttempted===0&&calls.get(1)===2,
    'Reverificación individual conserva una sola solicitud');

  await page.clock.install();
  await page.locator('[data-personalize]').click();
  await page.locator('[data-auto-refresh-minutes]').selectOption('0');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#ugr-diagnostics').textContent).autoRefreshIntervalMinutes===0);
  activityCount=4;faults[4]=['timeout'];
  await page.clock.fastForward(16*60000);
  const visibleTimeout=new Promise(resolve=>{pendingTimeout=resolve;});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await visibleTimeout;
  await page.clock.fastForward(15005);
  await final();
  const normal=(await diag()).lastRun;
  check(normal.mode==='normal'&&normal.trigger==='visible'&&normal.timeoutPhase.headers===1&&normal.recoveredAfterRetry===1&&calls.get(4)===2,
    'Sincronización al volver a la pestaña recupera un timeout');

  await page.evaluate(()=>localStorage.removeItem('fixture'));
  faults=Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,[503,'timeout']]));
  activityCount=8;calls.clear();
  let nextTimeout=new Promise(resolve=>{pendingTimeout=resolve;});
  await page.reload();
  for(let i=0;i<3;i++){
    await nextTimeout;
    nextTimeout=new Promise(resolve=>{pendingTimeout=resolve;});
    await page.clock.fastForward(25005);
  }
  await final();
  const budget=(await diag()).lastRun;
  check(budget.retriesAttempted<=3&&budget.recoveryDeferred>=5&&budget.recoveryDurationMs>=74900&&budget.recoveryDurationMs<75100&&
    budget.timeoutPhase.headers===budget.retriesAttempted,'El presupuesto de 75 s detiene la cola tras agotar los plazos');
  pendingTimeout=undefined;
  for(const release of held.splice(0))release();
  return {passed,comparison};
}
