async (page,_baseline,alternative,reference)=>{
  const origin='http://127.0.0.1:8765', context=page.context();
  const production=reference===null, refreshesCalendar=production||alternative;
  const start=Date.UTC(2026,10,11,15), minute=60000, ttl=15*minute;
  const baseline=Array.from({length:40},(_,i)=>({id:i+1,course:i%2+1}));
  const cases=new Set(), measurements={};
  let now=start, publications=[], wire=[], completed=[], failedMonths=new Set(), failedActivities=new Set();
  let gate, activityGate, completionWatch, active=0, peak=0, delivered=new Set();
  const check=(condition,label)=>{if(!condition)throw Error(label);};
  const pass=(number,condition,label)=>{check(condition,number+' · '+label);cases.add(number);};
  const deferred=()=>{
    let resolve;
    const promise=new Promise(r=>{resolve=r;});
    return {promise,resolve};
  };
  const arm=month=>{
    const captured=deferred(), release=deferred();
    gate={month,captured,release};
    return gate;
  };
  const setTime=async(value,...pages)=>{
    now=value;
    await Promise.all([page,...pages].map(p=>p.clock.setFixedTime(value)));
  };
  const publish=(id,options={})=>publications.push({id,at:now,month:11,course:1,...options});
  const event=(entry)=>{
    const id=entry.id, cmid=entry.cmid??id;
    const month=entry.month??11, due=Date.UTC(month===1?2027:2026,month-1,20)/1000+cmid*60;
    return {id,modulename:'assign',eventtype:entry.kind??'due',name:entry.name??'Taller ficticio '+cmid,
      timesort:entry.undated?0:due,timestart:entry.undated?0:due,
      url:origin+'/mod/assign/view.php?id='+cmid,course:{id:entry.course,fullname:'Curso '+entry.course}};
  };
  await context.route(origin+'/my/',route=>{
    wire.push({kind:'session'});
    return route.fallback();
  });
  await context.route(origin+'/lib/ajax/service.php?*',async route=>{
    const calls=route.request().postDataJSON();
    check(route.request().method()==='POST'&&calls.length===1&&calls[0].methodname==='core_calendar_get_calendar_monthly_view','Solo calendario de lectura');
    const month=calls[0].args.month;
    const rows=[...(month===11?baseline:[]),...publications.filter(p=>p.month===month&&p.at<=now&&!p.hidden)].map(event);
    const status=failedMonths.has(month)?503:200;
    wire.push({kind:'calendar',month,rows:rows.length,status});
    active++;peak=Math.max(peak,active);
    try{
      if(gate?.month===month){
        const held=gate;
        gate=null;
        held.captured.resolve();
        await held.release.promise;
      }
      if(status===200)await route.fulfill({json:[{data:{weeks:[{days:[{events:rows}]}]}}]});
      else await route.fulfill({status,body:'Error de calendario ficticio'});
      completed.push(month);
      if(completionWatch?.months.every(m=>completed.slice(completionWatch.from).includes(m))){
        completionWatch.resolve();
        completionWatch=null;
      }
    }catch{
      // Una cancelación puede cerrar la solicitud antes de liberar la respuesta ficticia.
    }finally{active--;}
  });
  await context.route(origin+'/mod/assign/view.php?*',async route=>{
    const id=Number(route.request().url().split('id=')[1]);
    check(route.request().method()==='GET'&&Number.isSafeInteger(id),'Solo lectura de tareas ficticias');
    const status=failedActivities.has(id)?503:200;
    wire.push({kind:'activity',id,status});
    if(activityGate?.id===id){
      const held=activityGate;
      activityGate=null;
      held.captured.resolve();
      await held.release.promise;
    }
    const state=delivered.has(id)?'submissionstatussubmitted':'submissionstatusnew';
    return route.fulfill({status,contentType:'text/html',body:'<body id="page-mod-assign-view">'+
      '<script>M.cfg={"userid":42};</script><div class="'+state+'"></div></body>'}).catch(()=>{});
  });
  const report=async(p=page)=>JSON.parse(await p.locator('#ugr-diagnostics').textContent()).lastRun;
  const settled=(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
    /Actualización finalizada|Reverificación cancelada/.test(document.querySelector('.ugr-note')?.textContent??''),null,{timeout:10000});
  const click=(kind,p=page)=>p.evaluate(kind=>{
    window.confirm=()=>true;
    document.querySelector(kind==='all'?'[data-reverify-all]':'[data-refresh]').click();
  },kind);
  const stored=(p=page)=>p.evaluate(()=>{
    const data=JSON.parse(localStorage.fixture);
    const {cache}=UGCore.readState(data,'ugr2:'+location.origin+':42:',location.origin);
    const items=new Map(), active=new Set();
    for(const month of Object.values(cache.months)){
      for(const item of month.items){
        if(!items.has(item.cmid)||items.get(item.cmid).synced<=item.synced)items.set(item.cmid,item);
        if(month.activeIds?.includes(item.id))active.add(item.cmid);
      }
    }
    return {items:[...items.values()],active:[...active]};
  });
  const ids=async(p=page)=>(await stored(p)).items.map(it=>it.cmid);
  const rows=(p=page)=>p.locator('.ugr-list li');
  const listed=(id,p=page)=>rows(p).locator('a[href$="?id='+id+'"]').count();
  const summary=async(since,p=page)=>{
    const log=wire.slice(since), run=await report(p), state=await stored(p);
    return {calendar:log.filter(x=>x.kind==='calendar').map(x=>x.month).sort((a,b)=>a-b),
      session:log.filter(x=>x.kind==='session').length, activity:log.filter(x=>x.kind==='activity').length,
      requests:log.length, errors:run.calendarErrors+run.activityErrors, candidates:run.detected,
      stored:state.items.length, rows:await rows(p).count(), elapsedMs:run.durationMs,
      ...(production?{reused:run.calendarReused,shared:run.calendarShared,discovered:run.newActivities}:{})};
  };
  const run=async(kind='normal',p=page)=>{
    const before=wire.length;
    await click(kind,p);await settled(p);
    return summary(before,p);
  };
  const reset=async(completedIds=[])=>{
    publications=[];failedMonths.clear();failedActivities.clear();
    delivered=new Set(completedIds);
    await setTime(start);
    if(page.url().startsWith(origin))await page.evaluate(()=>localStorage.removeItem('fixture'));
    const before=wire.length;
    await page.goto(origin);await settled();
    const result=await summary(before);
    check(result.calendar.length===6&&result.stored===40&&result.rows===40-completedIds.length,'Base de 40 talleres y seis meses');
    return result;
  };
  const setting=name=>page.locator('[data-'+name+']');
  const categoryFilter=page.locator(production?"#ugr-quick-categories":"#ugr-preferences");
  const categories=async(...values)=>{
    for(const box of await categoryFilter.locator('[data-category]').all())await box.setChecked(values.includes(await box.inputValue()));
  };
  const repeats=async()=>{
    const result=[];
    for(const offset of [15,30,45]){
      await setTime(start+4*minute+offset*1000);
      result.push(await run());
    }
    return result;
  };

  if(production)await page.addInitScript(()=>{
    // These fixtures exercise the 2.0.7 flows. The periodic suite drives its own clock.
    if(location.origin!=='http://127.0.0.1:8765'||localStorage.fixture)return;
    localStorage.fixture=JSON.stringify({['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0}});
  });
  if(reference!==null){
    // Las comparaciones históricas sirven una copia de 2.0.6 solo en este perfil.
    const originalClick="if(e.target.closest('[data-refresh]')){load();return;}";
    const originalTtl='if(!force && old && Date.now()-(calendarTimes[m.key]??old.t)<';
    check(reference.split(originalClick).length===2&&reference.split(originalTtl).length===2,'Puntos de comparación exactos de 2.0.6');
    const variant=alternative?reference.replace(originalClick,"if(e.target.closest('[data-refresh]')){load('manual-calendar');return;}")
      .replace(originalTtl,"if(!force && !(mode==='manual-calendar'&&!m.historical) && old && Date.now()-(calendarTimes[m.key]??old.t)<"):reference;
    await context.route(origin+'/content.js',route=>route.fulfill({contentType:'text/javascript',body:variant}));
  }
  const cold=await reset();
  await setTime(start+2*minute);publish(41);publish(42,{course:2});
  if(production){
    const beforeAutomatic=wire.length;
    await page.reload();await settled();
    const automatic=await summary(beforeAutomatic);
    check(automatic.requests===1&&automatic.reused===6&&automatic.discovered===0&&automatic.stored===40,
      'La carga automática conserva el TTL pese a una publicación reciente');
    measurements.automatic=automatic;
  }
  await setTime(start+3*minute);
  const currentNormal=await run();
  pass(1,currentNormal.calendar.length===(refreshesCalendar?3:0)&&currentNormal.rows===(refreshesCalendar?42:40)&&
    (await ids()).includes('41')===refreshesCalendar,'Publicación anterior a Actualizar y caché vigente');
  pass(16,currentNormal.requests===(refreshesCalendar?6:1)&&currentNormal.activity===(refreshesCalendar?2:0),'Actualizar poco después conserva estados frescos conocidos');
  if(production)check((await report()).calendarRequested===3&&currentNormal.reused===3&&currentNormal.discovered===2&&
    (await page.locator('.ugr-note').first().textContent()).includes('3 meses consultados · 3 meses con datos guardados · 2 actividades nuevas'),
    'Resumen y diagnóstico distinguen meses consultados, caché y altas');
  await setTime(start+4*minute);
  const currentFull=await run('all');
  pass(18,currentFull.calendar.length===6&&currentFull.activity===42&&currentFull.rows===42,'Reverificar todo tras Actualizar');
  pass(6,(await ids()).includes('41')&&await listed(42)===1,'Publicación del mes actual');
  const newCourses=(await stored()).items.filter(it=>['41','42'].includes(it.cmid)).map(it=>it.courseId).sort();
  pass(9,newCourses.join() === '1,2','Talleres en cursos diferentes');
  pass(10,publications[0].at===publications[1].at&&currentFull.stored-cold.stored===2,'Publicación simultánea');
  measurements.publication={cold,update:currentNormal,exhaustive:currentFull,repeated:await repeats()};

  const filterStart=wire.length;
  await setting('personalize').click();
  await setting('mode').selectOption('custom');
  if(production)await page.locator('[data-quick-filter="categories"]').click();
  await categoryFilter.locator('[data-select-all]').click();
  pass(26,await rows().count()===42&&await listed(41)===1,'Todas las categorías, sin duplicar');
  await categories('proximas');
  pass(27,await rows().count()===42&&await listed(42)===1,'Solo Próximas');
  await categories('pendientes');
  pass(28,await rows().count()===42&&await listed(41)===1,'Solo Pendientes');
  await categories('proximas','atrasadas');
  pass(29,await rows().count()===42,'Próximas y Atrasadas');
  await setting('course').selectOption('1');
  pass(30,await rows().count()===21&&await listed(41)===1&&await listed(42)===0&&(await ids()).includes('42'),'Curso seleccionado oculta una actividad incorporada');
  await setting('course').selectOption('all');
  pass(31,await rows().count()===42&&await listed(42)===1,'Todos los cursos recuperan visibilidad');
  for(const [number,limit] of [[32,5],[33,10],[34,30]]){
    await setting('limit').selectOption(String(limit));
    pass(number,await rows().count()===limit&&await listed(41)===0&&(await ids()).includes('41'),'Límite '+limit+' solo visual');
  }
  pass(38,await setting('list-info').textContent()==='Mostrando 30 de 42 actividades','Contador incluye las filas recortadas');
  await setting('limit').selectOption('');
  pass(35,await rows().count()===42&&await listed(41)===1,'Sin límite');
  const offscreen=await page.locator('.ugr-list').evaluate(list=>{
    list.scrollTop=0;
    const link=list.querySelector('a[href$="?id=42"]');
    const before=link.getBoundingClientRect().top>=list.getBoundingClientRect().bottom;
    list.scrollTop=list.scrollHeight;
    return before&&link.getBoundingClientRect().bottom<=list.getBoundingClientRect().bottom;
  });
  pass(37,offscreen,'Una actividad puede estar renderizada fuera del área visible hasta desplazar la lista');
  await categories('entregadas');const excluded=await rows().count();
  await categories('pendientes');
  pass(36,excluded===0&&await rows().count()===42&&wire.length===filterStart,'Cambiar filtros después del alta opera sin solicitudes');
  await page.reload();await settled();
  pass(24,await listed(41)===1&&await listed(42)===1&&(await ids()).length===42,'Ambos talleres siguen tras recargar');

  await reset();
  await setTime(start+ttl);
  const beforePublication=await run();
  await setTime(start+ttl+minute);publish(41);publish(42);
  const afterPublication=await run('all');
  pass(2,beforePublication.calendar.length===3&&beforePublication.stored===40&&afterPublication.stored===42,'La primera consulta fresca puede ocurrir antes de publicar');
  measurements.laterPublication={update:beforePublication,exhaustive:afterPublication};

  await reset();
  await setTime(start+ttl);
  const bothDuring=arm(11), duringStart=wire.length;
  await click('normal');await bothDuring.captured.promise;
  await setTime(start+ttl+1000);publish(41);publish(42);
  bothDuring.release.resolve();await settled();
  const bothDuringUpdate=await summary(duringStart), bothDuringFull=await run('all');
  pass(3,bothDuringUpdate.stored===40&&bothDuringFull.stored===42,'Los dos talleres se publican después de capturar una respuesta en curso');
  measurements.bothDuring={update:bothDuringUpdate,exhaustive:bothDuringFull};

  await reset();
  await setTime(start+ttl-1000);publish(41);publish(43,{month:12});publish(44,{month:10});
  await setTime(start+ttl);
  const pending=arm(11), startOfRun=wire.length, startOfCompletion=completed.length;
  const others=deferred();
  completionWatch={from:startOfCompletion,months:[12,1],resolve:others.resolve};
  await click('normal');await pending.captured.promise;
  await setTime(start+ttl+1000);publish(42);
  await others.promise;
  pending.release.resolve();await settled();
  const mid=await summary(startOfRun), middleIds=await ids();
  pass(4,mid.calendar.join()==='1,11,12'&&middleIds.includes('41'),'TTL exacto de 15 minutos abre la consulta');
  pass(5,middleIds.includes('41')&&!middleIds.includes('42'),'Solo el taller publicado antes de capturar aparece');
  pass(7,middleIds.includes('43'),'Mes siguiente');
  pass(17,mid.requests===46&&mid.activity===42,'Después del TTL se consultan tres meses y se comprueban los estados pendientes también caducados');
  const order=completed.slice(startOfCompletion);
  pass(20,order.at(-1)===11&&middleIds.includes('43')&&middleIds.includes('41')&&peak<=3,'Respuestas mensuales fuera de orden conservan ambos cambios');
  const forced=await run('all'), forcedIds=await ids();
  publish(45,{month:10});
  await setTime(now+24*60*minute+1);
  const historical=await run();
  pass(8,!middleIds.includes('44')&&forcedIds.includes('44')&&forced.calendar.length===6&&
    historical.calendar.includes(10)&&(await ids()).includes('45'),
    'Mes anterior fresco hasta 24 h: '+JSON.stringify({before:middleIds.includes('44'),forced:forcedIds.includes('44'),
      forcedMonths:forced.calendar,historicalMonths:historical.calendar}));
  pass(11,publications.find(p=>p.id===42).at-publications.find(p=>p.id===41).at===2000&&forcedIds.includes('42'),'Publicación separada por dos segundos');
  measurements.during={update:mid,order,exhaustive:forced,historical};

  await reset();
  publish(41,{hidden:true});
  publish(42,{undated:true});
  publish(43,{month:0}); // Existe en el curso ficticio y queda fuera de las respuestas mensuales.
  const invisible=await run('all');
  pass(14,!(await ids()).includes('42')&&invisible.stored===40,'Evento de taller sin timesort ni timestart positivos');
  pass(15,!(await ids()).includes('43')&&invisible.calendar.length===6,'Calendario sin una actividad existente en el curso');
  await setTime(start+minute);
  publications.find(p=>p.id===41).hidden=false;
  publish(141,{cmid:41});publish(141,{cmid:41});
  const enabled=await run('all');
  pass(12,enabled.stored===41&&await listed(41)===1,'Taller oculto, luego habilitado en la API');
  pass(23,enabled.activity===41&&await listed(41)===1&&(!production||enabled.discovered===1),'Repeticiones del evento y del CMID se deduplican');
  await setTime(start+2*minute);
  for(const p of publications.filter(p=>p.id===41||p.cmid===41)){p.name='Taller ficticio actualizado';p.course=2;}
  await run('all');
  pass(13,(await stored()).items.some(it=>it.cmid==='41'&&it.name==='Taller ficticio actualizado'&&it.courseId===2)&&
    await page.getByRole('link',{name:'Taller ficticio actualizado',exact:true}).count()===1,'Cambios de metadatos en memoria y almacenamiento');
  await setTime(start+3*minute);
  publications=publications.filter(p=>p.id!==41&&p.cmid!==41);
  publish(45);
  await setTime(start+3*minute+1000);
  publications=publications.filter(p=>p.id!==45);
  await run('all');
  const disappeared=await stored();
  pass(25,disappeared.items.some(it=>it.cmid==='41')&&!disappeared.active.includes('41')&&await listed(41)===1&&
    !disappeared.items.some(it=>it.cmid==='45'),'Desaparición tras una observación y publicación efímera entre lecturas');

  await reset();
  const second=await context.newPage();
  await second.clock.setFixedTime(start);
  await second.goto(origin);await settled(second);
  await setTime(start+ttl,second);publish(41);
  const concurrencyGate=arm(11), concurrentStart=wire.length;
  await click('normal');await concurrencyGate.captured.promise;
  await click('normal',second);
  await second.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Esperando turno'));
  concurrencyGate.release.resolve();
  await Promise.all([settled(),settled(second)]);
  const concurrent=wire.slice(concurrentStart);
  const sharedRun=await report(second);
  pass(19,concurrent.filter(x=>x.kind==='calendar'&&x.month===11).length===(alternative?2:1)&&
    concurrent.filter(x=>x.kind==='activity'&&x.id===41).length===1&&await listed(41)===1&&await listed(41,second)===1,
    'Dos pestañas serializan las lecturas y comparten el estado de la actividad');
  measurements.concurrent={sessions:concurrent.filter(x=>x.kind==='session').length,
    calendar:concurrent.filter(x=>x.kind==='calendar').length,activity:concurrent.filter(x=>x.kind==='activity').length,
    ...(production?{shared:sharedRun.calendarShared}:{})};
  if(production)check(sharedRun.calendarRequested===0&&sharedRun.calendarReused===6&&sharedRun.calendarShared===3&&
    sharedRun.newActivities===0,'La pestaña en espera reutiliza los tres meses y mantiene el alta');
  await second.close();
  await settled();

  await setTime(start+ttl+minute);
  const cancellation=arm(11);
  await click('all');await cancellation.captured.promise;
  publish(42);
  await setting('cancel').click();cancellation.release.resolve();await settled();
  const notYet=(await ids()).includes('42'), cancelled=(await report()).cancelled;
  await run('all');
  pass(21,cancelled&&!notYet&&(await ids()).includes('42'),'Cancelar una consulta durante la publicación permite descubrirla después');
  await setTime(start+2*ttl+2*minute);publish(43);
  failedMonths.add(11);const bad=await run();
  failedMonths.clear();const backoff=await run();
  await setTime(start+2*ttl+5*minute);failedActivities.add(43);
  const verifying={id:43,captured:deferred(),release:deferred()}, recoveryStart=wire.length;
  activityGate=verifying;
  await click('normal');await verifying.captured.promise;
  await page.getByRole('tab',{name:/Sin verificar/}).click();
  await rows().locator('a[href$="?id=43"]').waitFor();
  const visibleDuring=await setting('refresh').isDisabled()&&await listed(43)===1;
  verifying.release.resolve();await settled();
  const recovered=await summary(recoveryStart);
  pass(22,bad.errors===1&&bad.stored===42&&!backoff.calendar.includes(11)&&recovered.calendar.includes(11)&&
    recovered.stored===43&&recovered.errors===1&&visibleDuring&&await listed(43)===1,
    'Alta visible durante la comprobación y persistida aunque la consulta HTML falle');
  measurements.failure={http503:bad,backoff,recovery:recovered};

  await reset([1,2]);
  await setTime(start+2*minute);publish(41);publish(42);
  await setTime(start+3*minute);
  const statusStart=wire.length;
  await run();
  await page.getByRole('tab',{name:/Entregadas/}).click();
  check(await rows().count()===2&&wire.slice(statusStart).filter(r=>r.kind==='activity').every(r=>r.id>40),
    'Actualizar conserva dos entregas confirmadas con TTL vigente y evita sus lecturas HTML');

  check(currentNormal.calendar.join()===(refreshesCalendar?'1,11,12':'')&&currentNormal.errors===0&&
    currentNormal.stored===(refreshesCalendar?42:40),'Comparación directa de calendario, altas y errores');
  check(measurements.publication.repeated.every(r=>r.requests===(refreshesCalendar?4:1)&&r.activity===0&&r.stored===42&&r.errors===0&&
    (!production||(r.shared===0&&r.discovered===0))),
    'Costo de tres pulsaciones sin novedades');
  if(production){
    await reset();
    const manualTab=await context.newPage();
    await manualTab.clock.setFixedTime(start);
    await manualTab.goto(origin);await settled(manualTab);
    await setTime(start+ttl,manualTab);publish(41);
    const automaticGate=arm(11), beforeAutomatic=wire.length;
    await page.reload();await automaticGate.captured.promise;
    await click('normal',manualTab);
    await manualTab.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Esperando turno'));
    automaticGate.release.resolve();
    await Promise.all([settled(),settled(manualTab)]);
    const waitingManual=await report(manualTab);
    check((await report()).mode==='normal'&&waitingManual.calendarShared===3&&waitingManual.calendarRequested===0&&
      wire.slice(beforeAutomatic).filter(x=>x.kind==='calendar').length===3&&await listed(41,manualTab)===1,
      'Actualizar comparte los meses que acaba de descargar una sincronización automática solapada');
    await manualTab.close();

    await reset();
    const other=await context.newPage();
    await other.clock.setFixedTime(start);
    await other.goto(origin);await settled(other);
    await setTime(start+3*minute,other);
    publish(41,{month:12});publish(42);
    failedMonths.add(11);
    const partial=arm(11), before=wire.length;
    await click('normal');await partial.captured.promise;
    await click('normal',other);
    await other.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Esperando turno'));
    partial.release.resolve();
    await Promise.all([settled(),settled(other)]);
    const first=await report(), second=await report(other);
    check(first.calendarErrors===1&&first.newActivities===1&&second.calendarWaiting===1&&second.calendarShared===2&&
      second.calendarRequested===0&&wire.slice(before).filter(x=>x.kind==='calendar').length===3&&
      await listed(41,other)===1&&await listed(42,other)===0,'Solapamiento con HTTP 503 comparte éxitos y respeta la espera del mes fallido');
    await other.close();
    failedMonths.clear();
    await setTime(start+6*minute);
    const retry=await run();
    check(retry.calendar.includes(11)&&retry.errors===0&&retry.discovered===1&&await listed(42)===1,
      'Una pulsación posterior al backoff incorpora el taller que faltaba');
    measurements.partial={shared:second.calendarShared,waiting:second.calendarWaiting,retry};
  }
  check(cases.size===38,'Cobertura numerada completa: '+[...cases].sort((a,b)=>a-b).join(','));
  return {passed:cases.size+3+(production?6:0),cases:[...cases].sort((a,b)=>a-b),measurements,peakCalendarConcurrency:peak};
}
