'use strict';

// Sandbox only. No fetch, storage or form interaction.
function feedbackSchedule(events, origin) {
  const byModule=new Map();
  for(const event of events){
    if(event?.modulename!=='feedback'||!['open','close'].includes(event.eventtype)||event.visible===0)continue;
    if(event.instance!=null&&!Number.isSafeInteger(event.instance))continue;
    const target=event.action?.url??event.url;
    // Moodle 4.5 exports the course-module ID as instance when it has a module proxy.
    let cmid=String(event.instance??'');
    if(target!=null){
      let url;
      try{url=new URL(target,origin);}catch{continue;}
      if(url.origin!==origin||url.pathname!=='/mod/feedback/view.php'||url.username||url.password||url.hash||
        url.searchParams.size!==1)continue;
      const linkedId=url.searchParams.get('id');
      if(cmid&&cmid!==linkedId)continue;
      cmid=linkedId;
    }
    if(!/^[1-9]\d*$/.test(cmid??'')||!Number.isSafeInteger(event.timestart)||event.timestart<=0||event.timestart>8640000000000||
      (event.timesort!=null&&event.timesort!==event.timestart))continue;
    if(!byModule.has(cmid))byModule.set(cmid,{open:new Set(),close:new Set()});
    const bounds=byModule.get(cmid);
    bounds[event.eventtype].add(event.timestart*1000);
  }
  return new Map([...byModule].map(([cmid,{open,close}])=>{
    const [openAt=null]=open, [closeAt=null]=close;
    const conflict=open.size>1||close.size>1||(openAt!=null&&closeAt!=null&&openAt>=closeAt);
    return [cmid,conflict?{conflict:true}:{openAt,closeAt}];
  }));
}

function feedbackCategory(state, closeAt, now, manual) {
  if(manual!==undefined)return manual?'entregadas':'pendientes';
  if(state==='completed')return 'entregadas';
  if(state==='available'||state==='in_progress'){
    return closeAt==null?'pendientes':closeAt>now?'proximas':'atrasadas';
  }
  return 'sin_verificar';
}

function recognizeFeedback(doc, {core,...context}) {return core.recognizeFeedback(doc,context);}

if(typeof module!=='undefined'&&module.exports)module.exports={feedbackSchedule,feedbackCategory,recognizeFeedback};
