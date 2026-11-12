async page=>{
  if(!page.url().startsWith('http://127.0.0.1:8765/'))throw new Error('Fixture local requerido');
  let passed=0;
  const check=(ok,msg)=>{if(!ok)throw new Error(msg);passed++;};
  const settled=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled&&document.querySelector('.ugr-note').textContent.includes('Actualización finalizada'));
  const diag=()=>page.locator('#ugr-diagnostics').textContent().then(JSON.parse);
  const baseline=await page.evaluate(async()=>{
    await fetch('/mode?value=preservation');
    const prefix='ugr2:'+location.origin+':42:';
    const now=Date.now(),old=now-210*86400e3,due=Math.floor(old/1000);
    const event=(id,mod,name)=>({id:String(id),cmid:String(id),mod,name,due,courseId:7,course:'Curso histórico',url:location.origin+'/mod/'+mod+'/view.php?id='+id,extra:'original'});
    const t=new Date();
    const month=t.getFullYear()+'-'+(t.getMonth()+1);
    const forumFail={code:'SELECTOR_MISSING',t:old,retryAt:old+1800000,attempts:5,details:{forumContainers:1,forumAuthors:0},originalMeta:'conservar'};
    const data={
      [prefix+'cache']:{schema:2,updated:old,months:{
        [month]:{t:old,items:[event(30,'forum','Foro histórico automático'),{...event(30,'forum','Foro histórico automático'),id:'35'},event(31,'forum','Foro manual histórico'),event(32,'forum','Foro desmarcado histórico'),event(33,'forum','Foro histórico sin procedencia'),event(34,'forum','Foro histórico sin confirmar')]},
        '2020-1':{t:old,items:[event(40,'assign','Tarea histórica')]}
      },auto:{'forum:30':{done:true,source:'heuristic',t:old},'forum:32':{done:true,source:'heuristic',t:old},'forum:33':{done:true,extra:'evidencia'},'forum:34':{done:false,source:'heuristic',t:old},'assign:40':{done:true,source:'moodle',t:old}}},
      [prefix+'failures']:{'forum:30':forumFail,'forum:34':forumFail},
      [prefix+'manual:forum:31']:{done:true,t:old},
      [prefix+'manual:forum:32']:{done:false,t:old},
      [prefix+'preferences']:{course:'all',extra:'conservar'},
      ['ugr2:'+location.origin+':99:manual:forum:30']:{done:false,t:old}
    };
    localStorage.setItem('fixture',JSON.stringify(data));
    return data;
  });
  await page.reload();await settled();
  const first=await diag();
  check(first.version==='2.1.0','Versión');
  check(first.lastRun.checked===4&&first.lastRun.activityErrors===1,'Solo tareas y cuestionario en ejecución');
  check(first.effective.unknown===1&&first.effective.manualPending===3,'Quiz desconocido separado de foros por confirmar');
  check(first.activeFailures.length===1&&first.activeFailures[0].module==='quiz','Solo fallo activo del quiz');
  check(first.historicalForumFailures.length===2&&first.historicalForumFailures.every(f=>f.attempts===5),'Historial de errores de foro conservado');
  check(first.effective.completed.historical===1&&first.effective.completed.historicalUnknown===1&&first.effective.completed.manual===1,'Procedencia y decisiones');
  check((await page.evaluate(()=>fetch('/stats').then(r=>r.json()))).forums===0,'Cero peticiones de participación');
  await page.getByRole('tab',{name:/Entregadas/}).click();
  for(const name of ['Foro histórico automático','Foro manual histórico','Foro histórico sin procedencia','Tarea histórica']){
    check(await page.getByRole('link',{name,exact:true}).count()===1,'Conservado en Entregadas '+name);
  }
  await page.getByLabel('Filtrar por curso').selectOption('7');
  check(await page.getByRole('tab',{name:'Entregadas 4',exact:true}).count()===1,'Contador por curso sin duplicados');
  check(await page.getByRole('tab',{name:'Atrasadas 0',exact:true}).count()===1,'Foros vencidos siguen pendientes');
  await page.getByRole('tab',{name:'Pendientes 2',exact:true}).click();
  check(await page.getByRole('link',{name:'Foro desmarcado histórico',exact:true}).count()===1,'Decisión falsa prevalece');
  const pendingRow=page.locator('.ugr-item').filter({hasText:'Foro histórico sin confirmar'});
  await pendingRow.getByRole('button',{name:'Marcar como entregada'}).click();
  await page.getByRole('tab',{name:'Entregadas 5',exact:true}).click();
  const forumRow=page.locator('.ugr-item').filter({hasText:'Foro histórico sin confirmar'});
  await forumRow.locator('.ugr-source').dblclick();
  check(await forumRow.getByText('Estado manual').count()===1,'Doble clic no cambia el foro');
  await forumRow.getByRole('button',{name:'Marcar como no entregada'}).click();
  await page.getByRole('tab',{name:'Pendientes 2',exact:true}).click();
  check(await pendingRow.getByText('Estado manual').count()===1,'Desmarcar conserva una decisión explícita');
  await page.reload();await settled();
  check(await page.getByLabel('Filtrar por curso').inputValue()==='7','Curso elegido restaurado al recargar');
  await page.getByLabel('Filtrar por curso').selectOption('all');
  const warm=await diag();
  check(warm.lastRun.activityErrors===0&&warm.lastRun.skipped===1&&warm.effective.unknown===1,'Backoff deja visible el fallo persistente');
  check((await page.locator('.ugr-error').textContent())==='','Sin falsa alerta de error nuevo');
  await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await settled();
  check((await diag()).activeFailures[0].attempts===2,'Actualizar reintenta el cuestionario sin confundirlo con los foros');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.fixture));
  check(Object.entries(baseline).every(([k,v])=>JSON.stringify(saved[k])===JSON.stringify(v)),'Claves de 2.0.2 y de otra cuenta intactas');
  const history=Object.entries(saved).find(([k])=>k.endsWith(':history'))[1];
  check(history.changes.filter(c=>c.type==='manual'&&c.key==='forum:34').map(c=>c.value.done).join(',')==='true,false','Historial de ambas decisiones');
  check(Object.keys(saved).length===Object.keys(baseline).length+3&&
    Object.entries(saved).some(([k,v])=>k.endsWith(':presentation')&&v.course==='all'),
  'Solo se agregan historial, vigencia y la preferencia explícita de curso');
  check((await page.evaluate(()=>fetch('/stats').then(r=>r.json()))).forums===0,'Sin descargas de foros tras recargar o revertir');
  await page.getByRole('tab',{name:/Pendientes/}).click();
  await page.evaluate(()=>{chrome.storage.local.set=async()=>{throw new Error('QUOTA_BYTES');};});
  await pendingRow.getByRole('button',{name:'Marcar como entregada'}).click();
  await page.waitForFunction(()=>document.querySelector('.ugr-error').textContent.includes('No se pudo guardar el estado manual'));
  check(await pendingRow.getByText('Estado manual').count()===1,'Un rechazo de escritura mantiene el estado efectivo anterior');
  check(JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.fixture)))===JSON.stringify(saved),'Rechazo de cuota no altera los datos');
  return {passed};
}

