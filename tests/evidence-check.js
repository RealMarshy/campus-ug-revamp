async (page,baseline=false)=>{
  const origin='http://127.0.0.1:8765', context=page.context();
  const titles=[
    ['Tarea --> Investigación','Tarea --> Investigación'],
    ['Tarea --&gt; Investigación','Tarea --> Investigación'],
    ['Programación &amp; Testing','Programación & Testing'],
    ['A &#x1F4DA; &#233; &#39; &quot;','A 📚 é \' "'],
    ['&amp;lt;img src=x onerror=alert(1)&gt;','&lt;img src=x onerror=alert(1)>'],
    ['<script>alert(1)</script><img src=x onerror=alert(1)>','<script>alert(1)</script><img src=x onerror=alert(1)>'],
    ['&lt;svg onload=alert(1)&gt; javascript:alert(1)','<svg onload=alert(1)> javascript:alert(1)'],
  ];
  const quizzes=[
    '<p>No attempts have been made.</p>',
    '<div class="quizattempt"><p>This quiz is currently not available.</p></div>',
    '<div class="quizattempt"><div class="alert">El cuestionario no está disponible en este momento.</div></div>',
    '<div class="quizattempt"><p>This quiz is closed</p></div>',
    '<table class="quizreviewsummary"><tr><th>Estado</th><td>En curso</td></tr></table>',
    '<table class="quizreviewsummary"><tr><th>Estado</th><td>Finalizado</td></tr></table>',
    '<p>No attempts have been made.</p><a href="/mod/quiz/review.php?attempt=5">Revisar</a>',
    '<p>Diseño desconocido</p>',
    '<div class="quizattempt"><p hidden>This quiz is currently not available.</p></div>',
    '<p>No attempts have been made.</p><table class="quizreviewsummary"><tr><th>Estado</th><td>Finalizado</td></tr></table>',
  ];
  const grades=['9,50 / 10,00','',null,'Pending','82.5 / 100','9 / 10 o 8 / 10','<span hidden>10</span>'];
  const feedback=(grade,date='miércoles, 28 de octubre de 2026, 10:39')=>'<div class="feedback"><h3>Comentario</h3>'+
    '<div class="feedbacktable"><table><tr><th>Calificación</th><td>'+grade+'</td></tr>'+
    '<tr><th>Calificado sobre</th><td>'+date+'</td></tr></table></div></div>';
  const noSubmission='<div class="submissionstatustable"><table>'+
    '<tr><th>Estado de la entrega</th><td class="submissionstatus">Todavía no se han realizado envíos</td></tr>'+
    '<tr><th>Estado de la calificación</th><td>Sin calificar</td></tr></table></div>';
  const addSubmission='<form action="/mod/assign/view.php" method="get"><input type="hidden" name="id" value="3">'+
    '<input type="hidden" name="action" value="editsubmission"><button type="submit">Agregar entrega</button></form>';
  const groupNotice='<div class="alert alert-danger" role="alert">No perteneces a ningún grupo.</div>';
  const groupBlocked=noSubmission.replace('<table>','<table><tr><th>Grupo</th><td>'+groupNotice+'</td></tr>');
  let evaluation=null, evaluationOffline=false, assignBody=null;
  const calls=[], other=new Set();
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const identity=p=>'<script>window.M={cfg:{"userid":'+(other.has(p)?99:42)+'}};</script>';
  const fixtureUser=p=>other.has(p)?99:42;
  await context.route(origin+'/',async route=>{
    if(!other.has(route.request().frame().page()))return route.fallback();
    const response=await route.fetch();
    return route.fulfill({response,body:(await response.text()).replace('"userId":42','"userId":99')});
  });
  await context.route(origin+'/my/',route=>{
    calls.push('session');
    return route.fulfill({body:identity(route.request().frame().page())});
  });
  await context.route(origin+'/lib/ajax/service.php?*',route=>{
    const req=route.request(), [query]=req.postDataJSON();
    if(req.method()!=='POST'||query.methodname!=='core_calendar_get_calendar_monthly_view')throw Error('Operación de calendario inesperada');
    calls.push('calendar');
    const now=new Date(), events=query.args.month===now.getMonth()+1?[...titles.map(t=>t[0]),...quizzes.map((_,i)=>'Quiz '+(i+1))].map((name,i)=>{
      const id=i+1, mod=i<titles.length?'assign':'quiz';
      return {id,name,modulename:mod,eventtype:'due',timesort:Math.floor(now/1000)+86400+id,
        url:origin+'/mod/'+mod+'/view.php?id='+id,course:{id:1,fullname:'Curso ficticio'}};
    }):[];
    return route.fulfill({json:[{data:{weeks:[{days:[{events}]}]}}]});
  });
  await context.route(origin+'/mod/*/view.php?*',route=>{
    const req=route.request(), p=req.frame().page(), id=Number(req.url().split('id=')[1]);
    if(req.method()!=='GET'||!Number.isInteger(id))throw Error('Operación académica inesperada');
    calls.push(id);
    const mod=id<=titles.length?'assign':'quiz';
    const grade=fixtureUser(p)===99&&id===1?'6 / 10':grades[id-1];
    if(id===3&&evaluationOffline)return route.abort('failed');
    const html=id===3&&assignBody!==null?assignBody:id===3&&evaluation!==null?noSubmission+(fixtureUser(p)===99?'':evaluation):mod==='quiz'?quizzes[id-titles.length-1]:
      '<div class="submissionstatus'+(id===3?'new':'submitted')+'"></div>'+
      (grade?'<div class="feedbacktable"><table><tr><td>Calificación</td><td>'+grade+'</td></tr></table></div>':'');
    return route.fulfill({body:'<body id="page-mod-'+mod+'-view" class="cmid-'+id+'">'+identity(p)+'<main>'+html+'</main></body>'});
  });
  const diag=async(p=page)=>JSON.parse(await p.locator('#ugr-diagnostics').textContent());
  const idle=(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
    document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'));
  const tab=(name,p=page)=>p.getByRole('tab',{name:new RegExp('^'+name)}).click();
  const row=(id,p=page)=>p.locator('.ugr-item').filter({has:p.locator('.ugr-main a[href$="?id='+id+'"]')});
  const grade=(id,p=page)=>row(id,p).locator('.ugr-grade');
  const reread=async id=>{await row(id).locator('[data-reverify]').click();await idle();};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const scriptTime=async()=>((await cdp.send('Performance.getMetrics')).metrics.find(x=>x.name==='ScriptDuration')?.value??0)*1000;
  const first=await scriptTime();
  await page.goto(origin);await idle();
  const d=await diag(), m=JSON.parse(await page.locator('#ugr-panel').getAttribute('data-metrics'));
  const measured={requests:calls.length,checks:d.lastRun.checked,firstContentMs:m.firstContentMs,syncMs:d.lastRun.durationMs,
    loadMs:await page.evaluate(()=>Math.round(performance.now())),scriptMs:Math.round((await scriptTime()-first)*100)/100};
  check(measured.requests===24&&measured.checks===17,'Una sola consulta de cada actividad');
  const beforeWarm=calls.length;
  await page.reload();await idle();
  measured.warmRequests=calls.length-beforeWarm;
  measured.warmChecks=(await diag()).lastRun.checked;
  check(measured.warmRequests===1&&measured.warmChecks===0,'Caché vigente reutilizada');
  if(baseline)return {passed,measured};

  await tab('Sin verificar');
  for(const [id,label] of [[8,'No iniciado'],[9,'Todavía no disponible'],[10,'Todavía no disponible'],[11,'Todavía no disponible'],
    [14,'Sin verificar'],[15,'Sin verificar'],[16,'Sin verificar']]){
    check((await row(id).locator('.ugr-source').textContent()).startsWith(label),'Clasificación de quiz '+id);
  }
  check(d.lastRun.recognizedAbsences.quiz_unavailable===3&&d.lastRun.recognizedAbsences.quiz_no_attempts===1&&
    d.activeFailures.length===3&&d.activeFailures.every(f=>f.code==='SELECTOR_MISSING'),'Solo las estructuras ambiguas conservan errores');
  quizzes[1]='<table class="quizreviewsummary"><tr><th>Estado</th><td>Finalizado</td></tr></table>';
  const priorQuiz=calls.length;
  await reread(9);await tab('Entregadas');
  check(calls.length-priorQuiz===1&&await row(9).count()===1,'Reverificar un quiz bloqueado descubre un intento finalizado');
  check(await row(13).count()===1&&await row(17).count()===1&&await row(12).count()===0,'Finalizados prevalecen y en curso no se entrega');
  for(let id=1;id<=titles.length;id++){
    if(id===3)await tab('Próximas');
    else if(id===4)await tab('Entregadas');
    const link=row(id).locator('.ugr-main a');
    check(await link.textContent()===titles[id-1][1]&&await link.locator('*').count()===0&&
      await link.getAttribute('href')===origin+'/mod/assign/view.php?id='+id,'Título de texto plano '+id);
  }
  check(await grade(1).textContent()==='Calificación: 9,50 / 10,00'&&await grade(5).textContent()==='Calificación: 82.5 / 100','Escalas con coma y punto preservadas');
  check(await grade(2).count()===0&&await grade(4).count()===0&&await grade(6).count()===0&&await grade(7).count()===0,'Sin nota, pendiente, ambigua u oculta');
  await tab('Próximas');
  await row(3).locator('[data-toggle]').click();
  await tab('Entregadas');
  check(await row(3).count()===1&&await grade(3).count()===0,'Marca manual no crea una nota');
  grades[0]='8 / 10';
  const priorGrade=calls.length;
  await reread(1);
  check(await grade(1).textContent()==='Calificación: 8 / 10'&&calls.length===priorGrade+1,'La nota modificada se actualiza en la misma consulta');
  const second=await context.newPage();
  other.add(second);await second.goto(origin);await idle(second);await tab('Entregadas',second);
  check(await grade(1,second).textContent()==='Calificación: 6 / 10'&&await grade(1).textContent()==='Calificación: 8 / 10','Notas separadas por cuenta');
  await second.close();
  grades[0]='<script type="text/plain">10</script>';
  await reread(1);
  check(await grade(1).count()===0&&!JSON.stringify(await diag()).includes('8 / 10'),'Una nota retirada desaparece aunque quede texto invisible');
  const assignmentAvailability=await page.evaluate(({origin,groupBlocked,groupNotice,noSubmission})=>{
    const read=(html,cmid='3')=>UGCore.recognize(new DOMParser().parseFromString(
      '<body id="page-mod-assign-view" class="cmid-3"><script>M.cfg={"userid":42};</script><main>'+html+'</main></body>',
      'text/html'),'assign','42',origin,cmid);
    const status='<tr><th>Submission status</th><td>Nothing has been submitted for this assignment</td></tr>';
    const table=(group='')=>'<div class="submissionstatustable"><table>'+group+status+'</table></div>';
    const blocked=table('<tr><th>Group</th><td><div class="alert alert-danger">Not a member of any group</div></td></tr>');
    const add='<form action="/mod/assign/view.php" method="get"><input type="hidden" name="id" value="3">'+
      '<input type="hidden" name="action" value="editsubmission"><button type="submit">Add submission</button></form>';
    const cases=[
      [blocked,'group_blocked'],[table()+add,'add_submission'],[table(),undefined],
      [table()+add.replace('type="submit"','type="submit" disabled'),undefined],
      [table()+add.replace('value="3"','value="4"'),undefined],
      [blocked+add,'group_blocked'],
      [table()+'<div class="intro">'+add+'</div>',undefined],
      [groupBlocked,'group_blocked'],
      [noSubmission.replace('</table></div>','</table><div class="alert alert-danger" role="alert">'+
        'Esta tarea requiere entrega por grupos. Usted no es miempro de ningún grupo, así que no puede realizar entregas. '+
        'Por favor, contacte con su profesor para que le agregue a un grupo.<button type="button" data-bs-dismiss="alert" aria-label="Cerrar">×</button></div></div>'),'group_blocked'],
      [noSubmission.replace('</table></div>','</table><div class="alert alert-danger" role="alert">'+
        'Esta tarea requiere envío en grupos. Usted no es miembro de ningún grupo, por lo que no puede crear un envío '+
        'Por favor, póngase en contacto con su profesor para ser añadido a un grupo.</div></div>'),'group_blocked'],
      [noSubmission+groupNotice,undefined],
      [groupBlocked.replace('role="alert"','role="alert" hidden'),undefined],
      [groupBlocked.replace('No perteneces a ningún grupo.','Se requiere un grupo.'),undefined],
      [groupBlocked,undefined,'4']
    ];
    return cases.map(([html,expected,cmid])=>{const value=read(html,cmid);return value.done===false&&value.assignAvailability===expected;});
  },{origin,groupBlocked,groupNotice,noSubmission});
  for(const [i,ok] of assignmentAvailability.entries())check(ok,'Disponibilidad de tareas '+(i+1));
  const gradeCases={
    zero:{body:feedback('0,00/10,00'),grade:'0,00/10,00'},
    maxOnly:{body:feedback('10',''),error:'STATE_UNKNOWN'},
    noGrade:{body:feedback('—')},
    instructions:{body:'<div class="intro">'+feedback('9/10')+'</div>'},
    hidden:{body:'<div hidden>'+feedback('9/10')+'</div>'},
    ambiguous:{body:feedback('9/10')+feedback('8/10'),error:'STATE_UNKNOWN'},
    wrongModule:{body:feedback('9/10'),cmid:'4',error:'VIEW_MISMATCH'},
    wrongAccount:{body:feedback('9/10'),user:'99',error:'ACCOUNT_CHANGED'},
    contradictory:{body:feedback('9/10')+'<div class="submissionstatussubmitted"></div>',error:'STATE_UNKNOWN'},
  };
  const parsed=await page.evaluate(({gradeCases,origin,noSubmission})=>Object.entries(gradeCases).map(([name,test])=>{
    const html='<body id="page-mod-assign-view" class="cmid-3"><script>M.cfg={"userid":42};</script>'+
      '<main>'+noSubmission+test.body+'</main></body>';
    try{
      const state=UGCore.recognize(new DOMParser().parseFromString(html,'text/html'),'assign',test.user||'42',origin,test.cmid||'3');
      return [name,!test.error&&state.done===false&&state.evaluationGrade===test.grade];
    }catch(e){return [name,e.code===test.error];}
  }),{gradeCases,origin,noSubmission});
  for(const [name,ok] of parsed)check(ok,'Evidencia estructural: '+name);

  await row(3).locator('.ugr-source').dblclick();
  await tab('Próximas');
  await row(3).waitFor();
  evaluation=feedback('9,00 / 10,00');
  const priorEvaluation=calls.length;
  await reread(3);await tab('Entregadas');
  check(await row(3).locator('.ugr-source').textContent()==='Calificada sin envío en Moodle'&&
    await grade(3).textContent()==='Calificación: 9,00 / 10,00'&&calls.length===priorEvaluation+1,'Evaluación sin envío con una sola lectura');
  check((await diag()).effective.completed.gradedWithoutSubmission===1,'Contador de evaluadas sin envío');
  await page.waitForFunction(()=>{
    const history=JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':42:history'];
    const state=history?.changes.filter(change=>change.type==='auto'&&change.key==='assign:3').at(-1)?.value;
    return state?.done===false&&state?.evaluationGrade==='9,00 / 10,00';
  });
  await page.reload();await idle();await tab('Entregadas');
  check(await grade(3).textContent()==='Calificación: 9,00 / 10,00','Evaluación persistente al recargar');
  const realClock=await page.evaluateHandle(()=>Date.now);
  await page.evaluate(now=>{Date.now=()=>now()+14*86400000;},realClock);
  await tab('Entregadas');
  check((await grade(3).textContent()).startsWith('Última calificación confirmada')&&(await grade(3).textContent()).endsWith('9,00 / 10,00'),'El TTL conserva y etiqueta la nota histórica');
  await page.evaluate(now=>{Date.now=now;},realClock);
  await row(3).locator('[data-toggle]').click();await tab('Próximas');
  check(await row(3).locator('.ugr-source').textContent()==='Estado manual'&&await grade(3).count()===1,'Marca negativa prevalece y la nota sigue visible');
  await row(3).locator('[data-toggle]').click();await tab('Entregadas');
  check(await row(3).locator('.ugr-source').textContent()==='Estado manual','Marca positiva prevalece');
  await row(3).locator('.ugr-source').dblclick();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ugr-source')].some(el=>el.textContent==='Calificada sin envío en Moodle'));
  await idle();
  const evaluationAccount=await context.newPage();
  other.add(evaluationAccount);await evaluationAccount.goto(origin);await idle(evaluationAccount);await tab('Entregadas',evaluationAccount);
  check(await row(3,evaluationAccount).count()===0,'La evaluación no cruza cuentas');
  await evaluationAccount.close();
  evaluationOffline=true;
  await reread(3);
  check(await grade(3).count()===1&&(await diag()).activeFailures.some(f=>f.code==='NETWORK'),'El error de red conserva la evaluación');
  evaluationOffline=false;
  evaluation=feedback('0,00/10,00');
  await reread(3);
  check(await grade(3).textContent()==='Calificación: 0,00/10,00','Una consulta válida sustituye la nota');
  evaluation='';
  await reread(3);await tab('Próximas');
  check(await row(3).count()===1&&await grade(3).count()===0,'Una ausencia válida de evaluación retira la nota');
  assignBody=groupBlocked+addSubmission;
  const beforeBlocked=calls.length;
  await reread(3);
  const label=()=>row(3).locator('.ugr-source').textContent();
  check((await label()).startsWith('Sin entrega · Bloqueada por grupo')&&calls.length===beforeBlocked+1,
    'El aviso oficial en español prevalece y llega a la etiqueta con una sola lectura');
  const blockedRun=(await diag()).lastRun;
  check(JSON.stringify(blockedRun.assignGroup)===JSON.stringify({view:'view',hasMain:true,moduleMatches:true,eligible:true,hasStatusTable:true,
    groupNotice:'short',state:'no_submission',result:'group_blocked'})&&blockedRun.mode==='one',
    'Diagnóstico individual limitado a señales enumeradas y booleanos');
  check(!await page.evaluate(()=>localStorage.fixture.includes('"assignGroup"')),'El diagnóstico individual no se guarda');
  await page.reload();await idle();await tab('Pendientes');
  check((await label()).startsWith('Sin entrega · Bloqueada por grupo')&&(await diag()).lastRun.checked===0&&!(await diag()).lastRun.assignGroup,
    'La tarea sigue pendiente y el indicador sobrevive a la recarga desde caché');
  assignBody=noSubmission+addSubmission;
  await reread(3);
  check((await label()).startsWith('Sin entrega · Disponible para agregar entrega'),
    'La lectura válida reemplaza el bloqueo por disponibilidad de la misma tarea');
  assignBody=groupBlocked+feedback('8 / 10');
  await reread(3);await tab('Entregadas');
  check((await label())==='Calificada sin envío en Moodle'&&await grade(3).textContent()==='Calificación: 8 / 10',
    'La evaluación sin envío conserva su prioridad sobre el bloqueo');
  assignBody=groupBlocked.replace('Todavía no se han realizado envíos','Enviado para calificar')+addSubmission;
  await reread(3);
  check((await label()).startsWith('Entrega confirmada por Moodle'),'La entrega confirmada conserva prioridad');
  return {passed,measured};
}
