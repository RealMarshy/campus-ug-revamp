async (page,baseline)=>{
  const origin='http://127.0.0.1:8765', panel=page.locator('#ugr-panel');
  const picker=panel.getByLabel('Apariencia'), dialog=panel.locator('#ugr-credits');
  let passed=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const snapshot=()=>page.evaluate(()=>{
    const css=(selector,property)=>getComputedStyle(document.querySelector(selector))[property];
    return {
      page:css('#region-main','backgroundColor'),panel:css('#ugr-panel','backgroundColor'),
      card:css('.fixture-campus-card','backgroundColor'),menu:css('#ugr-preferences','backgroundColor'),
      text:css('#ugr-panel','color'),campusText:css('#region-main','color'),
      muted:css('.ugr-note','color'),campusMuted:css('.fixture-campus-card small','color'),
      border:css('#ugr-panel','borderTopColor'),campusBorder:css('.fixture-campus-card','borderTopColor'),
      button:css('[data-refresh]','backgroundColor'),campusButton:css('.fixture-campus-card button','backgroundColor'),
      controlBorder:css('[data-refresh]','borderTopColor'),campusControlBorder:css('.fixture-campus-card button','borderTopColor'),
      row:css('.ugr-item','backgroundColor'),modal:css('#ugr-credits','backgroundColor'),
    };
  });
  const equalBackground=()=>page.waitForFunction(()=>getComputedStyle(document.querySelector('#ugr-panel')).backgroundColor===
    getComputedStyle(document.querySelector('#region-main')).backgroundColor);
  const contrast=(a,b)=>{
    const lum=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255)
      .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
      .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const x=lum(a), y=lum(b);
    return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
  };
  const metrics=async()=>JSON.parse(await panel.getAttribute('data-metrics'));
  const setDark=dark=>page.evaluate(dark=>{
    const root=document.documentElement;
    if(dark)Object.assign(root.dataset,{darkreaderMode:'dynamic',darkreaderScheme:'dark'});
    else{delete root.dataset.darkreaderMode;delete root.dataset.darkreaderScheme;}
  },dark);
  const screenshot=theme=>page.screenshot({path:`output/playwright/ambient-${theme}-${baseline?'before':'after'}.png`});
  await page.emulateMedia({colorScheme:'light'});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector('.ugr-note')?.textContent.startsWith('Actualización finalizada'));
  await page.evaluate(()=>{
    const panel=document.querySelector('#ugr-panel');
    panel.parentElement.id='region-main';
    const block=document.createElement('section');
    block.className='block fixture-campus-card';
    block.innerHTML='<h2>Calendario de Moodle</h2><small class="text-muted">Superficie de referencia del campus simulado</small><button class="btn-secondary" type="button">Ver calendario</button>';
    panel.after(block);
    const style=document.createElement('style');
    style.id='fixture-campus-theme';
    style.textContent=`
      #region-main {background:#ebeff4;color:#233140;padding:18px;border-radius:12px}
      .fixture-campus-card {background:#f8fafc;border:1px solid #adb9c6;border-radius:8px;padding:14px 18px}
      .fixture-campus-card h2 {margin:0 0 6px;font-size:18px}
      .fixture-campus-card small {color:#4d5d6e}
      .fixture-campus-card button {margin-left:12px;padding:5px 8px;border:1px solid #5b6f82;border-radius:4px;background:#dfe8f1;color:#203144}
      html[data-darkreader-scheme="dark"] body {background:#191d24;color:#e8eff5}
      html[data-darkreader-scheme="dark"] #region-main {background:#242932;color:#e8eff5}
      html[data-darkreader-scheme="dark"] .fixture-campus-card {background:#2f3640;border-color:#556476}
      html[data-darkreader-scheme="dark"] .fixture-campus-card small {color:#b7c4d1}
      html[data-darkreader-scheme="dark"] .fixture-campus-card button {background:#384351;border-color:#8393a6;color:#e4eef7}
    `;
    document.head.append(style);
    window.ambientRow=panel.querySelector('.ugr-item');
  });
  await panel.locator('[data-personalize]').click();
  if(!baseline)await equalBackground();
  const light=await snapshot();
  check(baseline?light.page!==light.panel:light.page===light.panel&&light.card===light.menu&&light.text===light.campusText,
    'Fondo y superficie de Moodle claro');
  await screenshot('light');
  await setDark(true);
  await page.waitForFunction(()=>document.querySelector('#ugr-panel').dataset.ugrTheme==='dark');
  if(!baseline)await equalBackground();
  const dark=await snapshot();
  check(baseline?dark.page!==dark.panel:dark.page===dark.panel&&dark.card===dark.menu,'Fondo de Moodle oscuro');
  await screenshot('dark');
  if(baseline)return {passed,light,dark};

  check(dark.muted===dark.campusMuted&&dark.border===dark.campusBorder&&dark.button===dark.campusButton&&
    dark.controlBorder===dark.campusControlBorder,'Muestreo de texto secundario, bordes y controles');
  check(dark.row!==dark.panel&&dark.modal===dark.panel,'Fila diferenciada y modal con fondo del campus');
  const initial=await metrics();
  const requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.evaluate(()=>{
    document.querySelector('.fixture-campus-card small').style.color='#333a43';
    const button=document.querySelector('.fixture-campus-card button');
    button.style.color='#3c4654';button.style.borderColor='#3c4654';
  });
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ugr-note')).color!=='rgb(183, 196, 209)');
  const adjusted=await snapshot();
  const fg=await panel.locator('[data-refresh]').evaluate(el=>getComputedStyle(el).color);
  check(contrast(adjusted.muted,adjusted.panel)>=4.5&&contrast(fg,adjusted.button)>=4.5&&
    contrast(adjusted.controlBorder,adjusted.button)>=3,'Corrige muestras de contraste insuficiente');
  const hues=await panel.evaluate(el=>{
    const css=getComputedStyle(el);
    return ['blue','red','green'].map(name=>css.getPropertyValue('--ugr-'+name).match(/[\d.]+/g).map(Number));
  });
  check(hues[0][2]>hues[0][0]&&hues[1][0]>hues[1][1]&&hues[2][1]>hues[2][0],'Mantiene los colores semánticos');
  await page.evaluate(()=>{
    const sheet=document.getElementById('fixture-campus-theme').sheet;
    sheet.insertRule('html[data-darkreader-scheme="dark"] #region-main {background:#343d4a}',sheet.cssRules.length);
  });
  await equalBackground();
  check((await snapshot()).panel==='rgb(52, 61, 74)','Detecta una regla nueva sin mutación del DOM');
  await picker.selectOption('light');
  check((await snapshot()).panel==='rgb(248, 249, 250)','Claro usa su propia paleta');
  await picker.selectOption('dark');
  check((await snapshot()).panel==='rgb(28, 34, 43)','Oscuro usa su propia paleta');
  await picker.selectOption('auto');await equalBackground();
  await setDark(false);await equalBackground();
  check((await snapshot()).panel===light.page,'Desactivación en caliente restaura los colores claros');
  await page.evaluate(()=>{
    document.getElementById('fixture-campus-theme').textContent+='#region-main { background-color: #e4e9f0 }';
  });
  await equalBackground();
  check((await snapshot()).panel==='rgb(228, 233, 240)','Observa cambios de la hoja de estilos');
  await page.evaluate(()=>{
    const filter=document.createElement('style');
    filter.id='dark-reader-style';
    filter.textContent='html { filter:invert(1) hue-rotate(180deg); }';
    document.head.append(filter);
    document.documentElement.dataset.darkreaderMode='filter';
  });
  await page.waitForFunction(()=>document.querySelector('#ugr-panel').hasAttribute('data-ugr-filter'));
  const filtered=await snapshot();
  check(filtered.panel===filtered.page&&contrast(filtered.modal,'rgb(255, 255, 255)')>7&&filtered.modal!==filtered.panel,
    'Filtro aplica la transformación una vez y adapta el modal fuera de la raíz');
  await page.evaluate(()=>{
    document.getElementById('dark-reader-style').remove();
    document.documentElement.dataset.darkreaderScheme='dark';
    document.querySelector('#region-main').style.background='transparent';
    document.body.style.background='transparent';
  });
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#ugr-panel')).backgroundColor==='rgb(28, 34, 43)');
  check((await snapshot()).modal==='rgb(28, 34, 43)','Fondo no fiable mantiene la paleta oscura');
  await page.evaluate(()=>document.querySelector('#region-main').style.removeProperty('background'));
  await equalBackground();
  const after=await metrics();
  check(after.requests===initial.requests&&after.renders===initial.renders&&requests.length===0&&
    await page.evaluate(()=>window.ambientRow===document.querySelector('.ugr-item')),
    'Sin red, reconstrucción ni render académico al cambiar colores');
  await panel.locator('.ugr-credits-link').press('Enter');
  await dialog.locator('img').evaluate(img=>img.decode());
  check(await dialog.isVisible()&&(await snapshot()).modal===(await snapshot()).page,'Créditos adopta el tema de Moodle');
  await page.keyboard.press('Escape');
  return {passed,light,dark,adjusted,filtered};
}
