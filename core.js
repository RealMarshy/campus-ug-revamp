/* Campus UG Revamp: pure cache policy and validation (also used by tests). */
(() => {
  'use strict';
  const CONFIG = Object.freeze({ pending: 10*60e3, completed: 24*3600e3,
    calendar: 15*60e3, history: 24*3600e3, archiveProbe: 7*24*3600e3, timeout: 15000, concurrency: 3,
    recoveryTimeout: 25000, recoveryBudget: 75000, recoveryLimit: 6, maxServerWait: 2000,
    periodicRecoveryBudget: 25000, periodicRecoveryLimit: 2 });
  const mods = { assign: 'Tarea', quiz: 'Cuestionario', forum: 'Foro', feedback:'Encuesta' };
  const feedbackStates=['available','in_progress','not_yet_open','closed','restricted','unknown'];
  const calendarTime=value=>Number.isSafeInteger(value)&&value>0&&value<=8640000000000;
  const positiveId=value=>/^[1-9]\d*$/.test(value??'');
  function feedbackTarget(value,origin) {
    try {
      const url=new URL(value,origin);
      if(url.origin===origin&&url.pathname==='/mod/feedback/view.php'&&!url.username&&!url.password&&!url.hash&&
        url.searchParams.size===1&&positiveId(url.searchParams.get('id')))return url.searchParams.get('id');
    } catch {}
    return null;
  }
  function feedbackItem(ev,origin) {
    if(!['open','close'].includes(ev.eventtype)||ev.visible===0||ev.visible===false||!positiveId(ev.id)||
       !calendarTime(ev.timestart)||(ev.timesort!=null&&ev.timesort!==ev.timestart))return null;
    const cmid=ev.instance==null?null:Number.isSafeInteger(ev.instance)&&positiveId(ev.instance)?String(ev.instance):false;
    if(cmid===false)return null;
    const target=ev.action?.url??ev.url;
    const linked=target==null?null:feedbackTarget(target,origin);
    if(target!=null&&(!linked||(cmid&&linked!==cmid)))return null;
    const id=cmid??linked;
    if(!id)return null;
    const close=ev.eventtype==='close';
    return {id:String(ev.id),cmid:id,mod:'feedback',url:`${origin}/mod/feedback/view.php?id=${id}`,
      name:String(ev.activityname||ev.name||'Encuesta').slice(0,1000),
      courseId:Number(ev.course?.id)||0,course:String(ev.course?.fullnamedisplay||ev.course?.fullname||'Sin curso').slice(0,1000),
      due:close?ev.timestart:null,openAt:close?null:ev.timestart*1000,closeAt:close?ev.timestart*1000:null};
  }
  function item(ev, origin) {
    if(ev?.modulename==='feedback')return feedbackItem(ev,origin);
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
        const valid = item({ id:i?.id, name:i?.name, modulename:i?.mod,
          ...(i?.mod==='feedback'?{eventtype:i.openAt!=null?'open':'close',timestart:(i.openAt??i.closeAt)/1000}: {eventtype:'due',timesort:i?.due}),url:i?.url,
          course:{id:i?.courseId,fullname:i?.course} }, origin);
        return valid ? [{...valid, closeAt:valid.mod==='feedback'?valid.closeAt:valid.mod==='quiz' && i.closeAt===valid.due*1000 ? i.closeAt:null, synced: Number.isFinite(i.synced) && i.synced<=now ? i.synced : timestamp}] : [];
      }) };
    }
    for (const [key,s] of Object.entries(raw.auto || {})) {
      if (!activityKey(key) || typeof s?.done !== 'boolean') continue;
      const source = ['moodle','heuristic'].includes(s.source) ? s.source : 'unknown';
      const t = Number.isFinite(s.t) && s.t<=now ? s.t : 0;
      const absence=!s.done&&source==='moodle'&&key.startsWith('quiz:')&&
        ['quiz_no_attempts','quiz_unavailable','quiz_not_yet_open','quiz_scheduled'].includes(s.absence)?s.absence:null;
      const quizOpenAt=['quiz_not_yet_open','quiz_scheduled'].includes(absence)&&calendarTime(s.quizOpenAt)?s.quizOpenAt:null;
      const evaluationGrade=!s.done&&source==='moodle'&&key.startsWith('assign:')?gradeText(s.evaluationGrade):null;
      const assignAvailability=!s.done&&source==='moodle'&&key.startsWith('assign:')&&
        ['group_blocked','add_submission'].includes(s.assignAvailability)?s.assignAvailability:null;
      out.auto[key] = {done:s.done,t,source,...(s.recheck ? {recheck:true} : {}),...(absence?{absence}:{}),...(quizOpenAt?{quizOpenAt}:{}),...(evaluationGrade?{evaluationGrade}:{}),
        ...(assignAvailability?{assignAvailability}:{}),...(absence==='quiz_no_attempts'&&s.available===true?{available:true}:{}),
        ...(key.startsWith('feedback:')&&source==='moodle'&&!s.done&&feedbackStates.includes(s.feedbackState)?{feedbackState:s.feedbackState}:{})};
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
  function selectorUpgrade(item,failure,stamp) {
    const evidence=failure?.details;
    return item.mod==='quiz'&&stamp?.quizSelectorRevision!==1&&failure?.code==='SELECTOR_MISSING'&&
      evidence?.identity==='match'&&evidence.pageView==='view'&&evidence.hasMain===true&&evidence.mainBusy===false&&
      evidence.attemptRows===0&&evidence.attemptSummaries===0&&evidence.quizStart==='missing'&&
      evidence.attemptCardLists===undefined;
  }

  function verificationDecision({item,status,manual,failure,stamp,closeAt=null,mode='normal',now=Date.now()}) {
    if(!['assign','quiz','feedback'].includes(item.mod))return 'manual';
    if(mode==='all'||mode==='one')return 'check';
    if(typeof manual==='boolean')return 'manual';
    if(failure && now<failure.retryAt)return 'backoff';
    if(failure || !status || status.source!=='moodle')return 'check';
    const verified=stamp?.stateAt===status.t ? stamp : null;
    const last=verified?.t??status.t;
    if((status.recheck && !verified) || item.synced>last || (verified?.closedAt && verified.closedAt!==closeAt))return 'check';
    if(status.quizOpenAt&&last<status.quizOpenAt&&now>=status.quizOpenAt)return 'check';
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
      if(target.pathname==='/mod/feedback/view.php')return /^\?id=[1-9]\d*$/.test(target.search);
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
    for(const k of ['http','statusNodes','attemptRows','attemptSummaries','attemptCardLists','attemptCardStates','forumContainers','forumAuthors','concurrency']) if(Number.isInteger(value[k])&&value[k]>=0&&value[k]<=9999)out[k]=value[k];
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
      if(!activityKey(k) && !/^calendar:\d{4}-\d{1,2}$/.test(k) && k!=='session')continue;
      if(!Object.hasOwn(ERROR_LABELS,v?.code)||!Number.isFinite(v.t)||v.t>now||!Number.isFinite(v.retryAt))continue;
      out[k]={code:v.code,t:v.t,retryAt:Math.min(Math.max(v.retryAt,v.t),v.t+6*3600e3),attempts:Math.min(Math.max(Number(v.attempts)||1,1),10),
        details:safeDetails(v.details),...(/^(assign|quiz|feedback):/.test(k)&&v.recoveryFailed===true?{recoveryFailed:true}:{})};
    }
    return out;
  }
  const activityKey = key => /^(assign|quiz|forum|feedback):\d+$/.test(key);

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
    const manualDecision=(id,value)=>{
      if(id.startsWith('feedback:')){
        if(value?.participation==='completed'||value?.participation==='not_completed')return value.participation==='completed';
        return value?.done===true?true:undefined;
      }
      return typeof value?.done==='boolean'?value.done:undefined;
    };
    const manualPrefix=prefix+'manual:';
    for(const [key,value] of Object.entries(data)){
      if(!key.startsWith(manualPrefix))continue;
      const id=key.slice(manualPrefix.length);
      const decision=manualDecision(id,value);
      if(activityKey(id)&&decision!==undefined)manual[id]=decision;
    }
    for(const change of history?.changes||[]){
      const {type,key,value}=change||{};
      if(type==='month' && /^\d{4}-\d{1,2}$/.test(key)){
        const snapshot=clean({schema:2,months:{[key]:value}},origin,now).months[key];
        if(snapshot)mergeMonth(cache,key,{...snapshot,activeIds:value.activeIds});
      }else if(type==='auto' && activityKey(key) && typeof value?.done==='boolean'){
        cache.auto[key]=clean({schema:2,auto:{[key]:value}},origin,now).auto[key];
      }else if(type==='manual' && activityKey(key)){
        const decision=manualDecision(key,value);
        if(decision!==undefined)manual[key]=decision;
        else if(value===null||(key.startsWith('feedback:')&&value?.done===false))delete manual[key];
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
  function recognizeFeedback(doc, {origin,userId,cmid,window={},now=Date.now()}) {
    checkIdentity(doc,userId);
    const result=(state,reason)=>({state,reason,done:state==='completed'});
    const main=doc.querySelector('#region-main')??doc.querySelector('main, [role="main"]');
    const ids=[...doc.body.classList].filter(name=>/^cmid-/.test(name));
    if(doc.body.id!=='page-mod-feedback-view'||ids.length!==1||ids[0]!=='cmid-'+cmid||
      !/^[1-9]\d*$/.test(cmid)||!main||main.closest('[aria-busy="true"]')){
      return result('unknown','La vista o el módulo no se pudieron confirmar');
    }
    if(window.conflict)return result('unknown','El calendario muestra fechas contradictorias');
    const visible=node=>{
      if(node.closest('[hidden], [inert], [aria-hidden="true"], .d-none, .hidden, .visually-hidden, template, noscript'))return false;
      for(let parent=node;parent;parent=parent.parentElement){
        if(parent.style.display==='none'||['hidden','collapse'].includes(parent.style.visibility))return false;
      }
      return true;
    };
    const notices=[...main.querySelectorAll('.alert.alert-block')].filter(node=>
      visible(node)&&!node.closest('.feedback_description, .feedback_after_submit, form'));
    const message=node=>[...node.childNodes].filter(child=>!child.matches?.("button")).map(child=>child.textContent).join("").trim().replace(/\s+/g,' ');
    const statusMessages=notices.filter(node=>node.parentElement.matches('.generalbox.boxaligncenter')).map(message);
    const signals=new Set();
    if(statusMessages.some(text=>["You've already completed this activity.","Usted ya ha entregado esta retroalimentación."].includes(text)))signals.add('completed');
    if(notices.some(node=>message(node)==='You can only access this feedback from a course'))signals.add('restricted');
    if(statusMessages.some(text=>['The feedback is not open','La encuesta no está disponible'].includes(text)))signals.add('not_open');
    const links=[...main.querySelectorAll('a[href], button, input[type="submit"]')].filter(control=>
      visible(control)&&!control.matches(':disabled')&&!control.closest('.disabled, [aria-disabled="true"]')&&
      (control.matches('a[href]')||control.type==='submit')&&
      (control.matches('.feedback_description .tertiary-navigation .navitem a.btn.btn-primary[href]')||
       /^(Responda a las preguntas|Answer the questions)$/i.test((control.value||control.textContent).trim().replace(/\s+/g,' '))));
    const actions=links.flatMap(link=>{
      const form=link.form;
      if(form&&(!main.contains(form)||!visible(form)||form.closest('.disabled, [aria-disabled="true"]')||
        link.hasAttribute('formmethod')))return [];
      let url;
      const target=link.getAttribute('href')??link.getAttribute('formaction')??form?.getAttribute('action');
      if(!target||(!form&&!link.matches('a[href]')))return [];
      try{url=new URL(target,origin+'/mod/feedback/view.php');}catch{return [];}
      if(url.origin!==origin||url.pathname!=='/mod/feedback/complete.php'||url.username||url.password||url.hash)return [];
      for(const field of form?.elements??[]){
        if(field.matches('input[type="hidden"]:not(:disabled)')&&['id','courseid','gopage'].includes(field.name))
          url.searchParams.append(field.name,field.value);
      }
      if(url.searchParams.get('id')!==cmid||url.searchParams.getAll('id').length!==1||
        (url.searchParams.has('courseid')&&(!positiveId(url.searchParams.get('courseid'))||url.searchParams.getAll('courseid').length!==1))||
        [...url.searchParams.keys()].some(name=>!['id','courseid','gopage'].includes(name)))return [];
      const page=url.searchParams.get('gopage');
      if(page===null||page==='0'&&url.searchParams.getAll('gopage').length===1)return ['available'];
      return positiveId(page)&&url.searchParams.getAll('gopage').length===1?['in_progress']:[];
    });
    if(signals.size>1||actions.length>1||(signals.size&&actions.length))return result('unknown','La página muestra señales contradictorias');
    if(signals.has('completed'))return result('completed','Moodle confirma una respuesta enviada');
    if(signals.has('restricted'))return result('restricted','Acceso restringido');
    const beforeOpen=window.openAt!=null&&now<window.openAt;
    const afterClose=window.closeAt!=null&&now>=window.closeAt;
    if(signals.has('not_open')){
      if(beforeOpen)return result('not_yet_open','Todavía no disponible');
      if(afterClose)return result('closed','Cerrada sin participación confirmada');
      return result('unknown','Moodle indica que no está abierta, sin fechas suficientes para distinguir la causa');
    }
    if(actions.length&&!beforeOpen){
      return actions[0]==='in_progress'?result('in_progress','Respuesta en curso, sin envío confirmado'):
        result('available','Disponible para responder; participación previa sin confirmar');
    }
    return result('unknown','Moodle no muestra un estado de participación verificable');
  }

  function localizedFirstAttemptReason(start, action, main, origin, cmid, normalize, hasAttemptLink, localized) {
    const form=start.form;
    if(!form || form.method!=='post' || !action || action.origin!==origin || action.pathname!=='/mod/quiz/startattempt.php' ||
       main.querySelectorAll('.quizstartbuttondiv [type="submit"]').length!==1 || start.matches(':disabled') ||
       hiddenEvidence(start) || hiddenEvidence(form) || start.closest('[aria-disabled="true"]') ||
       form.closest('[aria-disabled="true"]') || !main.contains(form) || action.username || action.password || action.hash ||
       start.hasAttribute('formaction') || start.hasAttribute('formmethod'))return 'form_not_confirmed';

    const hiddenIds=[...form.elements].filter(field=>field.matches('input[type="hidden"][name="cmid"]:not(:disabled)'));
    const moduleIds=[...action.searchParams.getAll('cmid'), ...hiddenIds.map(input=>input.value)];
    if(!/^\d+$/.test(cmid||'') || moduleIds.length!==1 || moduleIds[0]!==cmid)return 'module_not_confirmed';

    const attemptParameters=['attempt','attemptid','page','forcenew'];
    const hasAttemptParameter=attemptParameters.some(name=>action.searchParams.has(name) || form.elements.namedItem(name));
    if(hasAttemptParameter || hasAttemptLink)return 'existing_attempt_evidence';

    const oneAttempt=[...main.querySelectorAll('.quizinfo, .quizinfo p')].some(node=>
      /^Intentos permitidos\s*:\s*1$/i.test(normalize(node.textContent)));
    if(localized&&!oneAttempt)return 'single_attempt_not_confirmed';
    return null;
  }

  function gradeText(value) {
    return typeof value==='string' && /^-?\d{1,8}(?:[.,]\d{1,8})?(?:\s*\/\s*\d{1,8}(?:[.,]\d{1,8})?)?$/.test(value)
      ? value:null;
  }

  function hiddenEvidence(node) {
    if(node.closest('[hidden], [inert], [aria-hidden="true"], .d-none, .hidden, .visually-hidden, .sr-only, script, style, template, noscript'))return true;
    for(let el=node;el;el=el.parentElement){
      if(el.style?.display==='none'||['hidden','collapse'].includes(el.style?.visibility))return true;
    }
    return false;
  }

  function assignmentGrade(main,normalize) {
    const rows=[...main.querySelectorAll('.feedbacktable tr')].filter(row=>{
      const [label]=row.children;
      return row.children.length===2&&/^(Grade|Calificación)$/i.test(normalize(label.textContent))&&!hiddenEvidence(row);
    });
    if(rows.length!==1)return null;
    const cell=rows[0].children[1];
    if(hiddenEvidence(cell)||[...cell.querySelectorAll('*')].some(hiddenEvidence))return null;
    return gradeText(normalize(cell.textContent));
  }

  function assignmentAvailability(main,origin,cmid,normalize,trace) {
    const excluded='.activity-description, #intro, .intro, aside, nav, footer';
    const shortNotice=/^(?:Not a member of any group|No es miembro de ningún grupo|No perteneces? a ningún grupo)\.?$/i;
    const description=/^(?:This assignment requires submission in groups\. You are not a member of any group, so you cannot create a submission\.|Esta tarea requiere entrega por grupos\. Usted no es miem(?:br|pr)o de ningún grupo, así que no puede realizar entregas\.|Esta tarea requiere envío en grupos\. Usted no es miembro de ningún grupo, por lo que no puede crear un envío\.?)(?:$| (?:Please contact your teacher|Por favor, (?:contacte|póngase en contacto) con su profesor)\b)/i;
    if(trace)trace.groupNotice='missing';
    for(const node of main.querySelectorAll('.submissionstatustable .alert, .submissionstatustable .teamname')){
      if(hiddenEvidence(node)||node.closest(excluded))continue;
      const message=node.cloneNode(true);
      message.querySelectorAll('button[data-dismiss="alert"], button[data-bs-dismiss="alert"]').forEach(button=>button.remove());
      const value=normalize(message.textContent);
      const evidence=shortNotice.test(value)?'short':node.matches('.alert')&&description.test(value)?'description':'unrecognized';
      if(trace)trace.groupNotice=evidence;
      if(evidence!=='unrecognized')return 'group_blocked';
    }
    const add=[...main.querySelectorAll('button[type="submit"], input[type="submit"]')].some(control=>{
      if(!/^(Add submission|Agregar entrega|Añadir entrega)$/i.test(normalize(control.value||control.textContent))||
        hiddenEvidence(control)||control.matches(':disabled')||control.closest(excluded+', [aria-disabled="true"], .disabled')||
        control.hasAttribute('formaction')||control.hasAttribute('formmethod'))return false;
      const form=control.form;
      if(!form||form.method!=='get'||!main.contains(form)||hiddenEvidence(form)||form.closest(excluded))return false;
      try{
        const url=new URL(form.getAttribute('action'),origin);
        if(url.origin!==origin||url.pathname!=='/mod/assign/view.php'||url.search||url.hash||url.username||url.password)return false;
        const fields=[...form.elements].filter(field=>field.name&&!field.matches(':disabled'));
        return fields.length===2&&fields.every(field=>field.matches('input[type="hidden"]'))&&
          fields.some(field=>field.name==='id'&&field.value===cmid)&&
          fields.some(field=>field.name==='action'&&field.value==='editsubmission');
      }catch{return false;}
    });
    return add?'add_submission':undefined;
  }

  function assignmentEvaluation(main,normalize,evidence) {
    // Moodle renders the grade and its date together in the feedback table.
    const tables=[...main.querySelectorAll('.feedback .feedbacktable table, .feedback table.feedbacktable')].filter(table=>
      !hiddenEvidence(table)&&!table.closest('#intro, .intro, .activity-description, .submissionstatustable, nav, aside, form'));
    const reports=tables.map(table=>{
      const rows=[...table.rows].filter(row=>row.cells.length===2&&!hiddenEvidence(row)&&
        ![...row.cells].some(cell=>hiddenEvidence(cell)||[...cell.querySelectorAll('*')].some(hiddenEvidence)));
      const gradeRows=rows.filter(row=>/^(Grade|Calificación)$/i.test(normalize(row.cells[0].textContent)));
      const dates=rows.filter(row=>/^(Graded on|Calificado sobre)$/i.test(normalize(row.cells[0].textContent)));
      if(!gradeRows.length)return null;
      if(gradeRows.length!==1)return false;
      const text=normalize(gradeRows[0].cells[1].textContent);
      if(!text||/^[-–—]$/.test(text))return null;
      const grade=gradeText(text);
      return grade&&dates.length===1&&/\d/.test(normalize(dates[0].cells[1].textContent))?grade:false;
    }).filter(value=>value!==null);
    if(reports.length>1||reports[0]===false)throw problem('STATE_UNKNOWN',evidence);
    return reports[0];
  }

  function mooveQuizStates(list,normalize) {
    const headings=new Set();
    const cards=[];
    // Moove overrides the quiz templates with a dedicated list and paired status fields.
    for(const wrapper of list.children){
      const card=wrapper.querySelector(':scope > .rounded.border');
      const title=card?.querySelector(':scope > h4.card-title');
      if(!title||hiddenEvidence(title))continue;
      const name=normalize(title.textContent).toLowerCase();
      if(!/^(Intento|Attempt) [1-9]\d*$/i.test(name))continue;
      if(headings.has(name))return [];
      headings.add(name);
      const fields=card.querySelectorAll(':scope > .moove-summary-table.quizreviewsummary > .moove-quizreviewsummary > .moove-infobox');
      const entries=[...fields].filter(field=>[...field.children].some(label=>
        label.matches('.moove-infobox-title')&&/^(Estado|State|Status)$/i.test(normalize(label.textContent))));
      if(entries.length!==1)continue;
      const [label,value]=entries[0].children;
      if(entries[0].children.length!==2||!label.matches('h5.moove-infobox-title')||
        !value.matches('.moove-infobox-content--small')||[label,value].some(hiddenEvidence)||
        [...label.querySelectorAll('*'),...value.querySelectorAll('*')].some(hiddenEvidence))continue;
      cards.push(normalize(value.textContent));
    }
    return cards;
  }

  const quizMonths='enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
  function quizSchedule(doc,cmid,normalize,expectedCloseAt,trace) {
    const moduleMatches=positiveId(cmid)&&[...doc.body.classList].filter(c=>c.startsWith('cmid-')).join(' ')==='cmid-'+cmid;
    if(trace)trace.moduleMatches=moduleMatches;
    if(!moduleMatches&&!trace)return null;
    const campusBlock='header#page-header [data-region="header-extras-container"] .header-extra [data-activityname] > [data-region="activity-dates"]';
    const standardBlock=':is([data-for="page-activity-header"], .activity-header, [data-region="activity-information"]) [data-region="activity-dates"]';
    const blocks=[...doc.querySelectorAll(standardBlock+', '+campusBlock)].filter(n=>
      !hiddenEvidence(n)&&!n.closest('.activity-description, #intro, .description, aside, nav, footer, form'));
    if(trace)trace.header=blocks.length===1?'found':blocks.length?'multiple':'missing';
    if(blocks.length!==1)return null;
    if(trace)trace.headerLocation=doc.querySelector('#region-main')?.contains(blocks[0])?'inside_main':'outside_main';
    const block=blocks[0], campus=block.matches(campusBlock);
    if(campus){
      const titles=[...block.closest('header#page-header').querySelectorAll('.page-header-headings h1')].filter(n=>!hiddenEvidence(n));
      const title=normalize(titles[0]?.textContent??'');
      if(titles.length!==1||!title||title!==normalize(block.parentElement.getAttribute('data-activityname'))){
        if(trace)trace.header='activity_mismatch';
        return null;
      }
    }
    const labelSelector=campus?':scope > .date-item > span.date-item-label':'strong';
    const dates={}, seen=new Set();
    let invalid=false;
    if(trace){trace.opening='missing';trace.closing='missing';}
    for(const label of block.querySelectorAll(labelSelector)){
      if(hiddenEvidence(label))continue;
      const name=normalize(label.textContent).toLowerCase();
      if(!['abre:','cierra:'].includes(name))continue;
      const row=label.parentElement;
      const field=name==='abre:'?'opening':'closing';
      if(trace)trace[field]=seen.has(name)?'duplicate':'invalid';
      if(seen.has(name)||row===blocks[0]||row.querySelectorAll(campus?'span.date-item-label':'strong').length!==1||
        [...row.querySelectorAll('*')].some(hiddenEvidence)){invalid=true;seen.add(name);continue;}
      seen.add(name);
      const value=campus?normalize([...row.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join(' ')):
        normalize(row.textContent).slice(name.length).trim();
      if(campus&&(row.children.length!==1||row.firstElementChild!==label)){invalid=true;continue;}
      const parts=value.match(/^(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo), (\d{1,2}) de ([a-z]+) de (\d{4}), (\d{1,2}):(\d{2})$/i);
      if(!parts){invalid=true;continue;}
      const [,day,month,year,hour,minute]=parts;
      const monthIndex=quizMonths.indexOf(month.toLowerCase());
      // Accept the localized text only when the close minute agrees with the campus calendar in Ecuador.
      const wall=new Date(Date.UTC(+year,monthIndex,+day,+hour,+minute));
      if(+year<2000||monthIndex<0||wall.getUTCMonth()!==monthIndex||wall.getUTCDate()!==+day||
        +hour>23||+minute>59||!value.toLowerCase().startsWith(wall.toLocaleDateString('es-EC',{weekday:'long',timeZone:'UTC'})+',')){invalid=true;continue;}
      dates[name]=wall.getTime()+5*3600e3;
      if(trace)trace[field]=field==='opening'?(dates[name]>Date.now()?'future':'elapsed'):'valid';
    }
    const openAt=dates['abre:'],closeAt=dates['cierra:'];
    const ordered=openAt<closeAt;
    const matches=Math.floor(expectedCloseAt/60000)*60000===closeAt;
    if(trace){
      trace.dateOrder=openAt&&closeAt?(ordered?'valid':'invalid'):'unknown';
      trace.calendarClose=expectedCloseAt==null?'missing':!closeAt?'unknown':matches?'match':'mismatch';
    }
    return !invalid&&moduleMatches&&ordered&&matches?{openAt}:null;
  }

  function recognize(doc, mod, userId, origin, cmid, expectedCloseAt, traceActivity=false) {
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
    let done,absence,grade,available,evaluationGrade,quizOpenAt,quizOpening,assignAvailability,assignGroup;
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
      if(done&&pageView==='view'&&main&&!evidence.mainBusy)grade=assignmentGrade(main,normalize);
      const ready=pageView==='view'&&main&&!main.closest('[aria-busy="true"]');
      const moduleMatches=!!positiveId(cmid)&&[...doc.body.classList].filter(name=>name.startsWith('cmid-')).join(' ')==='cmid-'+cmid;
      if(traceActivity)assignGroup={view:pageView,hasMain:!!main,moduleMatches,eligible:!!(ready&&moduleMatches&&!done),
        hasStatusTable:!!main?.querySelector('.submissionstatustable'),groupNotice:'not_checked',state:done?'submitted':'no_submission'};
      if(!done&&ready){
        if(moduleMatches)assignAvailability=assignmentAvailability(main,origin,cmid,normalize,assignGroup);
        const submissionRows=[...main.querySelectorAll('.submissionstatustable tr')].filter(row=>row.cells.length===2&&
          /^(Submission status|Estado de la entrega|Estado de entrega)$/i.test(normalize(row.cells[0].textContent))&&
          !hiddenEvidence(row)&&[...row.cells].every(cell=>!hiddenEvidence(cell)&&![...cell.querySelectorAll('*')].some(hiddenEvidence)));
        if(submissionRows.length===1&&/^(Todavía no se han realizado envíos|No submissions have been made yet|Nothing has been submitted for this assignment|No attempt|Sin entrega|No entregado)\.?$/i.test(normalize(submissionRows[0].cells[1].textContent))) {
          evaluationGrade=assignmentEvaluation(main,normalize,evidence);
          if(evaluationGrade&&(!/^[1-9]\d*$/.test(cmid||'')||
            [...doc.body.classList].filter(name=>name.startsWith('cmid-')).join(' ')!=='cmid-'+cmid))
            throw problem('VIEW_MISMATCH',evidence);
        }
      }
      if(assignGroup)assignGroup.result=evaluationGrade?'graded_without_submission':assignAvailability??'none';
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
      const quizMain=doc.querySelector('#region-main')||main;
      const lists=[...quizMain?.querySelectorAll('.moove-attempts-list')??[]];
      if(lists.length){
        evidence.attemptCardLists=lists.length;
        const ids=[...doc.body.classList].filter(name=>name.startsWith('cmid-'));
        if(pageView==='view'&&/^[1-9]\d*$/.test(cmid||'')&&ids.length===1&&ids[0]==='cmid-'+cmid&&
          !quizMain.closest('[aria-busy="true"]')&&lists.length===1&&!hiddenEvidence(lists[0])&&
          !lists[0].closest('.activity-description, .description, .intro, #intro, .quizteacherfeedback, .quizgradefeedback, nav, aside, form')){
          const cardStates=mooveQuizStates(lists[0],normalize);
          evidence.attemptCardStates=cardStates.length;
          states.push(...cardStates);
        }
      }
      if(states.some(t=>/^(Finalizado|Finalizados|Finished|Terminados|Terminado)$/i.test(t)))done=true;
      else if(states.some(t=>/^(En curso|In progress|Nunca enviado|Never submitted|Vencido|Overdue)$/i.test(t)))done=false;
      else {
        const scope=main||doc.body;
        const noAttempts=[...scope.querySelectorAll('p, h3, .box')].some(n=>!hiddenEvidence(n)&&/^(No attempts have been made(?: yet)?\.?|No se han realizado intentos\.?|Todavía no se han hecho intentos\.?)$/i.test(normalize(n.textContent)));
        const hasAttemptLink=[...scope.querySelectorAll('a[href]')].some(link=>{
          try{
            const url=new URL(link.getAttribute('href'),`${origin}/mod/quiz/view.php`);
            return url.origin===origin&&/^\/mod\/quiz\/(attempt|review|summary)\.php$/.test(url.pathname);
          }catch{return false;}
        });
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
        const localized=/^Intento de cuestionario$/i.test(label);
        if(localized||quizStart==='first'){
          const reason=localizedFirstAttemptReason(start,actionUrl,main,origin,cmid,normalize,hasAttemptLink,localized);
          if(reason){evidence.quizStartReason=reason;quizStart='other';}
          else quizStart='first';
        }
        const notices=[...main?.querySelectorAll('.quizattempt p, .quizattempt .alert, .quizinfo p, .quizinfo .alert')??[]]
          .filter(n=>!hiddenEvidence(n));
        const restriction=pageView==='view'&&notices.some(n=>
          /^(?:This quiz is currently not available|(?:Este|El) cuestionario no está disponible en este momento|This quiz is closed|Este cuestionario está cerrado|This quiz is not yet open|(?:Este|El) cuestionario aún no está abierto|Access restricted|Acceso restringido)\.?$/i.test(normalize(n.textContent)));
        const ambiguousNotice=[...main?.querySelectorAll('.quizattempt p, .quizattempt .alert, .quizinfo .alert, .availabilityinfo')??[]]
          .some(n=>!hiddenEvidence(n)&&normalize(n.textContent)!=='');
        if(!start && main?.querySelector('.quizattempt .alert'))quizStart='restricted';
        evidence.quizStart=quizStart;
        const explicitAbsence=noAttempts && quizStart==='missing';
        available=pageView==='view'&&quizStart==='first'&&!restriction&&!ambiguousNotice;
        if(!table&&!summaries.length&&!lists.length&&!hasAttemptLink&&!evidence.mainBusy&&
            (restriction||explicitAbsence||available)){
          done=false;
          const temporal=/^(?:This quiz is currently not available|(?:Este|El) cuestionario no está disponible en este momento|This quiz is not yet open|(?:Este|El) cuestionario aún no está abierto)\.?$/i;
          const temporalNotice=notices.some(n=>n.closest('.quizattempt')&&temporal.test(normalize(n.textContent)));
          const conflictingNotice=[...main?.querySelectorAll('.availabilityinfo, .quizattempt p, .quizattempt .alert, .quizinfo .alert')??[]]
            .some(n=>{const text=normalize(n.textContent);return !hiddenEvidence(n)&&text!==''&&!temporal.test(text);});
          const qualifies=restriction&&temporalNotice&&!start&&!conflictingNotice;
          if(traceActivity&&restriction)quizOpening={
            restriction:conflictingNotice?'other_or_conflicting':temporalNotice?'temporal_notice':'unrecognized_location',
            attempts:noAttempts?'explicitly_none':'absence_not_confirmed',
            startControl:!!start,
          };
          if(qualifies||quizOpening){
            const schedule=quizSchedule(doc,cmid,normalize,expectedCloseAt,quizOpening);
            if(qualifies&&schedule?.openAt>Date.now())quizOpenAt=schedule.openAt;
          }
          absence=restriction?(quizOpenAt?(noAttempts?'quiz_not_yet_open':'quiz_scheduled'):'quiz_unavailable'):'quiz_no_attempts';
        }else throw problem(table||summaries.length||lists.length?'STATE_UNKNOWN':'SELECTOR_MISSING',evidence);
      }
      if(done&&pageView==='view'&&main&&!main.closest('[aria-busy="true"]')&&positiveId(cmid)&&
        [...doc.body.classList].filter(name=>name.startsWith('cmid-')).join(' ')==='cmid-'+cmid){
        const headings=[...main.querySelectorAll('.generalbox.feedback > :is(h2,h3,h4,h5,h6)')].filter(node=>
          !hiddenEvidence(node)&&![...node.querySelectorAll('*')].some(hiddenEvidence)&&
          !node.closest('#intro, .intro, .activity-description, .description, .quizteacherfeedback, .quizgradefeedback, aside, nav, form'));
        const values=headings.map(node=>normalize(node.textContent).match(
          /^(?:Su calificación final en este cuestionario es|Your final grade for this quiz is)\s+(-?\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?)\.?$/i)?.[1]).filter(Boolean);
        if(values.length===1)grade=gradeText(values[0]);
      }
    }else throw problem('HTML_INCOMPATIBLE');
    return {done,source:'moodle',t:Date.now(),...(absence?{absence}:{}),...(available?{available:true}:{}),...(grade?{grade}:{}),...(evaluationGrade?{evaluationGrade}:{}),...(quizOpenAt?{quizOpenAt}:{}),...(quizOpening?{quizOpening}:{}),...(assignAvailability?{assignAvailability}:{}),...(assignGroup?{assignGroup}:{})};
  }
  const categories = Object.freeze(['proximas','atrasadas','entregadas','pendientes','desconocidas']);
  const activityTypes = Object.freeze(Object.keys(mods));
  const titleLimit = 80;
  const defaultTitle = 'Mis actividades · Campus UG Revamp';
  const datePresets=Object.freeze(['next-week','next-month','last-week','last-month']);

  function localDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const [year,month,day]=value.split('-').map(Number);
    const date=new Date(0);
    date.setFullYear(year,month-1,day);
    date.setHours(0,0,0,0);
    return year>0&&date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
  }

  function dateRange(value) {
    if(datePresets.includes(value?.preset))return {preset:value.preset};
    const from=localDate(value?.from)?value.from:'', to=localDate(value?.to)?value.to:'';
    return (from||to)&&(!from||!to||from<=to)?{from,to}:null;
  }

  function dateBounds(range, now=new Date()) {
    if(!range)return null;
    let from,to;
    if(range.preset){
      const today=new Date(now);
      today.setHours(0,0,0,0);
      const other=new Date(today), future=range.preset.startsWith('next-'), direction=future?1:-1;
      if(range.preset.endsWith('-week'))other.setDate(today.getDate()+7*direction);
      else{
        other.setDate(1);
        other.setMonth(other.getMonth()+direction+1,0);
        other.setDate(Math.min(other.getDate(),today.getDate()));
      }
      [from,to]=future?[today,other]:[other,today];
    }else{
      from=localDate(range.from);
      to=localDate(range.to);
    }
    if(to)to.setDate(to.getDate()+1);
    return {start:from?from.getTime()/1000:-Infinity,end:to?to.getTime()/1000:Infinity};
  }

  function filterPresentationRows(rows,types,bounds) {
    return rows.filter(({it})=>types.includes(it.mod)&&(!bounds||
      Number.isFinite(it.due)&&it.due>0&&it.due>=bounds.start&&it.due<bounds.end));
  }

  function presentation(value) {
    const saved = value?.schema === 1 ? value : {};
    const title = typeof saved.title === 'string' ? saved.title.slice(0,titleLimit).trim() : '';
    return {
      schema:1,
      position:['top','bottom','hidden'].includes(saved.position) ? saved.position : 'hidden',
      ...(saved.position==='hidden'&&saved.restoreStatusBelow===true?{restoreStatusBelow:true}:{}),
      mode:saved.mode === 'custom' ? 'custom' : 'tabs',
      categories:Array.isArray(saved.categories) ? categories.filter(id=>saved.categories.includes(id)) : ['proximas'],
      visibleTabs:Array.isArray(saved.visibleTabs) ? categories.filter(id=>saved.visibleTabs.includes(id)) : [...categories],
      activityTypes:Array.isArray(saved.activityTypes) ? activityTypes.filter(id=>saved.activityTypes.includes(id)) : [...activityTypes],
      dateRange:dateRange(saved.dateRange),
      title:title || defaultTitle,
      size:['compact','normal','wide'].includes(saved.size) ? saved.size : 'normal',
      limit:[5,10,30].includes(saved.limit) ? saved.limit : null,
      course:typeof saved.course === 'string' && /^\d{1,20}$/.test(saved.course) ? saved.course : 'all',
      autoRefreshMinutes:[0,10,15,30].includes(saved.autoRefreshMinutes) ? saved.autoRefreshMinutes : 10,
      appearance:['auto','light','dark'].includes(saved.appearance) ? saved.appearance : 'auto',
    };
  }

  function matchesCategory(category, bucket) {
    return category === 'pendientes' ? ['proximas','atrasadas','pendientes'].includes(bucket) : category === bucket;
  }

  function presentationList(rows, selected) {
    const result = new Map();
    for(const {it,b} of rows){
      if(selected.some(category=>matchesCategory(category,b)))result.set(it.mod+':'+it.cmid,it);
    }
    const ascending = selected.some(id=>id==='proximas'||id==='pendientes');
    return [...result.values()].sort((a,b)=>ascending ? a.due-b.due : b.due-a.due);
  }

  globalThis.UGCore = { CONFIG, mods, item, empty, clean, needsCheck, selectorUpgrade, verificationDecision, allowsRequest, closeEvidence, identity, ERROR_LABELS, problem, retryAfter, recoveryWait, safeDetails, failureRecord, cleanFailures, checkIdentity, recognizeFeedback, recognize, gradeText, readState, mergeMonth, completion, categories, titleLimit, presentation, matchesCategory, presentationList };
  Object.assign(globalThis.UGCore,{datePresets,dateRange,dateBounds,filterPresentationRows});
  if(typeof module !== 'undefined') module.exports = globalThis.UGCore;
})();
