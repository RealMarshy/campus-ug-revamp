async page=>{
  const origin='http://127.0.0.1:8765', context=page.context();
  const identity='<script>window.M={cfg:{"userid":42}};</script>';
  const notice=text=>'<div class="alert alert-warning alert-block" role="alert">'+text+'</div>';
  const statusNotice=text=>'<div class="generalbox boxaligncenter">'+notice(text)+'</div>';
  const notOpen=statusNotice('The feedback is not open');
  const restricted=notice('You can only access this feedback from a course');
  const completed=statusNotice("You've already completed this activity.");
  const link=(id,extra='',attrs='')=>'<div class="feedback_description"><div class="tertiary-navigation"><div class="row">'+
    '<div class="navitem"><a class="btn btn-primary" '+attrs+' href="/mod/feedback/complete.php?id='+id+
    '&amp;courseid=2'+extra+'">Responder</a></div></div></div></div>';
  const now=Math.floor(Date.now()/1000), past=now-3600, future=now+3600;
  const cases=[
    [link(1),past,future,'available','proximas'],
    [notOpen,future,future+3600,'not_yet_open','sin_verificar'],
    [restricted,past,future,'restricted','sin_verificar'],
    [notOpen,past,past+60,'closed','sin_verificar'],
    [completed,past,future,'completed','entregadas'],
    [link(6)+'<p>Multiple submissions allowed</p>',past,future,'available','proximas'],
    ['<p>Anonymous</p><a href="/mod/feedback/analysis.php?id=7">Submitted answers</a>',past,future,'unknown','sin_verificar'],
    [link(8,'&amp;gopage=2'),past,future,'in_progress','proximas'],
    [link(9),null,null,'available','pendientes'],
    ['<p>Unknown layout</p>',past,future,'unknown','sin_verificar'],
    ['',past,future,'SESSION_EXPIRED',null],
    [restricted,past,future,'restricted','sin_verificar'],
    [link(13,'','aria-disabled="true"'),past,future,'unknown','sin_verificar'],
    [link(999),past,future,'unknown','sin_verificar'],
    [link(15)+completed,past,future,'unknown','sin_verificar'],
    [notOpen,null,null,'unknown','sin_verificar'],
    ['<div class="feedback_after_submit">'+completed+'</div>',past,future,'unknown','sin_verificar'],
    [link(18),past,past+60,'available','atrasadas'],
    [completed,past,future,'ACCOUNT_CHANGED',null],
    [completed,past,future,'unknown','sin_verificar'],
    [notice("You've already completed this activity."),past,future,'unknown','sin_verificar'],
    ['<div class="feedback_description">'+completed+'</div>',past,future,'unknown','sin_verificar'],
    ['<form action="/mod/feedback/complete.php"><input type="hidden" name="id" value="23"><button>Responda a las preguntas</button></form>',past,future,'available','proximas'],
    ['<form action="/mod/feedback/complete.php?id=24"><fieldset disabled><button>Responda a las preguntas</button></fieldset></form>',past,future,'unknown','sin_verificar'],
    ['<a href="/mod/feedback/complete.php?id=99">Responda a las preguntas</a>',past,future,'unknown','sin_verificar'],
    ['<a href="https://external.test/mod/feedback/complete.php?id=26">Responda a las preguntas</a>',past,future,'unknown','sin_verificar'],
  ];
  const reads=[];
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  let changed=false, integrated=false, transient=true, submitted=false;
  const events=cases.flatMap(([,open,close],i)=>[['open',open],['close',close]].filter(([,t])=>t!==null)
    .map(([eventtype,timestart])=>({modulename:'feedback',eventtype,timestart,timesort:timestart,
      instance:i+1,visible:1,viewurl:origin+'/calendar/view.php?view=day&time='+timestart,
      ...(eventtype==='close'&&i===0?{action:{url:origin+'/mod/feedback/view.php?id=1'}}:{})})));
  await context.route(origin+'/lib/ajax/service.php?*',route=>{
    const req=route.request(), calls=req.postDataJSON();
    if(req.method()!=='POST'||calls?.length!==1||calls[0].methodname!=='core_calendar_get_calendar_monthly_view')
      throw Error('Operación fuera de la lectura de calendario');
    const [query]=calls;
    const items=integrated?events.filter(event=>[1,2,4,5,18].includes(event.instance)).map((event,index)=>({...event,id:100+index})):events;
    return route.fulfill({json:[{data:{weeks:[{days:[{events:query.args.month===new Date().getMonth()+1?items:[]}]}]}}]});
  });
  await context.route(origin+'/mod/feedback/view.php?*',route=>{
    if(route.request().method()!=='GET'||!/^\?id=[1-9]\d*$/.test(route.request().url().split('view.php')[1]))
      throw Error('Operación fuera de la lectura de Feedback');
    const id=Number(route.request().url().split('?id=')[1]);
    reads.push(id);
    if(integrated&&id===1&&transient){transient=false;return route.fulfill({status:503});}
    const contents=integrated?{
      1:submitted?completed:'<a href="/mod/feedback/complete.php?id=1">Responda a las preguntas</a>',
      2:notOpen.replace('The feedback is not open','La encuesta no está disponible'),
      4:notOpen,
      18:link(18),
      5:changed?link(5):completed.replace("You've already completed this activity.",'Usted ya ha entregado esta retroalimentación.')
    }[id]:(id===12&&changed?link(12):cases[id-1][0]);
    const body=id===11?'<body id="page-login-index"><form id="login"><input type="password"></form>':
      '<body id="page-mod-feedback-view" class="cmid-'+(id===20?999:id)+'">'+(id===19?identity.replace('42','99'):identity)+
      '<main id="region-main">'+contents+'</main>';
    return route.fulfill({body,contentType:'text/html'});
  });
  const calendarResponse=page.waitForResponse(async response=>{
    if(!response.url().startsWith(origin+'/lib/ajax/service.php?'))return false;
    return response.request().postDataJSON()[0].args.month===new Date().getMonth()+1;
  });
  await page.clock.install();
  await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'));
  const [calendar]=await (await calendarResponse).json();
  const discovered=calendar.data.weeks.flatMap(week=>week.days.flatMap(day=>day.events));
  const schedule=await page.evaluate(events=>Object.fromEntries(fixtureFeedback.feedbackSchedule(events,location.origin)),discovered);
  check(Object.keys(schedule).length===cases.length-2&&!schedule['9']&&!schedule['16'],
    'Se descubre un módulo por ID y las dos encuestas sin fechas quedan fuera');
  const baseline=await page.locator('#ugr-panel').getAttribute('data-metrics').then(JSON.parse);
  check(reads.length===0&&baseline.requests===7,'2.2.0 solo usa seis meses y la sesión, sin solicitudes Feedback');
  const inspect=(id,manual)=>page.evaluate(async ({id,manual,window,now})=>{
    const cmid=String(id), prototype=globalThis.fixtureFeedback;
    const response=await fetch('/mod/feedback/view.php?id='+cmid,{redirect:'error'});
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    try{
      const status=prototype.recognizeFeedback(doc,{core:UGCore,origin:location.origin,userId:'42',cmid,window,now:now*1000});
      return {...status,category:prototype.feedbackCategory(status.state,window.closeAt,now*1000,manual)};
    }catch(error){return {state:error.code,category:null};}
  },{id,manual,window:schedule[String(id)]??{},now});
  for(const [i,[,,,state,category]] of cases.entries()){
    const id=i+1, actual=await inspect(id);
    check(actual.state===state&&actual.category===category,'Caso '+id+': '+JSON.stringify(actual));
    if(category)check(actual.done===(state==='completed'),'Confirmación de envío '+id);
  }
  changed=true;
  const updated=await inspect(12);
  check(updated.state==='available'&&updated.category==='proximas','Una nueva lectura reconoce que la encuesta se abrió');
  const manual=await inspect(7,true);
  check(manual.category==='entregadas'&&manual.done===false,'La marca manual prevalece sin inventar confirmación automática');
  check(reads.length===cases.length+2,'Una lectura por inspección, sin solicitudes al formulario');
  const isolatedReads=reads.length;
  integrated=true;changed=false;reads.length=0;
  await page.evaluate(()=>localStorage.removeItem('fixture'));
  const idle=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
    document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'));
  await page.reload();await idle();
  const row=id=>page.locator('[data-id="feedback:'+id+'"]');
  check(reads.slice().sort((a,b)=>a-b).join(',')==='1,1,2,4,5,18','Una lectura por módulo salvo un 503 recuperado, sin duplicar apertura y cierre');
  check(await row(1).getByText('Disponible para responder',{exact:true}).isVisible(),'Encuesta disponible en Próximas');
  check(await row(2).getByText(/Todavía no disponible/).isVisible(),'Apertura futura en Próximas con aviso informativo');
  const choice=id=>row(id).locator('[data-feedback-choice]');
  check(await choice(1).count()===0&&await choice(2).count()===0&&await row(1).locator('[data-reverify]').isVisible(),'Disponible y próxima apertura sin selector');
  await page.locator('[data-tab="atrasadas"]').click();
  check(await row(18).getByText('Disponible para responder',{exact:true}).isVisible()&&await choice(18).count()===0,'Vencida pero disponible según Moodle');
  check(await page.locator('[data-minimal-warning]').isHidden(),'Sin advertencia por indisponibilidad ni error recuperado');
  await page.locator('[data-tab="entregadas"]').click();
  check(await row(5).getByText('Entregada · Confirmada por Moodle').isVisible(),'Aviso inequívoco en vista principal del fixture');
  await page.reload();await idle();await page.locator('[data-tab="entregadas"]').click();
  check(await row(5).isVisible()&&await choice(5).count()===0&&reads.length===6,'La caché conserva el envío y oculta el selector');
  changed=true;
  await row(5).locator('[data-reverify]').click();await idle();
  check(await row(5).isVisible()&&reads.length===7,'El control de respuesta no borra la confirmación anterior');
  await page.locator('[data-tab="pendientes"]').click();
  check(await row(1).isVisible(),'La encuesta abierta también aparece en Pendientes');
  const filtered=await page.evaluate(()=>UGCore.presentationList([
    {it:{mod:'feedback',cmid:'1',due:1},b:'proximas'}
  ],['pendientes','proximas']).length);
  check(filtered===1,'Próximas y Pendientes juntas muestran una sola fila');
  await page.locator('[data-tab="desconocidas"]').click();
  await row(4).getByText('Encuesta cerrada · No se pudo comprobar la participación').waitFor();
  await row(4).locator('[data-feedback-choice]').selectOption('completed');
  await page.locator('[data-tab="entregadas"]').click();
  await row(4).getByText('Completada · Confirmación manual').waitFor();
  await row(4).locator('[data-feedback-choice]').selectOption('not_completed');
  await page.locator('[data-tab="atrasadas"]').click();
  await row(4).getByText('Encuesta cerrada · No completada (manual)').waitFor();
  await page.reload();await idle();
  await page.locator('[data-tab="pendientes"]').click();
  check(await row(4).locator('[data-feedback-choice]').inputValue()==='not_completed','La declaración negativa persiste tras recargar');
  await row(4).locator('[data-feedback-choice]').selectOption('');
  await page.locator('[data-tab="desconocidas"]').click();
  await row(4).getByText('Encuesta cerrada · No se pudo comprobar la participación').waitFor();
  check(reads.length===7,'Restaurar incertidumbre conserva el estado y no inicia consultas');
  const boundaries=await page.evaluate(({html,closed,now})=>{
    const parse=content=>new DOMParser().parseFromString('<body id="page-mod-feedback-view" class="cmid-1">'+
      '<script>M.cfg={"userid":42}</script><main id="region-main">'+content+'</main>','text/html');
    const openAt=now*1000, closeAt=openAt+1000;
    const classify=(doc,time,window)=>UGCore.recognizeFeedback(doc,{origin:location.origin,userId:'42',cmid:'1',now:time,window}).state;
    return [classify(parse(html),openAt,{openAt,closeAt}),classify(parse(closed),closeAt,{openAt,closeAt}),
      classify(parse(html),closeAt-1,{closeAt}),classify(parse(html),openAt,{openAt}),
      classify(parse(html),closeAt,{openAt,closeAt})];
  },{html:link(1),closed:notOpen,now});
  check(boundaries.join(',')==='available,closed,available,available,available','Límites y disponibilidad observada tras el vencimiento');
  const performance=await page.evaluate(({window,now,html})=>{
    const {recognizeFeedback}=globalThis.fixtureFeedback;
    const doc=new DOMParser().parseFromString(html,'text/html');
    const start=performance.now();
    for(let i=0;i<1000;i++)recognizeFeedback(doc,{core:UGCore,origin:location.origin,userId:'42',cmid:'1',window,now:now*1000});
    return {classificationMsPer1000:Math.round(performance.now()-start)};
  },{window:schedule['1'],now,html:'<body id="page-mod-feedback-view" class="cmid-1">'+
    identity+'<main id="region-main">'+link(1)+'</main>'});
  submitted=true;
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#ugr-diagnostics').textContent).nextPeriodicRun!==null);
  await page.clock.fastForward(11*60000);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#ugr-diagnostics').textContent).lastRun.mode==='periodic'&&
    document.querySelector('.ugr-note').textContent.startsWith('Actualización periódica finalizada'),null,{timeout:10000});
  await page.locator('[data-tab="entregadas"]').click();
  check(await row(1).getByText('Entregada · Confirmada por Moodle').isVisible()&&reads.filter(id=>id===1).length===3,
    'El ciclo periódico detecta la nueva entrega al vencer el TTL');
  return {passed,baselineRequests:baseline.requests,baselineSyncMs:baseline.syncMs,
    feedbackReads:isolatedReads,integratedReads:reads.length,...performance};
}
