'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const wait=(code,http,header)=>C.recoveryWait(C.problem(code,{http,...C.retryAfter(header??null)}));

test('recuperación limitada a timeout, red y HTTP transitorio',()=>{
  for(const code of ['TIMEOUT','NETWORK'])assert.equal(wait(code),0);
  for(const code of ['CANCELLED','SESSION_EXPIRED','ACCOUNT_CHANGED','IDENTITY_MISSING','IDENTITY_CONFLICT','SELECTOR_MISSING','STATE_UNKNOWN','REDIRECT','DESTINATION','INTERNAL'])assert.equal(wait(code),null);
  for(const status of [502,503,504])assert.equal(wait('HTTP',status),0);
  for(const status of [400,401,403,404,500,501])assert.equal(wait('HTTP',status),null);
});
test('Retry-After corto se respeta y uno largo, inválido o ausente en 429 difiere',()=>{
  assert.equal(wait('HTTP',429),null);
  assert.equal(wait('HTTP',429,'1'),1000);
  assert.equal(wait('HTTP',429,'2'),2000);
  assert.equal(wait('HTTP',429,'3'),null);
  assert.equal(wait('HTTP',503,'90'),null);
  assert.equal(wait('HTTP',503,'1.5'),null);
  const now=Date.UTC(2026,10,11);
  assert.deepEqual(C.retryAfter(new Date(now+1000).toUTCString(),now),{retryAfterMs:1000});
  assert.deepEqual(C.retryAfter('99999999999999',now),{retryAfterBlocked:true});
});
test('el diagnóstico solo conserva campos permitidos y los límites de tiempo son independientes',()=>{
  assert.deepEqual(C.safeDetails({timeoutMs:25000,concurrency:1,phase:'headers',url:'privada',retryAfterMs:1000}),
    {concurrency:1,timeoutMs:25000,retryAfterMs:1000,phase:'headers'});
  assert.equal(C.CONFIG.timeout,15000);
  assert.equal(C.CONFIG.recoveryTimeout,25000);
  assert.equal(C.CONFIG.recoveryBudget,75000);
  assert.equal(C.CONFIG.recoveryLimit,6);
});
