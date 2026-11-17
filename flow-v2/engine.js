(function(root){
'use strict';
const clone=x=>structuredClone(x);
function state(o){if(o.items.every(i=>i.served===i.qty))return 'served';if(o.items.some(i=>i.picked>i.served))return 'delivering';if(o.items.every(i=>i.ready===i.qty))return 'ready';if(o.items.some(i=>i.ready>i.picked))return 'partial';if(o.startedAt)return 'cooking';return o.acceptedAt?'accepted':'new';}
function validate(o){if(!o.table.trim()||!o.actor.trim()||!o.items.length)throw Error('กรอกโต๊ะ ผู้ส่ง และรายการอาหาร');for(const i of o.items){if(!i.name.trim()||![i.qty,i.ready,i.picked,i.served].every(Number.isInteger)||i.qty<1||i.qty>99||i.served<0||i.served>i.picked||i.picked>i.ready||i.ready>i.qty)throw Error('จำนวนอาหารไม่ถูกต้อง');}return o;}
function apply(input,cmd,actor,at=Date.now()){
 if(!actor.trim())throw Error('ระบุชื่อผู้ดำเนินการ');
 if(input.events.some(e=>e.id===cmd.id))return input;
 const o=clone(input); if(state(o)==='served')throw Error('บิลนี้เสิร์ฟครบแล้ว');
 if(cmd.type==='accept'){if(o.acceptedAt)throw Error('มีผู้รับงานแล้ว');o.acceptedAt=at;}
 else if(cmd.type==='start'){if(!o.acceptedAt||o.startedAt)throw Error('ต้องรับงานก่อน หรือเริ่มทำไปแล้ว');o.startedAt=at;}
 else {const i=o.items.find(i=>i.id===cmd.item);if(!i)throw Error('ไม่พบรายการ');
 const n=Number(cmd.qty);if(!Number.isInteger(n)||n<1)throw Error('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
 if(cmd.type==='ready'){if(!o.startedAt)throw Error('ต้องเริ่มทำก่อน');if(i.ready+n>i.qty)throw Error('เกินจำนวนที่สั่ง');i.ready+=n;i.readyAt=at;}
 else if(cmd.type==='pick'){if(i.picked+n>i.ready)throw Error('อาหารพร้อมไม่พอ อาจมีคนรับไปแล้ว');i.picked+=n;i.pickedAt=at;}
 else if(cmd.type==='serve'){if(i.served+n>i.picked)throw Error('ต้องรับอาหารก่อนยืนยันเสิร์ฟ');i.served+=n;i.servedAt=at;}
 else throw Error('คำสั่งไม่ถูกต้อง');}
 o.events.push({...cmd,actor,at});o.updatedAt=at;o.status=state(o);if(o.status==='served')o.closedAt=at;return validate(o);
}
const api={state,validate,apply};if(typeof module!=='undefined')module.exports=api;else root.FlowEngine=api;
})(typeof window!=='undefined'?window:globalThis);
