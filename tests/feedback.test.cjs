'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {feedbackSchedule,feedbackCategory}=require('./feedback-prototype.cjs');
const origin='https://example.test';
const feedbackWindow=(events,origin,cmid)=>feedbackSchedule(events,origin).get(cmid)??{openAt:null,closeAt:null};
const event={modulename:'feedback',eventtype:'close',timestart:2000,timesort:2000,url:'/mod/feedback/view.php?id=1'};
const C=require('../core.js');

test('Las marcas antiguas positivas se conservan y las negativas requieren una declaración explícita',()=>{
  const data={'p:manual:feedback:1':{done:true},'p:manual:feedback:2':{done:false},
    'p:manual:assign:1':{done:false},'p:history':{schema:1,changes:[
      {type:'manual',key:'feedback:1',value:{done:false}},
      {type:'manual',key:'feedback:3',value:{participation:'not_completed',done:false}},
      {type:'manual',key:'feedback:4',value:{participation:'completed',done:true}},
      {type:'manual',key:'feedback:4',value:null}
    ]}};
  assert.deepEqual(C.readState(data,'p:',origin).manual,{'assign:1':false,'feedback:3':'no'});
  assert.equal(data['p:manual:feedback:1'].done,true);
});

test('El motor valida destino e identidad del módulo y conserva apertura sin vencimiento al recargar',()=>{
  const open={...event,id:909,instance:1,eventtype:'open'};
  const item=C.item(open,origin);
  assert.equal(item.cmid,'1');assert.equal(item.id,'909');assert.equal(item.due,null);
  assert.deepEqual(C.clean({schema:2,months:{'2026-11':{t:2,items:[item]}}},origin,3)
    .months['2026-11'].items[0],{...item,synced:2});
  assert.equal(C.item({...open,instance:2},origin),null);
  assert.equal(C.item({...open,visible:0},origin),null);
  assert.equal(C.allowsRequest(origin+'/mod/feedback/view.php?id=1',{},origin),true);
  for(const path of ['complete.php?id=1','view.php?id=1&id=2','view.php?id=1&courseid=2'])
    assert.equal(C.allowsRequest(origin+'/mod/feedback/'+path,{},origin),false);
  assert.equal(C.allowsRequest(origin+'/mod/feedback/view.php?id=1',{method:'POST'},origin),false);
});

test('Feedback requiere cierre explícito y deduplica eventos idénticos',()=>{
  const open={...event,eventtype:'open',timestart:1000,timesort:1000};
  assert.deepEqual(feedbackWindow([open],origin,'1'),{openAt:1000000,closeAt:null});
  assert.deepEqual(feedbackWindow([open,event,event],origin,'1'),{openAt:1000000,closeAt:2000000});
  assert.deepEqual(feedbackWindow([event,{...event,timestart:3000,timesort:3000}],origin,'1'),{conflict:true});
  assert.deepEqual(feedbackWindow([event,{...event,eventtype:'open'}],origin,'1'),{conflict:true});
  const exported={...event,url:undefined,instance:1,viewurl:origin+'/calendar/view.php?view=day'};
  assert.deepEqual(feedbackWindow([exported],origin,'1'),{openAt:null,closeAt:2000000});
});
test('Feedback rechaza eventos con fechas o destinos no confirmados',()=>{
  const events=[{...event,eventtype:'due'},{...event,timesort:42},{...event,url:'/mod/feedback/view.php?id=1&id=2'},
    {...event,url:'/mod/feedback/complete.php?id=1'},{...event,url:'https://elsewhere.test/mod/feedback/view.php?id=1'},
    {...event,url:'/mod/feedback/view.php?id=2'},{...event,visible:0},
    {...event,url:undefined,instance:2},{...event,instance:1,action:{url:'https://elsewhere.test/mod/feedback/view.php?id=1'}}];
  assert.deepEqual(feedbackWindow(events,origin,'1'),{openAt:null,closeAt:null});
});
test('Feedback distingue disponibilidad, participación y marcas manuales',()=>{
  assert.equal(feedbackCategory('available',1000,999),'proximas');
  assert.equal(feedbackCategory('available',1000,1001),'atrasadas');
  assert.equal(feedbackCategory('available',null,1001),'pendientes');
  assert.equal(feedbackCategory('closed',1000,1001),'sin_verificar');
  assert.equal(feedbackCategory('unknown',null,1001,true),'entregadas');
  assert.equal(feedbackCategory('completed',1000,1001,false),'pendientes');
});
