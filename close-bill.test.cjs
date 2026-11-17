const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),J=require('./photo-jobs.js');
const original=[{id:'a',text:'1 × Pad Thai',done:false,raw:'Pad Thai',metadata:{x:1,y:2}}];
const reordered=[{metadata:{y:2,x:1},done:false,raw:'Pad Thai',text:'1 × Pad Thai',id:'a'}];
assert.equal(J.sameItems(original,reordered),true);assert.equal(J.fingerprintItems(original),J.fingerprintItems(reordered));
for(const patch of [{text:'2 × Pad Thai'},{done:true},{id:'b'},{raw:'different'}])assert.equal(J.sameItems(original,[{...original[0],...patch}]),false);
const source=fs.readFileSync(__dirname+'/photo-flow.js','utf8');const a=source.indexOf(" $('board').onclick=async"),b=source.indexOf(';setInterval(render',a);const handler=source.slice(a,b)+';';
async function clickClose({items=original,latestItems=reordered,confirm=true,status='done',completed=false}={}){
 const board={},writes=[],messages=[];const displayed={id:'test',items,ocrStatus:status,createdAtMs:Date.now()-10000,notes:'',completed:false};
 const latest={...displayed,items:latestItems,completed};const context={$:()=>board,orders:[displayed],locked:new Set(),render(){},online:true,db:{},created:id=>id,PhotoJobs:J,message:s=>messages.push(s),window:{confirm:()=>confirm},f:{serverTimestamp:()=>0,runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(ref,patch)=>writes.push(patch)})}};
 vm.runInNewContext(handler,context);await board.onclick({target:{closest:()=>({dataset:{close:'test'}})}});return {writes,messages,context};
}
(async()=>{
 let r=await clickClose();assert.equal(r.writes.length,1);assert.equal(r.writes[0].completed,true);assert.equal('items' in r.writes[0],false);assert.ok(r.messages.includes('ปิดบิลแล้ว ✓'));
 r=await clickClose({confirm:false});assert.equal(r.writes.length,0);
 r=await clickClose({latestItems:[{...original[0],text:'2 × Pad Thai'}]});assert.equal(r.writes.length,0);assert.match(r.messages[0],/รายการเปลี่ยน/);
 r=await clickClose({items:[],latestItems:[],status:'ai_reading:job:9999999999999'});assert.equal(r.writes[0].completed,true);assert.equal(r.writes[0].ocrStatus,'closed');assert.equal(J.owns({...r.writes[0]},'ai_reading:job:9999999999999'),false);
 r=await clickClose({completed:true});assert.equal(r.writes.length,0);assert.match(r.messages[0],/บิลนี้ปิดแล้ว/);
 console.log('PASS: full close-click handler accepts reordered Firestore map keys, retains unchecked items, handles confirmation/cancel, blocks real changes, closes unread bills, fences late AI and prevents repeated close.');
})().catch(e=>{console.error(e);process.exitCode=1;});
