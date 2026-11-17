# Receipt reading update — 10 real examples

ตัวอย่างที่ผู้ใช้ส่ง: 10 บิล 25 บรรทัดเมนู รวมจำนวนสั่ง 26 หน่วย (Beef Burger AIP บิล A201 สั่ง 2)

Expected extraction ถอดด้วยตนเองจากภาพ ไม่ใช่ผล OCR:

| บิล | โต๊ะ/ห้องตามบิล | รายการ | จุดตรวจ |
|---|---|---:|---|
| TST0004994 | C230 | 2 | French Fried AIP; Grilled Angus Rib Eye AIP — Well Done |
| TST0004996 | A233 | 4 | Greek Salad Bowl with Smoked Salmon; Wagyu Beef Burger — Well done; Tropical Fruit Plate; Welle Water 500 ml. มีลายมือท้ายบิลต้องตรวจจากรูป |
| TST0004999 | OS1 | 1 | Tropical Fruit Plate ราคา 170 ต้องไม่เป็นจำนวน |
| TST0005001 | OS2 | 1 | Carbonara — Fettuccine Pasta |
| MGV0001402 | B210A | 5 | 1ST COURSE: Goong Sa-Rong, Spring Rolls, Pork Minced Soup; 2ND COURSE: Salmon และ Sirloin ทั้งสอง Well Done; ทุกเมนู AIP |
| TST0005004 | C511 | 2 | NOspicy ติดเฉพาะ Mee Sapam |
| TST0005012 | OS | 2 | Less Spicy ติดเฉพาะ Tom Yum Goong |
| TST0005016 | B319 | 5 | Less Spicy ติดแกงเขียวหวาน; Spaghetti Pasta ติด Carbonara; Strawberry Panna Cotta อยู่คอร์ส 2 |
| TST0004992 | C205 | 2 | เก็บ only carot oninn ตามบิล ไม่เปลี่ยนความหมายเอง |
| TST0004993 | A201 | 1 | Beef Burger AIP จำนวน 2 |

## เพิ่มในแอป

อ่านด้วย OCR เดิมแล้วส่งข้อความเข้า receipt-parser.js เพื่อเติมโต๊ะ เลขบิล จำนวน เมนู และหมายเหตุให้ฟอร์มตรวจ

- รวมชื่อเมนูที่ขึ้นบรรทัดใหม่
- AIP แยกเป็น package แล้วแสดงกำกับในหมายเหตุ
- คอร์สแยกจากเมนู แล้วแสดงกำกับ ไม่ใช่ตัวควบคุมการ fire คอร์สอัตโนมัติ
- modifier ผูกกับเมนูบรรทัดก่อนหน้า
- ตัดตัวเลขราคาท้ายบรรทัด (heuristic สำหรับรูปแบบบิลนี้ ต้องตรวจตัวเลขที่เป็นส่วนชื่อเมนู)
- ไม่เดาจำนวนเมื่อ OCR ไม่มีจำนวนชัดเจน
- ไม่ใช้โต๊ะ OS / OS1 / OS2 แทนกัน และไม่แปลง B210A เป็นเลขห้องรูปแบบอื่น
- เก็บข้อความดิบไว้ตรวจย้อนหลัง
- แจ้งเตือนกรณีหลายโต๊ะ ไม่พบเลขบิล มีเครื่องดื่ม หรือข้อความที่ต้องตรวจ
- ลายมือไม่ได้รับประกันการอ่าน และข้อความที่ OCR ไม่เห็นอาจไม่ปรากฏเป็นคำเตือนเฉพาะ ต้องเทียบรูปทุกครั้ง

ข้อความที่พบชื่อพนักงาน/หมายเหตุที่หลุดไปอยู่ในส่วนเมนูอาจถูกต่อเป็นชื่อเมนู ต้องตรวจสอบกับรูป วิธีนี้ยังไม่ใช่ AI เข้าใจภาพ

## ผลตรวจ

node receipt-parser.test.cjs: ผ่าน fixture ทั้ง 10 บิล พร้อมกรณี modifier, wrapped line, course, quantity, multi-table, missing quantity
node test.cjs: ผ่านวงจรการทำอาหารและเสิร์ฟ

ห้ามนำผล fixture ไปอ้างว่าอ่านภาพได้แม่นยำ 100% ข้อความใน fixture เป็นการถอดด้วยตนเอง ยังไม่มีชุดผล OCR จริงมาเทียบ และตัวอ่าน AI ภายนอกยังไม่ได้เชื่อม

## AI ขั้นถัดไป

ต้องใช้ endpoint ฝั่งเซิร์ฟเวอร์ที่มี secret, Auth, quota และตรวจผลลัพธ์ก่อนใช้ ข้อมูลที่ AI ส่งกลับควรเป็น outlet, bill, table, items [{quantity|null, rawName, canonicalMenuId|null, package|null, course|null, modifiers[], evidenceText}], warnings[] ให้ null เมื่ออ่านไม่ได้

จำกัดการจับคู่ชื่อกับฐานเมนูที่ผู้ดูแลยืนยัน ไม่บังคับชื่อที่คล้ายกันให้เป็นเมนูเดียวกัน เช่น Beef Burger กับ Wagyu Beef Burger, Sirloin กับ Rib Eye

ภาพอาจมีหลายบิลและฉากหลัง ต้องเลือกบิลหลัก ห้ามรวมรายการจากบิลในพื้นหลัง ทดสอบกับรูปชุดนี้ก่อนเปิดส่งอัตโนมัติ และแยกชุดภาพทดสอบใหม่ที่ไม่เคยใช้ปรับกติกาออกจากชุดนี้ด้วย
