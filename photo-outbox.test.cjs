const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Serialized transactional IDB mock: writes commit only after all requests succeed.
const stores=new Map();let serial=Promise.resolve(),quota=false;
const db={objectStoreNames:{contains:n=>stores.has(n)},createObjectStore:n=>stores.set(n,new Map()),close(){},transaction(names,mode){
 const tx={},ops=[];let active=false,staged;
 const request=fn=>{const q={};const op=()=>{try{q.result=fn();q.onsuccess?.();}catch(e){tx.error=e;throw e;}};if(active)op();else ops.push(op);return q;};
 tx.objectStore=name=>({get:key=>request(()=>structuredClone(staged.get(name).get(key))),getAll:()=>request(()=>structuredClone([...staged.get(name).values()])),put:(v,key)=>request(()=>{if(quota)throw Error('quota');staged.get(name).set(key,structuredClone(v));}),delete:key=>request(()=>staged.get(name).delete(key))});
 const run=serial.then(()=>new Promise(resolve=>setImmediate(()=>{try{staged=structuredClone(stores);active=true;for(const op of ops)op();active=false;if(mode==='readwrite'){stores.clear();for(const [k,v]of staged)stores.set(k,v);}tx.oncomplete?.();}catch(e){active=false;tx.onerror?.();}resolve();})));
 serial=run.catch(()=>{});return tx;
}};
const window={};vm.runInNewContext(fs.readFileSync(__dirname+'/photo-outbox.js','utf8'),{window,indexedDB:{open(){const q={};setImmediate(()=>{q.result=db;if(!stores.size)q.onupgradeneeded();q.onsuccess();});return q;}},Date,Promise,Error});
(async()=>{
 const q=await window.PhotoOutbox.open(),file=new Blob(['bill'],{type:'image/jpeg'}),job={id:'photo-1',file};
 await q.saveDraft(job);assert.ok(await q.draft());quota=true;await assert.rejects(q.enqueue(job));quota=false;assert.ok(await q.draft());assert.equal((await q.list()).length,0);
 await q.enqueue(job);assert.equal(await q.draft(),undefined);assert.equal((await q.list()).length,1);
 await q.enqueue(job);assert.equal((await q.list()).length,1);
 const [a,b]=await Promise.all([q.claim(job.id,'tab-a'),q.claim(job.id,'tab-b')]);assert.ok(a);assert.equal(b,null);
 await q.finish(job.id,'tab-b');assert.equal((await q.list()).length,1);
 await q.finish(job.id,'tab-a','offline');assert.equal((await q.list())[0].status,'error');assert.equal(await q.claim(job.id,'tab-b'),null);
 const reopened=await window.PhotoOutbox.open();assert.equal(await (await reopened.list())[0].file.text(),'bill');
 await reopened.retry(job.id);assert.equal((await reopened.list())[0].status,'waiting');await reopened.claim(job.id,'tab-b');await reopened.finish(job.id,'tab-b');assert.equal((await reopened.list()).length,0);
 await q.enqueue(job);const stale=stores.get('uploads').get(job.id);stores.get('uploads').set(job.id,{...stale,status:'uploading',owner:'old',leaseUntil:Date.now()-1});assert.ok(await q.claim(job.id,'recover'));
 console.log('PASS: outbox module atomic draft transfer / quota rollback, duplicate enqueue, serialized multi-tab claim, owner fence, retained failed Blob, reopen persistence, explicit retry, expired claim recovery. Transactional mock only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
