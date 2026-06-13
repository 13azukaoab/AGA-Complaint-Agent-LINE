# AGA Complaint Agent — Project Plan
> LINE Group Complaint Collector → Excel Analyzer
> เจ้าของโปรเจกต์: Weerachon (Dizzy) | AGA Pest Control

---

## 🎯 เป้าหมาย
Bot เงียบ ๆ ที่คอย "ดักฟัง" กลุ่ม LINE → เก็บเฉพาะข้อความแจ้งปัญหา → บันทึกลง Excel อัตโนมัติ ไม่ตอบ ไม่รบกวน

---

## ✅ สถานะปัจจุบัน (Phase 1 — เสร็จแล้ว)

| รายการ | สถานะ |
|--------|-------|
| สร้าง LINE Messaging API Channel | ✅ |
| ได้ Channel Secret + Access Token | ✅ |
| สร้าง Node.js Project | ✅ |
| Webhook Server (Express) ทำงานได้ | ✅ |
| ngrok เชื่อม LINE ↔ localhost | ✅ |
| ทดสอบรับข้อความจากกลุ่ม LINE | ✅ |
| Group ID: Cc87c1cfc5c9c8ad8ed527b9d5052be69 | ✅ |

---

## 📋 แผนงานทั้งหมด (4 Phases)

### Phase 1 — LINE Webhook Server ✅ เสร็จแล้ว
**เป้าหมาย:** รับข้อความจากกลุ่ม LINE ได้

- [x] สมัคร LINE Developers + สร้าง Channel
- [x] ติดตั้ง Node.js + Express + @line/bot-sdk
- [x] สร้าง Webhook server รับ POST /webhook
- [x] ตั้งค่า ngrok เพื่อ expose localhost
- [x] Verify Webhook สำเร็จ
- [x] ทดสอบรับข้อความจริงจากกลุ่ม

**Stack:** Node.js + Express + @line/bot-sdk + ngrok

---

### Phase 2 — AI วิเคราะห์ข้อความ 🔄 ถัดไป
**เป้าหมาย:** ให้ AI อ่านข้อความภาษาไทยและแยกข้อมูลออกมา

- [ ] สมัคร Google AI Studio รับ Gemini API Key (ฟรี)
- [ ] ติดตั้ง @google/generative-ai
- [ ] เขียน prompt ให้ Gemini วิเคราะห์ข้อความ
- [ ] Output เป็น JSON มาตรฐาน

**ตัวอย่าง Input → Output:**
```
Input:  "ฝากตรวจห้อง 111 มีมดปีกเยอะมาก"
Output: {
  pest_type: "มดปีก",
  location: "ห้อง 111",
  severity: "ปานกลาง",
  is_complaint: true
}
```

**ข้อมูลที่เก็บ:**
| Field | ตัวอย่าง |
|-------|---------|
| วันที่-เวลา | 7/6/2569 11:41 |
| กลุ่ม LINE | Specialist Termite |
| ชนิดแมลง | มดปีก, แมลงสาบ, ปลวก |
| สถานที่ | ห้อง 111, ห้องอาหาร |
| ความรุนแรง | น้อย / ปานกลาง / มาก |
| ข้อความต้นฉบับ | (เก็บไว้ด้วย) |

**Stack:** Gemini 1.5 Flash API (ฟรี 15 req/min)

---

### Phase 3 — บันทึกลง Google Sheets 📊
**เป้าหมาย:** เขียนข้อมูลลง Google Sheets อัตโนมัติ

- [ ] สร้าง Google Service Account
- [ ] สร้าง Google Sheets template
- [ ] ติดตั้ง googleapis
- [ ] เขียน function appendRow()
- [ ] ทดสอบ end-to-end จาก LINE → Sheet

**โครงสร้าง Sheet:**
```
| Timestamp | Group | Sender | Pest Type | Location | Severity | Raw Message |
```

**Stack:** Google Sheets API + googleapis npm

---

### Phase 4 — Deploy & Production ☁️
**เป้าหมาย:** รันได้ตลอด 24/7 ไม่ต้องเปิดเครื่อง

- [ ] สมัคร Google Cloud (ฟรี $300 credit)
- [ ] สร้าง Dockerfile
- [ ] Deploy ขึ้น Cloud Run
- [ ] ตั้ง Webhook URL ถาวร (แทน ngrok)
- [ ] ทดสอบ production

**Stack:** Google Cloud Run + Docker

---

## 🔮 Phase 5 — ฟีเจอร์เพิ่มเติม (อนาคต)
- [ ] Dashboard สรุปรายเดือน
- [ ] แจ้งเตือนเมื่อพบปัญหาซ้ำในจุดเดิม
- [ ] รับภาพ (รูปแมลง) วิเคราะห์ด้วย Vision AI
- [ ] รายงาน Excel อัตโนมัติทุกสัปดาห์

---

## 💰 ค่าใช้จ่าย

| Service | Free Tier | ค่าใช้จ่ายที่คาด |
|---------|-----------|----------------|
| LINE Messaging API | ฟรี (ไม่ส่งข้อความกลับ) | **ฟรี** |
| Gemini 1.5 Flash | 15 req/min, 1M tokens/day | **ฟรี** |
| Google Sheets API | ไม่จำกัด | **ฟรี** |
| Google Cloud Run | 2M req/month | **ฟรี** |
| ngrok (dev only) | ใช้ชั่วคราวระหว่าง dev | **ฟรี** |
| **รวม** | | **0 บาท/เดือน** |

---

## 📁 โครงสร้างไฟล์

```
LINE-AGA Complaint Agent/
├── index.js          ← Webhook server (Phase 1) ✅
├── .env              ← Credentials (ห้าม commit) ✅
├── .gitignore        ← ป้องกัน .env หลุด ✅
├── package.json      ✅
├── gemini.js         ← AI analyzer (Phase 2)
├── sheets.js         ← Google Sheets writer (Phase 3)
└── Dockerfile        ← Cloud deployment (Phase 4)
```

---

## 🔑 Credentials ที่มีแล้ว
> เก็บใน `LINE_credentials.txt`

- ✅ Channel Secret
- ✅ Channel Access Token
- ✅ ngrok Authtoken
- ⏳ Gemini API Key (Phase 2)
- ⏳ Google Service Account JSON (Phase 3)

---

*บันทึกเมื่อ: 7 มิถุนายน 2569 | AGA Pest Control (Dizzy)*
