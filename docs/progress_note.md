# 📋 Progress Note — AGA Complaint Agent (LINE)
อัปเดต: 8 มิถุนายน 2569

---

## ✅ ทำเสร็จแล้ว

### Phase 1 — LINE Webhook (เสร็จ 100%)
- สร้าง LINE Messaging API Channel ชื่อ "AGA Pest Control (Dizzy)"
- เขียน `src/index.js` รับ webhook จาก LINE
- ทดสอบส่งข้อความจากกลุ่ม LINE → terminal แสดงผลได้
- จับ Group ID ได้แล้ว: `Cc87c1cfc5c9c8ad8ed527b9d5052be69`
- ปิด Auto-reply และ Greeting message ของ LINE OA แล้ว

### Phase 2 — Gemini AI (เสร็จ 100% ✅)
- เขียน `src/gemini.js` เรียบร้อย
- **แก้ปัญหา quota = 0:** สาเหตุที่แท้จริงคือ `gemini-2.0-flash` ถูก Google ปิดให้บริการตั้งแต่ 1 มิ.ย. 2569 (ไม่ใช่ปัญหาบัตรเครดิต/บัญชีอย่างที่เข้าใจตอนแรก)
- เปลี่ยน model เป็น **`gemini-3.1-flash-lite`** (รุ่นใหม่ล่าสุด รองรับ input แบบ ข้อความ/รูปภาพ/วิดีโอ/เสียง/PDF)
- ทดสอบส่งข้อความ "ทดสอบ พบแมลงสาบ" ในกลุ่ม LINE → **สำเร็จ** ได้ผลลัพธ์ JSON ครบ (แมลง, สถานที่, ระดับ, สรุป)
- อัปเดต `src/index.js` ให้เรียก `analyzeComplaint()` แล้ว
- ติดตั้ง `@google/generative-ai@0.24.1` แล้ว

---

## 💡 หมายเหตุสำคัญ

`gemini-3.1-flash-lite` รองรับ **input รูปภาพ (Vision)** ได้ในตัว — สามารถทำ Phase 5 (วิเคราะห์รูปแมลงที่ส่งมาในกลุ่ม) ได้เลยโดยไม่ต้องเปลี่ยน model อีก เมื่อพร้อมจะเพิ่มฟีเจอร์นี้

---

## ⏸️ Pause ไว้ที่นี่ (8 มิ.ย. 2569)

### Phase 3 — กำลังทำอยู่ ใกล้เสร็จ
**ตั้งค่าฝั่ง Google เสร็จหมดแล้ว ✅** (เปลี่ยนมาใช้ project **"QCS Bait App"** แทน "AGA Complaint Agent-LINE")
- Service Account: `complaint-sheet-writer@qcs-bait-app-v5.iam.gserviceaccount.com`
- JSON Key: `credentials/qcs-bait-app-v5-daa46a58d50b.json` ✅ (อยู่ในโฟลเดอร์แล้ว)
- Google Sheet ชื่อ "AGA Complaint Log" สร้างแล้ว + แชร์สิทธิ์ Editor ให้ Service Account แล้ว ✅
- Sheet ID: `1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s`
- Sheet URL: https://docs.google.com/spreadsheets/d/1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s/edit

**ขั้นถัดไปที่ต้องทำ (รอบหน้า):**
1. รัน `npm install googleapis --save` (กำลังจะรันตอนถูกขัดจังหวะ — ยังไม่เสร็จ)
2. เขียน `src/sheets.js` — เชื่อมต่อด้วย Service Account JSON + ฟังก์ชัน `appendComplaint()`
3. แก้ `src/index.js` ให้เรียกบันทึกข้อมูลลง Sheet เมื่อพบ complaint
4. เพิ่มตัวแปรใน `Secret Key.env`: path ของ JSON key + Sheet ID
5. ทดสอบ end-to-end: ส่งข้อความใน LINE → เช็คว่าขึ้นแถวใหม่ใน Sheet จริง
6. อัปเดต `.gitignore` ให้ครอบคลุม `Secret Key.env`, `credentials/*.json`, `node_modules/`

---

## 🔜 สิ่งที่เหลือทั้งหมด

| Phase | งาน | สถานะ |
|-------|-----|--------|
| 3 | ติดตั้ง googleapis + เขียน `src/sheets.js` + เชื่อมต่อระบบ | 🔄 ใกล้เสร็จ — ตั้งค่า Google ฝั่ง cloud เสร็จหมดแล้ว |
| 4 | สร้าง `Dockerfile` | ยังไม่เริ่ม |
| 4 | Deploy บน Google Cloud Run (ไม่ต้องเปิดคอมทิ้งไว้) | ยังไม่เริ่ม |
| 5 | (ตัวเลือก) เพิ่มการรับ-วิเคราะห์รูปภาพแมลงด้วย Vision AI | ยังไม่เริ่ม — model รองรับแล้ว |
| - | แก้ `.gitignore` ให้ครบ | ยังไม่เริ่ม |

---

## 📁 โครงสร้างไฟล์ปัจจุบัน

```
Complaint Agent (LINE)/
├── src/
│   ├── index.js        ✅ webhook server
│   └── gemini.js       ✅ AI วิเคราะห์
├── docs/
│   ├── plan.md
│   ├── aga_plan.html
│   └── progress_note.md  ← ไฟล์นี้
├── credentials/
│   └── LINE_credentials.txt
├── Secret Key.env      ⚠️ ห้าม commit ขึ้น GitHub
├── .gitignore
└── package.json
```

---

## 🔑 Credentials สำคัญ

| รายการ | ที่เก็บ |
|--------|---------|
| LINE Channel Secret & Token | `Secret Key.env` |
| Gemini API Key | `Secret Key.env` |
| ngrok Token | `credentials/LINE_credentials.txt` |

> ⚠️ **ห้าม commit `Secret Key.env` ขึ้น GitHub เด็ดขาด**
