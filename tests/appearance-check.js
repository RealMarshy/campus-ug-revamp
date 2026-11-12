async page=>{
  const panel=page.locator('#ugr-panel'), prefs=panel.locator('#ugr-preferences');
  const picker=prefs.getByLabel('Apariencia'), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const idle=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]')?.disabled&&
    document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'),null,{timeout:12000});
  const open=()=>panel.locator('[data-personalize]').click();
  const theme=()=>panel.getAttribute('data-ugr-theme');
  const palette=()=>panel.getAttribute('data-ugr-palette');
  const expectTheme=mode=>page.waitForFunction(mode=>document.querySelector('#ugr-panel').dataset.ugrTheme===mode,mode);
  const metrics=async()=>JSON.parse(await panel.getAttribute('data-metrics'));
  const diag=async()=>JSON.parse(await panel.locator('#ugr-diagnostics').textContent());
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.fixture));
  const storedMode=mode=>page.waitForFunction(mode=>JSON.parse(localStorage.fixture)
    ['ugr2:'+location.origin+':42:presentation']?.appearance===mode,mode);
  const choose=async mode=>{await picker.selectOption(mode);await storedMode(mode);};
  const contrast=()=>panel.evaluate(root=>{
    const luminance=color=>{
      const channels=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255)
        .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
    };
    return Object.fromEntries(['.ugr-head h3','.ugr-note','[data-refresh]','[data-appearance]',
      '.ugr-source','.ugr-main a','.ugr-count-proximas','.ugr-count-atrasadas','.ugr-count-entregadas',
      '.ugr-assign','.ugr-diagnostic pre'].map(selector=>{
      const el=root.querySelector(selector), fg=luminance(getComputedStyle(el).color);
      let node=el,bg;
      while(node){
        bg=getComputedStyle(node).backgroundColor;
        if(bg!=='rgba(0, 0, 0, 0)')break;
        node=node.parentElement;
      }
      const l=luminance(bg);
      return [selector,(Math.max(fg,l)+.05)/(Math.min(fg,l)+.05)];
    }));
  });

  await page.emulateMedia({colorScheme:'light'});
  await page.setViewportSize({width:1280,height:900});
  await idle();await open();
  // Leave time for the synchronization's already-scheduled progress render.
  await page.waitForTimeout(150);
  check(await picker.inputValue()==='auto'&&await theme()==='light','Moodle claro y modo automático por defecto');
  const before=await metrics(), oldData=await store(), beforeDiagnostic=await diag();
  await page.evaluate(()=>{window.fixtureAppearanceRow=document.querySelector('.ugr-item');});
  const observedRequests=[];
  page.on('request',request=>observedRequests.push(request.url()));
  const light=await contrast();
  check(Object.values(light).every(value=>value>=4.5),'Contraste claro: '+JSON.stringify(light));
  await page.screenshot({path:'output/playwright/appearance-light.png'});
  await page.evaluate(()=>Object.assign(document.documentElement.dataset,{darkreaderMode:'dynamic',darkreaderScheme:'dark'}));
  await expectTheme('dark');
  check(await palette()==='dark'&&await picker.inputValue()==='auto','Activar Dinámico actualiza el tema');
  const dark=await contrast();
  check(Object.values(dark).every(value=>value>=4.5),'Contraste oscuro: '+JSON.stringify(dark));
  await page.screenshot({path:'output/playwright/appearance-dark.png'});
  await choose('light');
  check(await theme()==='light'&&await palette()==='light','Claro prevalece sobre Dinámico');
  await page.evaluate(()=>{
    delete document.documentElement.dataset.darkreaderMode;
    delete document.documentElement.dataset.darkreaderScheme;
  });
  await choose('dark');
  check(await theme()==='dark'&&await palette()==='dark','Oscuro manual con Moodle claro');
  await choose('auto');
  check(await theme()==='light','Volver a Automático respeta Moodle claro');
  await page.evaluate(()=>{document.documentElement.dataset.darkreaderScheme='dark';});
  await expectTheme('dark');
  await page.evaluate(()=>{delete document.documentElement.dataset.darkreaderScheme;});
  await expectTheme('light');
  check(await theme()==='light','Desactivar Dark Reader en caliente');

  await page.evaluate(()=>{document.body.style.backgroundColor='#15191e';});
  await expectTheme('dark');
  check(await theme()==='dark','Automático detecta el fondo oscuro de Moodle');
  await page.evaluate(()=>{document.body.style.backgroundColor='transparent';});
  await page.emulateMedia({colorScheme:'dark'});await expectTheme('dark');
  await page.evaluate(()=>{document.documentElement.dataset.darkreaderScheme='dimmed';});
  await expectTheme('light');
  check(await theme()==='light','Dinámico claro prevalece sobre el sistema oscuro');
  await page.evaluate(()=>{delete document.documentElement.dataset.darkreaderScheme;});
  await expectTheme('dark');
  await page.emulateMedia({colorScheme:'light'});await expectTheme('light');
  check(await theme()==='light','Cambio de preferencia del sistema sin recargar');

  await page.evaluate(()=>{
    const style=document.createElement('style');
    style.id='dark-reader-style';
    style.textContent='html { filter: invert(100%) hue-rotate(180deg); } img { filter: invert(100%) hue-rotate(180deg) !important; }';
    document.head.append(style);
    document.documentElement.dataset.darkreaderMode='filter';
  });
  await expectTheme('dark');
  check(await palette()==='light'&&await panel.locator('#ugr-credits').getAttribute('data-ugr-palette')==='dark',
    'Filtro usa una sola inversión de página y el diálogo mantiene el tema efectivo');
  check(await panel.locator('.ugr-credits-card').evaluate(img=>getComputedStyle(img).filter)==='none',
    'Filtro no invierte la carta del diálogo');
  await choose('light');
  check(await theme()==='light'&&await palette()==='dark','Claro manual compensa el sentido del filtro');
  await choose('auto');
  await page.evaluate(()=>{document.getElementById('dark-reader-style').textContent='html { filter: brightness(.9); }';});
  await expectTheme('light');
  check(await palette()==='light','Editar Filtro sin cambiar atributos se detecta');
  await page.evaluate(()=>{
    document.getElementById('dark-reader-style').remove();
    delete document.documentElement.dataset.darkreaderMode;
  });

  await choose('dark');
  const noRender=await metrics();
  const unchanged=await store();
  check(noRender.requests===before.requests&&noRender.renders===before.renders&&observedRequests.length===0,
    'Cambiar apariencia no sincroniza ni vuelve a renderizar la lista: '+JSON.stringify({before,noRender,requests:observedRequests.length}));
  check(await page.evaluate(()=>window.fixtureAppearanceRow===document.querySelector('.ugr-item')),
    'El nodo de actividad se conserva');
  check((await diag()).nextPeriodicRun===beforeDiagnostic.nextPeriodicRun,'Apariencia conserva el vencimiento periódico');
  check(Object.entries(oldData).filter(([key])=>!key.endsWith(':presentation'))
    .every(([key,value])=>JSON.stringify(unchanged[key])===JSON.stringify(value)),'Historial y datos académicos intactos');
  await page.setViewportSize({width:360,height:640});
  await prefs.locator('.ugr-credits-link').focus();
  await prefs.locator('.ugr-credits-link').press('Enter');
  const dialog=panel.locator('#ugr-credits');
  await dialog.locator('img').evaluate(img=>img.decode());
  check(await dialog.evaluate(el=>{
    const box=el.getBoundingClientRect();
    return el.matches(':modal')&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;
  }),'Créditos oscuro cabe en móvil');
  await page.screenshot({path:'output/playwright/appearance-dark-mobile.png'});
  await page.keyboard.press('Escape');
  check(await dialog.isHidden()&&await prefs.isVisible(),'Escape devuelve al menú');
  const scriptUrl='http://127.0.0.1:8765/content.js';
  await page.route(scriptUrl,async route=>{
    const response=await route.fetch();
    const delay=`{
      const originalGet=chrome.storage.local.get;
      chrome.storage.local.get=async key=>{
        if(key?.endsWith(':presentation'))await new Promise(resolve=>{window.releaseAppearance=resolve;});
        return originalGet(key);
      };
    }\n`;
    await route.fulfill({response,body:delay+await response.text()});
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.releaseAppearance==='function');
  check(await panel.isHidden(),'El panel espera la apariencia guardada antes de mostrarse');
  await page.evaluate(()=>window.releaseAppearance());
  await idle();await open();
  await page.unroute(scriptUrl);
  check(await picker.inputValue()==='dark'&&await theme()==='dark','Apariencia persistida tras recargar');
  const secondary=await page.context().newPage();
  await secondary.goto('http://127.0.0.1:8765/');
  await secondary.waitForFunction(()=>document.querySelector('#ugr-panel')?.dataset.ugrTheme==='dark');
  await secondary.close();
  check(await theme()==='dark','Otra pestaña carga la preferencia de la cuenta');
  await page.evaluate(()=>fetch('/mode?value=other'));
  await page.route('http://127.0.0.1:8765/lib/ajax/service.php?*',route=>route.fulfill({json:[{data:{weeks:[]}}]}));
  await page.reload();await idle();await open();
  check(await picker.inputValue()==='auto'&&await theme()==='light','La segunda cuenta conserva su propio valor');
  check(errors.length===0,'Sin errores JavaScript: '+errors.join(', '));
  return {passed,contrast:{light:Math.min(...Object.values(light)),dark:Math.min(...Object.values(dark))}};
}
