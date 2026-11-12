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
