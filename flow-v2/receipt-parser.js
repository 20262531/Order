(function(root){
'use strict';
function parse(text){
 const result={outlet:null,table:null,bill:null,items:[],warnings:[],rawText:String(text||'')};let current=null,course=null,inItems=false;
 const lines=result.rawText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const tables=[...result.rawText.matchAll(/\b([TR])\s*:\s*([A-Z0-9]+)/gi)].map(m=>m[2].toUpperCase());
 if(tables.length){result.table=tables[0];if(new Set(tables).size>1)result.warnings.push('พบโต๊ะ/ห้องหลายค่าในรูป ต้องเลือกบิลหลัก');}
 const bill=result.rawText.match(/#?\s*\(\s*((?:TST|MGV)\s*\d+)\s*\)/i);if(bill)result.bill=bill[1].replace(/\s/g,'');
 if(/\bMANGROVE\b/i.test(text))result.outlet='MANGROVE';else if(/THE\s+TASTE/i.test(text))result.outlet='THE TASTE';
 function flush(){if(!current)return;const original=current.name.replace(/\s+/g,' ').trim();current.rawName=original;current.package=/\bAIP\b/i.test(original)?'AIP':null;current.name=original.replace(/\bAIP\b/gi,'').replace(/\s+/g,' ').trim();if(!current.name)result.warnings.push('พบจำนวนแต่ไม่มีชื่อเมนู');else result.items.push(current);current=null;}
 for(const raw of lines){
  let line=raw.replace(/\s+/g,' ');
  if(/#?\s*\(\s*(TST|MGV)/i.test(line)){flush();inItems=false;continue;}
  const c=line.match(/\*?\s*(\d+)(?:ST|ND|RD|TH)\s+COURSE\s*\*?/i);
  if(c){flush();course=Number(c[1]);inItems=true;continue;}
  if(/^(THE TASTE|MANGROVE|Cover\b|Printer\b|\d{1,2}-\d{1,2}-\d{4}|[TR]\s*:|[-_=]{3,})/i.test(line))continue;
  const modifier=line.match(/^[-–—]{1,2}\s*(.+)/);
  if(modifier){if(current)current.modifiers.push(modifier[1]);else result.warnings.push('มีหมายเหตุที่ยังจับคู่เมนูไม่ได้: '+modifier[1]);continue;}
  const item=line.match(/^(\d{1,2})\s+(.+)/);
  if(item){flush();const quantity=Number(item[1]);if(quantity<1||quantity>99){result.warnings.push('จำนวนไม่ถูกต้อง: '+line);continue;}current={quantity,name:item[2].replace(/\s+\d+(?:[.,]\d{2})?\s*$/,''),modifiers:[],course,package:null,rawName:''};inItems=true;continue;}
  if(current&&inItems){line=line.replace(/\s+\d+(?:[.,]\d{2})?\s*$/,'');if(/^[A-Za-z][A-Za-z\s&'.,()/-]*$/.test(line)){current.name+=' '+line;}else result.warnings.push('ข้อความต้องตรวจด้วยตนเอง: '+line);}
 }
 flush();
 if(!result.table)result.warnings.push('อ่านโต๊ะ/ห้องไม่ได้');if(!result.bill)result.warnings.push('อ่านเลขบิลไม่ได้');if(!result.items.length)result.warnings.push('ไม่พบรายการอาหารที่มีจำนวนชัดเจน');
 if(result.items.some(i=>/^Welle Water\b/i.test(i.name)))result.warnings.push('มีเครื่องดื่มในบิล ต้องตรวจจุดรับผิดชอบก่อนส่งครัว');
 result.warnings.push('ตรวจลายมือและข้อความที่ OCR อาจตกหล่นเทียบรูปต้นฉบับ');
 return result;
}
const api={parse};if(typeof module!=='undefined')module.exports=api;else root.ReceiptParser=api;
})(typeof window!=='undefined'?window:globalThis);
