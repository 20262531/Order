/* Durable, local-only upload queue. Enqueue and removal of the draft are atomic. */
(function(root){
'use strict';
root.PhotoOutbox={open:async function(){
 const req=indexedDB.open('photo-kitchen-pending',2);
 req.onupgradeneeded=()=>{for(const name of ['pending','uploads'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};
 const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('กรุณาปิดหน้า Hostess เก่าในแท็บอื่น แล้วรีเฟรช'));});
 db.onversionchange=()=>db.close();
 function transaction(stores,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('บันทึกคิวในเครื่องไม่สำเร็จ'));fn(tx,value=>{result=value;});});}
 return {
 draft:()=>new Promise((resolve,reject)=>{const q=db.transaction('pending').objectStore('pending').get('current');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}),
 saveDraft:value=>transaction(['pending'],tx=>{const s=tx.objectStore('pending');if(value)s.put(value,'current');else s.delete('current');}),
 discardDraft:id=>transaction(['pending'],tx=>{
  const drafts=tx.objectStore('pending'),current=drafts.get('current');
  current.onsuccess=()=>{if(current.result?.id===id)drafts.delete('current');};
 }),
 enqueue:job=>transaction(['pending','uploads'],tx=>{const s=tx.objectStore('uploads'),q=s.get(job.id);q.onsuccess=()=>{if(!q.result)s.put({...job,status:'waiting',queuedAt:Date.now()},job.id);tx.objectStore('pending').delete('current');};}),
 list:()=>new Promise((resolve,reject)=>{const q=db.transaction('uploads').objectStore('uploads').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}),
 claim:(id,owner)=>transaction(['uploads'],(tx,done)=>{const s=tx.objectStore('uploads'),q=s.get(id);q.onsuccess=()=>{const j=q.result;if(!j||j.status==='error'||(j.status==='uploading'&&j.leaseUntil>Date.now()))return done(null);const next={...j,status:'uploading',owner,leaseUntil:Date.now()+600000};s.put(next,id);done(next);};}),
 finish:(id,owner,error)=>transaction(['uploads'],tx=>{const s=tx.objectStore('uploads'),q=s.get(id);q.onsuccess=()=>{const j=q.result;if(j?.owner!==owner)return;if(error)s.put({...j,status:'error',error:String(error).slice(0,400),leaseUntil:0},id);else s.delete(id);};}),
 retry:id=>transaction(['uploads'],tx=>{const s=tx.objectStore('uploads'),q=s.get(id);q.onsuccess=()=>{if(q.result?.status==='error')s.put({...q.result,status:'waiting',error:'',leaseUntil:0},id);};})
 };
}};
})(typeof window!=='undefined'?window:globalThis);
