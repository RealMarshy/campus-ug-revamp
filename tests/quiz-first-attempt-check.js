async page => {
  const origin = 'http://127.0.0.1:8765';
  let started = 0;
  const reads = [];
  const quizPage = `<body id="page-mod-quiz-view">
    <script>M.cfg={"userid":42};</script>
    <main id="region-main">
      <div class="quizstartbuttondiv"><form method="post" action="/mod/quiz/startattempt.php">
        <input type="hidden" name="cmid" value="2">
        <button type="submit">Intento de cuestionario</button>
      </form></div>
      <div class="quizinfo"><p>Intentos permitidos: 1</p></div>
    </main></body>`;
  // Minimal fixture based on Moove's public mod_quiz templates.
  const card=(number,state)=>'<div class="w-100"><div class="rounded border"><h4 class="card-title">Intento '+number+'</h4>'+
    '<div class="moove-summary-table quizreviewsummary"><div class="moove-quizreviewsummary"><div class="moove-infobox">'+
    '<h5 class="moove-infobox-title">Estado</h5><div class="moove-infobox-content--small">'+state+'</div>'+
    '</div></div></div></div></div>';
  const list=(...cards)=>'<h3>Sus intentos</h3><div class="moove-attempts-list">'+cards.join('')+'</div>';
  const cardPage=(markup)=>quizPage.replace('id="page-mod-quiz-view"','id="page-mod-quiz-view" class="cmid-2"')
    .replace(/<main[\s\S]*?<\/main>/,'<main id="region-main">'+markup+'</main>');
  const finalGrade='<div class="generalbox feedback"><h3>Su calificación final en este cuestionario es 0,00/10,00.</h3></div>';
  const completedPage=cardPage(finalGrade+list(card(1,'Finalizado')));
  let servedQuiz=quizPage, quizHttpError=false;
  await page.route(`${origin}/mod/quiz/startattempt.php*`, route => {
    started++;
    return route.abort();
  });
  await page.route(`${origin}/mod/quiz/view.php?id=2`, route => {
    reads.push(route.request().method());
    if(quizHttpError)return route.fulfill({status:503,body:'Fixture 503'});
    return route.fulfill({contentType:'text/html; charset=utf-8', body:servedQuiz});
  });
  await page.addInitScript(()=>{
    if(location.origin==='http://127.0.0.1:8765'&&!localStorage.fixture)
      localStorage.fixture=JSON.stringify({['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0}});
  });
  await page.goto(origin);
  await page.waitForFunction(() => !document.querySelector('[data-refresh]').disabled &&
    document.querySelector('.ugr-note').textContent.includes('Actualización finalizada')).catch(async e=>{throw Error('Sincronización: '+await page.locator('.ugr-note[role=status]').textContent(),{cause:e});});
  const report = JSON.parse(await page.locator('#ugr-diagnostics').textContent());
  const results = {
    pendingInPanel: report.lastRun.recognizedAbsences.quiz_no_attempts===1 && report.effective.unknown===0 && report.activeFailures.length===0,
    oneReadOnly: reads.length===1 && reads[0]==='GET',
    forumsManual: (await page.evaluate(() => fetch('/stats').then(r => r.json()))).forums===0
  };
  await page.getByRole('tab',{name:/^Próximas/}).click();
  results.quizListed = await page.getByRole('link',{name:'Cuestionario de redes',exact:true}).count()===1;
  results.availableLabel=await page.getByText('No iniciado · Disponible para realizar',{exact:true}).count()===1;
  const clock=await page.evaluateHandle(()=>Date.now);
  await page.evaluate(now=>{Date.now=()=>now()+7*86400000;},clock);
  await page.getByRole('tab',{name:/^Atrasadas/}).click();
  results.availablePast=await page.getByRole('link',{name:'Cuestionario de redes',exact:true}).count()===1;
  await page.evaluate(now=>{Date.now=now;},clock);

  Object.assign(results, await page.evaluate(({html,origin}) => {
    const before=localStorage.getItem('fixture');
    const check=(markup,cmid='2',userId='42')=>{
      try {
        const doc=new DOMParser().parseFromString(markup,'text/html');
        return UGCore.recognize(doc,'quiz',userId,origin,cmid);
      }catch(error){return {code:error.code,details:error.details};}
    };
    const pending=result=>result.done===false && result.absence==='quiz_no_attempts' && result.available===true;
    const rejected=(markup,reason,cmid='2')=>{
      const result=check(markup,cmid);
      return result.code==='SELECTOR_MISSING' && result.details.quizStartReason===reason;
    };
    const addInside=markup=>html.replace('</main>',`${markup}</main>`);
    const finished='<table class="quizreviewsummary"><tr><th>Estado</th><td>Finalizado</td></tr></table>';
    const unknown='<table class="quizreviewsummary"><tr><th>Estado</th><td>Estado personalizado</td></tr></table>';
    const report={
      localized:pending(check(html)),
      queryCmid:pending(check(html.replace('startattempt.php','startattempt.php?cmid=2').replace('<input type="hidden" name="cmid" value="2">',''))),
      missingContext:rejected(html.replace('Intentos permitidos: 1','Intentos permitidos: 2'),'single_attempt_not_confirmed'),
      contextOutsideQuizInfo:rejected(html.replace('class="quizinfo"','class="description"'),'single_attempt_not_confirmed'),
      mismatchedModule:rejected(html,'module_not_confirmed','3'),
      conflictingModule:rejected(html.replace('startattempt.php','startattempt.php?cmid=3'),'module_not_confirmed'),
      missingModule:rejected(html.replace('name="cmid"','name="other"'),'module_not_confirmed'),
      badMethod:rejected(html.replace('method="post"','method="get"'),'form_not_confirmed'),
      wrongAction:rejected(html.replace('startattempt.php','review.php'),'form_not_confirmed'),
      externalAction:rejected(html.replace('/mod/quiz/startattempt.php','https://example.test/mod/quiz/startattempt.php'),'form_not_confirmed'),
      override:rejected(html.replace('type="submit"','type="submit" formaction="review.php"'),'form_not_confirmed'),
      disabled:rejected(html.replace('type="submit"','type="submit" disabled'),'form_not_confirmed'),
      hiddenForm:rejected(html.replace('<form method','<form style="display:none" method'),'form_not_confirmed'),
      restricted:check(addInside('<div class="quizattempt"><p>Access restricted</p></div>')).absence==='quiz_unavailable',
      notOpen:check(html.replace(/<div class="quizstartbuttondiv">[\s\S]*?<\/div>/,'<div class="quizattempt"><p>This quiz is not yet open.</p></div>')).absence==='quiz_unavailable',
      ambiguousRestriction:check(addInside('<div class="availabilityinfo">Condición pendiente</div>')).code==='SELECTOR_MISSING',
      noButton:check('<body id="page-mod-quiz-view"><script>M.cfg={"userid":42};</script><main><p>No attempts have been made.</p></main>').available===undefined,
      inProgress:check(addInside(finished.replace('Finalizado','En curso'))).done===false,
      attemptParam:rejected(html.replace('startattempt.php','startattempt.php?attempt=17'),'existing_attempt_evidence'),
      reviewLink:rejected(addInside('<a href="/mod/quiz/review.php?attempt=17">Revisión</a>'),'existing_attempt_evidence'),
      wrongView:check(html.replace('page-mod-quiz-view','page-mod-quiz-review')).code==='VIEW_MISMATCH',
      wrongIdentity:check(html,'2','99').code==='ACCOUNT_CHANGED',
      existingUnknown:check(addInside(unknown)).code==='STATE_UNKNOWN',
      existingFinished:check(addInside(finished)).done===true,
      continue:check(html.replace('Intento de cuestionario','Continuar el último intento')).details?.quizStart==='resume',
      retry:check(html.replace('Intento de cuestionario','Reintentar el cuestionario')).details?.quizStart==='reattempt',
      originalLabel:pending(check(html.replace('Intento de cuestionario','Attempt quiz'))),
      textAlone:check(html.replace('class="quizstartbuttondiv"','class="description"')).code==='SELECTOR_MISSING'
    };
    report.readOnlyParser=localStorage.getItem('fixture')===before;
    return report;
  },{html:quizPage,origin}));
  const cardCases={
    complete:completedPage,
    progress:cardPage(list(card(1,'En curso'))),
    unknown:cardPage(list(card(1,'Personalizado'))),
    multiple:cardPage(list(card(2,'En curso'),card(1,'Finalizado'))),
    narrative:cardPage('<p>Finalizado</p>'),
    gradeOnly:cardPage('<h3>Su calificación final en este cuestionario es 8/10.</h3>'),
    hiddenCard:cardPage(list(card(1,'Finalizado').replace('class="w-100"','class="w-100" hidden'))),
    hiddenValue:cardPage(list(card(1,'<span style="display:none">Finalizado</span>'))),
    foreignBlock:cardPage('<div class="activity-description">'+list(card(1,'Finalizado'))+'</div>'),
    contradictory:cardPage(list(card(1,'Finalizado'),card(1,'En curso'))),
    competingLists:cardPage(list(card(1,'Finalizado'))+list(card(2,'En curso'))),
    wrongModule:completedPage.replace('cmid-2','cmid-3'),
    missingModule:completedPage.replace('cmid-2',''),
    wrongViewer:completedPage.replace('"userid":42','"userid":99'),
    wrongPage:completedPage.replace('page-mod-quiz-view','page-mod-quiz-review'),
    busy:completedPage.replace('id="region-main"','id="region-main" aria-busy="true"'),
    table:cardPage('<table class="quizattemptsummary"><thead><tr><th>Estado</th></tr></thead>'+
      '<tbody><tr><td>Finalizado</td></tr></tbody></table>'),
  };
  const expected={
    complete:true, progress:false, unknown:'STATE_UNKNOWN', multiple:true, narrative:'SELECTOR_MISSING',
    gradeOnly:'SELECTOR_MISSING', hiddenCard:'STATE_UNKNOWN', hiddenValue:'STATE_UNKNOWN', foreignBlock:'STATE_UNKNOWN',
    contradictory:'STATE_UNKNOWN', competingLists:'STATE_UNKNOWN', wrongModule:'STATE_UNKNOWN',
    missingModule:'STATE_UNKNOWN', wrongViewer:'ACCOUNT_CHANGED', wrongPage:'VIEW_MISMATCH', busy:'STATE_UNKNOWN', table:true,
  };
  Object.assign(results,await page.evaluate(({origin,cardCases,expected})=>Object.fromEntries(
    Object.entries(cardCases).map(([name,html])=>{
      let actual;
      try{
        const doc=new DOMParser().parseFromString(html,'text/html');
        actual=UGCore.recognize(doc,'quiz','42',origin,'2').done;
      }catch(e){actual=e.code;}
      return ['card_'+name,actual===expected[name]];
    })
  ),{origin,cardCases,expected}));

  const campusHeader=(opening,closing)=>'<header id="page-header"><div class="page-context-header">'+
    '<div class="page-header-headings"><h1>Cuestionario de prueba</h1></div></div>'+
    '<div data-region="header-extras-container"><div class="header-extra"><div data-activityname="Cuestionario de prueba">'+
    '<div data-region="activity-dates" class="activity-dates">'+
    '<div class="date-item"><span class="date-item-label">Abre:</span> '+opening+'</div>'+
    '<div class="date-item"><span class="date-item-label">Cierra:</span> '+closing+'</div>'+
    '</div></div></div></div></header>';
  const campusQuiz=(opening,closing)=>cardPage('<div class="activity-header" data-for="page-activity-header">'+
    '<div data-region="activity-information"><div data-region="activity-details"></div></div></div>'+
    '<div role="main"><div class="quizinfo"><p>Intentos permitidos: 1</p></div>'+
    '<div class="quizattempt"><p>Este cuestionario no está disponible en este momento</p></div></div>')
    .replace('<main id="region-main">',campusHeader(opening,closing)+'<main id="region-main">');
  const campusA=campusQuiz('jueves, 17 de diciembre de 2026, 20:29','domingo, 17 de enero de 2027, 21:18');
  const campusB=campusQuiz('lunes, 11 de enero de 2027, 01:23','lunes, 11 de enero de 2027, 02:23');
  const campusResults=await page.evaluate(({campusA,campusB,origin})=>{
    const clock=Date.now;
    Date.now=()=>Date.UTC(2026,10,13);
    try{
      const read=(html,close,cmid='2')=>UGCore.recognize(new DOMParser().parseFromString(html,'text/html'),'quiz','42',origin,cmid,close,true);
      const closeA=Date.UTC(2027,0,18,2,18),closeB=Date.UTC(2027,0,11,7,23);
      const a=read(campusA,closeA),b=read(campusB,closeB);
      const scheduled=(result,open)=>result.absence==='quiz_scheduled'&&result.quizOpenAt===open&&
        result.quizOpening.header==='found'&&result.quizOpening.headerLocation==='outside_main'&&
        result.quizOpening.attempts==='absence_not_confirmed'&&result.quizOpening.calendarClose==='match';
      return {
        campusDecemberToJanuary:scheduled(a,Date.UTC(2026,11,18,1,29)),
        campusOneHour:scheduled(b,Date.UTC(2027,0,11,6,23)),
        campusWrongClose:read(campusA,closeA+60000).absence==='quiz_unavailable',
        campusWrongModule:read(campusB,closeB,'3').absence==='quiz_unavailable',
        campusWrongActivity:read(campusB.replace('data-activityname="Cuestionario de prueba"','data-activityname="Otra actividad"'),closeB).absence==='quiz_unavailable',
        campusDuplicateBlocks:read(campusA.replace('<main',campusB.match(/<header[\s\S]*?<\/header>/)[0]+'<main'),closeA).absence==='quiz_unavailable',
        campusElapsedOpening:read(campusA.replace('jueves, 17 de diciembre','martes, 10 de noviembre'),closeA).absence==='quiz_unavailable'
      };
    }finally{Date.now=clock;}
  },{campusA,campusB,origin});
  Object.assign(results,campusResults);
  if(!campusResults.campusDecemberToJanuary||!campusResults.campusOneHour)throw Error('Fixtures A/B: '+JSON.stringify(campusResults));
  const closureCases=await page.evaluate(({origin,completedPage})=>{
    const label=(label)=>'<div data-region="activity-dates"><strong>'+label+':</strong></div>';
    const unavailable='<div class="quizattempt"><p>Este cuestionario no está disponible en este momento.</p></div>';
    const inspect=(markup)=>{
      const doc=new DOMParser().parseFromString(markup,'text/html');
      return {state:UGCore.recognize(doc,'quiz','42',origin,'2',Date.UTC(2099,0,3,7,23)),closed:UGCore.closeEvidence(doc,'quiz')};
    };
    const openNotice='<div class="quizattempt"><p>Este cuestionario no está disponible en este momento</p></div>';
    const noAttempts='<p>No attempts have been made.</p>';
    const schedule='<div data-for="page-activity-header"><div data-region="activity-dates">'+
      '<div><strong>Abre:</strong> sábado, 3 de enero de 2099, 01:23</div>'+
      '<div><strong>Cierra:</strong> sábado, 3 de enero de 2099, 02:23</div></div></div>';
    const traced=UGCore.recognize(new DOMParser().parseFromString(cardPageForTest(schedule+openNotice),'text/html'),'quiz','42',origin,'2',Date.UTC(2099,0,3,7,23),true);
    const future=inspect(cardPageForTest(schedule+openNotice+noAttempts));
    const restrictionOnly=inspect(cardPageForTest(schedule+openNotice));
    const invalidWindows=[
      openNotice+noAttempts,
      schedule.replace('02:23','00:23')+openNotice+noAttempts,
      schedule.replace('02:23','02:24')+openNotice+noAttempts,
      '<div class="activity-description">'+schedule+'</div>'+openNotice+noAttempts,
      '<div hidden>'+schedule+'</div>'+openNotice+noAttempts,
      schedule+openNotice+noAttempts+'<div class="availabilityinfo">Grupo requerido</div>',
    ];
    function cardPageForTest(content){
      return '<body id="page-mod-quiz-view" class="cmid-2"><script>M.cfg={"userid":42};</script><main>'+content+'</main></body>';
    }
    const before=inspect(completedPage.replace('</main>',label('Cierra')+'</main>'));
    const after=inspect(completedPage.replace('</main>',label('Cerró')+'</main>'));
    const closedWithoutAttempt=inspect('<body id="page-mod-quiz-view" class="cmid-2">'+
      '<script>M.cfg={"userid":42};</script><main>'+label('Cerró')+unavailable+'</main></body>');
    return {
      completedWhileOpen:before.state.done===true&&!before.closed&&before.state.grade==='0,00/10,00',
      completedAfterClose:after.state.done===true,
      evidenceOfFutureAbsence:future.state.absence==='quiz_not_yet_open'&&future.state.quizOpenAt===Date.UTC(2099,0,3,6,23)&&restrictionOnly.state.absence==='quiz_scheduled'&&restrictionOnly.state.quizOpenAt===future.state.quizOpenAt,
      diagnosticSeparatesScheduleAndAttempts:traced.absence==='quiz_scheduled'&&JSON.stringify(traced.quizOpening)===JSON.stringify({
        restriction:'temporal_notice',attempts:'absence_not_confirmed',startControl:false,moduleMatches:true,
        header:'found',headerLocation:'outside_main',opening:'future',closing:'valid',dateOrder:'valid',calendarClose:'match'
      }),
      alternateActivityInformation:inspect(cardPageForTest(schedule.replace('data-for="page-activity-header"',
        'data-region="activity-information"')+openNotice)).state.absence==='quiz_scheduled',
      headerOutsideMain:inspect(cardPageForTest(openNotice).replace('<main>',schedule+'<main id="region-main">')).state.absence==='quiz_scheduled',
      headerInsideMain:inspect(cardPageForTest(schedule+openNotice).replace('<main>','<main id="region-main">')).state.absence==='quiz_scheduled',
      permissionsStayUnverified:inspect(cardPageForTest(schedule+'<div class="quizattempt"><p>Acceso restringido</p></div>')).state.absence==='quiz_unavailable',
      duplicateHeaderStaysUnverified:inspect(cardPageForTest(schedule+schedule+openNotice)).state.absence==='quiz_unavailable',
      ambiguousSchedulesRemainUnverified:invalidWindows.every(markup=>inspect(cardPageForTest(markup)).state.absence==='quiz_unavailable'),
      closedWithoutParticipation:closedWithoutAttempt.closed&&closedWithoutAttempt.state.done===false&&
        closedWithoutAttempt.state.absence==='quiz_unavailable'
    };
  },{origin,completedPage});
  Object.assign(results,closureCases);
  const settled=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled &&
    document.querySelector('.ugr-note').textContent.includes('Actualización finalizada')).catch(async e=>{throw Error('Sincronización: '+await page.locator('.ugr-note[role=status]').textContent(),{cause:e});});
  const diagnostics=async()=>JSON.parse(await page.locator('#ugr-diagnostics').textContent());
  const quizRow=page.locator('[data-id="quiz:2"]');
  const reverify=()=>quizRow.locator('[data-reverify]').click();
  await page.getByRole('tab',{name:/^Próximas/}).click();
  servedQuiz=cardCases.gradeOnly;
  await reverify();await settled();
  const failure=(await diagnostics()).activeFailures.find(item=>item.module==='quiz');
  results.priorSelectorFailure=failure?.code==='SELECTOR_MISSING'&&failure.retryInMinutes>0;
  const beforeRecovery=reads.length;
  servedQuiz=completedPage;
  await page.getByRole('tab',{name:/^Sin verificar/}).click();
  await reverify();await settled();
  const recovered=await diagnostics();
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  results.individualRecovery=await quizRow.isVisible()&&recovered.lastRun.mode==='one'&&
    recovered.lastRun.recovered.quiz===1&&!recovered.activeFailures.some(item=>item.module==='quiz');
  results.finalGrade=await quizRow.locator('.ugr-grade').textContent()==='Calificación: 0,00/10,00';
  results.recoveredWithSingleGet=reads.length===beforeRecovery+1&&reads.at(-1)==='GET';
  for(const [result,label] of [
    ['upcoming','Próximas'],['overdue','Atrasadas'],['pending','Pendientes'],['unverified','Sin verificar']
  ]){
    await page.getByRole('tab',{name:new RegExp('^'+label)}).click();
    results['completedAbsent_'+result]=await quizRow.count()===0;
  }
  await page.evaluate(now=>{Date.now=()=>now()+7*86400000;},clock);
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  results.completedPastDeadline=await quizRow.isVisible();
  await page.evaluate(now=>{Date.now=now;},clock);
  await page.waitForFunction(()=>UGCore.readState(JSON.parse(localStorage.fixture),'ugr2:'+location.origin+':42:',location.origin).cache.auto['quiz:2']?.done===true).catch(e=>{throw Error('Finalización no persistida',{cause:e});});
  servedQuiz=cardCases.gradeOnly;
  await page.reload();await settled();
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  results.persistedCompletion=await quizRow.isVisible()&&(await quizRow.locator('.ugr-grade').textContent()).includes('0,00/10,00');
  servedQuiz=completedPage;
  results.officialCompletionHidesManual=await quizRow.locator('[data-manual-choice], [data-toggle]').count()===0;
  const legacy=await page.context().newPage();
  await legacy.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:8765'||sessionStorage.legacySeeded)return;
    sessionStorage.legacySeeded='1';
    const prefix='ugr2:'+location.origin+':42:',now=Date.now();
    localStorage.fixture=JSON.stringify({
      [prefix+'presentation']:{schema:1,autoRefreshMinutes:0},
      [prefix+'failures']:{'quiz:2':{code:'SELECTOR_MISSING',t:now-1000,retryAt:now+3600000,attempts:5,
        details:{identity:'match',pageView:'view',hasMain:true,mainBusy:false,attemptRows:0,attemptSummaries:0,quizStart:'missing'}}}
    });
  });
  let legacyReads=0;
  await legacy.route(origin+'/mod/quiz/view.php?id=2',route=>{
    legacyReads++;
    return route.fulfill({contentType:'text/html',body:completedPage});
  });
  await legacy.goto(origin);
  await legacy.waitForFunction(()=>document.querySelector('.ugr-note[role=status]').textContent.startsWith('Actualización finalizada'));
  const migration=JSON.parse(await legacy.locator('#ugr-diagnostics').textContent());
  results.automaticSelectorUpgrade=legacyReads===1&&migration.lastRun.recovered.quiz===1&&migration.activeFailures.length===0;
  await legacy.reload();
  await legacy.waitForFunction(()=>document.querySelector('.ugr-note[role=status]').textContent.startsWith('Actualización finalizada'));
  results.noRepeatedSelectorUpgrade=legacyReads===1;
  await legacy.close();
  const openAt=Math.floor(Date.now()/60000)*60000+86400000;
  const closeAt=openAt+3600000;
  const formatDate=ts=>new Intl.DateTimeFormat('es-EC',{
    timeZone:'America/Guayaquil',weekday:'long',day:'numeric',month:'long',year:'numeric'
  }).format(ts)+', '+new Intl.DateTimeFormat('es-EC',{
    timeZone:'America/Guayaquil',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(ts);
  // Reuse the same activity GET and give the sandbox calendar an explicit close event.
  await page.route(origin+'/lib/ajax/service.php?*',async route=>{
    const response=await route.fetch();
    const data=await response.json();
    for(const week of data[0].data.weeks)for(const day of week.days)for(const event of day.events){
      if(event.modulename==='quiz'){
        event.eventtype='close';
        event.timestart=event.timesort=closeAt/1000;
      }
    }
    await route.fulfill({response,json:data});
  });
  await page.evaluate(()=>{
    localStorage.fixture=JSON.stringify({['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0}});
  });
  const schedulePage=campusQuiz(formatDate(openAt),formatDate(closeAt));
  const closedAt=Math.floor(Date.now()/60000)*60000-86400000;
  const closedPage=campusQuiz(formatDate(closedAt-3600000),formatDate(closedAt))
    .replace('Abre:','Abrió:').replace('Cierra:','Cerró:')
    .replace(/<div class="activity-header"[\s\S]*?<div role="main">/,'<div class="activity-header"></div><div role="main">')
    .replace('Intentos permitidos: 1</p>','Intentos permitidos: 1</p><p>Límite de tiempo: 1 hora</p>')
    .replace('<p>Este cuestionario no está disponible en este momento</p>',
      '<form method="get" action="/course/view.php"><input type="hidden" name="id" value="7">'+
      '<button type="submit">Volver al curso</button></form>');
  Object.assign(results,await page.evaluate(({origin,closedPage,closedAt,visibleAttempt,contradiction,futureClosure})=>{
    const read=(html,close=null,cmid='2')=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      try{return UGCore.recognize(doc,'quiz','42',origin,cmid,close);}
      catch(error){return {code:error.code};}
    };
    const closed=read(closedPage);
    return {
      closedWithoutCalendar:closed.done===false&&closed.absence==='quiz_closed_unknown'&&!closed.available,
      closedCalendarAgrees:read(closedPage,closedAt).absence==='quiz_closed_unknown',
      closedCalendarMismatch:read(closedPage,closedAt+60000).code==='SELECTOR_MISSING',
      closedVisibleAttemptWins:read(closedPage.replace('</main>',visibleAttempt+'</main>')).done===true,
      closedContradictoryDates:read(contradiction).code==='SELECTOR_MISSING',
      closedFutureDates:read(futureClosure).code==='SELECTOR_MISSING',
      closedWrongActivity:read(closedPage.replace('data-activityname="Cuestionario de prueba"','data-activityname="Otra actividad"')).code==='SELECTOR_MISSING',
      closedWrongModule:read(closedPage,null,'3').code==='SELECTOR_MISSING',
      closedOtherRestriction:read(closedPage.replace('</main>','<div class="quizattempt"><p>Acceso restringido</p></div></main>')).absence==='quiz_unavailable',
      closedUnknownRestriction:read(closedPage.replace('</form>','</form><p>Grupo obligatorio</p>')).code==='SELECTOR_MISSING',
      closedForeignReturn:read(closedPage.replace('/course/view.php','https://example.test/course/view.php')).code==='SELECTOR_MISSING',
      closedReviewLink:read(closedPage.replace('</main>','<a href="/mod/quiz/review.php?attempt=6">Revisión</a></main>')).code==='SELECTOR_MISSING',
      closedMixedDateLabels:read(closedPage.replace('Cerró:','Cierra:')).code==='SELECTOR_MISSING',
    };
  },{origin,closedPage,closedAt,visibleAttempt:list(card(1,'Finalizado')),
    contradiction:closedPage.replace(formatDate(closedAt-3600000),formatDate(closedAt+60000)),
    futureClosure:closedPage.replace(formatDate(closedAt),formatDate(closeAt))}));
  servedQuiz=schedulePage;
  await page.goto(origin);
  await settled();
  await page.getByRole('tab',{name:/^Próximas/}).click();
  results.scheduledUpcoming=await quizRow.isVisible()&&
    (await quizRow.locator('.ugr-source').textContent()).startsWith('Todavía no disponible · Abre el ');
  await page.getByRole('tab',{name:/^Pendientes/}).click();
  results.scheduledPending=await quizRow.isVisible();
  await page.reload();await settled();
  results.schedulePersisted=await quizRow.isVisible();
  await page.locator('[data-personalize]').click();
  await page.locator('[data-mode]').selectOption('custom');
  results.scheduleSimpleView=await quizRow.isVisible();
  servedQuiz=quizPage;
  await reverify();await settled();
  results.availableAfterSchedule=await quizRow.locator('.ugr-source').textContent()==='No iniciado · Disponible para realizar';
  servedQuiz=completedPage;
  await reverify();await settled();
  await page.locator('[data-mode]').selectOption('tabs');
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  servedQuiz=schedulePage;
  await reverify();await settled();
  results.schedulePreservesCompletion=await quizRow.isVisible()&&await quizRow.locator('.ugr-grade').count()===1;
  await page.unroute(origin+'/lib/ajax/service.php?*');
  await page.route(origin+'/lib/ajax/service.php?*',async route=>{
    const response=await route.fetch(), data=await response.json();
    for(const week of data[0].data.weeks)for(const day of week.days)for(const event of day.events){
      if(event.modulename==='quiz')event.timesort=closedAt/1000;
    }
    await route.fulfill({response,json:data});
  });
  await page.evaluate(()=>{
    localStorage.fixture=JSON.stringify({['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0}});
  });
  servedQuiz=closedPage;
  await page.goto(origin);await settled();
  await page.getByRole('tab',{name:/^Sin verificar/}).click();
  const closedReport=await diagnostics();
  results.closedInPanel=await quizRow.locator('.ugr-source').textContent()==='Cuestionario cerrado · Participación sin confirmar'&&
    closedReport.lastRun.recognizedAbsences.quiz_closed_unknown===1&&closedReport.lastRun.activityErrors===0&&closedReport.activeFailures.length===0;
  const counter=category=>page.locator('[data-tab="'+category+'"] span').textContent().then(Number);
  const pendingBefore=await counter('pendientes'), unknownBefore=await counter('desconocidas');
  await page.getByRole('tab',{name:/^Pendientes/}).click();
  results.closedAlsoPending=await quizRow.count()===1;
  await page.getByRole('tab',{name:/^Atrasadas/}).click();
  results.closedNotOverdue=await quizRow.count()===0;
  await page.getByRole('tab',{name:/^Sin verificar/}).click();
  quizHttpError=true;
  await reverify();await settled();
  results.closedErrorDropsPending=await counter('pendientes')===pendingBefore-1&&
    await counter('desconocidas')===unknownBefore&&(await diagnostics()).activeFailures.some(f=>f.code==='HTTP');
  quizHttpError=false;
  const beforeClosedRead=reads.length;
  await reverify();await settled();
  results.closedSingleGet=reads.length===beforeClosedRead+1&&reads.at(-1)==='GET';
  await page.reload();await settled();
  await page.getByRole('tab',{name:/^Sin verificar/}).click();
  results.closedPersisted=await quizRow.locator('.ugr-source').textContent()==='Cuestionario cerrado · Participación sin confirmar'&&
    await counter('pendientes')===pendingBefore;
  const declaration=quizRow.getByRole('combobox',{name:/Realización · declaración manual/});
  for(const [width,appearance] of [[320,'light'],[360,'dark'],[320,'auto']]){
    await page.setViewportSize({width,height:720});
    await page.locator('[data-personalize]').click();
    await page.locator('[data-appearance]').selectOption(appearance);
    await page.locator('[data-personalize]').click();
    if(appearance==='auto')await page.evaluate(()=>Object.assign(document.documentElement.dataset,{darkreaderMode:'dynamic',darkreaderScheme:'dark'}));
    await declaration.focus();
    results['manualLayout_'+appearance]=await declaration.evaluate(node=>{
      const box=node.getBoundingClientRect(), row=node.closest('li').getBoundingClientRect();
      const style=getComputedStyle(node);
      return node===document.activeElement&&box.width>0&&box.left>=row.left&&box.right<=row.right+1&&box.right<=innerWidth&&
        style.color!==style.backgroundColor;
    });
  }
  await page.setViewportSize({width:1024,height:720});
  const countRequests=()=>page.locator('#ugr-panel').getAttribute('data-metrics').then(json=>JSON.parse(json).requests);
  const beforeDeclarations=await countRequests();
  await declaration.selectOption('yes');
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  results.closedManuallyCompleted=await declaration.inputValue()==='yes'&&await quizRow.locator('.ugr-grade').count()===0;
  results.closedPositiveCounters=await counter('pendientes')===pendingBefore-1&&await counter('desconocidas')===unknownBefore-1;
  await declaration.selectOption('no');
  await page.getByRole('tab',{name:/^Atrasadas/}).click();
  results.closedManuallyIncomplete=await declaration.inputValue()==='no';
  await page.getByRole('tab',{name:/^Pendientes/}).click();
  results.closedNegativePending=await quizRow.isVisible();
  await declaration.selectOption('yes');
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  await declaration.selectOption('');
  await page.getByRole('tab',{name:/^Sin verificar/}).click();
  results.closedWithdrawsLocally=await declaration.inputValue()===''&&await countRequests()===beforeDeclarations&&
    await quizRow.locator('.ugr-source').textContent()==='Cuestionario cerrado · Participación sin confirmar';
  results.closedRestoredCounters=await counter('pendientes')===pendingBefore&&await counter('desconocidas')===unknownBefore;
  await declaration.selectOption('no');
  await page.getByRole('tab',{name:/^Pendientes/}).click();
  servedQuiz=completedPage;
  await reverify();await settled();
  await page.getByRole('tab',{name:/^Entregadas/}).click();
  results.officialCompletionOverridesNegative=await declaration.inputValue()==='no'&&
    await quizRow.locator('.ugr-source').textContent()==='Entrega confirmada por Moodle · Contradice la declaración manual';
  servedQuiz=closedPage;
  await reverify();await settled();
  results.closedPreservesCompletionAndGrade=await quizRow.isVisible()&&await quizRow.locator('.ugr-grade').textContent()==='Calificación: 0,00/10,00';
  await declaration.selectOption('');
  results.closedWithdrawalPreservesOfficial=await quizRow.isVisible()&&await declaration.count()===0&&
    await quizRow.locator('.ugr-grade').textContent()==='Calificación: 0,00/10,00';
  results.noStartRequests=started===0;
  const failed=Object.keys(results).filter(name=>!results[name]);
  if(failed.length)throw new Error(failed.join(', '));
  return {passed:Object.keys(results).length,results};
}
