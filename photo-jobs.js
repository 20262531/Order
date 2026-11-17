(function(root){
'use strict';
const prefix='ai_reading:';
function leaseExpiry(status){if(typeof status!=='string'||!status.startsWith(prefix))return 0;const n=Number(status.slice(status.lastIndexOf(':')+1));return Number.isFinite(n)?n:0;}
function isReading(order,now=Date.now()){return leaseExpiry(order.ocrStatus)>now;}
function eligible(order,now=Date.now()){return !order.completed&&!order.softDeleted&&!!order.imageUrl&&!(order.items||[]).length&&(order.ocrStatus==='ai_queued'||(String(order.ocrStatus||'').startsWith(prefix)&&leaseExpiry(order.ocrStatus)<=now));}
function claim(order,token,now=Date.now()){if(!eligible(order,now))return null;return prefix+token+':'+(now+180000);}
function owns(order,status){return !order.completed&&!order.softDeleted&&order.ocrStatus===status;}
function closePatch(order,now=Date.now()){
 const duration=Math.max(0,now-Number(order.createdAtMs||now)),exceeded=!!order.exceeded30m||duration>1800000;
 const remaining=(order.items||[]).filter(i=>!i.done).length;
 const bypass=!(order.items||[]).length||remaining>0;
 return {completed:true,completedAtMs:now,completionDurationMs:duration,exceeded30m:exceeded,exceeded30mAtMs:order.exceeded30mAtMs||(exceeded?now:0),ocrStatus:String(order.ocrStatus||'').startsWith(prefix)||order.ocrStatus==='ai_queued'?'closed':order.ocrStatus,notes:(order.notes||'')+(bypass?'\nพนักงานยืนยันปิดบิลก่อนเช็กรายการครบ / ตรวจจากรูปต้นฉบับ':'')};
}
const api={isReading,eligible,claim,owns,closePatch};if(typeof module!=='undefined')module.exports=api;else root.PhotoJobs=api;
})(typeof window!=='undefined'?window:globalThis);
