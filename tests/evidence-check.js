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
    const html=mod==='quiz'?quizzes[id-titles.length-1]:
      '<div class="submissionstatus'+(id===3?'new':'submitted')+'"></div>'+
      (grade?'<div class="feedbacktable"><table><tr><td>Calificación</td><td>'+grade+'</td></tr></table></div>':'');
    return route.fulfill({body:'<body id="page-mod-'+mod+'-view">'+identity(p)+'<main>'+html+'</main></body>'});
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
  return {passed,measured};
}
