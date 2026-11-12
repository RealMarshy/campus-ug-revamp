'use strict';
const http=require('node:http');
const {once}=require('node:events');
const {performance}=require('node:perf_hooks');
const C=require('../core.js');

const now=Date.UTC(2026,10,11), day=86400000, expired=now-2*day;
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'||!/^\/(?:my\/|mod\/(?:quiz|assign)\/view\.php\?id=\d+)$/.test(req.url)){
    res.writeHead(405);res.end();return;
  }
  const id=Number(req.url.split('=')[1]);
  setTimeout(()=>{res.writeHead(id%10===9?503:200);res.end('fixture');},2);
});

function scenario(count,origin){
  return Array.from({length:count},(_,i)=>{
    const cohort=i%10, quiz=[0,1,2,6].includes(cohort), archived=[0,1,2].includes(cohort);
    const closeAt=archived?expired-day:null;
    const status=cohort===8?undefined:{done:cohort<5,source:'moodle',t:cohort===5?now-1000:expired};
    const item={id:String(i),cmid:String(i),mod:quiz?'quiz':'assign',synced:cohort===6?now:expired-day,due:(expired-day)/1000};
    return {item,status,closeAt,stamp:archived?{t:status.t,stateAt:status.t,closedAt:closeAt}:undefined,
      failure:cohort===7?{retryAt:now+1000}:undefined,now,url:origin+'/mod/'+item.mod+'/view.php?id='+i};
  });
}

async function measure(rows,origin,current){
  const started=performance.now();
  const visible=rows.map(({item,status})=>C.completion(item,undefined,status));
  const firstDataMs=+(performance.now()-started).toFixed(3);
  const byKey=new Map([...rows,...rows.slice(0,Math.ceil(rows.length/10))].map(r=>[r.item.mod+':'+r.item.cmid,r]));
  let archived=0,errors=0,checks=0;
  const work=[...byKey.values()].filter(row=>{
    const decision=current?C.verificationDecision(row):C.needsCheck(row.status,false,now,row.failure)?'check':'skip';
    if(decision==='archive')archived++;
    return decision==='check';
  });
  await (await fetch(origin+'/my/')).text();
  let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<work.length){
      const result=await fetch(work[next++].url);
      await result.text();checks++;
      if(!result.ok)errors++;
    }
  }));
  return {activities:visible.length,requests:1+checks,checks,archived,omitted:rows.length-checks,
    duplicatesAvoided:Math.ceil(rows.length/10),errors,firstDataMs,totalMs:+(performance.now()-started).toFixed(1)};
}

(async()=>{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const origin='http://127.0.0.1:'+server.address().port;
    const results=[];
    for(const size of [20,60,100,500,1000]){
      const rows=scenario(size,origin);
      results.push({size,baseline:await measure(rows,origin,false),current:await measure(rows,origin,true)});
    }
    console.log(JSON.stringify({environment:'Loopback, 2 ms programados por respuesta, calendario vigente, concurrencia 3. Comparación de políticas, sin pintura del navegador.',results},null,2));
  }finally{server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
