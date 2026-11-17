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
