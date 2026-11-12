async (page, baseline=false) => {
  const origin='http://127.0.0.1:8765', context=page.context(), delayIds=['1','2','3'];
  const identity='<script>M.cfg={"userid":42};</script>';
  const loaded=async p=>p.waitForFunction(()=>document.querySelector('#ugr-panel')&&!document.querySelector('[data-refresh]').disabled);
  const waitFinal=async p=>p.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled&&
    /Actualización finalizada|Reverificación cancelada/.test(document.querySelector('.ugr-note').textContent),null,{timeout:65000});
  const report=async(p=page)=>JSON.parse(await p.locator('#ugr-diagnostics').textContent());
  const metrics=async()=>JSON.parse(await page.locator('#ugr-panel').getAttribute('data-metrics'));
  const readStore=()=>page.evaluate(()=>JSON.parse(localStorage.fixture));
  const clickAll=async(p=page)=>{
    await p.evaluate(()=>{window.confirm=()=>true;});
    await p.getByRole('button',{name:'Reverificar todo',exact:true}).click();
  };

  let mode='slow', calls={}, retriesActive=0, retryPeak=0, calendarCalls=0, lateResponses=0, rateStart=0, rateWait=0;
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};

  await page.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:8765'||localStorage.getItem('fixture'))return;
    const prefix='ugr2:'+location.origin+':42:', now=Date.now(), day=new Date();
    const months={},auto={};
    for(let i=-3;i<=2;i++){
      const m=new Date(day.getFullYear(),day.getMonth()+i,1);
      months[m.getFullYear()+'-'+(m.getMonth()+1)]={t:now-1000,items:[]};
    }
    const current=months[day.getFullYear()+'-'+(day.getMonth()+1)];
    for(let n=1;n<=41;n++){
      const id=String(n),mod=n===41?'forum':'assign';
      current.items.push({id,cmid:id,mod,name:'Actividad '+n,courseId:2,course:'Fixture',due:Math.floor(now/1000)+3600+n,
        synced:now-1000,url:location.origin+'/mod/'+mod+'/view.php?id='+id});
      auto[mod+':'+id]={done:true,source:mod==='forum'?'heuristic':'moodle',t:now-100};
    }
    localStorage.setItem('fixture',JSON.stringify({
      [prefix+'cache']:{schema:2,months,auto,updated:now-1000},
      [prefix+'manual:assign:3']:{done:false,t:now-100},
      [prefix+'settings']:{course:'all'},
      ['ugr2:'+location.origin+':99:settings']:{course:'other'}
    }));
  });

  await context.route(origin+'/lib/ajax/service.php?*',async route=>{
    const payload=route.request().postDataJSON();
    if(route.request().method()!=='POST'||payload?.length!==1||payload[0]?.methodname!=='core_calendar_get_calendar_monthly_view')throw Error('Calendario ficticio no autorizado');
    calendarCalls++;
    const {year,month}=route.request().postDataJSON()[0].args;
    const now=await page.evaluate(()=>Date.now());
    const day=new Date(now);
    const seeded=await page.evaluate(()=>Object.values(JSON.parse(localStorage.fixture)).find(v=>v.months).months);
    const events=year===day.getFullYear()&&month===day.getMonth()+1?
      seeded[year+'-'+month].items.map(it=>({id:it.id,name:it.name,modulename:it.mod,eventtype:'due',timestart:it.due,timesort:it.due,url:it.url,course:{id:2,fullname:'Fixture'}})):[];
    await route.fulfill({json:[{data:{weeks:[{days:[{events}]}]}}]}).catch(()=>{});
  });

  await context.route(origin+'/mod/assign/view.php?*',async route=>{
    if(route.request().method()!=='GET'||!/^\d+$/.test(route.request().url().split('id=')[1]))throw Error('Operación de actividad no autorizada');
    const id=route.request().url().split('id=')[1], attempt=(calls[id]??0)+1;
    calls[id]=attempt;
    const transient=delayIds.includes(id);
    if(transient&&attempt>1){retriesActive++;retryPeak=Math.max(retryPeak,retriesActive);}
    try{
      if(transient&&attempt===1&&mode==='slow'){
        await page.waitForTimeout(18000);
        lateResponses++;
      }else if(transient&&attempt===1&&mode==='rateLimit'){
        if(id==='1')rateStart=Date.now();
        await route.fulfill({status:429,headers:{'Retry-After':id==='1'?'1':'3'},body:'Fixture 429'});return;
      }else if(transient&&attempt===1&&mode!=='clear'){
        await route.fulfill({status:503,body:'Fixture 503'});return;
      }else if(transient&&attempt>1){
        if(mode==='rateLimit'&&id==='1')rateWait=Date.now()-rateStart;
        if(mode==='slow'&&id==='1')await page.waitForTimeout(16000);
        if(mode==='retryTimeout'&&id==='1')await page.waitForTimeout(27000);
        if(mode==='overlap'&&id==='1')await page.waitForTimeout(1500);
        if(mode==='partial'&&id!=='1'||mode==='none'){await route.fulfill({status:504,body:'Fixture 504'});return;}
        if(mode==='offline'){await route.abort('internetdisconnected');return;}
        if(mode==='session'){await route.fulfill({contentType:'text/html',body:'<body id="page-login-index"><form id="login"></form></body>'});return;}
        if(mode==='cancel'||mode==='close')await page.waitForTimeout(5000);
      }
      const submitted=!(mode==='slow'&&id==='2'&&attempt>1);
      await route.fulfill({contentType:'text/html',body:identity+(submitted?'<div class="submissionstatussubmitted">Submitted</div>':'<div class="submissionstatusnew">No submission</div>')});
    }catch{
      // El navegador puede haber abortado antes de que el servidor simulado termine.
    }finally{if(transient&&attempt>1)retriesActive--;}
  });

  await page.goto(origin);await loaded(page);
  const oldStore=await readStore(), before=await metrics();
  await clickAll();await waitFinal(page);
  const first=await report(), after=await metrics(), summary=first.lastRun;
  const benchmark={version:first.version,initial:summary.initialChecked??summary.checked,
    retries:summary.retriesAttempted??0,recovered:summary.recoveredAfterRetry??0,errors:summary.activityErrors,
    requests:after.requests-before.requests,durationMs:summary.durationMs};
  check(summary.checked===40,'40 actividades únicas');
  check(Object.keys(calls).length===40&&calendarCalls===6,'Seis meses y 40 páginas conocidas');
  if(baseline){
    check(benchmark.errors===3&&benchmark.requests===47&&delayIds.every(id=>calls[id]===1),'2.0.4 termina con tres timeouts');
    return {passed,benchmark};
  }

  check(summary.initialErrors===3&&summary.timeoutPhase.headers===3,'Tres timeouts iniciales en cabeceras');
  check(summary.retriesAttempted===3&&summary.recoveredAfterRetry===3&&summary.persistentErrors===0,'Una operación recupera las tres');
  check(Object.entries(calls).every(([id,n])=>n===(delayIds.includes(id)?2:1)),'Solo se repiten las tres fallidas');
  check(retryPeak===1&&summary.retryConcurrency===1,'Recuperación secuencial');
  check(summary.recoveryDurationMs>=15000&&summary.recoveryDurationMs<75000,'Respuesta posterior a 15 s es válida en recuperación');
  check(lateResponses===3&&first.activeFailures.length===0,'Respuestas tardías no reemplazan resultados');
  check(benchmark.requests===50,'43 lecturas de actividad, seis meses y una sesión');
  const saved=await readStore();
  const autoChanges=Object.values(saved).find(v=>v.changes).changes.filter(entry=>entry.type==='auto');
  check(autoChanges.length===1&&autoChanges[0].key==='assign:2'&&!autoChanges[0].value.done,'Solo retiro real modifica historial de estados');
  check(Object.entries(oldStore).every(([k,v])=>JSON.stringify(saved[k])===JSON.stringify(v)),'Base de datos 2.0.4, marcas y otra cuenta intactas');
  check(first.effective.completed.manual===0&&first.effective.completed.historical===1,'Marca negativa prevalece y foro conserva estado');

  const execute=async kind=>{mode=kind;calls={};retryPeak=0;await clickAll();await waitFinal(page);return report();};
  for(const [kind,recovered,errors] of [['partial',1,2],['none',0,3],['offline',0,3]]){
    const d=await execute(kind);
    check(d.lastRun.recoveredAfterRetry===recovered&&d.lastRun.persistentErrors===errors&&d.activeFailures.length===errors,kind+' conserva fallos finales');
    check(d.lastRun.retriesAttempted===3&&retryPeak===1&&Math.max(...Object.values(calls))===2,kind+' no reintenta indefinidamente');
  }
  const stale=await report();
  check(stale.effective.completed.staleAutomatic===1,'Entrega confirmada permanece en Entregadas con reconfirmación pendiente');
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  check(await page.locator('.ugr-item').filter({hasText:'Actividad 1'}).getByText(/Reconfirmación pendiente/).count()===1,'Aviso en la fila de la entrega');
  const retryTimeout=await execute('retryTimeout');
  const timeout=retryTimeout.activeFailures.find(f=>f.code==='TIMEOUT');
  check(retryTimeout.lastRun.persistentErrors===1&&timeout?.details.timeoutMs===25000&&timeout.details.phase==='headers','El plazo ampliado de recuperación también vence');

  mode='cancel';calls={};
  await clickAll();
  await page.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Recuperando'));
  check(!(await page.locator('#ugr-panel [role="status"]').textContent()).includes('Actualización finalizada'),'Recuperación sin final prematuro');
  await page.getByRole('button',{name:'Cancelar verificación'}).click();await waitFinal(page);
  check((await report()).lastRun.cancelled&&delayIds.filter(id=>calls[id]>1).length<=1,'Cancelar detiene la cola');
  const rate=await execute('rateLimit');
  check(rate.lastRun.retriesAttempted===1&&rate.lastRun.persistentErrors===2&&calls['1']===2&&calls['2']===1&&calls['3']===1,'429 solo se reintenta con espera corta indicada');
  check(rateWait>=1000,'Se espera el Retry-After indicado');
  delayIds.push('4','5','6','7');
  const cap=await execute('cap');
  check(cap.lastRun.retriesAttempted===6&&cap.lastRun.recoveryDeferred===1&&cap.lastRun.persistentErrors===1,'Límite de seis intentos de recuperación por ejecución');
  delayIds.splice(3);

  const second=await context.newPage();
  await second.goto(origin);await loaded(second);
  mode='clear';calls={};
  await Promise.all([clickAll(),clickAll(second)]);
  await Promise.all([waitFinal(page),waitFinal(second)]);
  const pair=[await report(),await report(second)];
  check(pair.some(d=>d.lastRun.shared)&&Object.keys(calls).length===40&&Math.max(...Object.values(calls))===1,'Dos pestañas comparten revisión exhaustiva');
  mode='overlap';calls={};
  await clickAll();
  await page.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Recuperando'));
  await second.getByRole('tab',{name:/^Entregadas/}).click();
  await second.locator('[data-reverify="assign:1"]').click();
  await Promise.all([waitFinal(page),waitFinal(second)]);
  check((await report(second)).lastRun.shared&&calls['1']===2,'Individual concurrente reutiliza recuperación de la otra pestaña');
  mode='close';calls={};
  await clickAll(second);
  await second.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Recuperando'));
  await second.close();
  await execute('clear');
  check((await report()).lastRun.checked===40,'Cerrar pestaña durante recuperación libera el bloqueo');

  const persisted=await readStore();
  await page.evaluate(()=>{chrome.storage.local.set=async()=>{throw Error('QUOTA_BYTES');};});
  await execute('clear');
  check(JSON.stringify(await readStore())===JSON.stringify(persisted)&&(await page.locator('.ugr-error').textContent()).includes('No se guardaron'),'Cuota rechazada sin pérdida ni confirmación de guardado');

  mode='session';calls={};
  await clickAll();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#ugr-diagnostics').textContent).lastRun.retriesAttempted===1 &&
    document.querySelector('.ugr-note').textContent==='Sincronización detenida.');
  check((await report()).activeFailures.some(f=>f.code==='SESSION_EXPIRED')&&delayIds.filter(id=>calls[id]>1).length===1,'Sesión caducada detiene recuperación y oculta datos');
  return {passed,benchmark};
}
