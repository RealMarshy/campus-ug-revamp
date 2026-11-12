async page=>{
  const origin='http://127.0.0.1:8765', path='/assets/hagalo-usted-mismo.png';
  const panel=page.locator('#ugr-panel'), list=panel.locator('.ugr-list');
  const settings=panel.locator('#ugr-preferences'), personalize=panel.locator('[data-personalize]');
  const link=settings.getByRole('link',{name:'Créditos',exact:true});
  const dialog=panel.locator('#ugr-credits'), close=dialog.getByRole('button',{name:'Cerrar créditos'});
  const card=dialog.locator('img');
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const settled=()=>page.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled&&
    document.querySelector('.ugr-note').textContent.includes('Actualización finalizada'));
  const metric=async()=>JSON.parse(await panel.getAttribute('data-metrics')).requests;
  const store=()=>page.evaluate(()=>localStorage.fixture);
  const closeFocus=()=>page.waitForFunction(()=>document.activeElement?.matches('.ugr-credits-link')&&
    !document.querySelector('#ugr-credits').open);
  await settled();
  await page.evaluate(()=>{
    const prefix='ugr2:'+location.origin+':42:', now=Date.now();
    const data=JSON.parse(localStorage.fixture);
    const items=Array.from({length:50},(_,i)=>{
      const id=String(100+i);
      return {id,cmid:id,mod:'assign',name:'Tarea ficticia '+id,due:Math.floor(now/1000)+3600+i,
        courseId:1,course:'Curso ficticio',url:location.origin+'/mod/assign/view.php?id='+id,synced:now};
    });
    data[prefix+'cache']={schema:2,months:{'2020-1':{t:now,items}},auto:Object.fromEntries(
      items.map(it=>['assign:'+it.cmid,{source:'moodle',done:false,t:now}]))};
    data[prefix+'presentation']={schema:1,position:'hidden',title:'Panel de prueba'};
    localStorage.fixture=JSON.stringify(data);
  });
  await page.setViewportSize({width:1280,height:800});
  await page.reload();await settled();
  const requests=[];
  page.on('request',req=>requests.push(req.url()));
  const baseline=await metric(), saved=await store();
  const rowIds=()=>list.locator('li').evaluateAll(rows=>rows.map(row=>row.dataset.id).join(','));
  const beforeRows=await rowIds();
  await list.evaluate(el=>{el.scrollTop=350;});
  const startScroll=await list.evaluate(el=>el.scrollTop);
  check(startScroll===350,'La prueba comienza con la lista desplazada');
  check(await settings.isHidden()&&await panel.getByRole('link',{name:'Créditos',exact:true}).count()===0&&
    await panel.locator('.ugr-foot .ugr-credits-link').count()===0,'Créditos no aparece en el panel principal');
  await personalize.click();
  check(await panel.locator('#ugr-status').isHidden()&&await link.isVisible(),'Créditos disponible solo dentro de Personalizar');
  const footer=await link.evaluate(el=>{
    const parent=el.parentElement, link=el.getBoundingClientRect(), box=parent.getBoundingClientRect();
    const parentStyle=getComputedStyle(parent), style=getComputedStyle(el);
    return {right:box.right-link.right-parseFloat(parentStyle.paddingRight)-parseFloat(parentStyle.borderRightWidth),
      bottom:box.bottom-link.bottom-parseFloat(parentStyle.paddingBottom)-parseFloat(parentStyle.borderBottomWidth),
      last:parent.lastElementChild===el,size:parseFloat(style.fontSize),opacity:parseFloat(style.opacity),
      plain:parseFloat(style.borderRightWidth)===0&&style.backgroundColor==='rgba(0, 0, 0, 0)'};
  });
  check(footer.last&&Math.abs(footer.right)<1&&Math.abs(footer.bottom)<1,'Enlace al final, abajo y a la derecha de Personalizar');
  check(footer.size===9&&footer.opacity===0&&footer.plain,'Enlace de 9 px al 0 %, sin borde ni fondo');
  await settings.screenshot({path:'output/playwright/credits-personalize.png'});
  await link.hover();
  await page.waitForFunction(()=>Math.abs(Number(getComputedStyle(document.querySelector('.ugr-credits-link')).opacity)-.3)<.01);
  check(await link.evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)>0),'Transición suave al pasar el cursor');
  await page.mouse.move(0,0);
  await page.keyboard.press('Tab');
  await link.focus();
  await page.waitForFunction(()=>{
    const el=document.querySelector('.ugr-credits-link');
    return el.matches(':focus-visible')&&Math.abs(Number(getComputedStyle(el).opacity)-.3)<.01;
  });
  check(await link.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),'Foco de teclado visible');
  check(await card.getAttribute('src')===null,'La imagen se pide al abrir');
  await link.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ugr-credits-card').naturalWidth>0);
  check(await dialog.evaluate(el=>el.matches(':modal')),'Diálogo modal nativo');
  check(await close.evaluate(el=>el===document.activeElement),'Foco inicial en cerrar');
  check(await dialog.locator('h4').textContent()==='Créditos:'&&
    await dialog.locator('.ugr-credits-authors').innerText()==='Hecho por: Daniel Abel y Jonathan Peñafiel\nhttps://github.com/danieIabel\nhttps://github.com/Jonathan-hue-sudo\nRevamp por los GOATS ChatGPT y Codex\nDirigido y optimizado por Kleber Arteaga\nhttps://github.com/RealMarshy'&&
    await dialog.locator('strong').textContent()==='#RipMoodle'&&
    await dialog.locator('em').textContent()==='Si no nos quieren dar las herramientas...','Contenido exacto');
  const profiles=["https://github.com/danieIabel","https://github.com/Jonathan-hue-sudo","https://github.com/RealMarshy"];
  const links=await dialog.locator('.ugr-credits-authors a').evaluateAll(nodes=>nodes.map(link=>({
    text:link.textContent,href:link.href,target:link.target,rel:link.rel,
  })));
  check(JSON.stringify(links)===JSON.stringify(profiles.map(url=>({text:url,href:url,target:'_blank',rel:'noopener noreferrer'}))),
    'Tres perfiles correctos con apertura segura en otra pestaña');
  const image=await card.evaluate(el=>{
    const {width,height}=el.getBoundingClientRect();
    return {src:el.currentSrc,natural:[el.naturalWidth,el.naturalHeight],width,height};
  });
  check(image.src===origin+path&&image.natural.join()==='480,683','PNG local de la ilustración');
  check(image.width>=220&&image.width<=280&&Math.abs(image.width/image.height-480/683)<.002,'Relación de aspecto original');
  await page.keyboard.press('Tab');
  check(await dialog.evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body),'Tab no enfoca los controles del panel de fondo');
  await page.screenshot({path:'output/playwright/credits-desktop.png'});
  await close.click();await closeFocus();
  check(await dialog.isHidden(),'× cierra y devuelve el foco');
  await link.press('Enter');await page.keyboard.press('Escape');await closeFocus();
  check(await dialog.isHidden()&&await settings.isVisible(),'Escape cierra el diálogo y devuelve el foco dentro de Personalizar');
  await link.press('Escape');
  check(await settings.isHidden()&&await link.count()===0&&
    await personalize.evaluate(el=>el===document.activeElement),'Cerrar Personalizar oculta Créditos y devuelve el foco');
  check(await list.evaluate(el=>el.scrollTop)===startScroll&&await rowIds()===beforeRows,'La lista y su scroll se conservan');
  await page.setViewportSize({width:360,height:600});
  await panel.evaluate(el=>{el.style.overflow='hidden';});
  await personalize.click();
  await link.click();
  check(await dialog.evaluate(el=>{
    const box=el.getBoundingClientRect();
    return box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;
  }),'En móvil el modal cabe en el viewport y escapa al recorte del widget');
  await page.screenshot({path:'output/playwright/credits-mobile.png'});
  await page.setViewportSize({width:280,height:400});
  check(await dialog.evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth===el.clientWidth),'En una pantalla corta el modal desplaza solo en vertical');
  await page.keyboard.press('Escape');await closeFocus();
  await personalize.click();
  check(await settings.isHidden()&&await link.count()===0,'El enlace desaparece también al cerrar con clic');
  check(await store()===saved,'Abrir y cerrar conserva todos los datos y preferencias');
  check(await metric()===baseline&&requests.length===1&&requests[0]===origin+path,'Una carga local de la carta y cero solicitudes académicas');
  return {passed,assetRequests:requests.length,academicRequests:0,imageDimensions:image.natural};
}
