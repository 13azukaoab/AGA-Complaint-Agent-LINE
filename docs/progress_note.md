# 📋 Progress Note — AGA Complaint Agent (LINE)
อัปเดต: 13 มิถุนายน 2569

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
- **แก้ปัญหา quota = 0:** สาเหตุที่แท้จริงคือ `gemini-2.0-flash` ถูก Google ปิดให้บริการตั้งแต่ 1 มิ.ย. 2569
- เปลี่ยน model เป็น **`gemini-3.1-flash-lite`** (รองรับ ข้อความ/รูปภาพ/วิดีโอ/เสียง/PDF)
- ทดสอบสำเร็จ — ได้ผลลัพธ์ JSON ครบ
- Gemini API Key ใหม่ผูกกับ project **QCS Bait App** แล้ว ✅

### Phase 3 — Google Sheets (เสร็จ 100% ✅)
- Google Cloud Project: **QCS Bait App** (qcs-bait-app-v5)
- Service Account: `complaint-sheet-writer@qcs-bait-app-v5.iam.gserviceaccount.com`
- JSON Key: `credentials/qcs-bait-app-v5-daa46a58d50b.json` ✅
- Google Sheet: **"AGA Complaint Log"** — แชร์ Editor ให้ Service Account แล้ว ✅
- Sheet ID: `1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s`
- ติดตั้ง `googleapis` npm package แล้ว ✅
- เขียน `src/sheets.js` + `appendComplaint()` แล้ว ✅
- ทดสอบ end-to-end สำเร็จ — ข้อความจาก LINE → บันทึกลง Sheet ✅

---

## 📊 โครงสร้าง Google Sheet (11 คอลัมน์)

| คอลัมน์ | ชื่อ | ข้อมูล |
|---------|------|--------|
| A | Timestamp | เวลารับแจ้ง |
| B | Group ID | LINE Group ID |
| C | Sender ID | LINE User ID |
| D | Pest ที่แจ้ง | ชนิดแมลง/สัตว์ |
| E | สถานที่/อาคาร | ตึก/หน่วยที่พบ |
| F | ชั้น | ชั้นที่พบ (แยกจากอาคาร) |
| G | ระดับ | น้อย/ปานกลาง/มาก |
| H | ผู้ติดต่อ | ชื่อผู้ติดต่อ (AI สกัดจากข้อความ) |
| I | เบอร์ติดต่อ | เบอร์โทร (AI สกัดจากข้อความ) |
| J | ข้อความต้นฉบับ | ข้อความจริงจากกลุ่ม LINE |
| K | สรุป | AI สรุปให้กระชับ |

---

## 💡 หมายเหตุสำคัญ

- `gemini-3.1-flash-lite` รองรับ **Vision (วิเคราะห์รูปภาพ)** ในตัว — พร้อมทำ Phase 5 ได้เลย
- ไฟล์ Secrets ที่ห้าม commit: `Secret Key.env`, `credentials/*.json`, `credentials/*.txt`
- `.gitignore` ครอบคลุมไฟล์ sensitive ครบแล้ว ✅

---

### Phase 4 — Google Cloud Run (เสร็จ 100% ✅)
- สร้าง `Dockerfile` + `.dockerignore` ✅
- แก้ `src/sheets.js` ให้รองรับ Cloud Run (ใช้ GOOGLE_APPLICATION_CREDENTIALS env var) ✅
- สร้าง Artifact Registry repo `cloud-run-source-deploy` ✅
- เก็บ Secrets ทั้งหมดใน Secret Manager (6 ตัว) ✅
- Deploy สำเร็จ: `aga-complaint-agent-396358198178.asia-southeast1.run.app` ✅
- อัปเดต LINE Webhook URL → Verify Success ✅
- ทดสอบ end-to-end ผ่าน: LINE → Gemini → Sheet ✅
- ตั้ง `--no-cpu-throttling` + `--memory=512Mi` เพื่อให้ async task ทำงานได้ ✅
- เปิดรับทุกกลุ่ม (ไม่จำกัด Group ID) ✅
- Gemini API Key ใหม่: ผูกกับ project `457755056139` (AGA Complaint Agent-LINE) ✅

---

## 🔜 สิ่งที่เหลือ

| Phase | งาน | สถานะ |
|-------|-----|--------|
| 5 | เพิ่มวิเคราะห์รูปภาพแมลงด้วย Vision AI | ยังไม่เริ่ม — model รองรับแล้ว |

---

## 📁 โครงสร้างไฟล์ปัจจุบัน

```
Complaint Agent (LINE)/
├── src/
│   ├── index.js        ✅ webhook + บันทึก Sheet
│   ├── gemini.js       ✅ AI วิเคราะห์ (model: gemini-3.1-flash-lite)
│   └── sheets.js       ✅ Google Sheets API
├── docs/
│   ├── plan.md
│   ├── aga_plan.html
│   └── progress_note.md
├── credentials/
│   ├── LINE_credentials.txt        ⚠️ ห้าม commit
│   ├── Google_Service_Account.txt  ⚠️ ห้าม commit
│   └── qcs-bait-app-v5-daa46a58d50b.json  ⚠️ ห้าม commit
├── Secret Key.env      ⚠️ ห้าม commit
├── .gitignore          ✅ ครอบคลุม secrets ครบ
└── package.json        ✅ มี googleapis แล้ว
```

---

## 🔑 Credentials สำคัญ

| รายการ | ที่เก็บ |
|--------|---------|
| LINE Channel Secret & Token | `Secret Key.env` |
| Gemini API Key (QCS Bait App) | `Secret Key.env` |
| Google Sheet ID | `Secret Key.env` |
| Service Account JSON Key | `credentials/qcs-bait-app-v5-daa46a58d50b.json` |
| ngrok Token | `credentials/LINE_credentials.txt` |

> ⚠️ **ไฟล์ทั้งหมดใน credentials/ และ Secret Key.env อยู่ใน .gitignore แล้ว — ปลอดภัย commit ได้**
