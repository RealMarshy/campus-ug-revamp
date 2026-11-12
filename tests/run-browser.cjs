'use strict';
const {spawn,spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync,unlinkSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {randomUUID}=require('node:crypto');
const {setTimeout:wait}=require('node:timers/promises');
const cli=process.env.UG_PLAYWRIGHT_CLI;
if(!cli)throw Error('Define UG_PLAYWRIGHT_CLI con la ruta a cli.js de Playwright CLI.');
const all=['recovery','optimization','quiz-first-attempt','browser','robustness','migration','diagnostic','presentation','discovery','discovery-2.0.6','discovery-alternative','credits','periodic','periodic-baseline','appearance','ambient','ambient-baseline','header','universal','universal-baseline'];
const suites=process.argv.slice(2).length?process.argv.slice(2):all;
const server=spawn(process.execPath,['tests/fixture-server.cjs'],{stdio:['ignore','pipe','inherit']});
const session='ug-sandbox-'+process.pid;
const run=(...args)=>{
 const result=spawnSync(process.execPath,[cli,'-s='+session,...args],{encoding:'utf8',timeout:100000,maxBuffer:2e6});
 if(result.error||result.status!==0||result.stdout.includes('### Error'))throw Error(result.error?.message||result.stdout.slice(0,600)||result.stderr);
 return result.stdout;
};
const guard=`async page=>{
 const origin='http://127.0.0.1:8765', violations=[];
 await page.context().route('**/*',async route=>{
  const req=route.request(), url=req.url(), path=url.slice(origin.length);
  const allowedGet=req.method()==='GET' && /^\\/(?:my\\/|core\\.js|content\\.js|styles\\.css|stats|mode\\?value=[a-z-]+|mod\\/(assign|quiz)\\/view\\.php\\?id=\\d+)?$/.test(path);
  const allowedPost=req.method()==='POST' && path.startsWith('/lib/ajax/service.php?') &&
    req.postDataJSON()?.length===1 && req.postDataJSON()[0]?.methodname==='core_calendar_get_calendar_monthly_view';
  const allowedImage=req.method()==='GET' && path==='/assets/hagalo-usted-mismo.png';
  if(url.startsWith(origin+'/') && (allowedGet||allowedPost||allowedImage))return route.continue();
  violations.push(req.method()+' fuera de la lista de lectura');
  return route.abort();
 });
 const result=await (`;
(async()=>{
 let passed=0,failed=0;
 try{
  await Promise.race([
    new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(Error('No inició el fixture local')));}),
    wait(5000).then(()=>{throw Error('El fixture no respondió');})
  ]);
  for(const suite of suites){
   if(!all.includes(suite)&&suite!=='recovery-baseline')throw Error('Suite desconocida: '+suite);
   try{
    run('open','about:blank','--browser=chrome');
    const baseline=suite==='recovery-baseline';
    const alternative=suite==='discovery-alternative';
    const discovery=suite==='discovery'||suite==='discovery-2.0.6'||alternative;
    const periodic=suite==='periodic'||suite==='periodic-baseline';
    const ambient=suite==='ambient'||suite==='ambient-baseline';
    const universal=suite==='universal'||suite==='universal-baseline';
    const reference=discovery&&suite!=='discovery'?readFileSync(join(__dirname,'references','2.0.6','content.js'),'utf8'):null;
    const code=readFileSync('tests/'+(baseline?'recovery':discovery?'discovery':periodic?'periodic':ambient?'ambient':universal?'universal':suite)+'-check.js','utf8');
    // Legacy suites expect a loaded fixture, whereas the new suites configure routes first.
    let preload="if(!(await page.request.get(origin+'/mode?value=normal')).ok())throw Error('No se pudo restablecer el fixture.');";
    if(!discovery&&!periodic&&!ambient&&!universal&&!['optimization','quiz-first-attempt','recovery','recovery-baseline','presentation','header'].includes(suite))preload+='await page.goto(origin);';
    if(baseline||suite==='periodic-baseline'||suite==='ambient-baseline'||suite==='universal-baseline'){
      const version=baseline?'2.0.4':ambient?'2.0.9':universal?'2.0.9.1':'2.0.7';
      for(const file of ambient?['content.js','styles.css']:['core.js','content.js']){
        const body=JSON.stringify(readFileSync(join(__dirname,'references',version,file),'utf8'));
        preload+=`await page.route(origin+${JSON.stringify('/'+file)},route=>route.fulfill({contentType:${JSON.stringify(file.endsWith('.css')?'text/css':'text/javascript')},body:${body}}));`;
      }
    }
    const file=join(tmpdir(),'ug-browser-'+randomUUID()+'.js');
    let out;
    try{
      writeFileSync(file,guard.replace('const result=await (',preload+'const result=await (')+code+')(page,'+(baseline||suite.endsWith('-baseline'))+','+alternative+','+JSON.stringify(reference)+');if(violations.length)throw Error(violations.join(", "));return result;}');
      out=run('run-code','--filename',file);
    }finally{try{unlinkSync(file);}catch{}}
    const payload=out.split('### Result')[1];
    if(!payload)throw Error(out.slice(0,1200)||'El navegador no devolvió resultado.');
    const result=JSON.parse(payload.trim().split(/\r?\n/)[0]);
    passed+=result.passed;console.log(suite,JSON.stringify(result));
   }catch(error){failed++;console.error(suite,error.message);}
   finally{try{run('close');}catch{}}
  }
 }finally{server.kill();}
 const skippedSuites=all.filter(suite=>!suites.includes(suite));
 console.log(JSON.stringify({passed,failed,skipped:skippedSuites.length,skippedSuites}));
 if(failed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
