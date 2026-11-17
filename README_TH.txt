อัปเดตเว็บ: นำ photo-flow.js, kitchen.html, photo-kitchen.html วางทับที่เดิมใน GitHub แล้วรีเฟรช

เปิดระบบลบรูปจริง (ต้องทำเพิ่มครั้งเดียว ไม่ใช่อัปขึ้น GitHub แล้วทำงานทันที):
1. เปิด https://console.cloud.google.com/storage/browser?project=laya-order
2. เลือก bucket laya-order.firebasestorage.app
3. แท็บ Lifecycle > Add a rule > Delete object
4. ตั้ง Age = 3 days
5. ตั้ง Matches prefix = orders/photo- และ Matches suffix = /receipt
6. ตรวจแล้ว Create / Save โดยเก็บกฎอื่นที่มีอยู่ไว้
ทางเลือก: อัปไฟล์ enable-photo-retention.py เข้า Google Cloud Shell แล้วรัน python3 enable-photo-retention.py สคริปต์รวมกฎกับกฎเดิมให้

ลบเฉพาะรูปบิลในระบบถ่ายภาพนี้ ทั้งบิลเปิดและปิด เมื่ออายุรูปครบ 3 วัน ข้อมูลเมนู/บิลใน Firestore ยังคงอยู่ รูปเก่าที่ตรงเงื่อนไขจะถูกลบด้วย การลบเป็นรอบของ Google ไม่รับประกันตรงชั่วโมงที่ 72
หากเปิด Soft delete หรือ Object versioning ไว้ พื้นที่อาจยังถูกคิดเงินช่วงเก็บกู้คืน ตรวจแท็บ Protection ก่อนเลือกปิดนโยบายเหล่านั้น (มีผลทั้ง bucket)
รูปที่ลบแล้วเปิดจากบิลเก่าไม่ได้ ควรเก็บหลักฐานที่ต้องใช้นานกว่า 3 วันไว้อีกที่ก่อนเปิดกฎ

ระบบติ๊กเมนู: แสดงทันที บันทึกทีละรายการตามหลัง แตะรายการอื่นหรือแตะซ้ำได้ ไม่ล็อกการ์ด รอเมนูบันทึกครบก่อนปิดบิล ถ้าบันทึกล้มเหลวจะแจ้งและคืนค่าล่าสุด ต้องเปิดหน้าครัวไว้ขณะกำลังบันทึก
