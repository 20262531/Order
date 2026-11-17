# แก้ปิดบิลไม่ได้: รายการเปลี่ยนระหว่างยืนยัน

สาเหตุที่จำลองได้: การใช้ JSON.stringify(items) เปรียบเทียบ snapshot กับข้อมูล transaction จะให้ผลต่างเมื่อ key ภายใน map เรียงไม่เหมือนกัน แม้ทุกค่าจะเหมือนกัน เช่น {id,text,done} กับ {done,text,id}

แก้ photo-jobs.js เพิ่ม canonical fingerprint ที่เรียง key ใน object อย่างคงที่ แต่ยังคงลำดับรายการและค่าเดิมทุกฟิลด์ ใช้ทั้งก่อนปิดบิลและก่อนแทนผลอ่าน AI ใหม่

ยังคงถามยืนยันปิด และกันการเปลี่ยนเมนู/จำนวน/checkbox จริงระหว่างยืนยัน ไม่ลบรูป ไม่ติ๊กอาหารที่ยังไม่เสร็จเอง ไม่เปิดบิลกลับจากผล AI ที่มาทีหลัง
เพิ่มข้อความ ปิดบิลแล้ว ✓ เมื่อบันทึกสำเร็จ

อัปเดตไฟล์เว็บบน GitHub ให้ครบจาก Order-main แล้ว Ctrl+Shift+R ทั้งหน้า Hostess และ Kitchen
ไฟล์เปลี่ยน: photo-jobs.js, photo-flow.js และ HTML ทั้งสี่ไฟล์ (hostess.html, kitchen.html, photo-hostess.html, photo-kitchen.html) เพื่อเปลี่ยนเวอร์ชัน cache
ไม่ต้องวาง Worker ใหม่ ไม่ต้องเปลี่ยน Secret หรือ Firebase rules ไม่ต้องอ่าน AI ใหม่เพื่อปิดบิล

close-bill.test.cjs ทดสอบ handler กดปิดจริงใน VM: key order ต่างกัน, บิลอ่านไม่สำเร็จ, checkbox ยังไม่ครบ, cancel, ข้อมูลเปลี่ยนจริง, ผล AI มาทีหลัง และบิลปิดไปแล้ว
photo-background.test.cjs / photo-jobs.test.cjs ผ่าน regression คิวรูปมาก่อน AI ตามหลัง
ทดสอบด้วยบริการจำลอง ไม่ได้ปิดบิลจริงของเจ้าของในรอบนี้
