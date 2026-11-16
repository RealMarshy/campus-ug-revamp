async page=>{
  const origin='http://127.0.0.1:8765';
  const panel=page.locator('#ugr-panel'), setting=name=>panel.locator('[data-'+name+']');
  const list=panel.locator('.ugr-list'), rows=list.locator('li');
  const prefs=panel.locator('#ugr-preferences'), status=panel.locator('#ugr-status');
  const title=panel.locator('#ugr-title');
  const defaultTitle='Mis actividades · Campus UG Revamp';
  const open=()=>setting('personalize').click();
  const settle=async()=>{
    try{
      await page.waitForFunction(()=>!document.querySelector('[data-refresh]').disabled &&
        document.querySelector('.ugr-note').textContent.startsWith('Actualización finalizada'),null,{timeout:10000});
    }catch{
      throw Error('Sincronización no finalizada ('+passed+'): '+await panel.locator('.ugr-note').first().textContent()+
        ' '+await panel.locator('.ugr-error').textContent());
    }
  };
  const diag=async()=>JSON.parse(await panel.locator('#ugr-diagnostics').textContent());
  const ids=()=>rows.evaluateAll(elements=>elements.map(e=>e.dataset.id));
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.fixture));
  const metric=async()=>JSON.parse(await panel.getAttribute('data-metrics')).requests;
  const nextSaved=()=>page.waitForFunction(()=>JSON.parse(localStorage.fixture)[
    'ugr2:'+location.origin+':42:presentation']?.title==='Panel de pruebas',null,{timeout:5000})
    .catch(()=>{throw Error('El título editado no se guardó');});
  const expand=async toggle=>{if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();};
  const select=async(...categories)=>{
    await expand(quickCategories);
    for(const box of await quickCategoryBox.locator('[data-category]').all())await box.setChecked(categories.includes(await box.getAttribute('value')));
  };
  let passed=0, academicRequests=0, forumRequests=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  const fixtureNoon=new Date();
  fixtureNoon.setHours(12,0,0,0);
  await page.clock.setFixedTime(fixtureNoon);
  await page.route(origin+'/**',async route=>{
    const path=route.request().url().slice(origin.length);
    if(path.startsWith('/mod/forum/')){forumRequests++;return route.fulfill({body:'<article class="forum-post-container"><p>Publicación de prueba de otro participante</p></article><p>Discusión bloqueada</p>'});}
    if(path.startsWith('/mod/')||path==='/my/'||path.startsWith('/lib/ajax/'))academicRequests++;
    return route.fallback();
  });
  await page.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:8765'||localStorage.fixture)return;
    const prefix='ugr2:'+location.origin+':42:', now=Date.now(), day=new Date();
    const months={}, auto={};
    for(let i=-3;i<=2;i++){
      const m=new Date(day.getFullYear(),day.getMonth()+i,1);
      months[m.getFullYear()+'-'+(m.getMonth()+1)]={t:now-1000,items:[]};
    }
    const make=(id,mod,courseId,offset)=>{
      const it={id:String(id),cmid:String(id),mod,courseId,course:'Curso '+courseId,
        due:Math.floor(now/1000)+offset,name:'Actividad '+id,synced:now-1000,
        url:location.origin+'/mod/'+mod+'/view.php?id='+id};
      if(mod!=='forum'&&id!==6)auto[mod+':'+id]={done:id===1,source:'moodle',t:now-1000};
      return it;
    };
    const active=months[day.getFullYear()+'-'+(day.getMonth()+1)].items;
    active.push(make(1,'assign',1,100000),make(4,'assign',2,-100000),make(5,'assign',2,100005),
      make(6,'quiz',1,100006),make(7,'forum',2,72000),make(8,'forum',1,-100001));
    months['2020-1']={t:now-1000,items:Array.from({length:240},(_,i)=>make(1000+i,'assign',i%2+1,50000+i))};
    localStorage.fixture=JSON.stringify({
      [prefix+'cache']:{schema:2,updated:now-1000,months,auto},
      [prefix+'history']:{schema:1,changes:[{type:'manual',key:'forum:8',value:{done:true,t:now-1000}}]},
      [prefix+'verification']:{schema:1,calendar:{},exhaustiveAt:now-1200,records:{
        'assign:1':{t:now-500,stateAt:now-1000,closedAt:null,observedAt:now-500},
      }},
      [prefix+'manual:forum:7']:{done:false,t:now-1000},
      [prefix+'failures']:{'quiz:6':{code:'SELECTOR_MISSING',t:now-1000,retryAt:now+3600000,attempts:1}},
      ['ugr2:'+location.origin+':99:presentation']:{schema:1,title:'Otra cuenta',position:'top'},
    });
  });
  await page.setViewportSize({width:1280,height:1000});
  await page.goto(origin);await settle();
  const beforePresetChecks=academicRequests;
  const quickCategories=panel.locator('[data-quick-filter="categories"]');
  const quickTypes=panel.locator('[data-quick-filter="types"]');
  const quickCategoryBox=panel.locator('#ugr-quick-categories');
  const quickTypeBox=panel.locator('#ugr-quick-types');
  const quickDate=panel.locator('[data-quick-filter="date"]'), dateBox=panel.locator('#ugr-quick-date');
  check(await panel.locator('[data-quick-filter]').first().getAttribute('data-quick-filter')==='date','Fecha precede los demás accesos');
  await quickDate.press('Space');
  const presetButtons=dateBox.locator('[data-date-preset]');
  const baseCount=await panel.getByRole('tab',{selected:true}).textContent();
  for(const button of await presetButtons.all()){
    await button.press('Space');
    check(await button.getAttribute('aria-pressed')==='true','Activar '+await button.textContent());
    await button.press('Enter');
    check(await dateBox.locator('[aria-pressed="true"]').count()===0&&
      await panel.getByRole('tab',{selected:true}).textContent()===baseCount&&
      await setting('date-label').textContent()==='Fecha'&&await button.evaluate(el=>el===document.activeElement),
      'Desactivar restablece contador y conserva foco · '+await button.textContent());
    await button.click();
    check(await button.getAttribute('aria-pressed')==='true','Reactivar '+await button.textContent());
  }
  await presetButtons.first().click();
  check(await presetButtons.first().getAttribute('aria-pressed')==='true'&&
    await dateBox.locator('[aria-pressed="true"]').count()===1,'Cambio directo entre presets');
  await presetButtons.first().click();
  await page.waitForFunction(()=>JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':42:presentation']?.dateRange===null);
  check(academicRequests===beforePresetChecks,'Alternar presets no genera solicitudes académicas');
  await page.reload();await settle();
  check(await setting('date-label').textContent()==='Fecha'&&
    await panel.getByRole('tab',{selected:true}).textContent()===baseCount,'Fecha desactivada después de recargar');
  const beforeFilters=academicRequests;
  await quickDate.press('Space');
  await dateBox.getByRole('button',{name:'Hace 1 semana'}).click();
  check(await dateBox.locator('[aria-pressed="true"]').count()===1&&await rows.count()===0,'Preset activo filtra Próximas');
  check((await setting('empty-message').textContent()).includes('rango de fechas'),'El estado vacío identifica el rango');
  await quickCategories.click();
  check(await dateBox.isHidden(),'Categorías contrae Fecha');
  await quickDate.click();
  await dateBox.getByLabel('Desde').fill('2099-01-02');
  await dateBox.getByLabel('Hasta').fill('2099-01-01');
  await dateBox.getByRole('button',{name:'Aplicar fechas'}).click();
  check(await dateBox.getByRole('alert').isVisible()&&await dateBox.locator('[aria-pressed="true"]').count()===1,'Rango inverso conserva la selección vigente');
  await dateBox.getByLabel('Hasta').fill('');
  await dateBox.getByRole('button',{name:'Aplicar fechas'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':42:presentation']?.dateRange?.from==='2099-01-02');
  check(await panel.getByRole('tab',{name:'Próximas 0',exact:true}).isVisible()&&
    await dateBox.locator('[aria-pressed="true"]').count()===0,'Aplicar el rango manual quita el resaltado del preset y filtra el contador');
  await dateBox.getByRole('button',{name:'Limpiar filtro'}).click();
  await dateBox.getByLabel('Desde').press('Escape');
  check(await dateBox.isHidden()&&await quickDate.evaluate(el=>el===document.activeElement),'Escape devuelve el foco a Fecha');
  await page.setViewportSize({width:960,height:900});
  await quickDate.click();
  check(await dateBox.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth),'Fecha sin desbordamiento a 960 px');
  check(await dateBox.evaluate(el=>{
    const rect=s=>el.querySelector(s).getBoundingClientRect();
    const end=rect('[data-date-to]'),apply=rect('[data-apply-date]'),month=rect('[data-date-preset="next-month"]'),clear=rect('[data-clear-date]');
    return apply.left>=end.right&&Math.abs(apply.bottom-end.bottom)<1&&clear.left>=month.right&&
      Math.abs(clear.top-month.top)<1&&rect('[data-date-preset="last-week"]').top>clear.top;
  }),'Aplicar y Limpiar ocupan las posiciones solicitadas');
  await dateBox.getByRole('button',{name:'Dentro de 1 semana'}).click();
  await quickTypes.click();
  await quickTypeBox.locator('[value="assign"]').uncheck();
  await setting('course').selectOption('2');
  check((await ids()).join(',')==='forum:7','Fecha, tipos y curso se intersectan en Próximas');
  await expand(quickDate);
  const beforeToggle=academicRequests;
  const nextWeek=dateBox.locator('[data-date-preset="next-week"]');
  await nextWeek.click();
  check(await setting('course').inputValue()==='2'&&(await ids()).join(',')==='forum:7'&&academicRequests===beforeToggle,
    'Desactivar Fecha conserva curso y tipos, sin consultas adicionales');
  await nextWeek.click();
  await open();
  await setting('mode').selectOption('custom');
  await select('proximas','pendientes');
  check((await ids()).join(',')==='forum:7','Lista simple combina Fecha y categorías sin duplicar');
  await select('proximas');
  await setting('mode').selectOption('tabs');
  await open();
  await setting('course').selectOption('all');
  await expand(quickTypes);
  await quickTypeBox.locator('[value="assign"]').check();
  await quickDate.click();
  await dateBox.getByRole('button',{name:'Limpiar filtro'}).click();
  await quickDate.click();
  await page.setViewportSize({width:1280,height:1000});
  await quickCategories.press('Enter');
  check(await quickCategoryBox.isVisible()&&await quickCategories.getAttribute('aria-expanded')==='true','Abrir Categorías por teclado');
  await quickCategoryBox.locator('[value="atrasadas"]').uncheck();
  check(await panel.locator('[data-tab="atrasadas"]').isHidden(),'Categorías rápidas actualizan pestañas');
  await quickTypes.click();
  check(await quickCategoryBox.isHidden()&&await quickTypeBox.isVisible(),'Solo un desplegable abierto');
  await quickTypeBox.locator('[value="feedback"]').uncheck();
  await quickTypeBox.locator('[value="feedback"]').press('Escape');
  check(await quickTypeBox.isHidden()&&await quickTypes.evaluate(el=>el===document.activeElement),'Escape cierra y devuelve el foco');
  await open();
  check(await prefs.locator('fieldset, [data-category], [data-activity-type]').count()===0,'Personalizar sin filtros duplicados');
  await expand(quickTypes);
  check(!await quickTypeBox.locator('[value="feedback"]').isChecked(),'Tipos conserva la selección');
  await quickTypeBox.locator('[value="feedback"]').check();
  await expand(quickCategories);
  check(!await quickCategoryBox.locator('[value="atrasadas"]').isChecked(),'Categorías conserva la selección');
  await quickCategoryBox.locator('[value="atrasadas"]').check();
  await setting('mode').selectOption('custom');
  await quickCategoryBox.locator('[value="pendientes"]').check();
  check(new Set(await ids()).size===await rows.count(),'Lista simple deduplica las categorías');
  await quickCategoryBox.locator('[value="pendientes"]').uncheck();
  await setting('mode').selectOption('tabs');
  for(const mode of ['tabs','custom']){
    await setting('mode').selectOption(mode);
    await quickCategoryBox.getByRole('button',{name:'Deseleccionar todas'}).click();
    check(await panel.getByRole('tab',{selected:true}).count()===0&&
      await quickCategoryBox.locator('[data-category]:checked').count()===0&&
      (await setting('empty-message').textContent()).includes('al menos una categoría'),'Sin categorías en '+mode);
    await quickCategoryBox.getByRole('button',{name:'Seleccionar todas',exact:true}).click();
    check(await quickCategoryBox.locator('[data-category]:checked').count()===5,'Restaurar categorías en '+mode);
  }
  await select('proximas');
  await setting('mode').selectOption('tabs');
  await quickCategories.click();
  check(await quickCategoryBox.isHidden()&&await quickCategories.evaluate(el=>el===document.activeElement),'El botón principal cierra y devuelve el foco');
  await quickTypes.click();
  check(await quickTypeBox.locator('[value="feedback"]').isChecked(),'Tipos conserva la opción restaurada');
  await quickTypeBox.getByRole('button',{name:'Deseleccionar todas'}).click();
  check(await quickTypeBox.locator('[data-activity-type]:checked').count()===0&&
    (await setting('empty-message').textContent()).includes('al menos un tipo'),'Sin tipos desde el acceso rápido');
  await quickTypeBox.getByRole('button',{name:'Seleccionar todas',exact:true}).click();
  check(await quickTypeBox.locator('[data-activity-type]:checked').count()===4,'Restaurar tipos desde el acceso rápido');
  await quickTypes.click();
  check(await quickTypeBox.isHidden(),'Volver a pulsar contrae Tipos');
  await open();
  const visibleTabs=panel.getByRole('tab');
  check(await visibleTabs.count()===5,'Preferencias previas conservan las cinco pestañas');
  await open();
  await expand(quickCategories);
  const next=quickCategoryBox.locator('[data-category][value="proximas"]');
  await next.press('Space');
  check(await visibleTabs.count()===4&&await panel.getByRole('tab',{selected:true}).getAttribute('data-tab')==='atrasadas','Ocultar la activa selecciona la primera visible');
  await setting('mode').selectOption('custom');
  check(await setting('mode').locator('option:checked').textContent()==='Lista simple (Antiguo)'&&await next.isChecked(),'Lista simple conserva su selección independiente');
  await setting('mode').selectOption('tabs');
  check(!await next.isChecked(),'Volver a Pestañas recupera su selección');
  await quickCategoryBox.locator('[data-select-all]').click();
  await expand(quickTypes);
  const types=quickTypeBox.locator('[data-activity-type]');
  for(const box of await types.all())await box.setChecked(await box.getAttribute('value')==='forum');
  await panel.getByRole('tab',{name:'Próximas 1',exact:true}).click();
  check((await ids()).join(',')==='forum:7','Foros filtra filas y contador de Próximas');
  await setting('course').selectOption('1');
  check(await panel.getByRole('tab',{name:'Próximas 0',exact:true}).count()===1,'Curso y tipo se intersectan');
  await setting('course').selectOption('all');
  await quickTypeBox.locator('[data-activity-type][value="quiz"]').check();
  await panel.getByRole('tab',{name:'Sin verificar 1',exact:true}).click();
  check((await ids()).join(',')==='quiz:6','Dos tipos seleccionados conservan Sin verificar');
  for(const box of await types.all())await box.uncheck();
  check(await setting('empty-message').textContent()==='Selecciona al menos un tipo de actividad para ver resultados','Sin tipos muestra una indicación específica');
  await panel.getByRole('button',{name:'Restaurar todos los tipos'}).click();
  check(await quickTypeBox.locator('[data-activity-type]:checked').count()===4,'Restauración de tipos');
  check(academicRequests===beforeFilters,'Cambiar filtros no hace consultas académicas');
  await panel.getByRole('tab',{name:/^Próximas/}).click();
  await open();
  check(await title.textContent()===defaultTitle && await panel.getAttribute('data-size')==='normal','Título y tamaño predeterminados');
  check(await prefs.isHidden() && await panel.getByRole('tab',{name:/Próximas/}).getAttribute('aria-selected')==='true','Pestañas predeterminadas');
  check(await panel.locator('[data-toggle-status]').count()===1&&await prefs.locator('[data-toggle-status]').count()===1&&
    await panel.getByRole('button',{name:'Ocultar estado',exact:true}).count()===0,'Visibilidad solo dentro de Personalizar');
  check(await status.isHidden() && await setting('position').inputValue()==='hidden','Estado oculto sin preferencia guardada');
  check(await rows.count()===242,'Sin límite predeterminado');
  const futureForum=panel.locator('[data-id="forum:7"]');
  const futureForumLabel=await futureForum.locator('.ugr-source').textContent();
  check(await futureForum.evaluate(row=>row.classList.contains('ugr-soon'))&&
    futureForumLabel==='Participación sin confirmar · Puedes declarar si participaste','Foro próximo, ámbar y manual: '+futureForumLabel);
  const original=await store(), before=await metric(), initialRequests=academicRequests;
  await open();
  check(await setting('personalize').getAttribute('aria-expanded')==='true','Control de personalización accesible');
  await setting('toggle-status').press('Enter');
  check(await status.isVisible()&&await setting('position').inputValue()==='top','Mostrar por primera vez sitúa el estado arriba');
  await setting('position').selectOption('bottom');
  check(await status.evaluate(el=>el.previousElementSibling.matches('[data-list-body]')),'Estado abajo');
  await setting('position').selectOption('hidden');
  check(await status.isHidden() && await setting('toggle-status').textContent()==='Mostrar estado','Estado oculto');
  check(await setting('minimal-warning').isHidden() && await setting('show-diagnostic').isVisible(),'Fallo anterior sin evidencia de reintento mantiene un acceso neutral al diagnóstico');
  await setting('show-diagnostic').click();
  check(await status.isHidden() && await setting('position').inputValue()==='hidden' &&
    await panel.locator('.ugr-diagnostic[open]').isVisible(),'Acceso directo al diagnóstico conserva Oculto');
  await setting('toggle-status').press('Enter');
  check(await status.isVisible()&&await setting('position').inputValue()==='bottom','Mostrar desde Diagnóstico restaura Abajo');
  await setting('toggle-status').press('Enter');
  check(await status.isHidden() && await setting('position').inputValue()==='hidden' &&
    await setting('toggle-status').getAttribute('aria-expanded')==='false','El botón y el selector comparten la preferencia');
  await setting('toggle-status').press('Enter');
  check(await status.isVisible()&&await setting('position').inputValue()==='bottom','Mostrar restaura Abajo');
  await setting('mode').selectOption('custom');
  check(await panel.locator('.ugr-tabs').isHidden() && await rows.count()===242,'Solo Próximas');
  await select('atrasadas');
  check((await ids()).join()==='assign:4','Solo Atrasadas');
  await select('proximas','atrasadas');
  check(await rows.count()===243 && (await ids())[0]==='assign:4','Próximas con Atrasadas ordenadas antes de limitar');
  check(await setting('active-filters').textContent()==='Próximas · Atrasadas','Categorías activas visibles fuera de la configuración');
  await select('entregadas');
  check((await ids()).join()==='assign:1,forum:8','Solo Entregadas, incluido un foro manual');
  await select('pendientes');
  check(await rows.count()===243 && (await ids()).includes('forum:7') && !(await ids()).includes('quiz:6'),'Solo Pendientes');
  await select('desconocidas');
  check((await ids()).join()==='quiz:6','Solo Sin verificar');
  await select('entregadas','atrasadas');
  check((await ids()).join()==='assign:1,assign:4,forum:8','Combinación histórica en orden descendente');
  await select('pendientes','desconocidas');
  check(await rows.count()===244,'Pendientes más Sin verificar');
  await select('pendientes','proximas','atrasadas');
  const pending=await ids();
  check(new Set(pending).size===243 && pending.length===243,'Unión sin duplicados');
  await setting('course').selectOption('1');
  check(await rows.count()===120 && (await rows.locator('.ugr-course').allTextContents()).every(c=>c==='Curso 1'),'Intersección con un curso');
  await setting('course').selectOption('all');
  check(await rows.count()===243,'Todos los cursos');
  await select();
  check(await rows.count()===0 && (await setting('empty-message').textContent()).includes('al menos una categoría'),'Selección vacía explícita');
  await panel.locator('.ugr-empty [data-reset-categories]').click();
  check(await rows.count()===242,'Restablecer desde el estado vacío');
  await expand(quickCategories);
  await quickCategoryBox.locator('[data-select-all]').click();
  const all=await ids();
  check(all.length===246 && new Set(all).size===246,'Seleccionar todas conserva actividades únicas');
  const literal='<img src=x onerror=alert(1)>';
  await setting('title').fill(literal);
  check(await title.textContent()===literal && await title.locator('img').count()===0,'Título literal e inmediato');
  await setting('title').fill('');
  check(await title.textContent()===defaultTitle,'Título vacío usa el valor predeterminado');
  await setting('title').fill('X'.repeat(130));
  check((await title.textContent()).length===80,'Límite de 80 caracteres');
  await setting('reset-title').click();
  check(await title.textContent()===defaultTitle,'Restablecer título');
  const heights=[];
  for(const size of ['compact','normal','wide']){
    await setting('size').selectOption(size);
    heights.push(await list.evaluate(el=>el.clientHeight));
  }
  check(heights.join() === '250,460,680','Alturas Compacto, Normal y Amplio');
  for(const limit of [5,10,30]){
    await setting('limit').selectOption(String(limit));
    check((await ids()).join()===all.slice(0,limit).join() &&
      await setting('list-info').textContent()==='Mostrando '+limit+' de 246 actividades','Límite y orden '+limit);
  }
  await setting('limit').selectOption('');
  check(await rows.count()===246 && await list.evaluate(el=>el.scrollHeight>el.clientHeight),'Sin límite conserva el scroll');
  await list.evaluate(el=>{el.scrollTop=3000;});
  await setting('toggle-status').click();
  check(await list.evaluate(el=>el.scrollTop)===3000,'Scroll conservado durante render');
  await setting('limit').selectOption('5');
  check(await list.evaluate(el=>el.scrollTop===0),'Scroll ajustado a una lista más corta');
  await setting('course').selectOption('2');
  await select('atrasadas','proximas');
  await setting('limit').selectOption('10');
  await setting('title').fill('Panel de pruebas');
  await page.evaluate(()=>{
    const panel=document.querySelector('#ugr-panel');
    const form=document.createElement('form');
    panel.before(form);
    form.append(panel);
    form.addEventListener('submit',event=>{event.preventDefault();form.dataset.submitted='true';});
  });
  await setting('title').press('Enter');
  await nextSaved();
  check(await page.locator('form[data-submitted]').count()===0,'Editar el título dentro de Moodle no envía el formulario');
  check(academicRequests===initialRequests && await metric()===before,'Cero solicitudes académicas durante personalización');
  const personalized=await store();
  check(Object.entries(original).every(([k,v])=>k==='ugr2:'+origin+':42:presentation'||JSON.stringify(personalized[k])===JSON.stringify(v)),
    'Preferencias preservan los registros 2.0.5, su marcador de reverificación y la otra cuenta');
  await prefs.locator('[data-title]').press('Escape');
  check(await prefs.isHidden() && await setting('personalize').evaluate(el=>el===document.activeElement),'Escape devuelve el foco');
  await page.reload();await settle();await open();
  check(await title.textContent()==='Panel de pruebas' && await setting('course').inputValue()==='2' &&
    await setting('limit').inputValue()==='10' && await setting('mode').inputValue()==='custom' &&
    await setting('size').inputValue()==='wide' && await status.isHidden() && await rows.count()===10,
  'Preferencias y estado oculto restaurados tras recargar');
  await expand(quickTypes);
  await quickTypeBox.locator('[data-activity-type][value="forum"]').uncheck();
  await page.waitForFunction(()=>!JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':42:presentation'].activityTypes.includes('forum'));
  await page.reload();await settle();await open();
  await expand(quickTypes);
  check(!await quickTypeBox.locator('[data-activity-type][value="forum"]').isChecked(),'Tipos persistidos después de recargar');
  await quickTypeBox.locator('[data-select-types]').click();
  await quickTypes.click();
  for(const width of [320,360]){
    await page.setViewportSize({width,height:800});
    await quickDate.click();
    check(await dateBox.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth),'Fecha sin desbordamiento a '+width+' px');
    await quickDate.click();
    await quickTypes.click();
    check(await quickTypeBox.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth),'Acceso rápido sin desbordamiento a '+width+' px');
    await quickTypes.click();
    check(await prefs.evaluate(el=>el.scrollWidth<=el.clientWidth&&[...el.querySelectorAll('fieldset')].every(g=>g.scrollWidth<=g.clientWidth)), 'Personalizar sin desbordamiento a '+width+' px');
  }
  await page.setViewportSize({width:800,height:850});
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  await quickDate.click();
  check(await dateBox.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth),'Fecha al 200 %');
  await quickDate.click();
  await quickCategories.click();
  check(await quickCategoryBox.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth),'Acceso rápido al 200 %');
  await quickCategories.click();
  check(await prefs.evaluate(el=>el.scrollWidth<=el.clientWidth&&[...el.querySelectorAll('fieldset')].every(g=>g.scrollWidth<=g.clientWidth)),
    'Recuadros de Personalizar con zoom simulado al 200 %');
  await page.evaluate(()=>{document.documentElement.style.zoom='';});
  await setting('toggle-status').press('Enter');
  check(await status.isVisible()&&await setting('position').inputValue()==='bottom','Mostrar recuerda Abajo después de recargar');
  await setting('toggle-status').press('Enter');
  await page.screenshot({path:'output/playwright/presentation-2.0.6-desktop.png'});
  await page.setViewportSize({width:360,height:780});
  check(await panel.evaluate(el=>el.scrollWidth===el.clientWidth && document.documentElement.scrollWidth===innerWidth) &&
    await list.evaluate(el=>el.scrollWidth===el.clientWidth),'Pantalla pequeña sin desplazamiento horizontal');
  await page.screenshot({path:'output/playwright/presentation-2.0.6-mobile.png'});
  await page.setViewportSize({width:1280,height:1000});
  await setting('refresh').click();await settle();
  check((await diag()).lastRun.mode==='refresh' && await rows.count()===10,'Actualizar con filtros activos');
  await page.evaluate(()=>{window.confirm=()=>true;});
  await setting('reverify-all').click();await settle();
  const exhaustive=(await diag()).lastRun;
  check(exhaustive.mode==='all' && exhaustive.checked>0 && forumRequests===0 &&
    await setting('course').inputValue()==='2','Reverificar todo con filtros activos y sin solicitudes a foros');
  await list.locator('[data-reverify="assign:4"]').click();await settle();
  check((await diag()).lastRun.mode==='one' && (await diag()).lastRun.checked===1,'Reverificación individual desde filtros personalizados');
  await page.evaluate(()=>fetch('/mode?value=login'));
  await select('pendientes');
  // La respuesta de identidad del fixture se sustituye solo para la próxima sincronización.
  await page.route(origin+'/my/',route=>route.fulfill({body:'<body id="page-login-index"><form id="login"></form></body>'}));
  await setting('refresh').click();
  await page.waitForFunction(()=>document.querySelector('[data-minimal-warning]').textContent.includes('Sesión caducada'),null,{timeout:5000})
    .catch(async()=>{throw Error('Aviso de sesión: '+await setting('minimal-warning').textContent());});
  check(await setting('minimal-warning').isVisible() && await setting('show-diagnostic').isVisible(),'Aviso de sesión con el estado oculto');
  await page.unroute(origin+'/my/');
  await page.evaluate(()=>fetch('/mode?value=other'));
  await page.route(origin+'/lib/ajax/service.php?*',route=>route.fulfill({json:[{data:{weeks:[]}}]}));
  await page.reload();await settle();await open();
  check(await title.textContent()==='Otra cuenta' && await setting('course').inputValue()==='all','Preferencias aisladas por cuenta');
  check(await status.isVisible() && await setting('position').inputValue()==='top','La otra cuenta conserva Arriba');
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.fixture);
    data['ugr2:'+location.origin+':99:presentation']={schema:1,title:{},mode:'bad',size:'huge',limit:1,course:'bad',position:'side',categories:9};
    localStorage.fixture=JSON.stringify(data);
  });
  await page.reload();await settle();await open();
  check(await title.textContent()===defaultTitle && await setting('limit').inputValue()==='' &&
    await setting('mode').inputValue()==='tabs' && await status.isHidden(),'Preferencias inválidas usan valores seguros');
  await setting('title').fill('Nuevo título');
  await setting('size').selectOption('compact');
  await select('pendientes');
  await setting('mode').selectOption('custom');
  await select('atrasadas');
  await expand(quickTypes);
  await quickTypeBox.locator('[data-deselect-types]').click();
  await expand(quickDate);
  await dateBox.getByRole('button',{name:'Dentro de 1 semana'}).click();
  const priorRestore=await store();
  await setting('reset-presentation').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':99:presentation']?.size==='normal',null,{timeout:5000})
    .catch(()=>{throw Error('La configuración predeterminada no se guardó');});
  const restored=await store();
  const defaults=restored['ugr2:'+origin+':99:presentation'];
  check(defaults.mode==='tabs'&&defaults.visibleTabs.length===5&&defaults.categories.includes('proximas')&&
    !defaults.categories.includes('atrasadas')&&defaults.activityTypes.length===4&&defaults.dateRange===null,
    'Restaurar configuración restablece también las categorías, tipos y fecha');
  check(await title.textContent()===defaultTitle && Object.entries(priorRestore).filter(([k])=>!k.endsWith(':presentation'))
    .every(([k,v])=>JSON.stringify(restored[k])===JSON.stringify(v)),'Restaurar configuración sin tocar datos académicos');
  return {passed,preferenceRequests:0,fixtureActivities:all.length,heights};
}
