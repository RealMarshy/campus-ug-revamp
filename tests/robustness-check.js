async page=>{
 let passed=0;const check=(ok,msg)=>{if(!ok)throw new Error(msg);passed++;};
 const wait=()=>page.waitForFunction(()=>document.querySelector('.ugr-note').textContent.includes('Actualización finalizada'));
 await page.evaluate(async()=>{await fetch('/mode?value=normal');localStorage.clear();});await page.reload();await wait();
 await page.addScriptTag({url:'/content.js'});check(await page.locator('#ugr-panel').count()===1,'Panel duplicado');
 const before=JSON.parse(await page.locator('#ugr-panel').getAttribute('data-metrics')).requests;
 await page.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('[data-refresh]').dispatchEvent(new MouseEvent('click',{bubbles:true}));});await wait();
 const after=JSON.parse(await page.locator('#ugr-panel').getAttribute('data-metrics')).requests;check(after-before===4,'Clics simultáneos: una sesión, tres meses y sin solicitudes duplicadas');
 await page.evaluate(()=>{let d=JSON.parse(localStorage.fixture);const k=Object.keys(d).find(k=>k.endsWith(':history'));for(const m of d[k].changes.filter(c=>c.type==='month'))for(const i of m.value.items)i.name='<img src=x onerror="window.xss=1">';localStorage.fixture=JSON.stringify(d);});await page.reload();await wait();check(await page.locator('.ugr-main img').count()===0 && !(await page.evaluate(()=>window.xss)),'XSS');
 await page.evaluate(()=>{let d=JSON.parse(localStorage.fixture);const k=Object.keys(d).find(k=>k.endsWith(':history')).replace(':history',':cache');d[k]={schema:2,months:{bad:{t:'broken',items:null}},auto:null};localStorage.fixture=JSON.stringify(d);});await page.reload();await wait();check(await page.getByRole('tab',{name:'Entregadas 2',exact:true}).count()===1,'Recupera caché dañada');
 await page.evaluate(()=>{let d=JSON.parse(localStorage.fixture);const k=Object.keys(d).find(k=>k.endsWith(':cache'));d[k].schema=99;localStorage.fixture=JSON.stringify(d);});await page.reload();await page.waitForFunction(()=>document.querySelector('.ugr-error').textContent.includes('versión más reciente'));check(await page.locator('.ugr-item').count()===0,'Esquema futuro protegido');
 await page.evaluate(()=>localStorage.clear());await page.reload();await wait();
 return {passed};
}
