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
  const select=async(...categories)=>{
    for(const box of await prefs.locator('[data-category]').all())await box.setChecked(categories.includes(await box.getAttribute('value')));
  };
  let passed=0, academicRequests=0, forumRequests=0;
  const check=(ok,label)=>{if(!ok)throw Error(label);passed++;};
  await page.route(origin+'/**',async route=>{
    const path=route.request().url().slice(origin.length);
    if(path.startsWith('/mod/forum/')){forumRequests++;return route.abort();}
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
      make(6,'quiz',1,100006),make(7,'forum',2,100007),make(8,'forum',1,-100001));
    months['2020-1']={t:now-1000,items:Array.from({length:240},(_,i)=>make(1000+i,'assign',i%2+1,36000+i))};
    localStorage.fixture=JSON.stringify({
      [prefix+'cache']:{schema:2,updated:now-1000,months,auto},
      [prefix+'history']:{schema:1,changes:[{type:'manual',key:'forum:8',value:{done:true,t:now-1000}}]},
      [prefix+'verification']:{schema:1,calendar:{},exhaustiveAt:now-1200,records:{
        'assign:1':{t:now-500,stateAt:now-1000,closedAt:null,observedAt:now-500},
      }},
      [prefix+'manual:forum:7']:{done:false,t:now-1000},
      [prefix+'failures']:{'quiz:6':{code:'SELECTOR_MISSING',t:now-1000,retryAt:now+3600000,attempts:1}},
      ['ugr2:'+location.origin+':99:presentation']:{schema:1,title:'Otra cuenta'},
    });
  });
  await page.setViewportSize({width:1280,height:1000});
  await page.goto(origin);await settle();
  check(await title.textContent()===defaultTitle && await panel.getAttribute('data-size')==='normal','Título y tamaño predeterminados');
  check(await prefs.isHidden() && await panel.getByRole('tab',{name:/Próximas/}).getAttribute('aria-selected')==='true','Pestañas predeterminadas');
  check(await status.isVisible() && await status.evaluate(el=>el.nextElementSibling.matches('.ugr-warning')),'Estado arriba');
  check(await rows.count()===241,'Sin límite predeterminado');
  const original=await store(), before=await metric(), initialRequests=academicRequests;
  await open();
  check(await setting('personalize').getAttribute('aria-expanded')==='true','Control de personalización accesible');
  await setting('position').selectOption('bottom');
  check(await status.evaluate(el=>el.previousElementSibling.matches('[data-list-body]')),'Estado abajo');
  await setting('position').selectOption('hidden');
  check(await status.isHidden() && await setting('toggle-status').textContent()==='Mostrar estado','Estado oculto');
  check(await setting('minimal-warning').isVisible() && (await setting('minimal-warning').textContent()).includes('fallos pendientes'),'Fallo persistente con estado oculto');
  await setting('show-diagnostic').click();
  check(await status.isVisible() && await panel.locator('.ugr-diagnostic').getAttribute('open')!==null,'Acceso directo al diagnóstico');
  await setting('toggle-status').click();
  check(await status.isHidden() && await setting('position').inputValue()==='hidden','Visibilidad temporal independiente');
  await setting('mode').selectOption('custom');
  check(await panel.locator('.ugr-tabs').isHidden() && await rows.count()===241,'Solo Próximas');
  await select('atrasadas');
  check((await ids()).join()==='assign:4','Solo Atrasadas');
  await select('proximas','atrasadas');
  check(await rows.count()===242 && (await ids())[0]==='assign:4','Próximas con Atrasadas ordenadas antes de limitar');
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
  check(await rows.count()===241,'Restablecer desde el estado vacío');
  await setting('select-all').click();
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
  check(Object.entries(original).every(([k,v])=>JSON.stringify(personalized[k])===JSON.stringify(v)),
    'Preferencias preservan los registros 2.0.5, su marcador de reverificación y la otra cuenta');
  await prefs.locator('[data-title]').press('Escape');
  check(await prefs.isHidden() && await setting('personalize').evaluate(el=>el===document.activeElement),'Escape devuelve el foco');
  await page.reload();await settle();await open();
  check(await title.textContent()==='Panel de pruebas' && await setting('course').inputValue()==='2' &&
    await setting('limit').inputValue()==='10' && await setting('mode').inputValue()==='custom' &&
    await setting('size').inputValue()==='wide' && await status.isHidden() && await rows.count()===10,
  'Preferencias restauradas y visibilidad temporal descartada');
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
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.fixture);
    data['ugr2:'+location.origin+':99:presentation']={schema:1,title:{},mode:'bad',size:'huge',limit:1,course:'bad',position:'side',categories:9};
    localStorage.fixture=JSON.stringify(data);
  });
  await page.reload();await settle();await open();
  check(await title.textContent()===defaultTitle && await setting('limit').inputValue()==='' &&
    await setting('mode').inputValue()==='tabs' && await status.isVisible(),'Preferencias inválidas usan valores seguros');
  await setting('title').fill('Nuevo título');
  await setting('size').selectOption('compact');
  const priorRestore=await store();
  await setting('reset-presentation').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.fixture)['ugr2:'+location.origin+':99:presentation']?.size==='normal',null,{timeout:5000})
    .catch(()=>{throw Error('La configuración predeterminada no se guardó');});
  const restored=await store();
  check(await title.textContent()===defaultTitle && Object.entries(priorRestore).filter(([k])=>!k.endsWith(':presentation'))
    .every(([k,v])=>JSON.stringify(restored[k])===JSON.stringify(v)),'Restaurar configuración sin tocar datos académicos');
  return {passed,preferenceRequests:0,fixtureActivities:all.length,heights};
}
