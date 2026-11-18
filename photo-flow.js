(async()=>{
'use strict';
const $=id=>document.getElementById(id),mode=document.body.dataset.mode,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let f,db,store,sapi,online=false,orders=[],working=false,pending=null,localDB,locked=new Set(),sound=false,known=null;
const base='https://www.gstatic.com/firebasejs/10.12.5/';
function connectionState(state){$('connection').setAttribute('data-state',state);}
function message(s){if($('progress'))$('progress').textContent=s;else{ $('toast').textContent=s;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,5000);}}
try{const [a,b,c]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js'),import(base+'firebase-storage.js')]);f=b;sapi=c;const app=a.initializeApp(window.LAYA_FIREBASE_CONFIG,'photo-kitchen');db=window.LAYA_FIRESTORE_DATABASE_ID?f.getFirestore(app,window.LAYA_FIRESTORE_DATABASE_ID):f.getFirestore(app);store=c.getStorage(app);online=navigator.onLine;connectionState(online?'syncing':'offline');$('connection').textContent=online?'กำลังเชื่อมข้อมูลสด…':'ออฟไลน์ • รูปค้างส่งอยู่ในเครื่อง';}catch(e){connectionState('offline');$('connection').textContent='เชื่อมต่อไม่ได้: '+e.message+' — ตรวจอินเทอร์เน็ต แล้วรีเฟรช';return;}
const created=id=>f.doc(db,'orders',id);
function blank(id){const t=Date.now();return {billNo:'',tableNo:'',hostessName:'Photo Hostess',guestName:'',notes:'',imageUrl:'',rawText:'',readingText:'',items:[],ocrStatus:'ai_queued',completed:false,softDeleted:false,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp(),createdAtMs:t,completedAtMs:0,completionDurationMs:0,exceeded30m:false,exceeded30mAtMs:0,alertPhrase:'ออเดอร์ยังไม่เสร็จนะคะเชฟ'};}
async function extract(blob){
 if(!window.KitchenAI)throw Error('ยังไม่ได้โหลดตัวเชื่อม AI กรุณารีเฟรชหน้าเว็บ');
 if(mode==='hostess'&&$('aiQueueStatus'))$('aiQueueStatus').textContent='AI กำลังอ่านเบื้องหลัง • ถ่ายบิลถัดไปได้';
 return blob?.imageUrl?await KitchenAI.readFromURL(blob.imageUrl):await KitchenAI.read(blob);
}

async function readInto(id,blob,expectedItems=null,claimStatus=null){let parsed;try{parsed=await extract(blob);if(parsed.warnings.some(w=>w.includes('หลายค่า')))throw Error('พบหลายบิล/หลายโต๊ะในรูป กรุณาเปิดรูปต้นฉบับและถ่ายบิลเดียวให้ชัด');if(!parsed.items.length)throw Error('อ่านจำนวนและเมนูไม่ได้ กรุณาดูรูปต้นฉบับหรืออ่านใหม่');await f.runTransaction(db,async tx=>{const ref=created(id),s=await tx.get(ref);if(!s.exists())throw Error('ไม่พบบิล');const o=s.data();if(claimStatus&&!PhotoJobs.owns(o,claimStatus))return;if(o.completed||o.softDeleted)throw Error('บิลปิดแล้ว');if(o.items?.length){if(expectedItems===null)return;if(PhotoJobs.fingerprintItems(o.items)!==expectedItems)throw Error('มีคนเปลี่ยนรายการระหว่างอ่าน กรุณาตรวจข้อมูลล่าสุด');}const lines=parsed.items.map((i,n)=>({id:id+'-'+n,text:`${i.quantity} × ${i.name}${i.package?' ['+i.package+']':''}${i.course?' · คอร์ส '+i.course:''}${i.modifiers.length?'\n↳ '+i.modifiers.join(' / '):''}`,raw:i.rawName,done:false}));tx.update(ref,{tableNo:ReceiptParser.normalizeTable(o.tableNo||parsed.table||''),billNo:o.billNo||parsed.bill||'',items:lines,rawText:parsed.rawText,readingText:lines.map(i=>i.text).join('\n'),ocrStatus:'done',notes:'อ่านจากภาพอัตโนมัติ • ตรวจรูปประกอบก่อนทำ\n'+parsed.warnings.join('\n'),updatedAt:f.serverTimestamp()});});return parsed;}catch(e){await f.runTransaction(db,async tx=>{const ref=created(id),s=await tx.get(ref);if(s.exists()&&!s.data().items?.length&&!s.data().completed&&(!claimStatus||PhotoJobs.owns(s.data(),claimStatus)))tx.update(ref,{ocrStatus:'error',rawText:parsed?.rawText||'',notes:'อ่าน AI ไม่สำเร็จ: '+String(e.message||'ไม่ทราบสาเหตุ').slice(0,800)+'\nใช้รูปต้นฉบับตรวจสอบก่อนทำอาหาร',updatedAt:f.serverTimestamp()});}).catch(()=>{});throw e;}}
// Shared Firestore queue. Either Hostess or Kitchen may claim a job, never both at once.
let queueOrders=[],queueBusy=false,queueConnected=false;
function queueLabel(){if($('aiQueueStatus')){const waiting=queueOrders.filter(o=>PhotoJobs.eligible(o)||PhotoJobs.isReading(o)).length;$('aiQueueStatus').textContent=waiting?`คิวอ่าน AI · ${waiting} บิล`:'';}}
async function pumpQueue(){
 queueLabel();if(queueBusy||!queueConnected||!navigator.onLine||!window.KitchenAI)return;
 const candidate=queueOrders.filter(o=>PhotoJobs.eligible(o)).sort((a,b)=>a.createdAtMs-b.createdAtMs)[0];if(!candidate)return;
 queueBusy=true;const token=crypto.randomUUID();let claimed=null,failed=false;
 try{await f.runTransaction(db,async tx=>{claimed=null;const ref=created(candidate.id),snap=await tx.get(ref);if(!snap.exists())return;const next=PhotoJobs.claim(snap.data(),token);if(!next)return;claimed={...snap.data(),id:candidate.id,status:next};tx.update(ref,{ocrStatus:next,notes:'รูปส่งเข้าครัวแล้ว • AI กำลังอ่านเบื้องหลัง',updatedAt:f.serverTimestamp()});});
 if(claimed){await readInto(claimed.id,{imageUrl:claimed.imageUrl},null,claimed.status);}
 }catch(e){failed=true;if($('aiQueueStatus'))$('aiQueueStatus').textContent='บิล '+(claimed?.tableNo||candidate.tableNo||'ล่าสุด')+' อ่านไม่สำเร็จ • ดูสาเหตุที่หน้าครัว';}
 finally{queueBusy=false;if(claimed&&!failed)setTimeout(pumpQueue,200);}
}
f.onSnapshot(f.query(f.collection(db,'orders'),f.where('completed','==',false)),{includeMetadataChanges:true},snap=>{queueConnected=!snap.metadata.fromCache;connectionState(!navigator.onLine?'offline':queueConnected?'live':'syncing');if(mode==='hostess')$('connection').textContent=!navigator.onLine?'ออฟไลน์ • เก็บรูปไว้ในเครื่อง':queueConnected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ…';queueOrders=snap.docs.map(d=>({...d.data(),id:d.id}));queueLabel();pumpQueue();},()=>{queueConnected=false;connectionState('offline');$('connection').textContent='เชื่อมข้อมูลไม่ได้ • รอตรวจเครือข่าย';if($('aiQueueStatus'))$('aiQueueStatus').textContent='คิว AI รอเชื่อมต่อ • รูปที่ส่งแล้วไม่หาย';});
setInterval(pumpQueue,15000);window.addEventListener('online',()=>{connectionState('syncing');$('connection').textContent='กำลังเชื่อมข้อมูลสด…';pumpQueue();});window.addEventListener('offline',()=>{connectionState('offline');$('connection').textContent=mode==='hostess'?'ออฟไลน์ • รูปค้างส่งอยู่ในเครื่อง':'ออฟไลน์ • รอเชื่อมก่อนบันทึก';});
if(mode==='hostess'){
 const outbox=await window.PhotoOutbox.open();
 const save=value=>outbox.saveDraft(value);
 function uploadButton(){
  $('fileName').textContent=pending?.file?.name || 'รูปบิล';
  $('removeDraft').disabled=working || !pending || !!pending.attempted || !!pending.published;
  $('nextPhoto').disabled=working || !!pending;
  const b=$('upload');b.hidden=!pending;b.disabled=working;b.textContent=working?'กำลังเข้าคิว…':'ส่งเข้าครัว';b.setAttribute('aria-busy',String(working));}

 pending=await outbox.draft();
 if(pending){$('preview').src=URL.createObjectURL(pending.file);$('preview').hidden=false;$('upload').disabled=false;message('มีรูปที่เลือกไว้แล้ว ตรวจภาพแล้วกดส่งเข้าคิว');}
 uploadButton();
 $('nextPhoto').onclick=()=>$('camera').click();
 $('removeDraft').onclick=async()=>{
  if(working || $('camera').disabled || !pending || pending.attempted || pending.published)return;
  working=true;
  $('camera').disabled=true;
  uploadButton();
  try{
   await outbox.discardDraft(pending.id);
   pending=null;
   if($('preview').src)URL.revokeObjectURL($('preview').src);
   $('preview').hidden=true;
   $('preview').removeAttribute('src');
   message('');
  }catch(e){message('ลบรูปไม่ได้: '+e.message);}
  finally{working=false;$('camera').disabled=false;uploadButton();}
 };
 $('inspectDraft').onclick=()=>{
  if(!pending)return;
  $('draftImage').src=$('preview').src;
  $('draftPicture').showModal();
 };
 let uploading=false;
 async function uploadList(){const jobs=await outbox.list();
  $('waitingCount').textContent=jobs.filter(job=>job.status==='waiting').length;
  $('sendingCount').textContent=jobs.filter(job=>job.status==='uploading').length;
  $('failedCount').textContent=jobs.filter(job=>job.status==='error').length;
  $('uploadQueue').dataset.pendingCount=jobs.length;$('uploadQueue').classList.toggle('live',jobs.length===0);
 $('uploadQueue').innerHTML=(jobs.length?`<strong>คิวส่งรูป · ${jobs.length} บิล</strong>`:'')+jobs.sort((a,b)=>a.queuedAt-b.queuedAt).map((j,n)=>`<div class="upload-job"><span>บิล ${n+1} · ${esc(j.file.name||'รูปบิล')} — ${j.status==='error'?'ส่งไม่สำเร็จ: '+esc(j.error):j.status==='uploading'?'กำลังส่งรูป…':'รอส่งรูป'} </span>${j.status==='error'?`<button data-retry-upload="${esc(j.id)}">ลองส่งอีกครั้ง</button>`:''}</div>`).join('')+(!navigator.onLine&&jobs.length?'<p>ออฟไลน์ • รูปอยู่ในเครื่อง จะส่งต่อเมื่อเชื่อมอินเทอร์เน็ต</p>':'');return jobs;}
 async function publishPhoto(job){
 const id=job.id,ref=created(id);let skip=false,url='';
 await f.runTransaction(db,async tx=>{skip=false;url='';const s=await tx.get(ref);if(s.exists()){const o=s.data();skip=!!(o.completed||o.softDeleted||o.items?.length||o.imageUrl);url=o.imageUrl||'';if(!skip)tx.update(ref,{ocrStatus:'photo_uploading',notes:'กำลังรับรูปจาก Hostess',updatedAt:f.serverTimestamp()});}else tx.set(ref,{...blank(id),ocrStatus:'photo_uploading',notes:'Hostess ส่งบิลแล้ว • กำลังรับรูป'});});
 if(skip)return;
 const image=sapi.ref(store,`orders/${id}/receipt`);await sapi.uploadBytes(image,job.file,{contentType:job.file.type});url=await sapi.getDownloadURL(image);
 await f.runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())return;const o=s.data();if(!o.completed&&!o.softDeleted&&!o.items?.length&&!PhotoJobs.isReading(o))tx.update(ref,{imageUrl:url,ocrStatus:'ai_queued',notes:'รูปพร้อมแล้ว • รอ AI อ่าน',updatedAt:f.serverTimestamp()});});
 }
 async function pumpUploads(){
 if(uploading||!navigator.onLine)return;uploading=true;
 try{const jobs=await uploadList();const candidate=jobs.filter(j=>j.status==='waiting'||(j.status==='uploading'&&j.leaseUntil<=Date.now())).sort((a,b)=>a.queuedAt-b.queuedAt)[0];if(!candidate)return;
 const owner=crypto.randomUUID(),job=await outbox.claim(candidate.id,owner);if(!job)return;await uploadList();
 try{await publishPhoto(job);await outbox.finish(job.id,owner);if(!pending&&!working)message('ส่งรูปแล้ว');$('kitchenLink').hidden=false;pumpQueue();}
 catch(e){await outbox.finish(job.id,owner,e.message||'ส่งรูปไม่สำเร็จ');await f.runTransaction(db,async tx=>{const ref=created(job.id),s=await tx.get(ref);if(s.exists()&&!s.data().completed&&!s.data().imageUrl&&!s.data().items?.length)tx.update(ref,{ocrStatus:'photo_upload_error',notes:'ส่งรูปยังไม่สำเร็จ • ให้ Hostess กดลองส่งอีกครั้งจากคิวในเครื่อง',updatedAt:f.serverTimestamp()});}).catch(()=>{});}
 }catch(e){$('uploadQueue').textContent='ตรวจคิวส่งรูปไม่ได้: '+e.message;}
 finally{uploading=false;await uploadList().catch(()=>{});const jobs=await outbox.list().catch(()=>[]);if(navigator.onLine&&jobs.some(j=>j.status==='waiting'))setTimeout(pumpUploads,200);}
 }
 $('uploadQueue').onclick=async e=>{const id=e.target.closest('button')?.dataset.retryUpload;if(id){await outbox.retry(id);await uploadList();pumpUploads();}};
 window.addEventListener('online',()=>{uploadList();pumpUploads();});window.addEventListener('offline',()=>uploadList());setInterval(()=>{uploadList();pumpUploads();},15000);
 window.addEventListener('beforeunload',e=>{if(uploading||Number($('uploadQueue').dataset.pendingCount)>0){e.preventDefault();e.returnValue='';}});
 await uploadList();pumpUploads();
 async function send(){if(working)return;if(!pending){$('camera').click();return;}working=true;$('camera').disabled=true;uploadButton();
 try{await outbox.enqueue(pending);pending=null;$('preview').hidden=true;$('preview').removeAttribute('src');$('retry').hidden=true;$('next').hidden=true;message('เข้าคิวส่งแล้ว');}
 catch(e){message('เก็บเข้าคิวไม่ได้ รูปยังอยู่: '+e.message);}
 finally{working=false;$('camera').disabled=false;uploadButton();}
 // Network work starts only after the draft UI is released.
 uploadList().then(pumpUploads).catch(e=>message(e.message));
 }
 $('camera').onchange=async()=>{const file=$('camera').files[0];if(!file)return;if(working||pending?.attempted||pending?.published){message('มีรูปค้างอยู่ กรุณาลองส่งรูปเดิมให้เสร็จก่อน');$('camera').value='';return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>=8*1024*1024){message('เลือกรูป JPG / PNG / WebP ต่ำกว่า 8 MB');return;}try{$('camera').disabled=true;$('upload').disabled=true;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');pending={id:'photo-'+hash,file};await save(pending);$('preview').src=URL.createObjectURL(file);$('preview').hidden=false;$('camera').value='';$('upload').disabled=false;$('retry').hidden=true;$('next').hidden=true;uploadButton();message('');}catch(e){message('บันทึกรูปในเครื่องไม่ได้: '+e.message);$('upload').disabled=true;}finally{$('camera').disabled=false;}};$('upload').onclick=send;$('retry').onclick=send;$('next').onclick=async()=>{if(working||!pending?.published)return;await save(null);pending=null;$('upload').disabled=true;$('retry').hidden=true;$('next').hidden=true;message('รูปบิลก่อนหน้ายังอยู่ในครัว เปิดรูปและกดอ่านใหม่จากหน้าครัวได้ • พร้อมถ่ายบิลถัดไป');};
 $('camera').disabled=false;
}else{
 const paths = {
 chef:'<path d="M6 15a4.5 4.5 0 0 1-1-8.9A5.5 5.5 0 0 1 15 5a4.8 4.8 0 1 1 3 9.2V20H6zM6 17h12M9 12v3m3-4v4m3-3v3"/>',
 pan:'<path d="M3 12h13a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6Zm13 1 6-3M7 8c-2-2 2-2 0-4m5 4c-2-2 2-2 0-4"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
 timer:'<circle cx="12" cy="14" r="8"/><path d="M10 2h4m-2 0v4m6 1 2-2m-8 5v5"/>',
 receipt:'<path d="M5 3l2 1.5L9.5 3 12 4.5 14.5 3 17 4.5 19 3v18l-2-1.5-2.5 1.5-2.5-1.5-2.5 1.5L7 19.5 5 21zM9 8h6m-6 4h6m-6 4h4"/>',
 dish:'<path d="M3 16h18M5 15a7 7 0 0 1 14 0m-7-7V6m-1-1h2M4 19h16"/>',
 scan:'<path d="M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4m5-9h8v10H8zM10 10h4m-4 3h3"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 image:'<rect x="3" y="3.5" width="18" height="17" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
 closebill:'<path d="M11 4H5v16h14v-7m-8 1 8-8m-6 0h6v6"/>',
 check:'<path d="m5 12 4 4 10-10"/>', checkcircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 warn:'<path d="m10.4 4.5-8 14A1.6 1.6 0 0 0 4 21h16a1.6 1.6 0 0 0 1.5-2.5l-8-14a1.8 1.8 0 0 0-3.1 0Z"/><path d="M12 9v5m0 3v.1"/>',
 sort:'<path d="M6 4v16m-3-3 3 3 3-3m2-11h10m-10 5h7m-7 5h4"/>',
 search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
 volume:'<path d="M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 mute:'<path d="M3 9h4l5-5v16l-5-5H3zM16 9l5 6m0-6-5 6"/>',
 settings:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
 upload:'<path d="M7 18H6a4.5 4.5 0 0 1-.5-9A7 7 0 0 1 19 9.5a4.3 4.3 0 0 1-.5 8.5H17m-5 2V11m-4 4 4-4 4 4"/>',
 expand:'<path d="M13 4h7v7m0-7-9 9m-1-8H4v15h15v-6"/>',x:'<path d="m6 6 12 12M6 18 18 6"/>',
 reset:'<path d="M4 11a8 8 0 1 1 2 7m-3-13v6h6"/>',tablet:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M18 11v2"/>'
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24">'+paths[name]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
 const audio=new Audio('assets/alerts/chef-alert.mp3');$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'เสียงเปิดอยู่':'เปิดเสียง';$('sound').setAttribute('aria-pressed',String(sound));if(sound)audio.play().catch(()=>message('กรุณาเปิดเสียงอุปกรณ์'));};
 $('sound').textContent='เปิดเสียง';
 const dishEdits=new Map();let savingDishes=false;
 function displayed(o){return {...o,items:(o.items||[]).map(i=>{const e=dishEdits.get(o.id+'/'+i.id);return e?{...i,done:e.done}:i;})};}
 async function flushDishes(){if(savingDishes||!dishEdits.size)return;savingDishes=true;
 try{while(dishEdits.size){const [key,edit]=dishEdits.entries().next().value;
 try{await f.runTransaction(db,async tx=>{const ref=created(edit.order),snap=await tx.get(ref);if(!snap.exists()||snap.data().completed||snap.data().softDeleted)throw Error('บิลปิดแล้ว');const o=snap.data();if(!o.items.some(i=>i.id===edit.item&&i.text===edit.text))throw Error('รายการเปลี่ยน กรุณาตรวจใหม่');tx.update(ref,{items:o.items.map(i=>i.id===edit.item?{...i,done:edit.done}:i),updatedAt:f.serverTimestamp()});});
 const o=orders.find(o=>o.id===edit.order);if(o)o.items=o.items.map(i=>i.id===edit.item?{...i,done:edit.done}:i);
 if(dishEdits.get(key)===edit)dishEdits.delete(key);
 }catch(e){if(dishEdits.get(key)===edit)dishEdits.delete(key);message('บันทึกเมนูไม่สำเร็จ เครื่องหมายคืนค่าล่าสุด: '+e.message);}render();}
 }finally{savingDishes=false;render();}}
 window.addEventListener('beforeunload',e=>{if(dishEdits.size){e.preventDefault();e.returnValue='';}});
 const limitMs = 30 * 60000;
 const time = t => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);
 const start = o => Number(o.createdAtMs) || o.createdAt?.toMillis?.() || 0;
 const late = (o, now) => !o.completed && start(o)>0 && now-start(o)>limitMs;
 const unsafeItems = o => (o.items||[]).some(i=>ReceiptParser.isUnsafeItem({text:i.text}));
 function stage(o) {
  if(unsafeItems(o))return 'ตรวจรายการจากรูปบิล';
  if(o.items?.length)return 'พร้อมทำอาหาร';
  if(o.ocrStatus==='photo_upload_error')return 'ส่งรูปไม่สำเร็จ';
  if(!o.imageUrl)return 'กำลังส่งรูป';
  if(o.ocrStatus==='error')return 'อ่านรูปไม่สำเร็จ';
  return PhotoJobs.isReading(o)?'AI กำลังอ่าน':'รอ AI อ่าน';
 }
 function dish(o,i){
  const parts=String(i.text||'').split('\n'),qty=parts[0].match(/^(\d+)\s*[×x]\s*(.+)$/);
  if(qty)parts[0]=qty[2];
  return `<button class="dish ${i.done?'done':''}" data-order="${esc(o.id)}" data-item="${esc(i.id)}" aria-pressed="${!!i.done}" ${locked.has(o.id)||o.completed?'disabled':''}><span class="check">${i.done?icon('check'):''}</span><span class="name">${esc(parts.join('\n'))}</span>${qty?`<span class="qty">×${esc(qty[1])}</span>`:''}</button>`;
 }
 function card(o,now){
  const id=esc(o.id),items=unsafeItems(o)?[]:o.items||[],left=items.filter(i=>!i.done).length;
  const dt=start(o),age=dt?Math.max(0,Math.floor(((o.completed?o.completedAtMs:now)-dt)/60000)):'–';
  const overdue=late(o,now), label=stage(o), notes=String(o.notes||'');
  const warnings=[...new Set([...(o.items||[]).map(i=>i.text),...notes.split('\n')].filter(s=>s&&/แพ้|allerg|anaphyl/i.test(s)&&s!=='AI อ่านจากภาพ • ตรวจรูปต้นฉบับ โดยเฉพาะข้อมูลแพ้อาหาร'))];
  const saving=[...dishEdits.values()].some(e=>e.order===o.id);
  const ready=items.length>0 && left===0;
  const status=saving?'กำลังบันทึก…':o.completed?'ปิดแล้ว':ready?'เสร็จแล้ว (ครบถ้วน)':items.length?'กำลังทำ':label;
  const storagePrefix='https://firebasestorage.googleapis.com/v0/b/'+window.LAYA_FIREBASE_CONFIG.storageBucket+'/o/';
  const thumbnail=typeof o.imageUrl==='string' && o.imageUrl.startsWith(storagePrefix);
  return `<article class="ticket ${overdue?'late':''} ${ready?'ready':''}">
    <div class="ticket-head"><div><h2 class="table-title">โต๊ะ <strong>${esc(ReceiptParser.normalizeTable(o.tableNo)||'—')}</strong></h2>
      <div class="identifier">${icon('receipt')} ${esc(o.billNo||'รอเลขบิล')}</div><div class="received">${icon('clock')} รับบิล ${dt?time(dt):'—'}</div></div>
      <button class="thumb" data-image="${id}" aria-label="ดูรูปบิล ${esc(o.billNo||o.tableNo||'')}" ${o.imageUrl?'':'disabled'}>${thumbnail?`<img src="${esc(o.imageUrl)}" loading="lazy" alt="ดูรูปบิล">`:icon('image')}</button></div>
    <div class="line"><span class="status">${icon(ready?'checkcircle':items.length?'chef':'scan')} ${status}</span>${left?`<span class="leftcount">ค้าง ${left} เมนู</span>`:''}</div>
  ${items.length?`<div class="dishes">${items.map(i=>dish(o,i)).join('')}</div>`:`<div class="pending">${icon(o.imageUrl?'scan':'upload')}<strong>${label}</strong><small>${o.imageUrl?'เปิดรูปบิลเพื่อตรวจรายการได้':'รอรูปจากพนักงานส่งบิล'}</small></div>`}
  ${warnings.length?`<div class="allergy">${icon('warn')}<span>ข้อมูลแพ้อาหาร · ${esc(warnings.join('\n'))}</span></div>`:''}
  <details class="info" ${o.ocrStatus==='error'?'open':''}><summary>${o.ocrStatus==='done'&&(!o.tableNo||!o.billNo)?'⚠ ตรวจโต๊ะ / เลขบิลจากรูป':'หมายเหตุ / ข้อมูลการอ่านบิล'}</summary><p>${esc(notes)}</p>${o.imageUrl&&!o.completed?`<button data-read="${id}" ${locked.has(o.id)||PhotoJobs.isReading(o)||o.ocrStatus==='ai_queued'?'disabled':''}>อ่านรูปใหม่</button>`:''}</details>
  <div class="actions"><span class="elapsed"><small>${overdue?'เกิน 30 นาที':'ระยะเวลารอ'}</small>${age} นาที</span>${o.completed?'<span class="archived">✓ ปิดแล้ว</span>':`<button class="btn primary" data-close="${id}" ${locked.has(o.id)?'disabled':''}>${icon('checkcircle')}ปิดบิล</button>`}</div></article>`;
 }
 let filter='all',timer,historyOrders=[],historyMessage='';
 $('tabs').onclick=async e=>{
  const button=e.target.closest('[data-filter]');if(!button)return;
  filter=button.dataset.filter;
  if(filter!=='closed'){render();return}
  historyMessage='กำลังโหลดบิลที่ปิดแล้ว…';render();
  try{
   const snap=await f.getDocs(f.query(f.collection(db,'orders'),f.orderBy('completedAtMs','desc'),f.limit(100)));
   historyOrders=snap.docs.map(d=>({...d.data(),id:d.id})).filter(o=>o.completed&&!o.softDeleted);
   historyMessage='';
  }catch{historyMessage='โหลดบิลที่ปิดแล้วไม่สำเร็จ แตะปิดแล้วเพื่อลองอีกครั้ง'}
  render();
 };
 function render(){
  const now=Date.now(),active=orders.filter(o=>!o.completed&&!o.softDeleted).map(displayed);
  const overdue=active.filter(o=>late(o,now)),waiting=active.filter(o=>!o.items.length||unsafeItems(o));
  clearTimeout(timer);
  const next=active.map(o=>start(o)+limitMs+1).filter(t=>t>now);
  if(next.length)timer=setTimeout(render,Math.min(...next)-now);
  $('clock').textContent=time(now);$('date').textContent=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}).format(now);
  const cooking=active.filter(o=>!unsafeItems(o)&&o.items.some(item=>!item.done)).length;
  const readyCount=active.length-waiting.length-cooking;
  $('metrics').innerHTML=[['receipt','บิลที่เปิดอยู่',active.length,'บิล'],['chef','กำลังทำ',cooking,'บิล'],['timer','รอเกิน 30 นาที',overdue.length,'บิล'],['checkcircle','ครบทุกเมนู',readyCount,'บิล']].map(([im,label,n,u])=>`<div class="metric"><span class="metric-icon">${icon(im)}</span><div class="data"><small>${label}</small><b>${n}<span>${u}</span></b></div></div>`).join('');
  $('tabs').innerHTML=[['all','บิลทั้งหมด',active.length],['late','รอนาน',overdue.length],['waiting','รอรูป / AI',waiting.length],['closed','ปิดแล้ว',null]].map(([id,label,n])=>`<button class="tab ${filter===id?'active':''}" aria-pressed="${filter===id}" data-filter="${id}">${label}${n===null?'':` <em>${n}</em>`}</button>`).join('');
  const pool={all:active,late:overdue,waiting,closed:historyOrders}[filter];
  const q=$('search').value.trim().toLowerCase();
  const list=pool.filter(o=>['โต๊ะ '+ReceiptParser.normalizeTable(o.tableNo),o.billNo,...(o.items||[]).map(i=>i.text)].join(' ').toLowerCase().includes(q));
  if(filter!=='closed')list.sort((a,b)=>start(a)-start(b));
  document.querySelector('.sort').textContent=filter==='closed'?'ปิดล่าสุด · สูงสุด 100 บิล':'รอนานก่อน';
  const status=filter==='closed'&&historyMessage;
  const board=$('board'),opened=new Set([...board.querySelectorAll('details[open]')].map(d=>d.closest('article').querySelector('[data-image]').dataset.image));
  board.innerHTML=(!status&&list.map(o=>card(o,now)).join(''))||`<div class="empty">${status||'ไม่มีบิลในมุมมองนี้'}</div>`;
  for(const el of board.querySelectorAll('article'))if(opened.has(el.querySelector('[data-image]').dataset.image))el.querySelector('details').open=true;
 }
 render();
 f.onSnapshot(f.query(f.collection(db,'orders'),f.where('completed','==',false)),{includeMetadataChanges:true},snap=>{online=!snap.metadata.fromCache&&navigator.onLine;connectionState(!navigator.onLine?'offline':online?'live':'syncing');$('connection').textContent=online?'เชื่อมต่อแล้ว • ข้อมูลสด':!navigator.onLine?'ออฟไลน์ • รอเชื่อมก่อนบันทึก':'กำลังเชื่อมข้อมูลสด…';const ids=new Set(snap.docs.map(d=>d.id));if(sound&&known&&[...ids].some(id=>!known.has(id)))audio.play().catch(()=>{});known=ids;orders=snap.docs.map(d=>({...d.data(),id:d.id}));render();},e=>{connectionState('offline');$('connection').textContent='โหลดบิลไม่ได้: '+e.message;online=false;});
 $('search').oninput=render;$('closePicture').onclick=()=>$('picture').close();
 $('board').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.order||b.dataset.image||b.dataset.read||b.dataset.close,o=orders.find(o=>o.id===id)||(b.dataset.image&&historyOrders.find(o=>o.id===id));if(!o)return;if(b.dataset.image){$('billImage').src=o.imageUrl;$('picture').showModal();return;}if(locked.has(id))return;
 if(b.dataset.item){if(!navigator.onLine){message('ออฟไลน์ กรุณาเชื่อมต่อก่อนเช็กเมนู');return;}const item=displayed(o).items.find(i=>i.id===b.dataset.item);if(!item)return;dishEdits.set(id+'/'+item.id,{order:id,item:item.id,text:item.text,done:!item.done});render();flushDishes();return;}
 if([...dishEdits.values()].some(e=>e.order===id)){message('กำลังบันทึกเมนู กรุณารอสักครู่ก่อนปิดบิลหรืออ่านใหม่');return;}locked.add(id);render();try{if(!online)throw Error('รอเชื่อมข้อมูลสดก่อน');if(b.dataset.read){if(PhotoJobs.isReading(o)||o.ocrStatus==='ai_queued')throw Error('บิลนี้อยู่ในคิว AI แล้ว กรุณารอผล');if(!o.imageUrl)throw Error('บิลนี้ยังไม่มีรูป กรุณาส่งรูปก่อน');const expected=PhotoJobs.fingerprintItems(o.items);if(o.items?.length&&!window.confirm('อ่านรูปใหม่แทนรายการเดิม และเริ่มเช็กเมนูใหม่ทั้งหมด ยืนยันหรือไม่?'))return;await readInto(id,{imageUrl:o.imageUrl},expected);}else {if(b.dataset.close){const remaining=(o.items||[]).filter(i=>!i.done).length;const question=!(o.items||[]).length?'ยังไม่มีเมนูจาก AI ยืนยันว่าตรวจรูปบิลและต้องการปิดบิลนี้?':remaining?`ยังมี ${remaining} รายการไม่ได้เช็ก ยืนยันปิดบิลนี้หรือไม่?`:'ยืนยันปิดบิลนี้?';if(!window.confirm(question))return;}await f.runTransaction(db,async tx=>{const ref=created(id),s=await tx.get(ref);if(!s.exists()||s.data().completed||s.data().softDeleted)throw Error('บิลนี้ปิดแล้ว');const latest=s.data();if(b.dataset.item){const desired=!o.items.find(i=>i.id===b.dataset.item)?.done;const list=latest.items.map(i=>i.id===b.dataset.item?{...i,done:desired}:i);if(!list.some(i=>i.id===b.dataset.item))throw Error('รายการเปลี่ยนแล้ว');tx.update(ref,{items:list,updatedAt:f.serverTimestamp()});}else{if(!PhotoJobs.sameItems(latest.items,o.items))throw Error('รายการเปลี่ยนระหว่างยืนยัน กรุณาตรวจแล้วปิดอีกครั้ง');tx.update(ref,{...PhotoJobs.closePatch(latest),updatedAt:f.serverTimestamp()});}});if(b.dataset.close)message('ปิดบิลแล้ว ✓');}}catch(e){message(e.message);}finally{locked.delete(id);render();}};setInterval(render,30000);
}
})().catch(e=>{const el=document.getElementById('connection');if(el)el.textContent='เริ่มระบบไม่ได้: '+e.message;});
