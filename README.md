# ระบบแจ้งทำข่าวประชาสัมพันธ์

เว็บ HTML/CSS/JavaScript สำหรับ GitHub Pages พร้อม Google Apps Script backend, Google Sheet สำหรับข้อมูลข่าว และ Google Drive สำหรับเก็บรูป/ไฟล์แผ่นข่าวที่เสร็จสมบูรณ์

## ไฟล์ในชุดนี้

- `index.html` หน้าแจ้งทำข่าวและแสดงข่าวประชาสัมพันธ์ที่เสร็จสมบูรณ์
- `admin.html` หน้าแอดมิน
- `style.css` สไตล์ responsive ใช้ฟอนต์ Sarabun
- `script.js` JavaScript สำหรับหน้าแจ้งข่าว
- `admin.js` JavaScript สำหรับหน้าแอดมิน
- `Code.gs` backend สำหรับ Google Apps Script
- `README.md` คู่มือติดตั้ง

## 1. เตรียม Google Sheet

1. เข้า Google Drive แล้วสร้าง Google Sheet ใหม่
2. ตั้งชื่อไฟล์ เช่น `PR News Database`
3. คัดลอก `SHEET_ID` จาก URL ของ Sheet

ตัวอย่าง URL:

```text
https://docs.google.com/spreadsheets/d/1AbCDefGhIjKlMnOpQrStUvWxYz/edit
```

`SHEET_ID` คือ:

```text
1AbCDefGhIjKlMnOpQrStUvWxYz
```

ไม่ต้องสร้างหัวตารางเอง เพราะ `Code.gs` จะสร้าง sheet ชื่อ `News` และหัวตารางให้อัตโนมัติเมื่อรัน `setup()`

## 2. เตรียม Google Drive Folder

1. เข้า Google Drive แล้วสร้างโฟลเดอร์หลัก เช่น `PR News Uploads`
2. เปิดโฟลเดอร์นั้น แล้วคัดลอก `ROOT_FOLDER_ID` จาก URL

ตัวอย่าง URL:

```text
https://drive.google.com/drive/folders/1XyZFolderIdExample
```

`ROOT_FOLDER_ID` คือ:

```text
1XyZFolderIdExample
```

เมื่อมีคนแจ้งข่าวใหม่ ระบบจะสร้างโฟลเดอร์ย่อยแยกตามรหัสข่าวในโฟลเดอร์นี้

## 3. สร้าง Google Apps Script

1. ไปที่ [https://script.google.com](https://script.google.com)
2. สร้างโปรเจกต์ใหม่
3. ลบโค้ดเดิมในไฟล์ `Code.gs`
4. คัดลอกโค้ดจากไฟล์ `Code.gs` ในชุดนี้ไปวาง
5. แก้ค่าด้านบนของไฟล์ `Code.gs`

```javascript
const CONFIG = {
  SHEET_ID: "PASTE_YOUR_SHEET_ID_HERE",
  SHEET_NAME: "News",
  ROOT_FOLDER_ID: "PASTE_YOUR_ROOT_FOLDER_ID_HERE",
  NOTIFY_EMAIL: "gritsn.th@gmail.com",
  ADMIN_TOKEN_SECONDS: 21600
};
```

ให้เปลี่ยน:

- `PASTE_YOUR_SHEET_ID_HERE` เป็น ID ของ Google Sheet
- `PASTE_YOUR_ROOT_FOLDER_ID_HERE` เป็น ID ของ Drive folder หลัก
- `NOTIFY_EMAIL` ตั้งไว้เป็น `gritsn.th@gmail.com` ตามเงื่อนไขแล้ว

## 4. ตั้งรหัสผ่านแอดมินแบบไม่ฝังในหน้าเว็บ

ห้ามใส่รหัสผ่านไว้ใน `index.html`, `admin.html`, `script.js`, หรือ `admin.js`

ให้ตั้งใน Script Properties:

1. ในหน้า Apps Script กด `Project Settings`
2. เลื่อนหา `Script Properties`
3. กด `Add script property`
4. ตั้งค่า:

```text
Property: ADMIN_PASSWORD
Value: ใส่รหัสผ่านแอดมินที่ต้องการ
```

ระบบจะตรวจรหัสนี้จากฝั่ง Google Apps Script และออก token ชั่วคราวให้หน้า `admin.html`

## 5. รัน setup และอนุญาตสิทธิ์

1. ใน Apps Script เลือกฟังก์ชัน `setup`
2. กด `Run`
3. ระบบจะขอสิทธิ์เข้าถึง Google Sheet, Google Drive และส่งอีเมล
4. กดยืนยันสิทธิ์ให้ครบ

หลังรันสำเร็จ:

- Sheet จะมีแท็บชื่อ `News`
- หัวตารางจะถูกสร้างอัตโนมัติ
- Apps Script จะตรวจว่าเปิด Drive folder ได้

## 6. Deploy เป็น Web App

1. กด `Deploy`
2. เลือก `New deployment`
3. กดรูปเฟือง แล้วเลือก `Web app`
4. ตั้งค่า:

```text
Execute as: Me
Who has access: Anyone
```

5. กด `Deploy`
6. คัดลอก `Web app URL` ที่ลงท้ายด้วย `/exec`

ตัวอย่าง:

```text
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

ถ้าแก้ `Code.gs` ภายหลัง ต้องกด deploy เวอร์ชันใหม่อีกครั้ง หน้าเว็บจึงจะใช้โค้ด backend ล่าสุด

## 7. ตั้งค่า GOOGLE_SCRIPT_URL ในหน้าเว็บ

เปิดไฟล์ `script.js` และ `admin.js` แล้วแก้บรรทัดนี้ให้เป็น Web app URL จากข้อ 6

```javascript
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

ตัวอย่าง:

```javascript
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec";
```

ต้องแก้ทั้ง 2 ไฟล์:

- `script.js`
- `admin.js`

## 8. อัปโหลดขึ้น GitHub Pages

1. สร้าง GitHub repository ใหม่
2. อัปโหลดไฟล์ทั้งหมดในชุดนี้ไปไว้ที่ root ของ repository
3. เข้า repository แล้วไปที่ `Settings`
4. เลือก `Pages`
5. ตั้งค่า:

```text
Source: Deploy from a branch
Branch: main
Folder: /root
```

6. กด `Save`
7. รอ GitHub Pages สร้างเว็บ แล้วเปิด URL ที่ GitHub ให้มา

## 9. วิธีทดสอบระบบ

### ทดสอบหน้าแจ้งข่าว

1. เปิด `index.html` บน GitHub Pages
2. กรอกชื่อ-สกุล
3. กรอกหัวข้อข่าว
4. กรอกเนื้อหาข่าว
5. เลือกรูปภาพไม่เกิน 10 รูป
6. กด `ส่งข้อมูล`

ผลที่ควรเกิดขึ้น:

- มีแถวใหม่ใน Google Sheet
- มีโฟลเดอร์ย่อยใหม่ใน Google Drive
- รูปถูกบันทึกในโฟลเดอร์ข่าวนั้น
- มีอีเมลแจ้งเตือนไปที่ `gritsn.th@gmail.com`

### ทดสอบหน้าแอดมิน

1. เปิด `admin.html`
2. กรอกรหัสผ่านที่ตั้งไว้ใน `ADMIN_PASSWORD`
3. เลือกรายการข่าว
4. ทดสอบแก้ไขชื่อผู้แจ้ง หัวข้อข่าว เนื้อหา และสถานะ
5. กดเปิดโฟลเดอร์รูปต้นฉบับ
6. อัปโหลดแผ่นข่าวที่เสร็จสมบูรณ์เป็น `jpg`, `png`, `webp` หรือ `pdf`
7. กลับไปหน้า `index.html` แล้วรีเฟรช

เมื่อแอดมินอัปโหลดแผ่นข่าวแล้ว ระบบจะตั้งสถานะเป็น `เสร็จสิ้น` และแสดงไฟล์นั้นบนหน้าแรก

## หมายเหตุการใช้งาน

- รูปต้นฉบับจะเก็บใน Drive folder แยกตามข่าว
- ไฟล์แผ่นข่าวที่เสร็จสมบูรณ์จะถูกตั้งค่าเป็น `Anyone with the link can view` เพื่อให้แสดงบน GitHub Pages ได้
- ถ้ามีแอดมินหลายบัญชี ให้แชร์ Drive folder หลักกับบัญชีเหล่านั้น เพื่อให้เปิดโฟลเดอร์รูปต้นฉบับจากหน้าแอดมินได้
- รายการที่ลบในหน้าแอดมินจะถูกซ่อนจากระบบ แต่ไม่ได้ลบโฟลเดอร์รูปต้นฉบับทิ้งทันที
- การอัปโหลดผ่าน Apps Script มีข้อจำกัดด้านขนาด payload หากเป็นรูปจากมือถือที่ใหญ่มาก แนะนำลดขนาดไฟล์ก่อนอัปโหลด
- ถ้าส่งอีเมลไม่ได้ ให้ตรวจสอบว่าได้รัน `setup()` และอนุญาตสิทธิ์ `MailApp` แล้ว

## จุดที่ต้องแก้ก่อนใช้งานจริง

ใน `script.js`:

```javascript
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

ใน `admin.js`:

```javascript
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

ใน `Code.gs`:

```javascript
SHEET_ID: "PASTE_YOUR_SHEET_ID_HERE",
ROOT_FOLDER_ID: "PASTE_YOUR_ROOT_FOLDER_ID_HERE",
```

ใน Apps Script `Script Properties`:

```text
ADMIN_PASSWORD = รหัสผ่านแอดมินที่ต้องการ
```
