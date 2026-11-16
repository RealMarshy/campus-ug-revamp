async page=>{
 let passed=0;const check=(ok,msg)=>{if(!ok)throw new Error(msg);passed++;};
 const wait=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled && document.querySelector('.ugr-note').textContent.includes('Actualización finalizada'),null,{timeout:50000});
 const diag=()=>page.locator('#ugr-diagnostics').textContent().then(JSON.parse);
 const fresh=async mode=>{await page.evaluate(async m=>{await fetch('/mode?value='+m);localStorage.clear();},mode);await page.reload();await wait();};
 await fresh('normal');
 const parser=await page.evaluate(()=>{
  const results=[],id='<script>window.M={cfg:{"userId":42,"sesskey":"fake"}}</script>';
  const run=(html,mod,expected)=>{try{const s=UGCore.recognize(new DOMParser().parseFromString(id+html,'text/html'),mod,'42',location.origin);results.push(s.done===expected);}catch(e){results.push(e.code===expected);}};
  run('<div class="submissionstatussubmitted">Submitted for grading</div>','assign',true);
  run('<div class="submissionstatusdraft">Draft</div>','assign',false);
  run('<div class="submissionstatustable"><table><tr><td>Submission status</td><td>No submissions have been made yet</td></tr></table></div>','assign',false);
  run('<div class="submissionstatus">Unrecognized</div>','assign','STATE_UNKNOWN');
  run('<main><p>Submitted for grading</p></main>','assign','SELECTOR_MISSING');
  run('<table class="quizattemptsummary"><thead><tr><th>State</th><th>Feedback</th></tr></thead><tbody><tr><td>Finished<br>Completed on a date</td><td>Other</td></tr></tbody></table>','quiz',true);
  run('<table class="quizattemptsummary"><thead><tr><th>State</th><th>Feedback</th></tr></thead><tbody><tr><td>In progress</td><td>Finished</td></tr></tbody></table>','quiz',false);
  run('<table class="quizreviewsummary"><tr><th>Status</th><td>Finished</td></tr></table>','quiz',true);
  run('<table class="quizattemptsummary"><tbody></tbody></table>','quiz','STATE_UNKNOWN');
  run('<main><p>No attempts have been made</p></main>','quiz',false);
  return results;
 });parser.forEach((ok,i)=>check(ok,'HTML fixture '+i));
 const focused=await page.evaluate(()=>{
  const quizStart=label=>`<div class="quizstartbuttondiv"><form method="post" action="/mod/quiz/startattempt.php?cmid=2"><button type="submit">${label}</button></form></div>`;
  const verify=(module,view,html,busy=false)=>{
   const doc=new DOMParser().parseFromString(`<body id="page-mod-${module}-${view}"><script>window.M={cfg:{"userId":42}};</script><main aria-busy="${busy}">${html}</main><footer id="page-footer"></footer></body>`,'text/html');
   try{return UGCore.recognize(doc,module,'42',location.origin,'2');}catch(error){return error;}
  };
  const emptyQuiz=verify('quiz','view',quizStart('Intentar resolver el cuestionario'));
  const unknownQuiz=verify('quiz','view','<table class="quizreviewsummary"><tr><th>Unknown</th><td>Unknown</td></tr></table>');
  return {
   emptyQuiz:emptyQuiz.done===false&&emptyQuiz.absence==='quiz_no_attempts',
   wrongQuizView:verify('quiz','review','<table class="quizreviewsummary"><tr><th>Status</th><td>Finished</td></tr></table>').code==='VIEW_MISMATCH',
   reattempt:verify('quiz','view',quizStart('Re-attempt quiz')).details?.quizStart==='reattempt',
   resume:verify('quiz','view',quizStart('Continue your attempt')).details?.quizStart==='resume',
   restricted:verify('quiz','view','<div class="quizattempt"><div class="alert">No disponible</div></div>').details?.quizStart==='restricted',
   externalAction:verify('quiz','view',quizStart('Attempt quiz').replace('/mod/quiz/startattempt.php','https://example.test/mod/quiz/startattempt.php')).code==='SELECTOR_MISSING',
   unknownQuiz:unknownQuiz.code==='STATE_UNKNOWN'&&unknownQuiz.details.attemptSummaries===1
  };
 });
 for(const [name,ok] of Object.entries(focused))check(ok,name);
 for(const [mode,code] of [['http','HTTP'],['redirect','REDIRECT'],['noidentity','IDENTITY_MISSING'],['unknownhtml','SELECTOR_MISSING'],['incompatible','HTML_INCOMPATIBLE']]){
  await fresh(mode);const d=await diag();check(d.activeFailures.some(f=>f.code===code&&f.stage==='activity'),mode+' classification');
  check(d.lastRun.activityErrors===1,'One failing activity '+mode);
  check(await page.getByRole('tab',{name:'Sin verificar 1',exact:true}).count()===1,'Unknown isolated '+mode);
 }
 await fresh('timeout');
 const headerRun=await diag(), headerTimeout=headerRun.recentIncidents.find(f=>f.code==='TIMEOUT'&&f.round==='initial');
 check(headerTimeout?.details.phase==='headers'&&headerTimeout.details.elapsedMs>=14900&&headerTimeout.details.http===undefined,'Timeout before response headers');
 check(headerRun.lastRun.recoveredAfterRetry===1&&headerRun.activeFailures.length===0,'Se recupera el timeout de cabeceras');
 await fresh('slow-body');
 const bodyRun=await diag(), bodyTimeout=bodyRun.recentIncidents.find(f=>f.code==='TIMEOUT'&&f.round==='initial');
 check(bodyTimeout?.details.phase==='body' && bodyTimeout.details.http===200 && bodyTimeout.details.headersMs<bodyTimeout.details.elapsedMs,'Timeout after HTTP 200 headers');
 check(bodyRun.lastRun.recoveredAfterRetry===1&&bodyRun.activeFailures.length===0,'Se recupera el timeout del cuerpo');
 await fresh('empty-activities');
 const empty=await diag();
 check(empty.lastRun.activityErrors===0 && empty.activeFailures.length===0,'Explicit absences are not errors');
 check(empty.lastRun.recognizedAbsences.quiz_no_attempts===1 && empty.effective.manualPending===2,'Quiz absence and manual forums counted separately');
 check(await page.getByRole('tab',{name:'Pendientes 5',exact:true}).count()===1,'Quiz disponible y foros sin confirmar quedan pendientes');
 // Previously confirmed status must survive a failed revalidation.
 await fresh('normal');
 await page.locator('[data-toggle="assign:5"]').click();
 await page.evaluate(async()=>{await fetch('/mode?value=http');const d=JSON.parse(localStorage.fixture);const k=Object.keys(d).find(k=>k.endsWith(':history'));d[k].changes.find(c=>c.type==='auto'&&c.key==='assign:1').value.t=Date.now()-2*86400e3;localStorage.fixture=JSON.stringify(d);});
 await page.reload();await wait();
 check(await page.evaluate(()=>{const d=JSON.parse(localStorage.fixture);return Object.values(d).some(v=>v.changes?.some(c=>c.type==='auto'&&c.key==='assign:1'&&c.value.done===true));}), 'Prior confirmation retained');
 check(await page.evaluate(()=>Object.values(JSON.parse(localStorage.fixture)).some(v=>v.changes?.some(c=>c.type==='manual'&&c.value.done===true))), 'Manual retained');
 const first=await diag();check(first.activeFailures[0].attempts===2,'Fallo inicial más recuperación persistente');
 await page.reload();await wait();const warm=await diag();check(warm.lastRun.activityErrors===0&&warm.lastRun.skipped===1,'Cooldown after reload');
 check((await page.locator('[data-minimal-warning]').textContent())==='1 actividad sigue sin comprobarse.','El fallo de recuperación sigue visible después de recargar');
 check(warm.activeFailures.length===1,'Previous incidence remains accessible');
 await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await wait();check((await diag()).activeFailures[0].attempts===4,'Ronda explícita más un reintento para el HTTP 503 persistente');
 await page.evaluate(()=>fetch('/mode?value=normal'));await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await wait();check((await diag()).activeFailures.length===0,'Recovery removes failure');
 check((await diag()).lastRun.recovered.assign===1,'Recovery counted without activity identifiers');
 check(await page.getByRole('tab',{name:'Entregadas 3',exact:true}).count()===1,'Recovery plus manual');
 // Unexpected JS is classified, and private exception text is not exposed.
 await page.evaluate(()=>{UGCore.recognize=()=>{throw new TypeError('PRIVATE sesskey=secret')};});
 await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await wait();const internal=await diag();check(internal.activeFailures.some(f=>f.code==='INTERNAL'),'Internal error category');check(!JSON.stringify(internal).includes('PRIVATE')&&!JSON.stringify(internal).includes('secret'),'Sanitized diagnosis');
 await page.evaluate(async()=>{await fetch('/mode?value=login');localStorage.clear();});await page.reload();await page.waitForFunction(()=>document.querySelector('#ugr-diagnostics')?.textContent.includes('SESSION_EXPIRED'));check(await page.locator('.ugr-item').count()===0,'Session expiry hides data');
 await fresh('unknownhtml');await page.getByRole('tab',{name:'Sin verificar 1',exact:true}).click();await page.locator('[data-show-diagnostic]').click();await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/diagnostic-desktop-2.0.3.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/diagnostic-mobile-2.0.3.png',fullPage:true});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile width');
 return {passed, note:'login handled separately because refresh is intentionally disabled'};
}

