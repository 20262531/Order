const assert=require('node:assert/strict'),P=require('./receipt-parser.js'),fixtures=require('./receipt-fixtures.cjs');let count=0;
for(const f of fixtures){const r=P.parse(f.text);assert.equal(r.table,f.table);assert.equal(r.bill,f.bill);assert.deepEqual(r.items.map(i=>i.quantity),f.qty);assert.deepEqual(r.items.map(i=>i.name),f.names);count+=r.items.length;}
let r=P.parse(fixtures[4].text);assert.deepEqual(r.items.map(i=>i.course),[1,1,1,2,2]);assert.equal(r.items[3].modifiers[0],'Well Done');assert.equal(r.items[2].modifiers.length,0);assert.ok(r.items.every(i=>i.package==='AIP'));
r=P.parse(fixtures[5].text);assert.deepEqual(r.items[0].modifiers,[]);assert.deepEqual(r.items[1].modifiers,['NOspicy']);
r=P.parse(fixtures[7].text);assert.equal(r.items[4].course,2);assert.deepEqual(r.items[2].modifiers,['Spaghetti Pasta']);
assert.equal(P.parse('Pad Thai Goong').items.length,0);assert.ok(P.parse('T: A01\nT: B02\n1 Soup').warnings.some(w=>w.includes('หลายค่า')));
assert.ok(P.parse(fixtures[1].text).warnings.some(w=>w.includes('เครื่องดื่ม')));assert.deepEqual(P.parse(fixtures[8].text).items[1].modifiers,['only carot oninn']);
console.log(`PASS: ${fixtures.length} human-transcribed receipts, ${count} menu lines; quantities, table/bill, wrapped names, modifiers, AIP, courses, uncertain/no-quantity safeguards. NOT an image OCR accuracy benchmark.`);

assert.equal(P.normalizeTable('TI'),'T1');assert.equal(P.normalizeTable('T1'),'T1');assert.equal(P.normalizeTable(' ti '),'T1');for(const name of ['OS','OS1','OS2','C321','B210A','T11','A201'])assert.equal(P.normalizeTable(name),name);
assert.equal(P.parse('T: TI\n1 Khao Phad Chicken\n#(TST0005058) T: T1').table,'T1');assert.equal(P.parse('T: TI\n1 Khao Phad Chicken\n#(TST0005058) T: T1').warnings.some(w=>w.includes('หลายค่า')),false);
console.log('PASS: confirmed TI → T1 alias; repeated headers reconcile; other tables/rooms preserved');
