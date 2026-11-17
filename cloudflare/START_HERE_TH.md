# AI อ่านบิล — ไม่ต้องใส่รหัสพนักงาน

ตามคำขอเจ้าของ: เอา KITCHEN_ACCESS_TOKEN และหน้ากรอกรหัสพนักงานออกจากทั้ง Worker และเว็บแล้ว

## ทำทีละขั้น

1. OPENAI_API_KEY ที่ใส่ใน Cloudflare Production Secret ใช้ตัวเดิมได้ ไม่ต้องสร้าง Secret เพิ่ม
2. แตก ZIP แล้วเปิด Order-main/cloudflare/worker.js ด้วย Notepad/VS Code คัดลอกทั้งไฟล์
3. Cloudflare → kitchen-bill-reader → Edit code → แทนโค้ด Hello World ทั้งหมด → Deploy
4. เปิด workers.dev ใน Domains หรือ Settings → Domains & Routes หากหน้าหลักยังขึ้น No URLs enabled
5. เปิด URL ที่ Cloudflare แสดงต่อท้าย /health ควรเห็น ready:true การเข้า /health ไม่เรียก OpenAI
6. อัปโหลดเว็บใน Order-main ขึ้น hosting เดิม รวม ai-config.js, ai-client.js, photo-flow.js และ HTML ใหม่ให้ครบ
7. Worker URL เริ่มต้นใน ai-config.js อ้างอิงชื่อจากภาพ หาก URL จริงต่างให้แก้ไฟล์นี้ หรือกด ตั้งค่า AI ในเว็บเพื่อบันทึก URL ในเครื่อง (ผู้ดูแลทำครั้งเดียว ไม่มีช่องรหัส)
8. พนักงานถ่าย/เลือกรูป → กดอัปโหลด → ระบบเรียก AI → ครัวกดรายการที่เสร็จได้

## ตัวแปร

Secret ที่ต้องมี: OPENAI_API_KEY เท่านั้น
ตัวแปร ALLOWED_ORIGIN (Plain text): ค่าเริ่มต้น https://20262531.github.io ถ้าเว็บใช้โดเมนอื่นให้เปลี่ยนเป็น origin จริง เช่น https://order.example.com ไม่มี path
KITCHEN_ACCESS_TOKEN เดิมหากสร้างไว้แล้วจะไม่ถูกใช้งาน ไม่จำเป็นต้องลบทิ้งเพื่อให้โค้ดทำงาน

ไม่มี API Key ในโค้ดเว็บหรือ GitHub ไม่มีรหัสพนักงานและไม่มี header token
ข้อจำกัด Origin/CORS ไม่ใช่การยืนยันตัวตน ผู้เรียกนอกเบราว์เซอร์อาจปลอม Origin ได้ เจ้าของรับความเสี่ยงของการไม่ใช้รหัสตามคำขอ ห้ามอ้างว่าจำกัดเฉพาะพนักงานได้

## งบ

คง OpenAI hard spend limit US$5 และ Auto-reload OFF ตามที่เจ้าของตั้งไว้
วงเงิน OpenAI ครอบคลุมทั้ง organization, อาจเกินเล็กน้อยจากคำขอค้าง ไม่มีตัวนับงบรายเดือนแยกใน Worker
ค่า FX ภาษี Cloudflare/Firebase ไม่รวมใน hard limit นี้ และไม่รับประกันราคา 0.06 บาทต่อบิล
ใช้ gpt-4.1-mini อ่านหนึ่งครั้งต่อคำขอ จำกัดคำตอบ 1600 tokens และย่อภาพด้านยาวไม่เกิน 1400px ไม่มี fallback โมเดลแพง/ไม่มี retry อัตโนมัติ
cache ผลอ่านสำเร็จประมาณ 24 ชั่วโมงแบบ best effort ต่อ data center และรวมคำขอซ้ำรูปเดียวกันภายใน isolate เดียว ไม่รับประกัน exactly-once billing
คำขอที่ AI อ่านแล้วแต่ไม่ผ่าน validation อาจเสียค่าใช้จ่าย ให้ดูต้นทุนจริงที่ OpenAI Usage

## ทดสอบและสถานะ

ผ่าน worker.test.mjs แบบจำลอง: ไม่ต้องมีรหัส, ปฏิเสธ Origin ผิด, ไม่มี secret ใช้ไม่ได้, จำกัดขนาดรูป, schema/quantity/modifier checks, cache, คำขอซ้ำ, incomplete output, health ไม่เผย key
ยังไม่ได้ deploy หรือทดสอบกับคีย์จริง ต้องตรวจบิลตัวอย่างกับผล AI ก่อนนำไปทำอาหารจริง
รูปบิลส่งผ่าน Cloudflare ไป OpenAI โดย store:false; ผลอ่าน cache อยู่ใน Cloudflare และข้อมูลบิลเก็บ Firebase เดิม ภาพต้นฉบับยังใช้เปิดตรวจได้
Scan and Dine และ Firebase rules ไม่เปลี่ยน

## แก้ Failed to fetch ที่ปุ่มอ่านใหม่

ต้องอัปเดตทั้ง Worker และเว็บใน ZIP ชุดเดียวกัน:
- Cloudflare: วาง cloudflare/worker.js ใหม่แล้ว Deploy; /health จะมี version:firebase-fetch-fix-1
- GitHub Pages: อัปเดตไฟล์ใน Order-main รวม ai-client.js, photo-flow.js และ HTML ที่อ้างเวอร์ชันใหม่ จากนั้น Ctrl+Shift+R

อ่านใหม่จะส่ง imageUrl ให้ Worker ดึงรูปเอง จึงไม่ต้องให้ browser fetch Firebase รูปเดิมข้าม origin โดยตรง Worker อนุญาตเฉพาะ https://firebasestorage.googleapis.com ใน bucket laya-order.firebasestorage.app หรือ laya-order.appspot.com และ path orders/ เท่านั้น ห้ามตาม redirect
URL download อาจมี token สำหรับรูป ส่งผ่าน HTTPS ไป Worker ไม่บันทึก URL นี้ใน log ที่โค้ดสร้าง
หากรูปหาย สิทธิ์ถูกปิด token ใช้ไม่ได้ หรือ Worker ดึงรูปไม่ได้ จะแสดง Firebase + HTTP status (ถ้ามี) ก่อนเรียก AI
รูปที่อ่านใหม่ใช้ไฟล์เดิมจาก Firebase สูงสุด 8MB ไม่มีการ resize ฝั่ง Worker จึงอาจใช้ image tokens มากกว่าการอัปโหลดใหม่ที่ browser ย่อเป็นด้านยาว 1400px ราคาต่อบิลยังไม่ใช่ค่าคงที่
ไม่มีการเปลี่ยน CORS bucket/rules production จากไฟล์นี้ ผลจริงยังต้องทดสอบกับ URL บิลจริงโดยเจ้าของ
firebase-fetch.test.mjs ผ่านด้วย mock: CORS-free server fetch, whitelist, no redirects, failure before AI, cache; ไม่ใช้เครดิตจริง

## แยกการอ่านเมนูกับข้อมูลหัวบิล (menu-metadata-fix-2)

โค้ดเก่าปฏิเสธบิลทั้งใบเมื่อ table หรือ bill เป็น null แม้ชื่อเมนูและจำนวนครบ ชุดนี้อนุญาตให้เมนูที่ AI ยืนยันว่าอ่านครบผ่านได้ และแสดงคำเตือนให้ตรวจโต๊ะ/เลขบิลจากรูปอย่างชัดเจน ไม่เดาข้อมูลปลายทาง
หากเมนูไม่ครบ จำนวนเป็น null หรือ readable=false ยังคงไม่สร้างรายการ และแจ้งเหตุผลเฉพาะ เช่น อ่านจำนวน Mee Sapam ไม่ได้
อนุญาตรูปแบบ #(TST...) และ T: C511 ที่ AI อาจส่งกลับ โดยเอาเฉพาะเครื่องหมายครอบออก ไม่เปลี่ยนตัวเลข
การ์ดบิลที่อ่านล้มเหลวจะเก็บข้อความผิดพลาดไว้ใน notes และเปิดสาเหตุให้อัตโนมัติ (ข้อความของบิลเก่ายังเป็นข้อความเดิมจนเรียกอ่านอีกครั้ง)
ต้อง deploy Worker และเว็บคู่กัน /health จะมี version:menu-metadata-fix-2
metadata.test.mjs ผ่านกรณีเมนู C511 2 รายการ, modifier NOspicy เฉพาะ Mee Sapam, missing metadata, missing quantity และ readable=false ด้วย mock ไม่ใช่การยืนยันว่า OpenAI อ่านรูปผู้ใช้ถูกแล้ว
