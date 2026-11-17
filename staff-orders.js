/* Separate staff workspace. Original guest pages and app.js are intentionally unchanged. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  const now = Date.now();
  const demoItem = (text, done = false) => ({id:uid(),text,raw:text,done});
  const examples = [
    {id:'demo-1',tableNo:'A03',billNo:'TT-1048',hostessName:'Noi',createdAtMs:now-28*60000,notes:'แพ้ถั่วลิสง • กรุณายืนยันกับครัวก่อนปรุง',items:[demoItem('2 × Pad Thai Goong'),demoItem('1 × Tom Yum Goong',true),demoItem('1 × Mango Sticky Rice')]},
    {id:'demo-2',tableNo:'Room B205',billNo:'IRD-021',hostessName:'Game',createdAtMs:now-17*60000,notes:'ไม่เผ็ด / แยกซอส',items:[demoItem('1 × Club Sandwich',true),demoItem('2 × French Fries'),demoItem('1 × Chicken Fried Rice')]},
    {id:'demo-3',tableNo:'C06',billNo:'TT-1052',hostessName:'Sky',createdAtMs:now-5*60000,notes:'',items:[demoItem('2 × Carbonara'),demoItem('1 × Caesar Salad')]},
    {id:'demo-4',tableNo:'B02',billNo:'TT-1041',hostessName:'Noi',createdAtMs:now-40*60000,completedAtMs:now-8*60000,completed:true,notes:'',items:[demoItem('1 × Fish & Chips',true)]}
  ].map(o=>({completed:false,softDeleted:false,...o}));
  let orders = examples, filter = 'active', live = false, connected = false, busy = new Set(), submitting = false;
  let api, db, unsubscribers = [], sourceOrders = new Map(), sourceFresh = new Map(), feedFailed = false, initialized = false, sound = false, toastTimer, currentDetail;
  const titles = {active:'ออเดอร์ที่กำลังทำ',waiting:'บิลที่ยังไม่เช็กรายการ',partial:'บิลที่เช็กแล้วบางรายการ',ready:'พร้อมเสิร์ฟวันนี้',late:'บิลที่รอเกิน 25 นาที'};
  const todayStart = () => {
    // Property day always follows Asia/Bangkok, independently of device timezone.
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return new Date(`${day}T00:00:00+07:00`).getTime();
  };
  const items = o => Array.isArray(o.items) ? o.items : [];
  const doneCount = o => items(o).filter(i=>i.done).length;
  const active = o => !o.softDeleted && !o.completed;
  const elapsed = o => Math.max(0,(o.completed ? (o.completedAtMs || o.createdAtMs) : Date.now()) - (o.createdAtMs || Date.now()));
  const minutes = o => Math.floor(elapsed(o)/60000);
  const time = ms => new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}).format(new Date(ms || Date.now()));
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ $('toast').hidden=true; },5000); }
  function networkState() {
    $('connection').textContent = live ? connected ? 'เชื่อมต่อแล้ว • ข้อมูลสด' : 'กำลังเชื่อมต่อ • ยังบันทึกไม่ได้' : 'โหมดทดลอง • ข้อมูลตัวอย่าง';
    $('connection').classList.toggle('live-connected',live && connected);
  }
  function render() {
    const current = orders.filter(active), ready = orders.filter(o=>!o.softDeleted && o.completed && o.completedAtMs >= todayStart());
    $('activeCount').textContent = current.length;
    $('lateCount').textContent = current.filter(o=>minutes(o)>=25).length;
    $('itemCount').textContent = current.reduce((n,o)=>n+items(o).filter(i=>!i.done).length,0);
    $('readyCount').textContent = ready.length;
    $('boardTitle').textContent = titles[filter];
    document.querySelectorAll('.tools [data-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.filter===filter); b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
    const search = $('search').value.toLocaleLowerCase().trim();
    const list = (filter==='ready'?ready:current).filter(o=>filter==='waiting'?doneCount(o)===0:filter==='partial'?doneCount(o)>0:filter==='late'?minutes(o)>=25:true)
      .filter(o=>[o.tableNo,o.billNo,o.hostessName,o.notes,...items(o).map(i=>i.text)].join(' ').toLocaleLowerCase().includes(search))
      .sort((a,b)=>filter==='ready'?b.completedAtMs-a.completedAtMs:a.createdAtMs-b.createdAtMs);
    $('board').innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><h3>ไม่มีออเดอร์ในรายการนี้</h3><p>เลือกหมวดอื่น หรือส่งออเดอร์ใหม่เข้าครัว</p></div>';
  }
  function card(o) {
    const count=doneCount(o), all=items(o).length>0 && count===items(o).length, locked=busy.has(o.id) || (live&&!connected);
    return `<article class="ticket ${o.completed?'ready':minutes(o)>=25?'late':''}"><div class="ticket-top"><div><h3>${esc(o.tableNo || 'ยังไม่ระบุโต๊ะ')}</h3><div class="meta">${esc(o.billNo || 'ไม่ระบุเลขบิล')} • ${esc(o.hostessName || 'ไม่ระบุผู้ส่ง')}<br>รับออเดอร์ ${time(o.createdAtMs)}</div></div><div class="timer">${minutes(o)}<small>${o.completed?'นาทีที่ใช้ทำ':'นาทีที่รอ'}</small></div></div>
      ${o.notes?`<div class="ticket-notes">${esc(o.notes)}</div>`:''}
      <div class="progress-label"><span>${o.completed?'ครัวทำครบแล้ว':all?'ครบแล้ว • รอตรวจพร้อมเสิร์ฟ':count?'เช็กแล้วบางรายการ':'รอเช็กรายการ'}</span><span>${count}/${items(o).length} รายการ</span></div><div class="progress"><div style="width:${items(o).length?count/items(o).length*100:0}%"></div></div>
      <div class="items">${items(o).length?items(o).map((i,index)=>`<button class="check-item ${i.done?'done':''}" data-order="${esc(o.id)}" data-item="${index}" aria-pressed="${!!i.done}" ${locked||o.completed?'disabled':''}><span class="check-box" aria-hidden="true">${i.done?'✓':''}</span><span class="item-name">${esc(i.text)}</span></button>`).join(''):'<div class="ticket-empty">ยังไม่มีรายการ • ตรวจรูปบิลและสถานะ OCR ก่อนทำอาหาร</div>'}</div>
      <div class="ticket-bottom"><button data-detail="${esc(o.id)}">ตรวจบิล${o.imageUrl?' / รูป':''}</button>${o.completed?'<span class="status-chip">✓ พร้อมเสิร์ฟ</span>':`<button class="primary" data-complete="${esc(o.id)}" ${!all||locked?'disabled':''}>${busy.has(o.id)?'กำลังบันทึก…':'ตรวจครบ • พร้อมเสิร์ฟ'}</button>`}</div></article>`;
  }
  function detail(id) {
    const o=orders.find(x=>x.id===id); if(!o)return;
    currentDetail=id;
    $('detailTitle').textContent=`ตรวจบิล • ${o.tableNo || 'ยังไม่ระบุโต๊ะ'}`;
    $('detailBody').innerHTML=`<p class="meta">บิล ${esc(o.billNo || '—')} • ผู้ส่ง ${esc(o.hostessName || '—')} • เวลา ${time(o.createdAtMs)}</p>${o.notes?`<p class="detail-notes">${esc(o.notes)}</p>`:''}<ul class="detail-list">${items(o).map(i=>`<li>${i.done?'✓':'○'} ${esc(i.text)}</li>`).join('')}</ul><p class="meta">${o.completed?'ครัวทำครบแล้ว • พร้อมให้พนักงานนำเสิร์ฟ':'ตรวจจำนวนและหมายเหตุเทียบกับบิลต้นฉบับ'}</p>`;
    if(o.imageUrl && /^https:\/\//i.test(o.imageUrl)) {
      const image=document.createElement('img'); image.className='receipt'; image.alt='รูปบิลต้นฉบับ'; image.src=o.imageUrl; $('detailBody').append(image);
    }
    if(!$('detailDialog').open)$('detailDialog').showModal();
  }
  function checkAvailable() { if(live&&!connected)throw new Error('ยังไม่เชื่อมต่อ กรุณารอข้อมูลสดก่อนบันทึก'); }
  async function mutate(id, change) {
    if(busy.has(id))return;
    try {
      checkAvailable(); busy.add(id); render();
      if(live) {
        await api.runTransaction(db,async transaction=>{
          const ref=api.doc(db,'orders',id), snapshot=await transaction.get(ref);
          if(!snapshot.exists())throw new Error('ไม่พบบิลนี้แล้ว');
          const latest=snapshot.data();
          if(latest.softDeleted || latest.completed)throw new Error('บิลนี้ถูกปิดแล้ว กรุณาตรวจข้อมูลล่าสุด');
          transaction.update(ref,{...change(latest),updatedAt:api.serverTimestamp()});
        });
      } else {
        const index=orders.findIndex(o=>o.id===id);
        if(index<0)throw new Error('ไม่พบบิล');
        orders[index]={...orders[index],...change(orders[index])};
      }
      toast(live?'บันทึกแล้ว':'อัปเดตข้อมูลทดลองแล้ว');
    } catch(error) { toast(`บันทึกไม่สำเร็จ: ${error.message}`); }
    finally { busy.delete(id); render(); if($('detailDialog').open)detail(currentDetail); }
  }
  $('board').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.detail){detail(b.dataset.detail);return;}
    if(b.dataset.order) {
      // Capture intent, not a blind toggle, so transaction retries remain idempotent.
      const o=orders.find(x=>x.id===b.dataset.order), original=items(o)[Number(b.dataset.item)];
      if(!original)return;
      const value=!original.done;
      mutate(o.id,latest=>{
        const updated=items(latest).map(i=>({...i}));
        const index=original.id ? updated.findIndex(i=>i.id===original.id) : Number(b.dataset.item);
        if(index<0 || !updated[index] || updated[index].text!==original.text)throw new Error('รายการเปลี่ยนแล้ว กรุณาตรวจบิลอีกครั้ง');
        updated[index].done=value; return {items:updated};
      });
    }
    if(b.dataset.complete)mutate(b.dataset.complete,latest=>{
      if(!items(latest).length || !items(latest).every(i=>i.done))throw new Error('ยังเช็กรายการไม่ครบ');
      const duration=Math.max(0,Date.now()-latest.createdAtMs), exceeded=!!latest.exceeded30m || duration>1800000;
      return {completed:true,completedAtMs:Date.now(),completionDurationMs:duration,exceeded30m:exceeded,exceeded30mAtMs:latest.exceeded30mAtMs || (exceeded?Date.now():0)};
    });
  });
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
  $('search').addEventListener('input',render);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$ (b.dataset.close).close()));
  function addLine() {
    const row=document.createElement('div'); row.className='draft-line';
    row.innerHTML='<input class="menu-name" list="menuSuggestions" required maxlength="200" placeholder="ชื่อเมนู / หมายเหตุรายจาน" aria-label="ชื่อเมนู"><input class="menu-qty" type="number" min="1" max="99" step="1" value="1" required aria-label="จำนวน"><button type="button" aria-label="ลบรายการ">✕</button>';
    row.querySelector('button').onclick=()=>{if($('draftLines').children.length>1)row.remove();else toast('ต้องมีอย่างน้อย 1 รายการ');};
    $('draftLines').append(row); row.querySelector('input').focus();
  }
  $('addLine').onclick=()=>{if($('draftLines').children.length<30)addLine();else toast('ส่งได้ครั้งละไม่เกิน 30 รายการ');};
  $('newOrder').onclick=()=>{
    $('formError').textContent='';
    $('reviewText').textContent=live?'ข้อมูลจะส่งเข้าครัวจริง • ตรวจโต๊ะ จำนวน และหมายเหตุก่อนส่ง':'โหมดทดลอง • ออเดอร์นี้ไม่ส่งเข้าครัวจริง';
    if(!$('draftLines').children.length)addLine();
    $('createDialog').showModal();
  };
  $('createDialog').addEventListener('cancel',e=>{if(submitting)e.preventDefault();});
  $('createForm').onsubmit=async e=>{
    e.preventDefault(); if(submitting)return;
    const form=e.currentTarget, data=new FormData(form);
    const newItems=[...$('draftLines').children].map(row=>({id:uid(),text:`${Number(row.querySelector('.menu-qty').value)} × ${row.querySelector('.menu-name').value.trim()}`,raw:row.querySelector('.menu-name').value.trim(),done:false,matchType:'manual',confidence:1}));
    try {
      checkAvailable();
      if(!String(data.get('table')).trim() || !String(data.get('staff')).trim() || !newItems.length || newItems.some(i=>!i.raw))throw new Error('กรอกโต๊ะ ผู้ส่ง และชื่อเมนูให้ครบ');
      submitting=true; $('submitOrder').disabled=true; $('submitOrder').textContent='กำลังส่ง…';
      const stamp=Date.now(), text=newItems.map(i=>i.text).join('\n');
      const order={billNo:String(data.get('bill')).trim(),tableNo:String(data.get('table')).trim(),hostessName:String(data.get('staff')).trim(),guestName:'',notes:String(data.get('notes')).trim(),imageUrl:'',rawText:text,readingText:text,items:newItems,ocrStatus:'manual',completed:false,softDeleted:false,createdAtMs:stamp,completedAtMs:0,completionDurationMs:0,exceeded30m:false,exceeded30mAtMs:0,alertPhrase:'ออเดอร์ยังไม่เสร็จนะคะเชฟ'};
      if(live) {
        // One fixed reference per submission prevents SDK retries creating duplicates.
        const ref=api.doc(api.collection(db,'orders'));
        await api.runTransaction(db,async tx=>{tx.set(ref,{...order,createdAt:api.serverTimestamp(),updatedAt:api.serverTimestamp()});});
      } else orders.push({...order,id:uid()});
      form.reset(); $('draftLines').innerHTML=''; $('createDialog').close(); filter='active'; $('search').value=''; render(); toast(live?'ส่งออเดอร์เข้าครัวแล้ว':'เพิ่มออเดอร์ทดลองแล้ว');
    } catch(error) { $('formError').textContent=`ส่งไม่สำเร็จ: ${error.message}`; }
    finally {submitting=false;$('submitOrder').disabled=false;$('submitOrder').textContent='ตรวจแล้ว • ส่งเข้าครัว';}
  };
  let alertAudio;
  $('sound').onclick=async()=>{
    sound=!sound; $('sound').setAttribute('aria-pressed',String(sound)); $('sound').textContent=sound?'เสียงเปิดอยู่':'เปิดเสียง';
    if(sound){alertAudio ||= new Audio('assets/alerts/chef-alert.mp3');try{await alertAudio.play();}catch{toast('เปิดเสียงไม่ได้ กรุณาตรวจเสียงของอุปกรณ์');}}else if(alertAudio){alertAudio.pause();alertAudio.currentTime=0;}
  };
  const seedMenus=['Tom Yum Goong','Pad Thai Goong','Carbonara','Club Sandwich','French Fries','Chicken Fried Rice','Caesar Salad'];
  function menus(names) { $('menuSuggestions').innerHTML=[...new Set(names)].sort().map(n=>`<option value="${esc(n)}"></option>`).join(''); }
  menus(seedMenus);
  function updateSource(key,snapshot) {
    sourceOrders.set(key,snapshot.docs.map(d=>({ ...d.data(),id:d.id })));
    sourceFresh.set(key,!snapshot.metadata.fromCache);
    connected=!feedFailed && sourceFresh.get('active')===true && sourceFresh.get('ready')===true && navigator.onLine;
    const prior=new Set(orders.map(o=>o.id));
    orders=[...new Map([...sourceOrders.values()].flat().map(o=>[o.id,o])).values()].filter(o=>!o.softDeleted);
    if(key==='active' && initialized && sound && orders.some(o=>active(o)&&!prior.has(o.id)))alertAudio?.play().catch(()=>{});
    if(key==='active')initialized=true;
    networkState();render();
    if(snapshot.size>=200){$('notice').textContent='เชื่อมข้อมูลจริง • แสดงสูงสุด 200 บิลค้าง และ 200 บิลพร้อมเสิร์ฟต่อวัน หากครบขีดจำกัดให้ตรวจบอร์ดเดิมด้วย';}
  }
  async function connectLive() {
    $('mode').disabled=true;
    try {
      const base='https://www.gstatic.com/firebasejs/10.12.5/';
      const [app,firestore]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js')]);
      api=firestore;
      const config=window.LAYA_FIREBASE_CONFIG;
      if(!config?.projectId)throw new Error('ไม่พบ Firebase config');
      const firebase=app.initializeApp(config,'staff-order-desk');
      const databaseId=String(window.LAYA_FIRESTORE_DATABASE_ID || '').trim();
      db=databaseId?api.getFirestore(firebase,databaseId):api.getFirestore(firebase);
      live=true;connected=false;orders=[];networkState();render();
      $('notice').textContent='ระบบจริง • ออเดอร์และการเช็กจะบันทึกร่วมกับกระดานครัวเดิม • แสดงสูงสุด 200 บิลค้าง และ 200 บิลพร้อมเสิร์ฟวันนี้';
      $('notice').classList.add('live');$('mode').textContent='กลับโหมดทดลอง';
      const onError=error=>{feedFailed=true;connected=false;networkState();$('notice').textContent=`เชื่อมต่อไม่สำเร็จ: ${error.message} • กรุณากลับโหมดทดลองหรือตรวจการเชื่อมต่อ`;render();};
      const c=api.collection(db,'orders');
      unsubscribers.push(api.onSnapshot(api.query(c,api.where('completed','==',false),api.limit(200)),{includeMetadataChanges:true},s=>updateSource('active',s),onError));
      unsubscribers.push(api.onSnapshot(api.query(c,api.where('completedAtMs','>=',todayStart()),api.limit(200)),{includeMetadataChanges:true},s=>updateSource('ready',s),onError));
      api.getDocs(api.collection(db,'menu_master')).then(s=>menus([...seedMenus,...s.docs.map(d=>d.data().name).filter(n=>typeof n==='string')])).catch(()=>{});
    } catch(error) {toast(`เชื่อมระบบไม่ได้: ${error.message}`);}
    finally {$('mode').disabled=false;}
  }
  $('mode').onclick=()=>{
    if(submitting || busy.size){toast('กรุณารอให้บันทึกเสร็จก่อนเปลี่ยนโหมด');return;}
    if(live)location.href='staff-orders.html';else connectLive();
  };
  window.addEventListener('offline',()=>{connected=false;networkState();render();});
  window.addEventListener('online',()=>{if(live){connected=false;networkState();render();} });
  let propertyDay=todayStart();
  setInterval(()=>{
    if(live && todayStart()!==propertyDay && !submitting && !busy.size){
      propertyDay=todayStart();
      unsubscribers[1]?.();
      sourceOrders.delete('ready');sourceFresh.set('ready',false);connected=false;networkState();
      unsubscribers[1]=api.onSnapshot(api.query(api.collection(db,'orders'),api.where('completedAtMs','>=',propertyDay),api.limit(200)),{includeMetadataChanges:true},s=>updateSource('ready',s),error=>{feedFailed=true;connected=false;networkState();toast(error.message);render();});
    }
    render();
  },30000);
  render();
})();
