'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {presentation,presentationList,titleLimit}=require('../core');

test('Preferencias por defecto con ausencia, esquema futuro o tipos inválidos',()=>{
  const defaults={schema:1,position:'hidden',mode:'tabs',categories:['proximas'],
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
    title:'x'.repeat(titleLimit),size:'wide',limit:30,course:'7',autoRefreshMinutes:10,appearance:'auto'});
  assert.equal(raw.categories.length,4);
  assert.deepEqual(presentation({...raw,categories:[]}).categories,[]);
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
