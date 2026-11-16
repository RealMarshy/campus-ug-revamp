async (page) => {
 let passed=0;const assert=(ok,msg)=>{if(!ok)throw new Error(msg);passed++;};
 const wait=()=>page.waitForFunction(()=>document.querySelector('.ugr-note')?.textContent.includes('Actualización finalizada'));
 const metric=()=>page.locator('#ugr-panel').getAttribute('data-metrics').then(JSON.parse);
 await page.evaluate(async()=>{await fetch('/mode?value=normal');localStorage.clear();});await page.reload();await wait();
 const results={cold:await metric()};await page.setViewportSize({width:1280,height:800});
 assert(await page.getByRole('tab',{name:'Entregadas 2',exact:true}).count()===1,'Clasificación entregadas');
 await page.reload();await wait();results.warm=await metric();assert(results.warm.requests===1,'Caché caliente solo comprueba sesión');
 await page.getByLabel('Filtrar por curso').selectOption('2');assert(await page.getByRole('tab',{name:'Pendientes 2',exact:true}).count()===1,'Filtro');
 await page.getByLabel('Filtrar por curso').selectOption('all');
 await page.locator('[data-toggle="assign:5"]').click();
 await page.waitForFunction(()=>document.querySelector('.ugr-count-entregadas').textContent==='3');
 await page.reload();await wait();assert(await page.getByRole('tab',{name:'Entregadas 3',exact:true}).count()===1,'Persistencia manual');
 await page.getByRole('tab',{name:'Entregadas 3',exact:true}).click();assert((await page.locator('.ugr-source').allTextContents()).includes('Declarada como realizada · Declaración del estudiante'),'Origen manual');
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();await wait();results.manual=await metric();assert(results.manual.checks===0,'Actualizar respeta TTL y marcas manuales');
 await page.evaluate(()=>fetch('/mode?value=new'));await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await wait();
 await page.getByRole('tab',{name:/Próximas/}).click();assert(await page.getByRole('link',{name:'Actividad nueva'}).count()===1,'Nueva actividad');
 await page.evaluate(()=>fetch('/mode?value=partial'));await page.evaluate(()=>{window.confirm=()=>true;});await page.getByRole('button',{name:'Reverificar todo',exact:true}).click();await wait();assert(await page.locator('[data-minimal-warning]').isHidden() && await page.locator('[data-show-diagnostic]').isHidden(),'El fallo transitorio del calendario queda pendiente');assert(await page.getByRole('link',{name:'Actividad nueva'}).count()===1,'Conserva datos tras error');
 await page.screenshot({path:'output/playwright/panel-desktop-2.0.3.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/panel-mobile-2.0.3.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin desborde móvil');
 await page.evaluate(()=>fetch('/mode?value=unknown'));await page.reload();await page.waitForFunction(()=>document.querySelector('.ugr-error')?.textContent.includes('identificar'));assert(await page.locator('.ugr-item').count()===0,'No muestra caché sin identidad');
 await page.evaluate(()=>fetch('/mode?value=other'));await page.reload();await page.waitForFunction(()=>document.querySelector('.ugr-error')?.textContent.includes('Cuenta distinta'));assert(await page.locator('.ugr-item').count()===0,'Respuesta de otra cuenta oculta datos');assert(!(await page.locator('.ugr-source').allTextContents()).includes('Declarada como realizada · Declaración del estudiante'),'Cuenta distinta no hereda manual');
 await page.evaluate(()=>fetch('/mode?value=normal'));await page.reload();await wait();
 return {passed,metrics:results};
}
