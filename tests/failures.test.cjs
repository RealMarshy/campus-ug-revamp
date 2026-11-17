const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
test('error persists separately and does not turn confirmed delivery into pending',()=>{
 const s={done:true,t:10,source:'moodle'},f=C.failureRecord(C.problem('HTTP',{http:503}),null,100);
 assert.equal(C.needsCheck(s,false,101,f),false);assert.equal(C.needsCheck(s,true,101,f),true);
 assert.equal(C.needsCheck(s,false,f.retryAt,f),true);assert.equal(s.done,true);
 assert.equal(f.code,'HTTP');assert.equal(f.details.http,503);
});
test('repeated failures back off and successful status resumes ordinary TTL',()=>{
 let f=C.failureRecord(C.problem('TIMEOUT'),null,100);const first=f.retryAt-f.t;
 f=C.failureRecord(C.problem('TIMEOUT'),f,200);assert.equal(f.retryAt-f.t,first*2);
 for(let n=0;n<20;n++)f=C.failureRecord(C.problem('TIMEOUT'),f,300+n);
 assert.ok(f.retryAt-f.t<=6*3600e3);
 assert.equal(C.needsCheck({done:true,t:400,source:'moodle'},false,401),false);
});
test('structural errors wait longer than network errors',()=>{assert.ok(C.failureRecord(C.problem('SELECTOR_MISSING'),null,0).retryAt>C.failureRecord(C.problem('HTTP'),null,0).retryAt);});
test('diagnostic allowlist strips private data including arbitrary exception messages',()=>{
 const error=new TypeError('secret sesskey=123 https://private/?token=abc');
 const f=C.failureRecord(error,null,100);assert.equal(f.code,'INTERNAL');assert.equal(f.details.jsType,'TypeError');assert.ok(!JSON.stringify(f).includes('secret'));
 assert.deepEqual(C.safeDetails({html:'PRIVATE',cookie:'PRIVATE',url:'PRIVATE',http:403,identity:'match'}),{http:403,identity:'match'});
 assert.deepEqual(C.safeDetails(null),{});
});
test('failure cache validates scope, times and data without changing automatic cache schema',()=>{
 const f=C.failureRecord(C.problem('STATE_UNKNOWN'),null,100);
 const cleaned=C.cleanFailures({'assign:1':f,'session':f,'untrusted':f,'quiz:4':{...f,t:1000},'forum:4':{...f,details:{sesskey:'secret'}}},200);
 assert.equal(Object.keys(cleaned).length,3);assert.ok(!JSON.stringify(cleaned).includes('secret'));
 assert.equal(C.empty().schema,2);
});
test('Los fallos de actividad y las redirecciones de sesión conservan la evidencia explícita de recuperación fallida',()=>{
 const failed={...C.failureRecord(C.problem('HTTP',{http:504}),null,100),recoveryFailed:true};
 const legacy={...C.failureRecord(C.problem('TIMEOUT'),null,100),attempts:4};
 const base=C.readState({'p:failures':{'assign:1':legacy,'calendar:2026-11':failed},
   'p:history':{schema:1,changes:[{type:'failure',key:'quiz:2',value:failed}]}},'p:','https://example.test',200).failures;
 assert.equal(base['quiz:2'].recoveryFailed,true);
 assert.equal(base['quiz:2'].attempts,1);
 assert.equal(base['assign:1'].recoveryFailed,undefined);
 assert.equal(base['calendar:2026-11'].recoveryFailed,undefined);
 assert.equal(C.cleanFailures({'quiz:2':{...failed,recoveryFailed:'true'}},200)['quiz:2'].recoveryFailed,undefined);
 const redirect=C.failureRecord(C.problem('REDIRECT'),null,100);
 assert.equal(C.cleanFailures({session:{...redirect,attempts:5}},200).session.recoveryFailed,undefined);
 assert.equal(C.cleanFailures({session:{...redirect,recoveryFailed:true}},200).session.recoveryFailed,true);
 assert.equal(C.cleanFailures({session:failed},200).session.recoveryFailed,undefined);
});
test('la visibilidad se determina por la fase, la elegibilidad y el resultado explícito',()=>{
 const issue=(code,details,extra)=>({...C.failureRecord(C.problem(code,details),null,100),...extra});
 const view=(f,options={})=>C.failureVisibility(f,options.stage??'activity',options.phase,options.scheduled??true);
 assert.equal(view(null),'none');
 assert.equal(view(issue('CANCELLED')),'none');
 for(const f of [issue('TIMEOUT',{}, {attempts:6}),issue('NETWORK'),issue('HTTP',{http:503}),
   issue('HTTP',{http:429,retryAfterMs:10000}),issue('HTTP',{http:429,retryAfterBlocked:true})]){
  assert.equal(view(f,{phase:'queued'}),'queued');
  assert.equal(view(f,{phase:'recovering'}),'recovering');
  assert.equal(view(f),'deferred');
  assert.equal(view(f,{scheduled:false}),'action_required');
 }
 const exhausted=issue('TIMEOUT',{}, {attempts:1,recoveryFailed:true});
 assert.equal(view(exhausted),'exhausted');
 assert.equal(view(exhausted,{phase:'checking'}),'checking');
 for(const f of [issue('HTTP',{http:403}),issue('SESSION_EXPIRED'),issue('ACCOUNT_CHANGED'),issue('SELECTOR_MISSING')])
  assert.equal(view(f),'action_required');
 const redirect=issue('REDIRECT');
 assert.equal(view(redirect),'action_required');
 assert.equal(view(redirect,{stage:'session'}),'deferred');
 assert.equal(view(redirect,{stage:'session',scheduled:false}),'action_required');
 assert.equal(view({...redirect,recoveryFailed:true},{stage:'session'}),'exhausted');
});
