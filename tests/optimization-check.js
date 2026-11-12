async page=>{
 const origin='http://127.0.0.1:8765', start=Date.UTC(2026,10,11,12), close=start/1000-3600;
 const ctx=page.context(), calendar=[], reads=[];
 let now=start, reopened=false, delivered=true, count=0, delay=null, routeEntered;
 const assert=(ok,label)=>{if(!ok)throw Error(label);count++;};
 const fixtureId='<script>M.cfg={"userid":42};</script>';
 const setClock=async value=>{now=value;await page.clock.setFixedTime(now);};
 await page.addInitScript(()=>{
   if(location.origin!=='http://127.0.0.1:8765'||localStorage.fixture)return;
   localStorage.fixture=JSON.stringify({['ugr2:'+location.origin+':42:presentation']:{schema:1,autoRefreshMinutes:0}});
 });
 await setClock(start);
 await ctx.route(origin+'/lib/ajax/service.php?*', async route=>{
   const call=route.request().postDataJSON()[0];calendar.push(call.args.month);
   const event=(id,cmid,mod,kind,t)=>({id,modulename:mod,eventtype:kind,timesort:t,timestart:t,name:'Actividad '+cmid,url:origin+'/mod/'+mod+'/view.php?id='+cmid,course:{id:2,fullname:'Pruebas'}});
   const events=call.args.month===11?[event(1,1,'assign','due',close),event(2,2,'quiz','close',reopened?close+86400*3:close),event(3,2,'quiz','close',reopened?close+86400*3:close),event(4,4,'forum','due',close),...(reopened?[event(5,5,'assign','due',close+86400)]:[])]:[];
   await route.fulfill({json:[{data:{weeks:[{days:[{events}]}]}}]});
 });
 await ctx.route(origin+'/mod/*/view.php?*', async route=>{
   const url=route.request().url(), id=url.split('id=')[1], quiz=url.includes('/quiz/');
   reads.push(id);
   if(delay && id==='1'){const waiting=delay;delay=null;routeEntered?.();await waiting;}
   const status=quiz?'<table class="quizreviewsummary"><tr><th>Status</th><td>Finished</td></tr></table>':delivered?'<div class="submissionstatussubmitted">Submitted</div>':'<div class="submissionstatusnew">No submission</div>';
   const notice=quiz&&!reopened?'<div data-region="activity-dates"><div><strong>Cerró:</strong> miércoles</div></div><div class="quizattempt"><p>Este cuestionario no está disponible en este momento</p></div>':'';
   await route.fulfill({contentType:'text/html; charset=utf-8',body:'<body id="page-mod-'+(quiz?'quiz':'assign')+'-view">'+fixtureId+'<main>'+status+notice+'</main></body>'}).catch(()=>{});
 });
 const settled=async(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
   document.querySelector('.ugr-note')?.textContent.includes('Actualización finalizada'),null,{timeout:10000})
   .catch(async()=>{throw Error('Sincronización del fixture de optimización: '+await p.locator('.ugr-note').first().textContent());});
 const report=async()=>JSON.parse(await page.locator('#ugr-diagnostics').textContent()).lastRun;
 const normal=()=>page.getByRole('button',{name:'Actualizar',exact:true}).click();
 const full=async accept=>{
   await page.evaluate(value=>{window.confirm=()=>value;},accept);
   await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();
   if(accept)await settled();
 };
 await page.goto(origin);await settled();
 assert(reads.length===2&&reads.filter(id=>id==='2').length===1,'Deduplicación y foros manuales');
 assert(calendar.length===6,'Calendario inicial');
 await normal();await settled();
 assert(reads.length===2&&calendar.length===9,'Actualizar renueva tres meses y respeta la vigencia de estados');
 assert((await report()).archived===1,'Cierre confirmado posterior');
 await full(false);
 assert(reads.length===2&&calendar.length===9,'Cancelar reverificación no consulta');
 await setClock(start+86400001);await normal();await settled();
 assert(reads.length===3&&reads.at(-1)==='1','Vencimiento no archiva tarea y cierre omite quiz');
 assert((await report()).archived===1,'Archivo operativo omite quiz caducado');
 const before=await page.evaluate(()=>JSON.parse(localStorage.fixture));
 const beforeAuto=Object.values(before).find(v=>v.changes).changes.filter(c=>c.type==='auto').length;
 delivered=false;
 await page.getByRole('tab',{name:/^Entregadas/}).click();
 const row=page.locator('.ugr-item').filter({hasText:'Actividad 1'});
 let release;
 delay=new Promise(resolve=>{release=resolve;});
 const previousCalendar=calendar.length, previousReads=reads.length;
 await row.getByRole('button',{name:'Reverificar esta actividad'}).click();
 await row.getByRole('button',{name:'Reverificar esta actividad'}).click();
 release();await settled();
 assert(calendar.length===previousCalendar&&reads.length===previousReads+1,'Individual comparte duplicado y no consulta calendario');
 assert(await page.getByRole('tab',{name:'Entregadas 1',exact:true}).count()===1,'Retiro válido cambia estado');
 reopened=true;
 await setClock(start+86400001+1000);await full(true);
 const summary=await report();
 assert(summary.mode==='all'&&summary.checked===3&&summary.reverified===3,'Exhaustiva incluye nueva, entregada y archivada');
 assert(calendar.length===previousCalendar+6&&reads.filter(x=>x==='4').length===0,'Exhaustiva fuerza seis meses y omite foros');
 assert(summary.reactivated===1,'Fecha nueva reactiva quiz');
 assert(await page.getByRole('tab',{name:'Entregadas 1',exact:true}).count()===1,'Quiz conserva estado confirmado');
 const after=await page.evaluate(()=>JSON.parse(localStorage.fixture));
 const afterAuto=Object.values(after).find(v=>v.changes).changes.filter(c=>c.type==='auto').length;
 assert(afterAuto===beforeAuto+2,'Solo dos cambios académicos reales: retiro y alta');
 assert(after[Object.keys(before).find(k=>k.endsWith(':history'))].changes.length>=Object.values(before).find(v=>v.changes).changes.length,'Historial anterior conservado');
 const prepare=async p=>{
   await p.clock.setFixedTime(now);
   await p.goto(origin);await settled(p);
   await p.getByRole('tab',{name:/^Pendientes/}).click();
 };
 const individual=p=>p.locator('[data-reverify="assign:1"]');
 await page.getByRole('tab',{name:/^Pendientes/}).click();
 const other=await ctx.newPage();
 await prepare(other);
 const beforeTwoTabs=reads.length;
 delay=new Promise(resolve=>{release=resolve;});
 await Promise.all([page.waitForRequest(origin+'/mod/assign/view.php?id=1'),individual(page).click()]);
 await individual(other).click();
 release();await settled(page);await settled(other);
 assert(reads.length===beforeTwoTabs+1,'Dos pestañas comparten resultado con bloqueo y comprobación persistida');
 assert(JSON.parse(await other.locator('#ugr-diagnostics').textContent()).lastRun.shared,'Segunda pestaña informa reutilización');
 await other.close();

 const interrupted=await ctx.newPage();
 await prepare(interrupted);
 const beforeAbort=reads.length;
 delay=new Promise(resolve=>{release=resolve;});
 const reachedRoute=new Promise(resolve=>{routeEntered=resolve;});
 await Promise.all([reachedRoute,individual(interrupted).click()]);
 routeEntered=undefined;
 await interrupted.close();release();
 await individual(page).click();await settled(page);
 assert(reads.length===beforeAbort+2&&(await report()).checked===1,'Cerrar una pestaña permite reanudar desde otra');
 return {passed:count};
}
