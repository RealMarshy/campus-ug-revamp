const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const identity='<script>window.M={cfg:{"userId":42,"sesskey":"fixture123"}};</script>';
const shim=`<script>
const listeners=[];
window.chrome={storage:{local:{async get(k){let d=JSON.parse(localStorage.getItem('fixture')||'{}');return k?{[k]:d[k]}:d;},async set(values){let d=JSON.parse(localStorage.getItem('fixture')||'{}');Object.assign(d,values);localStorage.setItem('fixture',JSON.stringify(d));listeners.forEach(f=>f(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{newValue:v}])),'local'));},async remove(keys){let d=JSON.parse(localStorage.getItem('fixture')||'{}');for(const k of [].concat(keys))delete d[k];localStorage.setItem('fixture',JSON.stringify(d));}},onChanged:{addListener(f){listeners.push(f);}}}};
window.chrome.runtime={getURL(file){return new URL(file,location.origin+'/').href;}};
</script>`;
let counts={months:0,checks:0,session:0,forums:0}, mode='normal';
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:8765');res.setHeader('Content-Type','text/html; charset=utf-8');
 if(req.headers.host!=='127.0.0.1:8765' || (req.method!=='GET' && !(req.method==='POST' && u.pathname==='/lib/ajax/service.php'))){
  res.writeHead(405);res.end('Ruta de escritura bloqueada');return;
 }
 if(u.pathname==='/stats'){res.end(JSON.stringify(counts));return;}
 if(u.pathname==='/mode'){mode=u.searchParams.get('value');counts={months:0,checks:0,session:0,forums:0};res.end('ok');return;}
 if(u.pathname==='/lib/ajax/service.php'){
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 counts.months++;let body='';for await(const c of req)body+=c;
 let calls;try{calls=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
 if(!Array.isArray(calls)||calls.length!==1||calls[0]?.methodname!=='core_calendar_get_calendar_monthly_view'||!calls[0].args){
  res.writeHead(403);res.end('Método Moodle bloqueado');return;
 }
 const {year,month}=calls[0].args;
 if(mode==='partial'&&month===new Date().getMonth()+1){res.statusCode=503;res.end('unavailable');return;}
 const now=new Date();let events=[];
 if(year===now.getFullYear()&&month===now.getMonth()+1)events=Array.from({length:mode==='new'?7:6},(_,n)=>({id:n+1,name:['Diseño de software','Cuestionario de redes','Foro: arquitectura','Informe atrasado','Tarea pendiente','Foro de requisitos','Actividad nueva'][n],modulename:['assign','quiz','forum','assign','assign','forum','assign'][n],eventtype:'due',url:`http://127.0.0.1:8765/mod/${['assign','quiz','forum','assign','assign','forum','assign'][n]}/view.php?id=${n+1}`,timesort:Math.floor(new Date().setHours(0,0,0,0)/1000)+(n===3?-86400:86400*(n+1)),course:{id:n%2+1,fullname:n%2?'Redes':'Ingeniería de Software'}}));
 setTimeout(()=>res.end(JSON.stringify([{data:{weeks:[{days:[{events}]}]}}])),30);return;
 }
 if(/^\/mod\/(assign|quiz|forum)\/view\.php$/.test(u.pathname)){counts.checks++;const id=u.searchParams.get('id');
 if(u.pathname.startsWith('/mod/forum/'))counts.forums++;
 if(mode==='preservation' && id==='2'){res.end('<body id="page-mod-quiz-view">'+identity+'<main><p>Estado personalizado</p></main></body>');return;}
 if(mode==='http' && id==='1'){res.statusCode=503;res.end('unavailable');return;}
 if(mode==='redirect' && id==='1'){res.writeHead(302,{Location:'/login/index.php'});res.end();return;}
 if(mode==='timeout' && id==='1'){
  const timer=setTimeout(()=>res.end(identity+'<div class="submissionstatussubmitted"></div>'),20000);
  res.once('close',()=>clearTimeout(timer));
  return;
 }
 if(mode==='slow-body' && id==='1'){
  res.write(identity);
  const timer=setTimeout(()=>res.end('<div class="submissionstatussubmitted"></div>'),20000);
  res.once('close',()=>clearTimeout(timer));
  return;
 }
 if(mode==='empty-activities' && (id==='2'||id==='3')){
  const mod=id==='2'?'quiz':'forum';
  const content=id==='2'?'<div class="quizstartbuttondiv"><form method="post" action="/mod/quiz/startattempt.php?cmid=2"><button type="submit">Attempt quiz</button></form></div>':'<div data-gradable-itemtype="forum"><div class="forumnodiscuss alert alert-info">There are no discussion topics yet in this forum.</div></div>';
  res.end(`<body id="page-mod-${mod}-view">${identity}<main id="region-main">${content}</main><footer id="page-footer"></footer></body>`);return;
 }
 if(mode==='login' && id==='1'){res.end('<body id="page-login-index"><form id="login"><input type="password"></form></body>');return;}
 if(mode==='noidentity' && id==='1'){res.end('<div class="submissionstatussubmitted">Submitted for grading</div>');return;}
 if(mode==='unknownhtml' && id==='1'){res.end(identity+'<main><p>Unknown theme</p></main>');return;}
 if(mode==='incompatible' && id==='1'){res.end('not html');return;}
 let html=id==='1'?'<div class="submissionstatussubmitted">Enviado para calificar</div>':id==='2'?'<table class="quizattemptsummary"><thead><tr><th>Estado</th></tr></thead><tbody><tr><td>Finalizado</td></tr></tbody></table>':u.pathname.includes('forum')?'<div class="forumheaderlist"><div class="author"><a href="/user/view.php?id=42">Autor</a></div></div>':'<div class="submissionstatusnew">Sin entrega</div>';setTimeout(()=>res.end(identity+html),40);return;}
 if(['/core.js','/content.js','/styles.css'].includes(u.pathname)){res.setHeader('Content-Type',u.pathname.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,u.pathname)));return;}
 if(u.pathname==='/assets/hagalo-usted-mismo.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(root,u.pathname)));return;}
 if(!['/','/my/'].includes(u.pathname)){res.writeHead(404);res.end('Ruta fuera del fixture');return;}
 if(u.pathname==='/my/')counts.session++;
 res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Campus simulado</title><link rel="stylesheet" href="/styles.css"><style>body{font-family:Arial;margin:32px;background:#fff}main{max-width:1100px;margin:auto}</style></head><body><main><h1>Área personal · Moodle simulado</h1></main>${mode==='other'?identity.replace('42','99'):mode==='unknown'?'':identity}${shim}<script src="/core.js"></script><script src="/content.js"></script></body></html>`);
});server.listen(8765,'127.0.0.1',()=>console.log('Fixture http://127.0.0.1:8765'));


