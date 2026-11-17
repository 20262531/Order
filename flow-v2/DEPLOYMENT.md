# Kitchen Flow v2 — pilot build

เริ่มต้น: เปิด flow-v2/index.html ผ่าน HTTPS หรือ localhost (python -m http.server 8000 ที่โฟลเดอร์ Order-main) แล้วเข้า http://localhost:8000/flow-v2/ ไม่ควรเปิดจาก file://

โหมดทดลอง: บันทึกบิล รูป และร่างใน IndexedDB บนเบราว์เซอร์เดียว รองรับรีเฟรช ไม่ซิงก์ข้ามอุปกรณ์ ชื่อผู้ดำเนินการเป็นชื่อที่กรอกเอง

ทำได้: ส่งรูป JPG/PNG/WebP ต่ำกว่า 8MB, OCR อังกฤษผ่าน Tesseract CDN (ต้องออนไลน์และผู้ใช้ตรวจทุกบรรทัด), กรอกจำนวน | เมนู | หมายเหตุ, ข้อมูลแพ้อาหาร, รับงาน, เริ่มทำ, ทำเสร็จทีละจำนวน, รับไปเสิร์ฟ, เสิร์ฟครบ, ประวัติ, ค้นหา, มุมมองครัว/นำเสิร์ฟ, เก็บร่างพร้อมรูป, retry ใช้รหัสบิลเดิม, กันรับเกินจำนวนด้วย transaction

การเชื่อมจริง: มี Firebase adapter และ Auth email/password ใช้ config เดิม แต่แยก collection kitchen_flow_v2 และ Storage kitchen_flow_v2/{uid}/{orderId}/receipt บัญชีต้องมี custom claim kitchenStaff=true ที่กำหนดผ่าน Admin SDK จากผู้ดูแล ไม่ได้สร้างบัญชีหรือแก้สิทธิ์ production ในรอบนี้

สำคัญ: rules เดิมจะปฏิเสธ collection ใหม่ตามปกติ ยังไม่พร้อมเปิด production ต้องเพิ่ม server-side validation / Firestore rules ที่ตรวจ schema และ transition รวมถึง Storage rules จำกัด staff และรูป ก่อนเปิดใช้ร่วมกันหลายเครื่อง ไม่ควรใช้ allow read,write: if true เป็นทางลัด ข้อมูล payload ปัจจุบันเป็น JSON สำหรับ pilot; ก่อน production ควรย้าย mutation ไป callable backend ที่ใช้ transition engine เดียวกันและบันทึก audit ที่ client แก้ไม่ได้

สถานะ pilot: logic engine ผ่าน automated tests; ยังไม่ได้ทดสอบ browser ภาพจริง, Firebase production, OCR กับบิลของร้าน, quota storage หรือ concurrency emulator ห้ามถือว่าเป็น production-ready

หน้าเดิมทั้งหมด รวม Scan and Dine ไม่ได้แก้ บิล v2 ไม่ปรากฏในครัวเดิม ให้ทีมทดลองในหน้า v2 เดียวกันเท่านั้น ข้อมูลเก่ายังไม่ย้ายเข้า v2

งานระยะต่อไปที่ยังไม่รวม: server-enforced roles และ audit, migration บิลเก่า, เพิ่มอาหาร/แก้รายการ/ยกเลิก/ทำใหม่, เสียงแจ้งเตือนและการรับทราบ, เกณฑ์เวลาปรับค่า, การแจ้งเตือนที่นับเวลาแต่ละชุดอาหารอย่างละเอียด, pagination บิลเกิน 200, retry queue หลังปิดเบราว์เซอร์, report SLA

ร่างและรูปทดลองเก็บในเบราว์เซอร์ อาจหายเมื่อผู้ใช้ล้างข้อมูลเว็บไซต์ โหมดจริงไม่ล้างไฟล์รูปที่อัปโหลดแล้วแต่ยังไม่ได้สร้างบิลอัตโนมัติ

อัปเดตตัวแยกข้อความบิล: ดู RECEIPT_READING.md; เพิ่ม receipt-parser.js ในรายการไฟล์ที่ต้องอัปโหลด การอ่านนี้ยังใช้ OCR เดิม ไม่ได้เชื่อม AI ภายนอก
