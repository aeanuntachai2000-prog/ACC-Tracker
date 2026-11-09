# ACCOUNTING TRACKER — PWA Starter

## สิ่งที่มีในเวอร์ชันนี้
- Dashboard หน้าแรก (ข้อมูลตัวอย่าง)
- Sidebar เมนู 8 โมดูล
- Mobile bottom navigation
- Responsive สำหรับมือถือและคอมพิวเตอร์
- PWA manifest, service worker และ app icons
- เปลี่ยนหน้าโดยไม่ reload ทั้งแอป

## วิธีทดลองบนคอมพิวเตอร์
1. แตก ZIP
2. เปิดโฟลเดอร์ด้วย VS Code
3. ใช้ส่วนขยาย Live Server หรือรัน local web server
4. เปิด URL ที่ได้จาก Live Server

> การติดตั้ง PWA ต้องเปิดผ่าน HTTPS หรือ localhost ไม่รองรับการติดตั้งจากการดับเบิลคลิกไฟล์ HTML แบบ file://

## วิธีติดตั้งบนโทรศัพท์
1. นำไฟล์ทั้งหมดขึ้น GitHub Pages หรือเว็บโฮสติ้งที่รองรับ HTTPS
2. เปิด URL ของแอปด้วย Chrome (Android) หรือ Safari (iPhone)
3. Android: เมนูเบราว์เซอร์ > Install app / Add to Home screen
4. iPhone: Share > Add to Home Screen

## ข้อจำกัดที่ตั้งใจไว้
- ตัวเลข Dashboard เป็นข้อมูลตัวอย่างเท่านั้น
- เมนูอีก 7 โมดูลเป็นโครงหน้าพร้อมพัฒนาต่อ
- ยังไม่มีฐานข้อมูล, ระบบ login, Excel import/sync หรือการบันทึกข้อมูลจริง
- ไม่มีการแก้ไขไฟล์ Excel ต้นฉบับ
