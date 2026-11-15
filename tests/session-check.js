async (page, baseline=false)=>{
  const origin='http://127.0.0.1:8765', context=page.context();
  const valid='<script>M={cfg:{"userId":42}}</script>';
  const responses={
    ok:{body:valid}, redirect:{status:302,headers:{location:'/login/index.php'},body:''},
    expired:{body:'<body id="page-login-index"><form id="login"><input type="password"></form></body>'},
    other:{body:valid.replace('42','99')}, conflict:{body:valid+'<script>const data={"userid":99};</script>'},
    http:{status:503,body:'Fixture 503'}
  };
  let mode='ok', probes=0, gate, entered, passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  await context.route(origin+'/my/',async route=>{
    probes++;
    if(gate){entered();await gate;}
    if(mode==='network')return route.abort('failed');
    return route.fulfill(responses[mode]);
  });
  await page.addInitScript(()=>{
    window.fixturePaint={};
    const observer=new MutationObserver(()=>{
      const panel=document.querySelector('#ugr-panel');
      if(panel&&!fixturePaint.panelMs)fixturePaint.panelMs=performance.now();
      const row=panel?.querySelector('.ugr-list .ugr-item');
      if(row&&row.getClientRects().length&&!fixturePaint.firstRowMs){
        fixturePaint.firstRowMs=performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document,{childList:true,subtree:true});
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const diag=(p=page)=>p.locator('#ugr-diagnostics').textContent().then(JSON.parse);
  const idle=(p=page)=>p.waitForFunction(()=>{
    const text=document.querySelector('.ugr-note').textContent;
    return /finalizada|en espera|detenida|redirección sigue bloqueada/i.test(text)&&!document.querySelector('#ugr-panel[hidden]');
  });
  const button=(p=page)=>p.locator('[data-refresh]');
  const clickAll=async()=>{
    await page.evaluate(()=>{window.confirm=()=>true;});
    await page.getByRole('button',{name:'Reverificar todo'}).click();await idle();
  };
  const sessionCode=async(p=page)=>(await diag(p)).activeFailures.find(f=>f.stage==='session')?.code;
  const stats=()=>page.request.get(origin+'/stats').then(r=>r.json());
  const visible=()=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.goto(origin);await idle();
  await page.evaluate(()=>{
    const items=JSON.parse(localStorage.fixture);
    const prefix='ugr2:'+location.origin+':42:';
    items[prefix+'presentation']={schema:1,autoRefreshMinutes:0,position:'below'};
    items[prefix+'manual:assign:4']={done:true,t:Date.now()-100};
    localStorage.fixture=JSON.stringify(items);
  });
  const original=await page.evaluate(()=>JSON.parse(localStorage.fixture));
  const benchmark={};
  async function sample(label){
    const before=(await cdp.send('Performance.getMetrics')).metrics.find(x=>x.name==='ScriptDuration').value;
    await page.reload();await idle();
    const after=(await cdp.send('Performance.getMetrics')).metrics.find(x=>x.name==='ScriptDuration').value;
    const values=await page.evaluate(()=>{
      const {panelMs,firstRowMs}=fixturePaint;
      return {panelMs,firstRowMs,
        ...JSON.parse(document.querySelector('#ugr-panel').dataset.metrics)};
    });
    (benchmark[label]??=[]).push({...values,scriptMs:(after>=before?after-before:after)*1000});
  }
  for(let i=0;i<3;i++)await sample('warm');
  mode='redirect';
  await button().click();await idle();
  check(await sessionCode()==='REDIRECT','La redirección de sesión no se sigue');
  for(let i=0;i<3;i++)await sample('blocked');
  const beforeAuto=probes;
  await visible();await idle();
  check(probes===beforeAuto,'La sincronización automática respeta el backoff');
  mode='ok';
  // The next calendar read includes a newly published synthetic assignment.
  await page.request.get(origin+'/mode?value=new');
  const beforeRecover=probes, beforeRecoveryStats=await stats();
  await button().click();await idle();
  const afterRecoveryStats=await stats();
  benchmark.manualRecovery={session:probes-beforeRecover,calendar:afterRecoveryStats.months-beforeRecoveryStats.months,
    activities:afterRecoveryStats.checks-beforeRecoveryStats.checks};
  if(baseline){
    check(probes===beforeRecover&&await sessionCode()==='REDIRECT'&&(await diag()).lastRun.calendarRequested===0,'2.5.0 reproduce el bloqueo manual');
    await clickAll();
    check(await sessionCode()===undefined,'2.5.0 se recupera con Reverificar todo');
  }else{
    check(probes===beforeRecover+1&&await sessionCode()===undefined,'Actualizar vuelve a confirmar la sesión y limpia REDIRECT');
    check(benchmark.manualRecovery.calendar===3&&(await diag()).lastRun.mode==='refresh','La recuperación actualiza los tres meses recientes');
    check(benchmark.manualRecovery.activities===1&&(await diag()).lastRun.newActivities===1,'Se verifica la actividad nueva sin revisar las demás');
  }
  for(let i=0;i<3;i++)await sample('recovered');
  if(baseline)return {passed,benchmark};

  mode='redirect';
  await button().click();await idle();
  const first=probes;
  await button().click();await idle();
  check(probes===first+1&&await sessionCode()==='REDIRECT','Una recuperación rápida puede fallar otra vez');
  const blockedCalendar=(await stats()).months;
  await button().click();await idle();await button().click();await idle();
  check(probes===first+1&&(await stats()).months===blockedCalendar,'Las pulsaciones rápidas durante el bloqueo no duplican consultas');
  await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+31000;});
  await button().click();await idle();
  check(probes===first+2,'Una nueva comprobación manual se permite tras 30 segundos');
  mode='ok';
  await clickAll();
  check(await sessionCode()===undefined&&(await diag()).lastRun.mode==='all'&&(await diag()).lastRun.calendarRequested===6,'Reverificar todo conserva su alcance y recuperación');
  const beforeVisible=probes;
  await visible();await idle();
  check(probes===beforeVisible+1&&(await diag()).lastRun.mode==='normal','La sincronización automática vuelve a funcionar');

  mode='redirect';await button().click();await idle();
  const second=await context.newPage();await second.goto(origin);await idle(second);
  mode='ok';
  let release;
  gate=new Promise(resolve=>{release=resolve;});
  const pending=new Promise(resolve=>{entered=resolve;});
  const beforePair=probes, pairMonths=(await stats()).months;
  await button().click();
  try{
    await pending;
    await button(second).click();
    await second.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Esperando turno'));
  }finally{gate=undefined;release();}
  await Promise.all([idle(page),idle(second)]);
  check(probes===beforePair+1&&(await stats()).months===pairMonths+3,'Las dos pestañas comparten la comprobación y los meses');
  check((await diag(second)).lastRun.sessionProbe==='shared'&&await sessionCode(second)===undefined,'La segunda pestaña reutiliza una identidad validada');
  await second.close();

  const saved=await page.evaluate(()=>JSON.parse(localStorage.fixture));
  const prefix='ugr2:'+origin+':42:';
  check(JSON.stringify(saved[prefix+'presentation'])===JSON.stringify(original[prefix+'presentation'])&&
    JSON.stringify(saved[prefix+'manual:assign:4'])===JSON.stringify(original[prefix+'manual:assign:4'])&&
    original[prefix+'history'].changes.every((v,i)=>JSON.stringify(saved[prefix+'history'].changes[i])===JSON.stringify(v)),
  'La recuperación conserva preferencias, marca anterior e historial');

  await page.evaluate(key=>{
    const data=JSON.parse(localStorage.fixture);
    data[key].autoRefreshMinutes=10;
    localStorage.fixture=JSON.stringify(data);
  },prefix+'presentation');
  await page.reload();await idle();
  mode='redirect';await button().click();await idle();
  const beforePeriodic=probes;
  await page.evaluate(()=>{
    const now=Date.now;
    Date.now=()=>now()+11*60_000;
  });
  await visible();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#ugr-diagnostics').textContent).lastPeriodicResult?.mode==='periodic');
  check(probes===beforePeriodic&&(await diag()).lastPeriodicResult.sessionProbe==='waiting','El temporizador conserva el backoff de sesión');
  for(const [kind,code] of [['network','NETWORK'],['http','HTTP'],['conflict','IDENTITY_CONFLICT'],['other','ACCOUNT_CHANGED'],['expired','SESSION_EXPIRED']]){
    mode='ok';
    await page.reload();await idle();
    if(await sessionCode())await clickAll();
    mode=kind;
    const months=(await stats()).months;
    await button().click();await idle();
    check(await sessionCode()===code&&(await stats()).months===months,code+' no permite continuar al calendario');
    if(kind==='network'||kind==='http'){
      const previous=probes;await button().click();await idle();
      check(probes===previous,code+' mantiene su backoff');
    }
  }
  check((await stats()).forums===0,'No se consultan foros');
  return {passed,benchmark};
}
