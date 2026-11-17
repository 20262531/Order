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
function queueLabel(){if($('aiQueueStatus')){const waiting=queueOrders.filter(o=>PhotoJobs.eligible(o)||PhotoJobs.isReading(o)).length;$('aiQueueStatus').textContent=waiting?`AI อ่านเบื้องหลัง • ${waiting} บิลในคิว • ถ่ายบิลถัดไปได้`:'ไม่มีบิลรออ่าน AI';}}
async function pumpQueue(){
 queueLabel();if(queueBusy||!queueConnected||!navigator.onLine||!window.KitchenAI)return;
 const candidate=queueOrders.filter(o=>PhotoJobs.eligible(o)).sort((a,b)=>a.createdAtMs-b.createdAtMs)[0];if(!candidate)return;
 queueBusy=true;const token=crypto.randomUUID();let claimed=null,failed=false;
 try{await f.runTransaction(db,async tx=>{claimed=null;const ref=created(candidate.id),snap=await tx.get(ref);if(!snap.exists())return;const next=PhotoJobs.claim(snap.data(),token);if(!next)return;claimed={...snap.data(),id:candidate.id,status:next};tx.update(ref,{ocrStatus:next,notes:'รูปส่งเข้าครัวแล้ว • AI กำลังอ่านเบื้องหลัง',updatedAt:f.serverTimestamp()});});
 if(claimed){await readInto(claimed.id,{imageUrl:claimed.imageUrl},null,claimed.status);}
 }catch(e){failed=true;if($('aiQueueStatus'))$('aiQueueStatus').textContent='บิล '+(claimed?.tableNo||candidate.tableNo||'ล่าสุด')+' อ่านไม่สำเร็จ • ดูสาเหตุที่หน้าครัว';}
 finally{queueBusy=false;if(claimed&&!failed)setTimeout(pumpQueue,200);}
}
f.onSnapshot(f.query(f.collection(db,'orders'),f.where('completed','==',false)),{includeMetadataChanges:true},snap=>{queueConnected=!snap.metadata.fromCache;connectionState(!navigator.onLine?'offline':queueConnected?'live':'syncing');if(mode==='hostess')$('connection').textContent=!navigator.onLine?'ออฟไลน์ • เก็บรูปไว้ในเครื่อง':queueConnected?'เชื่อมต่อแล้ว • ข้อมูลสด':'กำลังเชื่อมข้อมูลสด…';queueOrders=snap.docs.map(d=>({...d.data(),id:d.id}));queueLabel();pumpQueue();},()=>{queueConnected=false;connectionState('offline');$('connection').textContent='เชื่อมข้อมูลไม่ได้ • รอตรวจเครือข่าย';if($('aiQueueStatus'))$('aiQueueStatus').textContent='คิว AI รอเชื่อมต่อ • รูปที่ส่งแล้วไม่หาย';});
setInterval(pumpQueue,15000);window.addEventListener('online',()=>{connectionState('syncing');$('connection').textContent='กำลังเชื่อมข้อมูลสด…';pumpQueue();});window.addEventListener('offline',()=>{connectionState('offline');$('connection').textContent=mode==='hostess'?'ออฟไลน์ • รูปค้างส่งอยู่ในเครื่อง':'ออฟไลน์ • รอเชื่อมก่อนบันทึก';});
if(mode==='hostess'){
 const outbox=await window.PhotoOutbox.open();
 const save=value=>outbox.saveDraft(value);
 function uploadButton(){const b=$('upload');b.disabled=working;b.textContent=working?'กำลังเก็บรูปเข้าคิว…':pending?'ส่งเข้าครัว':'ถ่ายบิลถัดไป';b.setAttribute('aria-busy',String(working));}

 pending=await outbox.draft();
 if(pending){$('preview').src=URL.createObjectURL(pending.file);$('preview').hidden=false;$('upload').disabled=false;message('มีรูปที่เลือกไว้แล้ว ตรวจภาพแล้วกดส่งเข้าคิว');}
 uploadButton();
 let uploading=false,sentCount=0;
 async function uploadList(){const jobs=await outbox.list();$('uploadQueue').dataset.pendingCount=jobs.length;$('uploadQueue').classList.toggle('live',jobs.length===0);
 if(!pending&&!working)message(jobs.length?'พร้อมถ่ายบิลถัดไป • ระบบกำลังส่งรูปตามคิว ดูสถานะด้านล่าง':sentCount?'ส่งรูปถึงระบบแล้ว ✓ • พร้อมถ่ายบิลถัดไป':'พร้อมถ่ายบิลใหม่ • ไม่มีรูปค้างส่งในเครื่อง');$('uploadQueue').innerHTML=`<strong>คิวส่งรูปในเครื่อง ${jobs.length} บิล${sentCount?' • ส่งถึงระบบแล้ว '+sentCount+' บิล':''}</strong>`+jobs.sort((a,b)=>a.queuedAt-b.queuedAt).map((j,n)=>`<div class="upload-job"><span>บิล ${n+1} · ${esc(j.file.name||'รูปบิล')} — ${j.status==='error'?'ส่งไม่สำเร็จ: '+esc(j.error):j.status==='uploading'?'กำลังส่งรูป…':'รอส่งรูป'} </span>${j.status==='error'?`<button data-retry-upload="${esc(j.id)}">ลองส่งอีกครั้ง</button>`:''}</div>`).join('')+(!navigator.onLine&&jobs.length?'<p>ออฟไลน์ • รูปอยู่ในเครื่อง จะส่งต่อเมื่อเชื่อมอินเทอร์เน็ต</p>':'');return jobs;}
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
 try{await publishPhoto(job);await outbox.finish(job.id,owner);sentCount++;$('kitchenLink').hidden=false;pumpQueue();}
 catch(e){await outbox.finish(job.id,owner,e.message||'ส่งรูปไม่สำเร็จ');await f.runTransaction(db,async tx=>{const ref=created(job.id),s=await tx.get(ref);if(s.exists()&&!s.data().completed&&!s.data().imageUrl&&!s.data().items?.length)tx.update(ref,{ocrStatus:'photo_upload_error',notes:'ส่งรูปยังไม่สำเร็จ • ให้ Hostess กดลองส่งอีกครั้งจากคิวในเครื่อง',updatedAt:f.serverTimestamp()});}).catch(()=>{});}
 }catch(e){$('uploadQueue').textContent='ตรวจคิวส่งรูปไม่ได้: '+e.message;}
 finally{uploading=false;await uploadList().catch(()=>{});const jobs=await outbox.list().catch(()=>[]);if(navigator.onLine&&jobs.some(j=>j.status==='waiting'))setTimeout(pumpUploads,200);}
 }
 $('uploadQueue').onclick=async e=>{const id=e.target.closest('button')?.dataset.retryUpload;if(id){await outbox.retry(id);await uploadList();pumpUploads();}};
 window.addEventListener('online',()=>{uploadList();pumpUploads();});window.addEventListener('offline',()=>uploadList());setInterval(()=>{uploadList();pumpUploads();},15000);
 window.addEventListener('beforeunload',e=>{if(uploading||Number($('uploadQueue').dataset.pendingCount)>0){e.preventDefault();e.returnValue='';}});
 await uploadList();pumpUploads();
 async function send(){if(working)return;if(!pending){$('camera').click();return;}working=true;$('camera').disabled=true;uploadButton();
 try{await outbox.enqueue(pending);pending=null;$('preview').hidden=true;$('preview').removeAttribute('src');$('retry').hidden=true;$('next').hidden=true;message('เก็บเข้าคิวในเครื่องแล้ว ✓ • พร้อมถ่ายบิลถัดไป • ดูสถานะส่งรูปด้านล่าง');}
 catch(e){message('เก็บเข้าคิวไม่ได้ รูปยังอยู่: '+e.message);}
 finally{working=false;$('camera').disabled=false;uploadButton();}
 // Network work starts only after the draft UI is released.
 uploadList().then(pumpUploads).catch(e=>message(e.message));
 }
 $('camera').onchange=async()=>{const file=$('camera').files[0];if(!file)return;if(working||pending?.attempted||pending?.published){message('มีรูปค้างอยู่ กรุณาลองส่งรูปเดิมให้เสร็จก่อน');$('camera').value='';return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>=8*1024*1024){message('เลือกรูป JPG / PNG / WebP ต่ำกว่า 8 MB');return;}try{$('camera').disabled=true;$('upload').disabled=true;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');pending={id:'photo-'+hash,file};await save(pending);$('preview').src=URL.createObjectURL(file);$('preview').hidden=false;$('camera').value='';$('upload').disabled=false;$('retry').hidden=true;$('next').hidden=true;message('เลือกรูปแล้ว • ตรวจภาพ แล้วกดอัปโหลดและส่งเข้าครัว');}catch(e){message('บันทึกรูปในเครื่องไม่ได้: '+e.message);$('upload').disabled=true;}finally{$('camera').disabled=false;}};$('upload').onclick=send;$('retry').onclick=send;$('next').onclick=async()=>{if(working||!pending?.published)return;await save(null);pending=null;$('upload').disabled=true;$('retry').hidden=true;$('next').hidden=true;message('รูปบิลก่อนหน้ายังอยู่ในครัว เปิดรูปและกดอ่านใหม่จากหน้าครัวได้ • พร้อมถ่ายบิลถัดไป');};
}else{
 const audio=new Audio('assets/alerts/chef-alert.mp3');$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'เสียงเปิดอยู่':'เปิดเสียง';$('sound').setAttribute('aria-pressed',String(sound));if(sound)audio.play().catch(()=>message('กรุณาเปิดเสียงอุปกรณ์'));};
 function render(){
 const active=orders.filter(o=>!o.completed&&!o.softDeleted);
 if($('activeCount'))$('activeCount').textContent=active.length;
 if($('pendingCount'))$('pendingCount').textContent=active.filter(o=>!(o.items||[]).length).length;
 if($('lateCount'))$('lateCount').textContent=active.filter(o=>Date.now()-o.createdAtMs>=1800000).length;
 const q=$('search').value.toLowerCase();
 const visible=orders.filter(o=>!o.completed&&!o.softDeleted&&[ReceiptParser.normalizeTable(o.tableNo),o.tableNo,o.billNo,...(o.items||[]).map(i=>i.text)].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.createdAtMs-b.createdAtMs);
 $('board').innerHTML=visible.map(o=>{
 const aiReading=PhotoJobs.isReading(o),aiQueued=o.ocrStatus==='ai_queued';
 const unsafe=(o.items||[]).some(i=>ReceiptParser.isUnsafeItem({text:i.text}));
 const rows=unsafe?[]:(o.items||[]),done=rows.filter(i=>i.done).length,minutes=Math.max(0,Math.floor((Date.now()-o.createdAtMs)/60000)),all=rows.length>0&&done===rows.length;
 const note=o.notes||'ตรวจชื่อเมนู จำนวน และหมายเหตุกับรูปบิล';
 const important=(o.items||[]).some(i=>/แพ้|allerg|anaphyl/i.test(i.text))||note.split('\n').filter(line=>line!=='AI อ่านจากภาพ • ตรวจรูปต้นฉบับ โดยเฉพาะข้อมูลแพ้อาหาร').some(line=>/แพ้|allerg|anaphyl/i.test(line));const metadataMissing=o.ocrStatus==='done'&&(!o.tableNo||!o.billNo);
 return `<article class="ticket compact-ticket ${minutes>=25?'ticket-late':''} ${all?'ticket-checked':''}">
 <div class="compact-head"><div><span class="ticket-label">โต๊ะ / ห้อง</span><h3>${esc(ReceiptParser.normalizeTable(o.tableNo)||'ดูโต๊ะจากรูป')}</h3><div class="meta">${esc(o.billNo||(o.ocrStatus==='done'?'ดูเลขบิลจากรูป':'รออ่านเลขบิล'))}</div></div><div class="compact-time"><strong>${minutes}</strong><span>นาที</span></div></div>
 ${unsafe?'<div class="ticket-note">รายการเดิมมีข้อความผิดรูปแบบ • ใช้รูปบิลก่อน และกดอ่านใหม่</div>':''}
 <div class="compact-toolbar"><span class="completion-label">${all?'✓ ครบแล้ว':`เสร็จ ${done}/${rows.length} รายการ`}</span>${o.imageUrl?`<button data-image="${o.id}" class="receipt-button">ดูรูปบิล ↗</button><button data-read="${o.id}" class="receipt-button" ${locked.has(o.id)||aiReading||aiQueued?'disabled':''}>อ่านใหม่</button>`:''}</div>
 <div class="compact-progress" aria-label="ทำเสร็จ ${done} จาก ${rows.length} รายการ"><span style="width:${rows.length?Math.round(done/rows.length*100):0}%"></span></div>
 <div class="compact-menu">${!rows.length&&o.imageUrl?`<button class="pending-preview" data-image="${o.id}" aria-label="ขยายรูปบิล"><img src="${esc(o.imageUrl)}" alt="รูปบิลที่ส่งถึงครัวแล้ว" loading="lazy"><span>แตะเพื่อขยายรูปบิล</span></button>`:''}${rows.length?rows.map(i=>{
 const parts=String(i.text||'').split('\n'),main=parts.shift();
 return `<button class="dish ${/แพ้|allerg|anaphyl/i.test(i.text)?'dish-allergy':''} ${i.done?'done':''}" data-order="${o.id}" data-item="${esc(i.id)}" ${locked.has(o.id)?'disabled':''} aria-pressed="${!!i.done}"><span class="dish-check" aria-hidden="true">${i.done?'✓':''}</span><span class="dish-content"><span class="dish-title">${esc(main)}</span>${parts.length?`<small>${esc(parts.join(' · '))}</small>`:''}</span></button>`;
 }).join(''):`<div class="ocr-error">${unsafe?'รายการเดิมอ่านคลาดเคลื่อน • กดอ่านใหม่ด้วย AI':o.ocrStatus==='photo_upload_error'?'ยังรับรูปไม่สำเร็จ • ให้ Hostess ลองส่งอีกครั้ง':o.ocrStatus==='photo_uploading'?'กำลังรับรูปจาก Hostess…':o.ocrStatus==='error'?'การอ่านครั้งก่อนยังไม่สำเร็จ • ดูรูปหรืออ่านใหม่':aiReading?'AI กำลังอ่านเบื้องหลัง…':aiQueued?'รูปส่งถึงครัวแล้ว • รอ AI อ่าน':locked.has(o.id)?'กำลังอ่านรูป…':'รอผลอ่านรูป • หากปิดหน้าส่งบิลก่อนเสร็จ กดอ่านใหม่ได้'}<button data-read="${o.id}" ${!o.imageUrl||locked.has(o.id)||aiReading||aiQueued?'disabled':''}>อ่านรูปนี้ใหม่</button></div>`}</div>
 <details class="compact-notes" ${important||metadataMissing||o.ocrStatus==='error'?'open':''}><summary>${important?'⚠ ข้อมูลแพ้อาหาร / หมายเหตุ':metadataMissing?'⚠ ตรวจโต๊ะ / เลขบิลจากรูป':o.ocrStatus==='error'?'สาเหตุที่อ่านไม่สำเร็จ':'ข้อมูลการอ่านบิล'}</summary><div>${esc(note)}</div></details>
 <div class="ticket-bottom"><button data-close="${o.id}" ${locked.has(o.id)?'disabled':''} class="primary full-button">${locked.has(o.id)?'กำลังบันทึก…':all?'✓ ปิดบิลนี้':'ปิดบิลนี้'}</button></div></article>`;
 }).join('')||'<div class="empty">ยังไม่มีบิลในรายการนี้</div>';
 if($('boardCount'))$('boardCount').textContent=visible.length+' บิล';
 }

 f.onSnapshot(f.query(f.collection(db,'orders'),f.where('completed','==',false)),{includeMetadataChanges:true},snap=>{online=!snap.metadata.fromCache&&navigator.onLine;connectionState(!navigator.onLine?'offline':online?'live':'syncing');$('connection').textContent=online?'เชื่อมต่อแล้ว • ข้อมูลสด':!navigator.onLine?'ออฟไลน์ • รอเชื่อมก่อนบันทึก':'กำลังเชื่อมข้อมูลสด…';const ids=new Set(snap.docs.map(d=>d.id));if(sound&&known&&[...ids].some(id=>!known.has(id)))audio.play().catch(()=>{});known=ids;orders=snap.docs.map(d=>({...d.data(),id:d.id}));render();},e=>{connectionState('offline');$('connection').textContent='โหลดบิลไม่ได้: '+e.message;online=false;});
 $('search').oninput=render;$('closePicture').onclick=()=>$('picture').close();
 $('board').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.order||b.dataset.image||b.dataset.read||b.dataset.close,o=orders.find(o=>o.id===id);if(!o)return;if(b.dataset.image){$('billImage').src=o.imageUrl;$('picture').showModal();return;}if(locked.has(id))return;locked.add(id);render();try{if(!online)throw Error('รอเชื่อมข้อมูลสดก่อน');if(b.dataset.read){if(PhotoJobs.isReading(o)||o.ocrStatus==='ai_queued')throw Error('บิลนี้อยู่ในคิว AI แล้ว กรุณารอผล');if(!o.imageUrl)throw Error('บิลนี้ยังไม่มีรูป กรุณาส่งรูปก่อน');const expected=PhotoJobs.fingerprintItems(o.items);if(o.items?.length&&!window.confirm('อ่านรูปใหม่แทนรายการเดิม และเริ่มเช็กเมนูใหม่ทั้งหมด ยืนยันหรือไม่?'))return;await readInto(id,{imageUrl:o.imageUrl},expected);}else {if(b.dataset.close){const remaining=(o.items||[]).filter(i=>!i.done).length;const question=!(o.items||[]).length?'ยังไม่มีเมนูจาก AI ยืนยันว่าตรวจรูปบิลและต้องการปิดบิลนี้?':remaining?`ยังมี ${remaining} รายการไม่ได้เช็ก ยืนยันปิดบิลนี้หรือไม่?`:'ยืนยันปิดบิลนี้?';if(!window.confirm(question))return;}await f.runTransaction(db,async tx=>{const ref=created(id),s=await tx.get(ref);if(!s.exists()||s.data().completed||s.data().softDeleted)throw Error('บิลนี้ปิดแล้ว');const latest=s.data();if(b.dataset.item){const desired=!o.items.find(i=>i.id===b.dataset.item)?.done;const list=latest.items.map(i=>i.id===b.dataset.item?{...i,done:desired}:i);if(!list.some(i=>i.id===b.dataset.item))throw Error('รายการเปลี่ยนแล้ว');tx.update(ref,{items:list,updatedAt:f.serverTimestamp()});}else{if(!PhotoJobs.sameItems(latest.items,o.items))throw Error('รายการเปลี่ยนระหว่างยืนยัน กรุณาตรวจแล้วปิดอีกครั้ง');tx.update(ref,{...PhotoJobs.closePatch(latest),updatedAt:f.serverTimestamp()});}});if(b.dataset.close)message('ปิดบิลแล้ว ✓');}}catch(e){message(e.message);}finally{locked.delete(id);render();}};setInterval(render,30000);
}
})().catch(e=>{const el=document.getElementById('connection');if(el)el.textContent='เริ่มระบบไม่ได้: '+e.message;});
