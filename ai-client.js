(function(){
'use strict';
const normalize=url=>{const u=new URL(url.trim());if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('ใช้ URL HTTPS ของ Worker เท่านั้น');return u.origin;};
let endpoint;try{endpoint=normalize(localStorage.getItem('kitchen-ai-endpoint')||window.KITCHEN_AI_ENDPOINT||'');}catch{endpoint='';}
let waiting=null;
function setup(){if(waiting)return waiting;
 const d=document.getElementById('aiSettings');document.getElementById('aiEndpoint').value=endpoint;document.getElementById('aiSettingsError').textContent='';
 waiting=new Promise((resolve,reject)=>{
 const close=()=>{waiting=null;};
 const cancel=()=>{d.close();close();reject(Error('ยังไม่ได้เชื่อม AI รูปบิลยังอยู่ในครัว'));};
 document.getElementById('aiCancel').onclick=cancel;d.oncancel=e=>{e.preventDefault();cancel();};
 document.getElementById('aiSettingsForm').onsubmit=e=>{e.preventDefault();try{endpoint=normalize(document.getElementById('aiEndpoint').value);localStorage.setItem('kitchen-ai-endpoint',endpoint);d.close();close();resolve();}catch(err){document.getElementById('aiSettingsError').textContent=err.message;}};
 });d.showModal();return waiting;
}
async function encode(blob){
 const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
 try{const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const c=canvas.getContext('2d',{alpha:false});c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.9);if(data.length>1900000)throw Error('รูปใหญ่เกินไป กรุณาถ่ายเฉพาะบิล');return data;}finally{bitmap.close();}
}
async function read(blob){return requestImage({image:await encode(blob)});}
async function readFromURL(imageUrl){return requestImage({imageUrl});}
async function requestImage(payload){if(!endpoint)await setup();
 let response;try{response=await fetch(endpoint+'/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(75000)});}catch(e){throw Error('ติดต่อ AI ไม่ได้ กรุณาตรวจ Worker URL / การเปิด workers.dev / อินเทอร์เน็ต (ไม่มีการลองซ้ำอัตโนมัติ)');}
 const result=await response.json().catch(()=>({error:'Worker ไม่ได้ส่งผล JSON กรุณาติดตั้งโค้ดอ่านบิลก่อน'}));
 if(!response.ok){throw Error(result.error||'AI อ่านบิลไม่สำเร็จ');}
 const r=result.receipt;if(!r||!r.readable||!r.table||!r.bill||!Array.isArray(r.items)||!r.items.length||r.items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1||typeof i.name!=='string'))throw Error('ข้อมูล AI ไม่ครบ กรุณาดูรูปบิล');
 const p={table:ReceiptParser.normalizeTable(r.table),bill:r.bill,items:r.items.map(i=>({...i,rawName:i.name})),warnings:[...(r.warnings||[]),'AI อ่านจากภาพ • ตรวจรูปต้นฉบับ โดยเฉพาะข้อมูลแพ้อาหาร'],rawText:r.items.map(i=>i.quantity+' '+i.name+' '+(i.modifiers||[]).join(' / ')).join('\n')};
 // Cost is an estimate from returned token usage, excludes tax/FX/infra. The provider Usage page is authoritative.
 if(result.usage){try{const costs=JSON.parse(localStorage.getItem('kitchen-ai-costs')||'[]');costs.push({at:Date.now(),...result.usage,estimatedUsd:result.cached?0:result.usage.estimatedUsd,cached:!!result.cached});localStorage.setItem('kitchen-ai-costs',JSON.stringify(costs.slice(-500)));}catch{}}
 return p;
}
window.KitchenAI={read,readFromURL,setup};
document.getElementById('aiSetup')?.addEventListener('click',()=>setup().catch(()=>{}));
})();
