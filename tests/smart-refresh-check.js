async (page,baseline=false)=>{
  const ctx=page.context(), origin='http://127.0.0.1:8765', start=Date.UTC(2026,10,11,15);
  const minute=60000, wire=[], samples={};
  let passed=0, size=3, missing=0, submitted=false, published=false, offline=0, expired=false;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const checkTime=(minutes,...tabs)=>Promise.all([page,...tabs].map(p=>p.evaluate(t=>{
    window.fixtureClock=t;localStorage.setItem('fixtureNow',String(t));
  },start+minutes*minute)));
  const identity='<script>M.cfg={"userid":42};</script>';
  await ctx.addInitScript(initialTime=>{
    if(location.origin!=='http://127.0.0.1:8765')return;
    // Change only the academic clock. Chrome's performance clock stays native across navigations.
    const NativeDate=Date;
    window.fixtureClock=Number(localStorage.getItem('fixtureNow'))||initialTime;
    window.Date=class extends NativeDate{
      constructor(...values){super(...(values.length?values:[Date.now()]));}
      static now(){return window.fixtureClock;}
    };
    if(!localStorage.fixture)localStorage.fixture=JSON.stringify({
      ['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0,position:'below'}
    });
    const navigationStart=performance.now();
    const observer=new MutationObserver(()=>{
      const row=document.querySelector('.ugr-item');
      if(row?.getClientRects().length){window.fixtureFirstRow=Math.round(performance.now()-navigationStart);observer.disconnect();}
    });
    observer.observe(document,{subtree:true,childList:true});
  },start);
  let release, entered, newActivityGate;
  await ctx.route(origin+'/my/',async route=>{
    wire.push('session');
    if(entered){
      const signal=entered;entered=null;
      await new Promise(resolve=>{release=resolve;signal();});
    }
    await route.fulfill({body:expired?'<body id="page-login-index"><form id="login"><input type="password"></form></body>':identity});
  });
  await ctx.route(origin+'/lib/ajax/service.php?*',route=>{
    const {args,methodname}=route.request().postDataJSON()[0];
    if(methodname!=='core_calendar_get_calendar_monthly_view')throw Error('Consulta inesperada');
    wire.push('calendar');
    const events=[];
    if(args.month===11)for(let id=1;id<=size;id++){
      if(id===missing)continue;
      events.push({id,name:'Actividad ficticia '+id,modulename:'assign',eventtype:'due',
        timesort:start/1000+86400+(id>240?1000+id:id),url:origin+'/mod/assign/view.php?id='+id,course:{id:1,fullname:'Curso ficticio'}});
    }
    return route.fulfill({json:[{data:{weeks:[{days:[{events}]}]}}]});
  });
  await ctx.route(origin+'/mod/assign/view.php?*',async route=>{
    const id=Number(route.request().url().split('id=')[1]);
    wire.push(id);
    if(newActivityGate&&id>240){
      if(++newActivityGate.count===3)newActivityGate.ready();
      await newActivityGate.wait;
    }
    if(id===offline)return route.abort('failed');
    const done=id===1?submitted:id%3!==1;
    const grade=id===3?(published?'9':'7'):id===2&&published?'8':id>3&&id%3===0?'6':null;
    const status='<div class="submissionstatus'+(done?'submitted':'new')+'"></div>';
    const points=grade?'<div class="feedbacktable"><table><tr><th>Calificación</th><td>'+grade+' / 10</td></tr></table></div>':'';
    return route.fulfill({body:'<body id="page-mod-assign-view" class="cmid-'+id+'">'+identity+'<main>'+status+points+'</main></body>'});
  });
  const idle=(p=page)=>p.waitForFunction(()=>{
    const note=document.querySelector('.ugr-note')?.textContent??'';
    return note.includes('detenida')||(!document.querySelector('[data-refresh]')?.disabled&&note.includes('finalizada'));
  });
  const click=p=>p.evaluate(()=>document.querySelector('[data-refresh]').click());
  const reading=(p=page)=>p.evaluate(()=>{
    const prefix='ugr2:'+location.origin+':42:', data=JSON.parse(localStorage.fixture);
    const {cache}=UGCore.readState(data,prefix,location.origin);
    const records=data[prefix+'verification'].records;
    return {done:cache.auto['assign:1']?.done,grade2:records['assign:2']?.grade,grade3:records['assign:3']?.grade,
      known:new Set(Object.values(cache.months).flatMap(m=>m.items.map(it=>it.cmid))).size,
      metrics:JSON.parse(document.querySelector('#ugr-panel').dataset.metrics),
      run:JSON.parse(document.querySelector('#ugr-diagnostics').textContent).lastRun,firstRowMs:window.fixtureFirstRow};
  });
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const scriptTime=async()=>(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='ScriptDuration').value;
  async function measure(label,action,navigation=false){
    const before=wire.length, renders=navigation?0:(await reading()).metrics.renders;
    const scriptStart=navigation?null:await scriptTime();
    await action();await idle();
    const scriptMs=navigation?null:Math.round((await scriptTime()-scriptStart)*1000);
    const state=await reading(), log=wire.slice(before);
    samples[label]={http:log.length,session:log.filter(x=>x==='session').length,calendar:log.filter(x=>x==='calendar').length,
      get:log.filter(Number.isInteger).length,syncMs:state.run.durationMs,renders:state.metrics.renders-renders,
      ...(navigation?{}:{scriptMs}),
      ...(navigation?{firstRowMs:state.firstRowMs}:{})};
    return state;
  }
  await measure('cold',()=>page.goto(origin),true);
  check(samples.cold.http===10,'Arranque frío');
  await checkTime(6);
  await measure('warm',()=>page.reload(),true);
  check(samples.warm.http===1&&samples.warm.get===0,'F5 vigente');
  for(const label of ['warm2','warm3']){
    await measure(label,()=>page.reload(),true);
    check(samples[label].http===1&&samples[label].get===0,'Repetición de F5 vigente');
  }
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  await page.evaluate(()=>{
    let start;
    document.querySelector('[data-refresh]').addEventListener('click',()=>{start=performance.now();},{once:true});
    const observer=new MutationObserver(()=>{
      const row=id=>document.querySelector('.ugr-item[data-id="assign:'+id+'"]');
      if(start!==undefined&&row(1)&&row(2)?.querySelector('.ugr-grade')?.textContent.includes('8 / 10')&&
        row(3)?.querySelector('.ugr-grade')?.textContent.includes('9 / 10')){
        window.fixtureChangeMs=Math.round(performance.now()-start);observer.disconnect();
      }
    });
    observer.observe(document.querySelector('.ugr-list'),{childList:true,subtree:true});
  });
  submitted=published=true;
  const updated=await measure('changed',()=>click(page));
  samples.changed.visibleMs=await page.evaluate(()=>window.fixtureChangeMs??null);
  check(samples.changed.get===(baseline?0:3),'Actualizar · lecturas de actividades');
  check(updated.done===!baseline,'Entrega recién realizada');
  check(updated.grade2===(baseline?undefined:'8 / 10'),'Nota nueva');
  check(updated.grade3===(baseline?'7 / 10':'9 / 10'),'Cambio de nota');
  if(!baseline)check(updated.run.gradesUpdated===2,'El diagnóstico cuenta las dos calificaciones recibidas');
  check(baseline?samples.changed.visibleMs===null:samples.changed.visibleMs!==null,'Cambios visibles en las filas entregadas');
  await measure('repeat',()=>click(page));
  check(samples.repeat.http===4,'Segundo clic conserva resultados');
  size=4;missing=2;
  const discovered=await measure('calendarChange',()=>click(page));
  check(discovered.known===4&&discovered.run.newActivities===1&&samples.calendarChange.get===1,'Alta y conservación de actividad ausente');
  await checkTime(22);
  const expiredCache=await measure('expired',()=>page.reload(),true);
  check(samples.expired.calendar===3&&samples.expired.get===(baseline?2:1),'F5 con caché vencida');
  check(expiredCache.done===true,'La entrega se refleja también al vencer el TTL ordinario');
  const other=await ctx.newPage();await other.goto(origin);await idle(other);
  await checkTime(29,other);
  const reached=new Promise(resolve=>{entered=resolve;});
  const pairStart=wire.length;
  await measure('twoTabs',async()=>{
    await click(page);await reached;
    try{await click(other);await other.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Esperando turno'));}
    finally{release();}
    await Promise.all([idle(page),idle(other)]);
  });
  const pairIds=wire.slice(pairStart).filter(Number.isInteger);
  check(new Set(pairIds).size===pairIds.length&&samples.twoTabs.calendar===3,'Dos pestañas comparten calendario y actividades');
  check(samples.twoTabs.session===(baseline?2:1),'El segundo clic solapado consume el resultado completo');
  await other.close();
  offline=3;await checkTime(36);
  const failed=await measure('network',()=>click(page));
  check(failed.grade3===(baseline?'7 / 10':'9 / 10')&&failed.run.activityErrors===(baseline?0:1),'Fallo conserva la calificación');
  offline=0;expired=true;
  const denied=await measure('sessionExpired',()=>click(page));
  check(samples.sessionExpired.get===0&&samples.sessionExpired.calendar===0&&denied.run.checked===0,'Sesión caducada detiene el calendario');
  expired=false;await checkTime(75);
  await measure('sessionRecovered',()=>page.reload(),true);
  check(samples.sessionRecovered.session===1&&samples.sessionRecovered.calendar===3,'Sesión válida recuperada');
  size=240;missing=0;
  await measure('largeDiscovery',()=>click(page));
  await checkTime(81);
  const large=await measure('largeRefresh',()=>click(page));
  check(large.known===240&&samples.largeRefresh.get===(baseline?0:3),'240 actividades mixtas · coste acotado');
  if(!baseline)check(large.run.refreshDeferred>0&&large.run.refreshChecked===3,'Diagnóstico del presupuesto');
  await measure('largeRepeat',()=>click(page));
  check(samples.largeRepeat.get===0,'El segundo clic tampoco vacía la cola grande');
  await checkTime(24*60+82);
  const later=await measure('nextDay',()=>page.reload(),true);
  check(later.grade2==='8 / 10'&&later.grade3==='9 / 10','También se observan ambas notas al vencer la caché normal');
  // Next day, the three new deadlines are closer than the 240 old deadlines.
  // All old results are eligible at planning time. Pending TTLs expire while the first three GETs wait.
  const nextDay=24*60+82, beforeEdge=wire.length;
  size=243;await checkTime(nextDay+9+59/60);
  let notify,unblock;
  const ready=new Promise(resolve=>{notify=resolve;});
  newActivityGate={count:0,ready:notify,wait:new Promise(resolve=>{unblock=resolve;})};
  const edge=await measure('ttlDuringRefresh',async()=>{
    await click(page);await ready;
    try{await checkTime(nextDay+10+1/60);}finally{unblock();}
  });
  const oldGets=wire.slice(beforeEdge).filter(id=>Number.isInteger(id)&&id<=240);
  check(oldGets.length>70&&oldGets.length===new Set(oldGets).size,'El TTL puede vencer durante una lectura de calendario y actividades');
  if(!baseline)check(edge.run.refreshDeferred===240-oldGets.length,'Las comprobaciones ordinarias realizadas quedan fuera del contador pendiente');
  return {passed,samples};
}
