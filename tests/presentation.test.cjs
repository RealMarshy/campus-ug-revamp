'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {presentation,presentationList,titleLimit,categories,dateRange,dateBounds,filterPresentationRows}=require('../core');
const allTypes=['assign','quiz','forum','feedback'];

test('Preferencias por defecto con ausencia, esquema futuro o tipos inválidos',()=>{
  const defaults={schema:1,position:'hidden',mode:'tabs',categories:['proximas'],
    visibleTabs:categories,activityTypes:allTypes,dateRange:null,
    title:'Mis actividades · Campus UG Revamp',size:'normal',limit:null,course:'all',autoRefreshMinutes:10,appearance:'auto'};
  assert.deepEqual(presentation(),defaults);
  assert.deepEqual(presentation({schema:2,title:'Futuro'}),defaults);
  assert.deepEqual(presentation({schema:1,position:true,mode:'otro',categories:'todas',
    title:'   ',size:'vertical',limit:'10',course:{}}),defaults);
});

test('Conserva las tres posiciones guardadas y la ubicación que se debe restaurar',()=>{
  for(const position of ['top','bottom','hidden']){
    const saved={schema:1,position};
    assert.equal(presentation(saved).position,position);
    assert.deepEqual(saved,{schema:1,position});
  }
  assert.equal(presentation({schema:1,position:'hidden',restoreStatusBelow:true}).restoreStatusBelow,true);
});

test('Acepta una selección vacía y valida valores persistidos sin modificar el objeto original',()=>{
  const raw={schema:1,position:'bottom',mode:'custom',categories:['pendientes','invalida','pendientes','proximas'],
    title:'x'.repeat(120),size:'wide',limit:30,course:'7',irrelevant:'legacy'};
  assert.deepEqual(presentation(raw),{schema:1,position:'bottom',mode:'custom',categories:['proximas','pendientes'],
    visibleTabs:categories,activityTypes:allTypes,dateRange:null,
    title:'x'.repeat(titleLimit),size:'wide',limit:30,course:'7',autoRefreshMinutes:10,appearance:'auto'});
  assert.equal(raw.categories.length,4);
  assert.deepEqual(presentation({...raw,categories:[]}).categories,[]);
});

test('Fecha usa días locales inclusivos y meses naturales con ajuste de fin de mes',()=>{
  const now=new Date(2028,0,31,19);
  const seconds=(month,day)=>new Date(2028,month,day).getTime()/1000;
  assert.deepEqual(dateBounds({preset:'next-week'},now),{start:seconds(0,31),end:seconds(1,8)});
  assert.deepEqual(dateBounds({preset:'next-month'},now),{start:seconds(0,31),end:seconds(2,1)});
  assert.deepEqual(dateBounds({preset:'last-week'},now),{start:seconds(0,24),end:seconds(1,1)});
  assert.deepEqual(dateBounds({preset:'last-month'},now),{start:seconds(-1,31),end:seconds(1,1)});
  assert.equal(dateBounds({preset:'next-week'},new Date(2028,1,1)).start,seconds(1,1));
  assert.deepEqual(dateBounds({preset:'next-month'},new Date(2028,11,31)),{start:seconds(11,31),end:seconds(13,1)});
});

test('Rangos manuales abiertos, fechas inválidas y actividades sin vencimiento',()=>{
  assert.equal(dateRange({from:'2026-11-18',to:'2026-11-17'}),null);
  assert.equal(dateRange({from:'2026-02-29'}),null);
  assert.equal(dateBounds(dateRange({from:'2026-11-13'})).end,Infinity);
  assert.equal(dateBounds(dateRange({to:'2026-11-13'})).start,-Infinity);
  const bounds=dateBounds(dateRange({from:'2026-11-13',to:'2026-11-13'}));
  const rows=[bounds.start-1,bounds.start,bounds.end-1,bounds.end,null].map(due=>({it:{mod:'assign',due}}));
  assert.deepEqual(filterPresentationRows(rows,['assign'],bounds),rows.slice(1,3));
  assert.deepEqual(filterPresentationRows(rows,['assign'],null),rows);
  assert.deepEqual(presentation({schema:1,dateRange:{preset:'last-month'}}).dateRange,{preset:'last-month'});
});

test('Las pestañas y los tipos conservan selecciones independientes, incluso vacías',()=>{
  const saved=presentation({schema:1,mode:'tabs',categories:['pendientes'],visibleTabs:[],
    activityTypes:['feedback','assign','forum','feedback','invalid']});
  assert.deepEqual(saved.visibleTabs,[]);
  assert.deepEqual(saved.categories,['pendientes']);
  assert.deepEqual(saved.activityTypes,['assign','forum','feedback']);
  assert.deepEqual(presentation({...saved,activityTypes:[]}).activityTypes,[]);
});

test('La frecuencia automática valida intervalos y conserva la opción desactivada',()=>{
  for(const autoRefreshMinutes of [0,10,15,30]){
    assert.equal(presentation({schema:1,autoRefreshMinutes}).autoRefreshMinutes,autoRefreshMinutes);
  }
  for(const autoRefreshMinutes of [5,'15',null,-10]){
    assert.equal(presentation({schema:1,autoRefreshMinutes}).autoRefreshMinutes,10);
  }
});

test('Apariencia conserva las preferencias anteriores y valida el modo',()=>{
  for(const appearance of ['auto','light','dark']){
    const saved=presentation({schema:1,appearance,course:'7',autoRefreshMinutes:30,title:'Mi panel'});
    assert.equal(saved.appearance,appearance);
    assert.equal(saved.course,'7');
    assert.equal(saved.autoRefreshMinutes,30);
    assert.equal(saved.title,'Mi panel');
  }
  assert.equal(presentation({schema:1,appearance:'night'}).appearance,'auto');
});

test('Unión por módulo y CMID, con foros en Pendientes y en su categoría de vencimiento',()=>{
  const row=(mod,cmid,b,due)=>({it:{mod,cmid,due},b});
  const rows=[row('assign','1','proximas',9),row('assign','1','proximas',9),
    row('quiz','1','atrasadas',2),row('forum','1','proximas',4),row('assign','2','entregadas',8),
    row('quiz','2','desconocidas',5)];
  const due=ids=>presentationList(rows,ids).map(it=>it.due);
  assert.deepEqual(due(['pendientes','proximas']),[2,4,9]);
  assert.deepEqual(due(['proximas']),[4,9]);
  assert.deepEqual(due(['pendientes','desconocidas']),[2,4,5,9]);
  assert.deepEqual(due(['atrasadas','entregadas']),[8,2]);
  assert.deepEqual(due([]),[]);
});

test('La confirmación pendiente se superpone sin duplicados y respeta filtros',()=>{
  const quiz={it:{mod:'quiz',cmid:'1',due:10},b:'desconocidas',awaitingConfirmation:true};
  const feedback={it:{mod:'feedback',cmid:'1',due:20},b:'desconocidas',awaitingConfirmation:true};
  const readError={it:{mod:'quiz',cmid:'2',due:15},b:'desconocidas'};
  const rows=[quiz,feedback,readError];
  assert.deepEqual(presentationList(rows,['pendientes']),[quiz.it,feedback.it]);
  assert.deepEqual(presentationList(rows,['desconocidas','pendientes']),[quiz.it,readError.it,feedback.it]);
  assert.deepEqual(presentationList(rows,['atrasadas']),[]);
  const filtered=filterPresentationRows(rows,['quiz'],{start:10,end:20});
  assert.deepEqual(presentationList(filtered,['pendientes','desconocidas']),[quiz.it,readError.it]);
});
