const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const now=Date.UTC(2026,10,11,15), minute=60000;

function fixture(rows,lastBatchAt=0){
  const data={auto:{},manual:{},failures:{},stamps:{},now,lastBatchAt};
  const candidates=rows.map(({id,mod='assign',age=6*minute,due=now/1000,synced=0,closeAt=null,
    done=false,grade,manual,failure,status={},stamp={}})=>{
    const key=mod+':'+id,t=now-age;
    data.auto[key]={source:'moodle',t,done,...status};
    data.stamps[key]={t,stateAt:t,grade,...stamp};
    data.manual[key]=manual;
    data.failures[key]=failure;
    return {it:{mod,cmid:String(id),due,synced},closeAt};
  });
  const {selected,eligible}=C.planRefresh(candidates,data);
  return {ids:[...selected],eligible:eligible.size};
}

test('Actualizar reparte tres lecturas y las asigna en orden reproducible',()=>{
  const rows=[{id:9,done:true},{id:3,done:true,grade:'7 / 10'},{id:2},{id:1,age:8*minute},{id:4,done:true,age:9*minute}];
  assert.deepEqual(fixture(rows),{ids:['assign:1','assign:4','assign:3'],eligible:5});
  assert.deepEqual(fixture(rows),fixture([...rows].reverse()));
  assert.deepEqual(fixture([{id:4},{id:3},{id:2},{id:1}]),{ids:['assign:1','assign:2','assign:3'],eligible:4});
});

test('Actualización anticipada respeta el minuto por cuenta y los cinco minutos con nota',()=>{
  const rows=[{id:1,age:minute-1},{id:2,age:minute},{id:3,done:true,age:5*minute-1,grade:'0'},
    {id:4,done:true,age:5*minute,grade:'0'}];
  assert.deepEqual(fixture(rows,now-minute+1),{ids:[],eligible:2});
  assert.deepEqual(fixture(rows,now-minute),{ids:['assign:2','assign:4'],eligible:2});
});

test('Los cambios obligatorios, declaraciones, restricciones e incidencias no consumen el cupo',()=>{
  const rows=[{id:1,manual:'no'},{id:2,manual:false},{id:3,failure:{retryAt:now+minute}},
    {id:4,failure:{retryAt:now}},{id:5,synced:now},{id:6,age:C.CONFIG.pending},
    {id:7,status:{evaluationGrade:'9'}},{id:8,status:{assignAvailability:'group_blocked'}},
    {id:9,status:{assignAvailability:'no_submission_option'}},{id:10,mod:'forum'},
    {id:11,mod:'quiz',status:{absence:'quiz_scheduled',quizOpenAt:now+minute}},
    {id:12,mod:'quiz',status:{absence:'quiz_closed_unknown'}},{id:13,mod:'feedback',status:{feedbackState:'restricted'}},
    {id:14,due:null},{id:15,due:(now+C.CONFIG.refreshDueWindow+1)/1000},{id:16,status:{source:'unknown'}},
    {id:17,done:true,mod:'feedback'},{id:18,done:true,age:C.CONFIG.completed}];
  assert.deepEqual(fixture(rows),{ids:[],eligible:0});
});

test('Cuestionario cerrado reciente con entrega confirmada puede recibir nota; se conserva el archivo ordinario',()=>{
  const closeAt=now-2*86400e3;
  assert.deepEqual(fixture([{id:1,done:true,mod:'quiz',closeAt,stamp:{closedAt:closeAt}},
    {id:2,mod:'quiz',closeAt,stamp:{closedAt:closeAt}},{id:3,mod:'feedback',status:{feedbackState:'available'}}]),
    {ids:['feedback:3','quiz:1'],eligible:2});
});

test('Un sello antiguo no aporta una nota a la nueva evidencia',()=>{
  assert.deepEqual(fixture([{id:1,age:minute,done:true,grade:'9',stamp:{stateAt:now-86400e3}}]),
    {ids:['assign:1'],eligible:1});
});
