async page=>{
  const origin='http://127.0.0.1:8765', panel=page.locator('#ugr-panel');
  const selectors=['#ugr-title','[data-course]','[data-refresh]','[data-reverify-all]','[data-personalize]'];
  const refresh=panel.locator('[data-refresh]'), all=panel.locator('[data-reverify-all]');
  const personalize=panel.locator('[data-personalize]'), course=panel.locator('[data-course]');
  const cancel=panel.locator('[data-cancel]'), status=panel.locator('[data-toggle-status]');
  let passed=0, pending, reads=0, aborted=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const snapshot=()=>panel.evaluate((root,selectors)=>{
    const rect=el=>{
      const {x,y,width,height}=el.getBoundingClientRect();
      return [x,y,width,height];
    };
    return {
      header:selectors.map(selector=>rect(root.querySelector(selector))),
      toolbar:rect(root.querySelector('.ugr-list-toolbar')),
      status:rect(root.querySelector('[data-toggle-status]')),
    };
  },selectors);
  const sameHeader=(a,b)=>JSON.stringify(a.header)===JSON.stringify(b.header);
  const same=(a,b)=>sameHeader(a,b)&&JSON.stringify(a.toolbar)===JSON.stringify(b.toolbar)&&
    JSON.stringify(a.status)===JSON.stringify(b.status);
  const screenshot=name=>page.screenshot({path:'output/playwright/header-'+name+'.png'});
  const diagnostics=()=>panel.locator('#ugr-diagnostics').textContent().then(JSON.parse);
  const idle=()=>page.waitForFunction(()=>{
    const panel=document.querySelector('#ugr-panel');
    return panel&&!panel.querySelector('[data-reverify-all]').disabled&&panel.querySelector('[data-cancel]').hidden;
  });
  const calendar=url=>url.startsWith(origin+'/lib/ajax/service.php?');
  await page.route(url=>calendar(url.href),async route=>{
    reads++;
    const gate=pending;
    if(gate){if(++gate.seen===gate.expected)gate.started();await gate.wait;}
    try{await route.fallback();}catch(error){if(!gate?.aborted)throw error;}
  });
  page.on('requestfailed',request=>{
    if(calendar(request.url())&&request.failure()?.errorText.includes('ABORTED'))aborted++;
  });
  const hold=expected=>{
    let release,started;
    const active=new Promise(resolve=>{started=resolve;});
    const wait=new Promise(resolve=>{release=resolve;});
    pending={active,wait,started,release,aborted:false,expected,seen:0};
    return pending;
  };
  const start=async(button=all,expected=1)=>{
    const gate=hold(expected);
    await button.click();
    await gate.active;
    return gate;
  };
  const finish=async gate=>{
    pending=undefined;
    gate.release();
    await idle();
  };
  const within=()=>panel.evaluate((root,selectors)=>{
    const bounds=root.getBoundingClientRect();
    const controls=[...selectors,'[data-toggle-status]','[data-cancel]'].map(selector=>root.querySelector(selector))
      .filter(el=>!el.hidden).map(el=>el.getBoundingClientRect());
    return controls.every((rect,i)=>rect.left>=bounds.left&&rect.right<=bounds.right+.5&&rect.right<=innerWidth+.5&&
      controls.slice(i+1).every(other=>rect.right<=other.left+.5||other.right<=rect.left+.5||
        rect.bottom<=other.top+.5||other.bottom<=rect.top+.5));
  },selectors);

  await page.setViewportSize({width:960,height:800});
  await page.emulateMedia({colorScheme:'light'});
  await page.goto(origin);
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.waitForFunction(()=>document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'));
  await idle();
  const before=await snapshot();
  await screenshot('antes');
  const cancelRole=panel.getByRole('button',{name:'Cancelar verificación',exact:true});
  check(await cancel.isHidden()&&await cancelRole.count()===0&&await refresh.isEnabled()&&await all.isEnabled(),'Controles en reposo');
  const first=await start();
  await cancel.waitFor({state:'visible'});
  await screenshot('durante');
  const during=await snapshot();
  check(sameHeader(before,during),'La cabecera cambia de posición al reverificar: '+JSON.stringify({antes:before.header,durante:during.header}));
  check(same(before,during),'El área de estado conserva el espacio de sus controles');
  check(await cancelRole.count()===1&&await cancel.evaluate(el=>!!el.closest('.ugr-list-toolbar')&&!el.disabled),
    'Cancelar está habilitado y tiene un nombre accesible en el área de estado');
  check(await refresh.isDisabled()&&await all.isDisabled()&&await personalize.isEnabled()&&await course.isEnabled(),
    'Actualizar y Reverificar se deshabilitan y los demás controles siguen disponibles');
  await cancel.focus();
  await finish(first);
  check(same(before,await snapshot())&&(await diagnostics()).lastRun.cancelled===false,'La operación completa restaura los controles');
  check(await status.evaluate(el=>el===document.activeElement),'Al terminar, el foco del botón desaparecido vuelve al control de estado');
  await screenshot('despues');

  const normal=await start(refresh);
  check(await cancel.isHidden()&&await refresh.isDisabled()&&await all.isDisabled(),'Actualizar carece de control de cancelación');
  await finish(normal);

  await status.click();
  check(await panel.locator('#ugr-status').isHidden(),'El resumen puede permanecer oculto');
  const hiddenStatus=await snapshot();
  const second=await start(all,3);
  const startedReads=reads;
  second.aborted=true;
  await cancel.press('Enter');
  await idle();
  await finish(second);
  const cancelled=(await diagnostics()).lastRun.cancelled;
  check(cancelled&&reads===startedReads&&aborted>0,
    'Cancelar por teclado aborta la petición y detiene la revisión: '+JSON.stringify({cancelled,reads,startedReads,aborted}));
  check(same(hiddenStatus,await snapshot())&&await status.evaluate(el=>el===document.activeElement)&&await panel.locator('#ugr-status').isHidden(),
    'Cancelar devuelve el foco al control de estado y conserva el resumen oculto');
  check(await refresh.isEnabled()&&await all.isEnabled(),'Los botones vuelven a habilitarse tras cancelar');
  await status.click();

  await personalize.click();
  const appearance=panel.getByLabel('Apariencia');
  for(const [mode,width,zoom] of [['light',320,1],['dark',880,2],['auto',360,1]]){
    await appearance.selectOption(mode);
    await page.setViewportSize({width,height:900});
    await page.evaluate(({zoom,mode})=>{
      document.documentElement.style.zoom=String(zoom);
      if(mode==='auto')document.documentElement.dataset.darkreaderScheme='dark';
    },{zoom,mode});
    await personalize.click();
    await page.waitForFunction(theme=>document.querySelector('#ugr-panel').dataset.ugrTheme===theme,mode==='light'?'light':'dark');
    const compact=await snapshot();
    const gate=await start();
    check(same(compact,await snapshot())&&await within(),'Cabecera y estado estables, sin solapamiento con '+mode+' a '+width+' px y zoom '+zoom);
    await screenshot(mode==='light'?'estrecho':mode==='dark'?'zoom-200':'auto-oscuro');
    await finish(gate);
    check(same(compact,await snapshot()),'La distribución se conserva al finalizar con '+mode);
    await personalize.click();
  }
  return {passed,viewport:960,aborted};
}
