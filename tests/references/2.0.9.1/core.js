/* Campus UG Revamp: pure cache policy and validation (also used by tests). */
(() => {
  'use strict';
  const CONFIG = Object.freeze({ pending: 10*60e3, completed: 24*3600e3,
    calendar: 15*60e3, history: 24*3600e3, archiveProbe: 7*24*3600e3, timeout: 15000, concurrency: 3,
    recoveryTimeout: 25000, recoveryBudget: 75000, recoveryLimit: 6, maxServerWait: 2000 });
  const mods = { assign: 'Tarea', quiz: 'Cuestionario', forum: 'Foro' };
  function item(ev, origin) {
    if (!Object.hasOwn(mods, ev?.modulename) || !['due','close'].includes(ev.eventtype)) return null;
    let url;
    try { url = new URL(ev.url, origin); } catch { return null; }
    const cmid = url.searchParams.get('id');
    const due = Number(ev.timesort || ev.timestart);
    if (url.origin !== origin || !/^\d+$/.test(cmid || '') || !/^\d+$/.test(String(ev.id)) || !Number.isFinite(due) || due <= 0) return null;
    return { id: String(ev.id), name: String(ev.name || 'Sin nombre').slice(0,1000), mod: ev.modulename,
      cmid, url: `${origin}/mod/${ev.modulename}/view.php?id=${cmid}`, due,
      closeAt: ev.modulename==='quiz' && ev.eventtype==='close' && Number(ev.timestart)===due && Number.isSafeInteger(due) ? due*1000 : null,
      courseId: Number(ev.course?.id) || 0,
      course: String(ev.course?.fullnamedisplay || ev.course?.fullname || 'Sin curso').slice(0,1000) };
  }
  const empty = () => ({ schema: 2, months: {}, auto: {}, updated: 0 });
  function clean(raw, origin, now = Date.now()) {
    const out = empty();
    if (!raw || raw.schema !== 2) return out;
    for (const [key, month] of Object.entries(raw.months || {})) {
      if (!/^\d{4}-\d{1,2}$/.test(key) || !Array.isArray(month?.items)) continue;
      const timestamp = Number.isFinite(month.t) && month.t <= now ? month.t : 0;
      out.months[key] = { t: timestamp, items: month.items.flatMap(i => {
        const valid = item({ id:i?.id, name:i?.name, modulename:i?.mod, eventtype:'due', url:i?.url,
          timesort:i?.due, course:{id:i?.courseId,fullname:i?.course} }, origin);
        return valid ? [{...valid, closeAt:valid.mod==='quiz' && i.closeAt===valid.due*1000 ? i.closeAt:null, synced: Number.isFinite(i.synced) && i.synced<=now ? i.synced : timestamp}] : [];
      }) };
    }
    for (const [key,s] of Object.entries(raw.auto || {})) {
      if (!activityKey(key) || typeof s?.done !== 'boolean') continue;
      const source = ['moodle','heuristic'].includes(s.source) ? s.source : 'unknown';
      const t = Number.isFinite(s.t) && s.t<=now ? s.t : 0;
      out.auto[key] = {done:s.done,t,source,...(s.recheck ? {recheck:true} : {})};
    }
    out.updated = Number(raw.updated) || 0;
    return out;
  }
  function needsCheck(s, force, now=Date.now(), failure) {
    if (failure) return force || now>=failure.retryAt;
    if (s?.recheck) return true;
    if (!s || s.source==='unknown') return true;
    if (force && !s.done) return true;
    return now-s.t >= (s.done ? CONFIG.completed : CONFIG.pending);
  }
  function verificationDecision({item,status,manual,failure,stamp,closeAt=null,mode='normal',now=Date.now()}) {
    if(!['assign','quiz'].includes(item.mod))return 'manual';
    if(mode==='all'||mode==='one')return 'check';
    if(typeof manual==='boolean')return 'manual';
    if(failure && now<failure.retryAt)return 'backoff';
    if(failure || !status || status.source!=='moodle')return 'check';
    const verified=stamp?.stateAt===status.t ? stamp : null;
    const last=verified?.t??status.t;
    if((status.recheck && !verified) || item.synced>last || (verified?.closedAt && verified.closedAt!==closeAt))return 'check';
    if(closeAt && verified?.closedAt===closeAt && last>closeAt && now-last<CONFIG.archiveProbe)return 'archive';
    return now-last>=(status.done?CONFIG.completed:CONFIG.pending)?'check':'cache';
  }

  // Activity requests have no write-capable routes. The single POST is the calendar read method.
  function allowsRequest(url, options, origin) {
    let target;
    try{target=new URL(url);}catch{return false;}
    if(target.origin!==origin || target.username || target.password || target.hash)return false;
    const method=options.method??'GET';
    if(method==='GET' && options.body==null){
      if(target.pathname==='/my/' && !target.search)return true;
      return /^\/mod\/(assign|quiz)\/view\.php$/.test(target.pathname) && /^\?id=\d+$/.test(target.search);
    }
    if(method!=='POST'||target.pathname!=='/lib/ajax/service.php')return false;
    const calendar='core_calendar_get_calendar_monthly_view';
    if(target.searchParams.get('info')!==calendar || [...target.searchParams.keys()].sort().join(',')!=='info,sesskey')return false;
    try{const calls=JSON.parse(options.body);return Array.isArray(calls)&&calls.length===1&&calls[0]?.methodname===calendar;}
    catch{return false;}
  }

  function closeEvidence(doc, mod) {
    if(mod!=='quiz'||doc.body?.id!=='page-mod-quiz-view'||doc.querySelector('.quizstartbuttondiv [type="submit"]'))return false;
    const dateLabel=[...doc.querySelectorAll('[data-region="activity-dates"] strong')].some(node=>/^(Closed|Cerró):$/i.test(node.textContent.trim()));
    if(!dateLabel)return false;
    return [...doc.querySelectorAll('.quizattempt p, .quizattempt .alert')].some(node=>
      /^(This quiz is currently not available|Este cuestionario no está disponible en este momento)\.?$/i.test(node.textContent.trim()));
  }
  function identity(doc) {
    const config = [...doc.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n');
    const ids = [...config.matchAll(/["'](?:userId|userid)["']\s*:\s*["']?(\d+)/g)].map(m=>m[1]);
    const menu = doc.querySelector('.usermenu a[href*="/user/profile.php"], .usermenu a[href*="/user/view.php"]');
    if(menu) { try { const id=new URL(menu.getAttribute('href'), doc.baseURI === 'about:blank' ? 'https://invalid.local' : doc.baseURI).searchParams.get('id'); if(id) ids.push(id); } catch {} }
    const unique = [...new Set(ids.filter(id=>/^[1-9]\d*$/.test(id)))];
    const sesskey = (config.match(/["']sesskey["']\s*:\s*["']([a-zA-Z0-9]+)["']/)||[])[1];
    return { userId: unique.length===1 ? unique[0] : null, sesskey, identityState:unique.length>1?'conflict':unique.length===1?'found':'missing' };
  }
  const ERROR_LABELS = Object.freeze({HTTP:'Error HTTP',TIMEOUT:'Tiempo de espera agotado',REDIRECT:'Redirección bloqueada',NETWORK:'Error de red',CANCELLED:'Consulta cancelada',SESSION_EXPIRED:'Sesión caducada',IDENTITY_MISSING:'Identidad no reconocida',IDENTITY_CONFLICT:'Identidades contradictorias',ACCOUNT_CHANGED:'Cuenta distinta',HTML_INCOMPATIBLE:'HTML incompatible',VIEW_MISMATCH:'Vista distinta de la actividad',SELECTOR_MISSING:'Selector de estado no encontrado',STATE_UNKNOWN:'Estado no reconocido',INTERNAL:'Error interno de JavaScript',API_ERROR:'Error de API Moodle',STORAGE:'Error de almacenamiento',DESTINATION:'Destino no permitido'});
  function problem(code, details={}) {const e=new Error(ERROR_LABELS[code]||ERROR_LABELS.INTERNAL);e.code=Object.hasOwn(ERROR_LABELS,code)?code:'INTERNAL';e.details=safeDetails(details);return e;}
  function retryAfter(value, now=Date.now()) {
    if(value===null)return {};
    const delay=/^\d+$/.test(value)?Number(value)*1000:
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)?Date.parse(value)-now:NaN;
    return Number.isFinite(delay)&&delay<=86400000
      ? {retryAfterMs:Math.max(0,Math.ceil(delay))}
      : {retryAfterBlocked:true};
  }
  function recoveryWait(error) {
    if(['TIMEOUT','NETWORK'].includes(error.code))return 0;
    if(error.code!=='HTTP')return null;
    const {http,retryAfterMs,retryAfterBlocked}=error.details??{};
    if(![429,502,503,504].includes(http)||retryAfterBlocked)return null;
    if(retryAfterMs===undefined)return http===429?null:0;
    return retryAfterMs<=CONFIG.maxServerWait?retryAfterMs:null;
  }
  // Allowlist only: never copy exception messages, stack traces, URLs or HTML.
  function safeDetails(value={}) {
    if(!value || typeof value!=='object')return {};
    const out={};
    for(const k of ['http','statusNodes','attemptRows','attemptSummaries','forumContainers','forumAuthors','concurrency']) if(Number.isInteger(value[k])&&value[k]>=0&&value[k]<=9999)out[k]=value[k];
    for(const k of ['elapsedMs','headersMs','timeoutMs','retryAfterMs']) if(Number.isInteger(value[k])&&value[k]>=0&&value[k]<=86400000)out[k]=value[k];
    for(const k of ['hasMain','hasFooter','mainBusy','retryAfterBlocked']) if(typeof value[k]==='boolean')out[k]=value[k];
    if(['headers','body'].includes(value.phase))out.phase=value.phase;
    if(['view','subview','other','unmarked'].includes(value.pageView))out.pageView=value.pageView;
    if(['first','resume','reattempt','restricted','other','missing'].includes(value.quizStart))out.quizStart=value.quizStart;
    if(['form_not_confirmed','module_not_confirmed','existing_attempt_evidence','single_attempt_not_confirmed'].includes(value.quizStartReason))out.quizStartReason=value.quizStartReason;
    if(['missing','conflict','match','different'].includes(value.identity))out.identity=value.identity;
    if(['TypeError','ReferenceError','SyntaxError','RangeError','Error'].includes(value.jsType))out.jsType=value.jsType;
    return out;
  }
  function failureRecord(error, previous, now=Date.now()) {
    const code=Object.hasOwn(ERROR_LABELS,error?.code)?error.code:'INTERNAL';
    const attempts=previous?.code===code ? Math.min((previous.attempts||0)+1,10) : 1;
    const base=['TIMEOUT','NETWORK','HTTP','CANCELLED'].includes(code)?2*60e3:30*60e3;
    return {code,t:now,attempts,retryAt:now+Math.min(base*2**(attempts-1),6*3600e3),details:safeDetails({...error?.details,jsType:code==='INTERNAL'?error?.name:undefined})};
  }
  function cleanFailures(raw, now=Date.now()) {
    const out={};
    for(const [k,v]of Object.entries(raw||{})) {
      if(!/^(assign|quiz|forum):\d+$/.test(k) && !/^calendar:\d{4}-\d{1,2}$/.test(k) && k!=='session')continue;
      if(!Object.hasOwn(ERROR_LABELS,v?.code)||!Number.isFinite(v.t)||v.t>now||!Number.isFinite(v.retryAt))continue;
      out[k]={code:v.code,t:v.t,retryAt:Math.min(Math.max(v.retryAt,v.t),v.t+6*3600e3),attempts:Math.min(Math.max(Number(v.attempts)||1,1),10),details:safeDetails(v.details)};
    }
    return out;
  }
  const activityKey = key => /^(assign|quiz|forum):\d+$/.test(key);

  // The original keys are immutable. Replay only the changes made by 2.0.3.
  function readState(data, prefix, origin, now=Date.now()) {
    const baseline = data[prefix+'cache'];
    if(baseline?.schema>2) throw new Error('Caché creada por una versión más reciente. Actualiza la extensión.');
    const history = data[prefix+'history'];
    if(history!==undefined && (history?.schema!==1 || !Array.isArray(history.changes))) {
      throw new Error('El historial tiene un formato no compatible. Los datos siguen guardados.');
    }
    const cache=clean(baseline,origin,now);
    const failures=cleanFailures(data[prefix+'failures'],now);
    const manual={};
    const manualPrefix=prefix+'manual:';
    for(const [key,value] of Object.entries(data)){
      if(!key.startsWith(manualPrefix))continue;
      const id=key.slice(manualPrefix.length);
      if(activityKey(id) && typeof value?.done==='boolean')manual[id]=value.done;
    }
    for(const change of history?.changes||[]){
      const {type,key,value}=change||{};
      if(type==='month' && /^\d{4}-\d{1,2}$/.test(key)){
        const snapshot=clean({schema:2,months:{[key]:value}},origin,now).months[key];
        if(snapshot)mergeMonth(cache,key,{...snapshot,activeIds:value.activeIds});
      }else if(type==='auto' && activityKey(key) && typeof value?.done==='boolean'){
        cache.auto[key]=clean({schema:2,auto:{[key]:value}},origin,now).auto[key];
      }else if(type==='manual' && activityKey(key)){
        if(value===null)delete manual[key];
        else if(typeof value?.done==='boolean')manual[key]=value.done;
      }else if(type==='failure'){
        if(value===null && Object.hasOwn(failures,key))delete failures[key];
        else Object.assign(failures,cleanFailures({[key]:value},now));
      }
    }
    return {cache,failures,manual,history:history??{schema:1,changes:[]}};
  }

  function mergeMonth(cache, key, snapshot) {
    const previous=cache.months[key];
    if(previous && !snapshot.items.length && !Array.isArray(snapshot.activeIds)){
      cache.months[key]={...previous,t:snapshot.t};
      return;
    }
    const items=new Map((previous?.items||[]).map(it=>[it.id,it]));
    for(const it of snapshot.items)items.set(it.id,it);
    const activeIds=Array.isArray(snapshot.activeIds)
      ? [...new Set(snapshot.activeIds.filter(id=>items.has(id)))]
      : previous?.activeIds??previous?.items.map(it=>it.id)??[];
    cache.months[key]={t:snapshot.t,items:[...items.values()],activeIds};
  }

  function completion(item, manual, auto) {
    if(typeof manual==='boolean')return {done:manual,source:'manual'};
    if(item.mod==='forum'){
      if(auto?.done===true)return {done:true,source:auto.source==='unknown'?'historical_unknown':'historical'};
      return {done:false,source:'manual_pending'};
    }
    if(auto?.done===true && auto.source==='unknown')return {done:true,source:'historical_unknown'};
    return {done:auto?.done===true,source:auto?.source??'unknown'};
  }
  function checkIdentity(doc, expected) {
    if(doc.querySelector('form#login, body#page-login-index, input[name="username"]') && doc.querySelector('input[type="password"], body#page-login-index'))throw problem('SESSION_EXPIRED');
    const who=identity(doc);
    if(who.identityState==='conflict')throw problem('IDENTITY_CONFLICT',{identity:'conflict'});
    if(!who.userId)throw problem('IDENTITY_MISSING',{identity:'missing'});
    if(who.userId!==expected)throw problem('ACCOUNT_CHANGED',{identity:'different'});
  }
  function localizedFirstAttemptReason(start, action, main, origin, cmid, normalize) {
    const form=start.form;
    if(!form || form.method!=='post' || !action || action.origin!==origin || action.pathname!=='/mod/quiz/startattempt.php' ||
       main.querySelectorAll('.quizstartbuttondiv [type="submit"]').length!==1 || start.matches(':disabled') ||
       start.closest('[hidden], [inert], [aria-disabled="true"], [aria-hidden="true"]') ||
       start.hasAttribute('formaction') || start.hasAttribute('formmethod'))return 'form_not_confirmed';

    const hiddenIds=[...form.elements].filter(field=>field.matches('input[type="hidden"][name="cmid"]:not(:disabled)'));
    const moduleIds=[...action.searchParams.getAll('cmid'), ...hiddenIds.map(input=>input.value)];
    if(!/^\d+$/.test(cmid||'') || moduleIds.length!==1 || moduleIds[0]!==cmid)return 'module_not_confirmed';

    const attemptParameters=['attempt','attemptid','page','forcenew'];
    const hasAttemptParameter=attemptParameters.some(name=>action.searchParams.has(name) || form.elements.namedItem(name));
    const hasAttemptLink=[...main.querySelectorAll('a[href]')].some(link=>{
      try{
        const url=new URL(link.getAttribute('href'),`${origin}/mod/quiz/view.php`);
        return url.origin===origin && /^\/mod\/quiz\/(attempt|review|summary)\.php$/.test(url.pathname);
      }catch{return false;}
    });
    if(hasAttemptParameter || hasAttemptLink)return 'existing_attempt_evidence';

    const oneAttempt=[...main.querySelectorAll('.quizinfo, .quizinfo p')].some(node=>
      /^Intentos permitidos\s*:\s*1$/i.test(normalize(node.textContent)));
    if(!oneAttempt)return 'single_attempt_not_confirmed';
    return null;
  }

  function recognize(doc, mod, userId, origin, cmid) {
    checkIdentity(doc,userId);
    const normalize=s=>s.replace(/\s+/g,' ').trim();
    const main=doc.querySelector('#region-main, main, [role="main"]');
    const bodyId=doc.body?.id||'';
    let pageView='unmarked';
    if(bodyId===`page-mod-${mod}-view`)pageView='view';
    else if(bodyId.startsWith(`page-mod-${mod}-`))pageView='subview';
    else if(bodyId.startsWith('page-'))pageView='other';
    const evidence={identity:'match',pageView,hasMain:!!main,hasFooter:!!doc.querySelector('#page-footer'),mainBusy:!!main?.matches('[aria-busy="true"]')};
    if(pageView==='subview'||pageView==='other')throw problem('VIEW_MISMATCH',evidence);
    let done,absence;
    if(mod==='assign') {
      const nodes=[...doc.querySelectorAll('.submissionstatussubmitted, .submissionstatusnew, .submissionstatusdraft, .submissionstatusreopened, .submissionstatus')];
      for(const row of doc.querySelectorAll('.submissionstatustable tr')) {
        const cells=[...row.children];
        if(cells.length===2 && /^(Submission status|Estado de la entrega|Estado de entrega)$/i.test(normalize(cells[0].textContent)) && !nodes.includes(cells[1]))nodes.push(cells[1]);
      }
      evidence.statusNodes=nodes.length;
      const values=[];
      for(const n of nodes){
        if(n.classList.contains('submissionstatussubmitted'))values.push(true);
        else if(['submissionstatusnew','submissionstatusdraft','submissionstatusreopened'].some(c=>n.classList.contains(c)))values.push(false);
        else {const text=normalize(n.textContent);if(/^(Enviado para calificar|Submitted for grading)$/i.test(text))values.push(true);else if(/^(No submissions have been made yet|Nothing has been submitted for this assignment|No attempt|No se ha enviado nada en esta tarea|Todavía no se han realizado envíos|Sin entrega|No entregado|Borrador(?: \(no enviado\))?|Draft(?: \(not submitted\))?|Reopened|Reabierto)\.?$/i.test(text))values.push(false);}
      }
      if(!nodes.length)throw problem('SELECTOR_MISSING',evidence);
      if(!values.length||new Set(values).size!==1)throw problem('STATE_UNKNOWN',evidence);
      done=values[0];
    }else if(mod==='quiz') {
      const table=doc.querySelector('table.quizattemptsummary');
      const rows=table?[...table.querySelectorAll('tbody tr')]:[];evidence.attemptRows=rows.length;
      // Match a whole status line/cell, never a question title containing "Finished".
      const headers=table?[...table.querySelectorAll('thead th')]:[];
      const statusColumn=headers.findIndex(h=>/^(State|Status|Estado)$/i.test(normalize(h.textContent)));
      const states=statusColumn<0?[]:rows.flatMap(r=>{const td=r.children[statusColumn];return td?td.innerHTML.split(/<br\s*\/?\s*>/i).map(part=>{const holder=doc.createElement('div');holder.innerHTML=part;return normalize(holder.textContent);}):[];});
      const summaries=[...doc.querySelectorAll('table.quizreviewsummary')];
      const statusRows=summaries.flatMap(summary=>[...summary.querySelectorAll('tr')]).filter(r=>/^(Status|State|Estado)$/i.test(normalize(r.querySelector('th')?.textContent||'')));
      states.push(...statusRows.map(r=>normalize(r.querySelector('td')?.textContent||'')));
      evidence.attemptRows+=statusRows.length;
      evidence.attemptSummaries=summaries.length;
      if(states.some(t=>/^(Finalizado|Finalizados|Finished|Terminados|Terminado)$/i.test(t)))done=true;
      else if(states.some(t=>/^(En curso|In progress|Nunca enviado|Never submitted|Vencido|Overdue)$/i.test(t)))done=false;
      else {
        const scope=main||doc.body;
        const noAttempts=[...scope.querySelectorAll('p, h3, .box')].some(n=>/^(No attempts have been made(?: yet)?\.?|No se han realizado intentos\.?|Todavía no se han hecho intentos\.?)$/i.test(normalize(n.textContent)));
        // Moodle uses a distinct label for the first attempt, another attempt and resuming one.
        const start=main?.querySelector('.quizstartbuttondiv [type="submit"]');
        const action=start?.form?.getAttribute('action');
        let quizStart=start?'other':'missing';
        const label=start?normalize(start.tagName==='INPUT'?start.value:start.textContent):'';
        let actionUrl;
        if(action){
          try{
            actionUrl=new URL(action,`${origin}/mod/quiz/view.php`);
            if(actionUrl.origin===origin && actionUrl.pathname==='/mod/quiz/startattempt.php'){
              if(/^(Attempt quiz|Intentar resolver el cuestionario|Intentar el cuestionario)$/i.test(label))quizStart='first';
              else if(/^(Continue (your )?attempt|Continuar (con )?(el|su) intento|Continuar el último intento)$/i.test(label))quizStart='resume';
              else if(/^(Re-attempt quiz|Volver a intentar (resolver )?el cuestionario|Realizar un nuevo intento|Reintentar el cuestionario)$/i.test(label))quizStart='reattempt';
            }
          }catch{}
        }
        if(/^Intento de cuestionario$/i.test(label)){
          const reason=localizedFirstAttemptReason(start,actionUrl,main,origin,cmid,normalize);
          if(reason)evidence.quizStartReason=reason;
          else quizStart='first';
        }
        if(!start && main?.querySelector('.quizattempt .alert'))quizStart='restricted';
        evidence.quizStart=quizStart;
        const explicitAbsence=noAttempts && quizStart==='missing';
        if(!table && !summaries.length && !evidence.mainBusy && (explicitAbsence || (pageView==='view' && quizStart==='first'))){
          done=false;
          absence='quiz_no_attempts';
        }else throw problem(table||summaries.length?'STATE_UNKNOWN':'SELECTOR_MISSING',evidence);
      }
    }else throw problem('HTML_INCOMPATIBLE');
    return {done,source:'moodle',t:Date.now(),...(absence?{absence}:{})};
  }
  const categories = Object.freeze(['proximas','atrasadas','entregadas','pendientes','desconocidas']);
  const titleLimit = 80;
  const defaultTitle = 'Mis actividades · Campus UG Revamp';

  function presentation(value) {
    const saved = value?.schema === 1 ? value : {};
    const title = typeof saved.title === 'string' ? saved.title.slice(0,titleLimit).trim() : '';
    return {
      schema:1,
      position:['top','bottom','hidden'].includes(saved.position) ? saved.position : 'top',
      mode:saved.mode === 'custom' ? 'custom' : 'tabs',
      categories:Array.isArray(saved.categories) ? categories.filter(id=>saved.categories.includes(id)) : ['proximas'],
      title:title || defaultTitle,
      size:['compact','normal','wide'].includes(saved.size) ? saved.size : 'normal',
      limit:[5,10,30].includes(saved.limit) ? saved.limit : null,
      course:typeof saved.course === 'string' && /^\d{1,20}$/.test(saved.course) ? saved.course : 'all',
      autoRefreshMinutes:[0,10,15,30].includes(saved.autoRefreshMinutes) ? saved.autoRefreshMinutes : 10,
      appearance:['auto','light','dark'].includes(saved.appearance) ? saved.appearance : 'auto',
    };
  }

  function matchesCategory(category, bucket) {
    return category === 'pendientes' ? ['proximas','atrasadas','manuales'].includes(bucket) : category === bucket;
  }

  function presentationList(rows, selected) {
    const result = new Map();
    for(const {it,b} of rows){
      if(selected.some(category=>matchesCategory(category,b)))result.set(it.mod+':'+it.cmid,it);
    }
    const ascending = selected.some(id=>id==='proximas'||id==='pendientes');
    return [...result.values()].sort((a,b)=>ascending ? a.due-b.due : b.due-a.due);
  }

  globalThis.UGCore = { CONFIG, mods, item, empty, clean, needsCheck, verificationDecision, allowsRequest, closeEvidence, identity, ERROR_LABELS, problem, retryAfter, recoveryWait, safeDetails, failureRecord, cleanFailures, checkIdentity, recognize, readState, mergeMonth, completion, categories, titleLimit, presentation, matchesCategory, presentationList };
  if(typeof module !== 'undefined') module.exports = globalThis.UGCore;
})();
