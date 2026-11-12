const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
const origin='https://fixture.example', now=Date.UTC(2026,10,11), ago=now-2*86400000;
const evt={id:4,url:origin+'/mod/quiz/view.php?id=2',modulename:'quiz',eventtype:'close',timestart:ago/1000,timesort:ago/1000};
const quiz={...C.item(evt,origin),synced:ago};
const status={done:true,source:'moodle',t:ago+1000};
const stamp={stateAt:status.t,t:status.t,closedAt:ago};
const decide=(extra={})=>C.verificationDecision({item:quiz,status,stamp,closeAt:ago,now,...extra});
test('solo un evento quiz close explícito y consistente aporta fecha de cierre',()=>{
 assert.equal(quiz.closeAt,ago);
 for(const v of [{eventtype:'due'},{modulename:'assign'},{timestart:1},{timestart:undefined}])assert.equal(C.item({...evt,...v},origin).closeAt,null);
});
test('el vencimiento y un cierre sin evidencia posterior mantienen TTL',()=>{
 assert.equal(decide({closeAt:null,stamp:null}),'check');
 assert.equal(decide({stamp:null}),'check');
 assert.equal(decide({stamp:{...stamp,t:ago-1}}),'check');
 assert.equal(decide({status:{done:false,source:'moodle',t:now-1000},stamp:null,closeAt:null}),'cache');
});
test('archivo reversible y sonda de seguridad',()=>{
 assert.equal(decide(),'archive');
 assert.equal(decide({closeAt:now+1000}),'check');
 assert.equal(decide({item:{...quiz,synced:now}}),'check');
 assert.equal(decide({now:now+C.CONFIG.archiveProbe}),'check');
 assert.equal(decide({mode:'all'}),'check');
 assert.equal(decide({mode:'one'}),'check');
});
test('la política respeta marcas, backoff y foros',()=>{
 assert.equal(decide({manual:false}),'manual');
 assert.equal(decide({failure:{retryAt:now+1000}}),'backoff');
 assert.equal(decide({failure:{retryAt:now}}),'check');
 assert.equal(decide({mode:'all',manual:true}),'check');
 assert.equal(decide({item:{mod:'forum'},mode:'all'}),'manual');
});
test('lista de rutas admite solo lectura y el POST de calendario',()=>{
 const allowed=(path,options={})=>C.allowsRequest(origin+path,options,origin);
 assert.ok(allowed('/mod/quiz/view.php?id=2'));
 assert.ok(allowed('/mod/assign/view.php?id=2'));
 assert.ok(allowed('/my/'));
 for(const route of ['/mod/quiz/startattempt.php?id=2','/mod/assign/view.php?id=2&action=editsubmission','/mod/forum/view.php?id=2','/mod/assign/view.php?id=2&id=3'])assert.equal(allowed(route),false);
 const methodname='core_calendar_get_calendar_monthly_view', path='/lib/ajax/service.php?info='+methodname+'&sesskey=fake';
 assert.ok(allowed(path,{method:'POST',body:JSON.stringify([{methodname,args:{}}])}));
 assert.equal(allowed(path,{method:'POST',body:JSON.stringify([{methodname},{methodname:'mod_quiz_start_attempt'}])}),false);
 assert.equal(allowed('/mod/assign/view.php?id=2',{method:'POST',body:'fake'}),false);
 assert.equal(C.allowsRequest('https://external.example/my/',{},origin),false);
});
