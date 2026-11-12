'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const origin='https://campus.example.test';
const prefix='ugr2:'+origin+':42:';
const now=Date.UTC(2026,10,11);
const old=now-220*86400e3;
const item=(id,mod='forum')=>({id:String(id),mod,cmid:String(id),name:'Ejemplo '+id,courseId:2,course:'Curso',due:Math.floor(old/1000),url:origin+'/mod/'+mod+'/view.php?id='+id,synced:old});
const failure={code:'SELECTOR_MISSING',t:old,retryAt:old+1800000,attempts:5,details:{forumContainers:1,forumAuthors:0}};

test('lectura aditiva determinista de claves 2.0.2, incluso datos antiguos y huérfanos',()=>{
  const raw={
    [prefix+'cache']:{schema:2,updated:old,months:{'2026-3':{t:old,items:[item(1),item(2),item(3)]}},auto:{'forum:1':{done:true,source:'heuristic',t:old},'forum:2':{done:true,t:old},'assign:9':{done:true,t:old,source:'moodle'}}},
    [prefix+'manual:forum:1']:{done:false,t:old},
    [prefix+'manual:forum:3']:{done:true},
    [prefix+'failures']:{'forum:1':failure},
    [prefix+'preferences']:{example:42},
    ['ugr2:'+origin+':99:manual:forum:2']:{done:false,t:old}
  };
  const original=structuredClone(raw);
  const saved=C.readState(raw,prefix,origin,now);
  assert.deepEqual(C.readState(raw,prefix,origin,now),saved);
  assert.deepEqual(raw,original);
  assert.deepEqual(saved.cache.months['2026-3'].items.map(i=>[i.id,i.due]),['1','2','3'].map(id=>[id,Math.floor(old/1000)]));
  assert.deepEqual(saved.failures['forum:1'],failure);
  assert.equal(saved.cache.auto['assign:9'].done,true);
  assert.deepEqual(C.completion(item(1),saved.manual['forum:1'],saved.cache.auto['forum:1']),{done:false,source:'manual'});
  assert.deepEqual(C.completion(item(2),saved.manual['forum:2'],saved.cache.auto['forum:2']),{done:true,source:'historical_unknown'});
  assert.deepEqual(C.completion(item(3),saved.manual['forum:3']),{done:true,source:'manual'});
  assert.deepEqual(C.completion(item(4)),{done:false,source:'manual_pending'});
});

test('un cambio de calendario y una verificación nueva mantienen la evidencia anterior',()=>{
  const oldEvent=item(1,'assign'), newEvent={...oldEvent,due:oldEvent.due+3600,synced:now};
  const before={schema:2,months:{'2026-11':{t:old,items:[oldEvent,item(2)]}},auto:{'assign:1':{done:true,t:old,source:'moodle'}}};
  const changes=[
    {type:'month',key:'2026-11',value:{t:now,items:[newEvent],activeIds:['1']}},
    {type:'auto',key:'assign:1',value:{done:false,t:now,source:'moodle'}},
    {type:'failure',key:'assign:1',value:failure},
    {type:'failure',key:'assign:1',value:null},
    {type:'manual',key:'forum:2',value:{done:true,t:now}},
    {type:'manual',key:'forum:2',value:{done:false,t:now}}
  ];
  const data={[prefix+'cache']:before,[prefix+'history']:{schema:1,changes}};
  const original=structuredClone(data);
  const saved=C.readState(data,prefix,origin,now);
  assert.deepEqual(saved.cache.months['2026-11'].items.map(i=>i.id),['1','2']);
  assert.deepEqual(saved.cache.months['2026-11'].activeIds,['1']);
  assert.equal(saved.cache.months['2026-11'].items[0].due,newEvent.due);
  assert.equal(saved.cache.auto['assign:1'].done,false);
  assert.equal(saved.failures['assign:1'],undefined);
  assert.equal(saved.manual['forum:2'],false);
  assert.deepEqual(data,original);
});

test('formato futuro de historial bloquea la escritura sin alterar la entrada',()=>{
  const data={[prefix+'history']:{schema:9,changes:[{unknown:'mantener'}]}};
  const copy=structuredClone(data);
  assert.throws(()=>C.readState(data,prefix,origin,now),/formato no compatible/);
  assert.deepEqual(data,copy);
});
