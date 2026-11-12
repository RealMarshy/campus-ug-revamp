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
  await page.route(`${origin}/mod/quiz/startattempt.php*`, route => {
    started++;
    return route.abort();
  });
  await page.route(`${origin}/mod/quiz/view.php?id=2`, route => {
    reads.push(route.request().method());
    return route.fulfill({contentType:'text/html; charset=utf-8', body:quizPage});
  });
  await page.goto(origin);
  await page.waitForFunction(() => !document.querySelector('[data-refresh]').disabled &&
    document.querySelector('.ugr-note').textContent.includes('Actualización finalizada'));
  const report = JSON.parse(await page.locator('#ugr-diagnostics').textContent());
  const results = {
    pendingInPanel: report.lastRun.recognizedAbsences.quiz_no_attempts===1 && report.effective.unknown===0 && report.activeFailures.length===0,
    oneReadOnly: reads.length===1 && reads[0]==='GET',
    forumsManual: (await page.evaluate(() => fetch('/stats').then(r => r.json()))).forums===0
  };
  await page.getByRole('tab',{name:/^Próximas/}).click();
  results.quizListed = await page.getByRole('link',{name:'Cuestionario de redes',exact:true}).count()===1;
  results.availableLabel=await page.getByText('No iniciado · Disponible para realizar',{exact:true}).count()===1;
  await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+7*86400000;});
  await page.getByRole('tab',{name:/^Atrasadas/}).click();
  results.availablePast=await page.getByRole('link',{name:'Cuestionario de redes',exact:true}).count()===1;

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
  results.noStartRequests=started===0;
  const failed=Object.keys(results).filter(name=>!results[name]);
  if(failed.length)throw new Error(failed.join(', '));
  return {passed:Object.keys(results).length,results};
}
