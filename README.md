# AGA Complaint Agent — LINE

ระบบรับแจ้งปัญหาแมลงรบกวนผ่านกลุ่ม LINE อัตโนมัติ สำหรับ **Advance Group Asia (AGA)**

Bot รับข้อความจากสมาชิกในกลุ่ม → วิเคราะห์ด้วย AI → บันทึกลง Google Sheet → ออก Work Order → แจ้งเตือนทีมงาน → Dashboard ติดตามงานแบบ real-time

---

## สารบัญ

- [ภาพรวมระบบ](#ภาพรวมระบบ)
- [สิ่งที่ระบบทำได้](#สิ่งที่ระบบทำได้)
- [คำสั่ง LINE ที่ใช้งานได้](#คำสั่ง-line-ที่ใช้งานได้)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [Google Sheet — โครงสร้างข้อมูล](#google-sheet--โครงสร้างข้อมูล)
- [การติดตั้งและตั้งค่า](#การติดตั้งและตั้งค่า)
- [การ Deploy](#การ-deploy)
- [Dashboard](#dashboard)
- [ระบบแจ้งเตือน](#ระบบแจ้งเตือน)
- [Tech Stack](#tech-stack)

---

## ภาพรวมระบบ

```
สมาชิกกลุ่ม LINE
      │ พิมพ์ข้อความแจ้งปัญหา
      ▼
LINE Messaging API
      │ Webhook
      ▼
Google Cloud Run (Node.js 22)
      │
      ├─► Gemini AI ── วิเคราะห์ข้อความ → สกัด ชนิดแมลง / พื้นที่ / ชั้น / ผู้ติดต่อ
      │
      ├─► Google Sheets ── บันทึกข้อมูล + ออก Work Order ID (W001, W002...)
      │
      ├─► Google Cloud Storage ── เก็บรูปภาพปิดงาน (bucket: aga-complaint-photos)
      │
      └─► LINE Bot ── ตอบกลับยืนยัน "รับแจ้ง W001 ✅"

Cloud Scheduler (ทุก 4 ชม. + 17:00)
      └─► /notify ── แจ้งเตือนงานค้าง / สรุปรายวัน

Dashboard (Netlify — auto-deploy จาก GitHub)
      └─► /api/dashboard ── ดึงข้อมูลจาก Sheet แสดงผล real-time
```

---

## สิ่งที่ระบบทำได้

### รับแจ้งปัญหาอัตโนมัติ
- Bot อยู่ในกลุ่ม LINE คอยฟังข้อความตลอดเวลา
- ใช้ Gemini AI วิเคราะห์ว่าเป็นการแจ้งปัญหาแมลงหรือไม่
- สกัดข้อมูล: ชนิดแมลง, พื้นที่/อาคาร, ชั้น, ชื่อผู้ติดต่อ, เบอร์โทร
- รองรับข้อความที่มีหลาย complaint ในคราวเดียว
- แยก "หนู" (สรรพนาม) กับ "หนู" (สัตว์รบกวน) ได้ถูกต้อง
- ข้อความสนทนาปกติ Bot ไม่ตอบ (ไม่รบกวนกลุ่ม)

### Work Order System
- ออก Work Order ID อัตโนมัติ (W001, W002, ...)
- บันทึกลง Google Sheet พร้อมข้อมูลครบถ้วน
- ติดตาม Status: **เปิด → ปิด**
- หมายเลข WO อ่านจากข้อมูลจริงใน Sheet (ป้องกัน ghost rows)

### ปิดงานผ่าน LINE
- พิมพ์ `ปิดงาน W001 [วิธีที่ใช้]` เพื่อปิดงาน
- แนบรูปภาพก่อนปิดงานได้ (รองรับหลายรูปต่อครั้ง ภายใน 5 นาที)
- รูปอัปโหลดขึ้น Google Cloud Storage อัตโนมัติ พร้อม URL บันทึกใน Sheet

### Dashboard
- ดูงานทั้งหมด real-time ผ่านเบราว์เซอร์ ไม่ต้องเปิด Google Sheet
- กราฟ 5 ชุด: ชนิดแมลง, พื้นที่ Top10, แนวโน้ม 14 วัน, กลุ่ม LINE, SLA
- ตาราง: sort ทุก column, filter หลายมิติ, pagination, ดูรูปปิดงาน popup
- Export CSV
- อัปเดตอัตโนมัติทุก 30 นาที

### ระบบแจ้งเตือน
- แจ้งเตือนงานค้างเกิน 4 ชั่วโมง ช่วง 08:00–16:00
- สรุปรายวัน 17:00 — งานวันนี้ทั้งหมด แยก ปิดแล้ว/ยังไม่ปิด

---

## คำสั่ง LINE ที่ใช้งานได้

| คำสั่ง | ตัวอย่าง | ผลลัพธ์ |
|--------|---------|---------|
| แจ้งปัญหา (พิมพ์ปกติ) | `พบปลวกที่ห้องประชุมชั้น 3 ติดต่อคุณสมชาย 0812345678` | `รับแจ้ง W001 — ปลวก ห้องประชุม ✅` |
| ปิดงาน | `ปิดงาน W001 กำจัดด้วยยาปลวก` | `W001 ปิดแล้ว โดย คุณสมชาย ✅` |
| ปิดงานพร้อมรูป | ส่งรูป → พิมพ์ `ปิดงาน W001 วางกับดัก` ภายใน 5 นาที | บันทึกรูปใน GCS + URL ใน Sheet |
| ดูงานค้าง | `งานค้าง` | รายการงานที่ยังไม่ปิดในกลุ่มนี้ |

---

## โครงสร้างโปรเจกต์

```
aga-complaint-agent/
├── src/
│   ├── index.js        # Webhook handler หลัก — รับ LINE events, routing คำสั่ง
│   ├── sheets.js       # อ่าน/เขียน Google Sheets (Work Order CRUD)
│   ├── gemini.js       # เรียก Gemini AI วิเคราะห์ข้อความ
│   └── notify.js       # Endpoint /notify สำหรับ Cloud Scheduler
├── dashboard.html      # Single-file Dashboard (Tailwind CSS + Chart.js)
├── docs/
│   ├── deploy.md       # ขั้นตอน deploy แบบละเอียด
│   └── task.md         # Task tracking
├── Dockerfile          # node:22-alpine
├── .dockerignore
├── package.json
└── Secret Key.env      # ⚠️ ห้าม commit — ENV variables
```

---

## Google Sheet — โครงสร้างข้อมูล

| Column | ชื่อ | ตัวอย่างข้อมูล |
|--------|------|--------------|
| A | วันเวลา | `15/6/2569 11:47:13` |
| B | Group ID | `C1abc...` |
| C | User ID | `Uabc...` |
| D | ชื่อกลุ่ม LINE | `Test system complain` |
| E | ชื่อผู้แจ้ง | `Oab` |
| F | ชนิดแมลง | `ปลวก` |
| G | พื้นที่/อาคาร | `ตึก A` |
| H | ชั้น | `ชั้น 3` |
| I | ระดับความรุนแรง | `ปานกลาง` |
| J | ชื่อผู้ติดต่อ | `คุณสมชาย` |
| K | เบอร์โทร | `0812345678` |
| L | ข้อความต้นฉบับ | ข้อความที่พิมพ์ใน LINE |
| M | สรุป AI | สรุปจาก Gemini |
| N | Work Order ID | `W001` |
| O | สถานะ | `เปิด` / `ปิด` |
| P–Q | (สำรอง) | — |
| R | ผู้ปิดงาน | `Oab` |
| S | เวลาปิด | `15/6/2569 16:50:00` |
| T | วิธีปิด + รูป | `กำจัดด้วยยาปลวก [รูป: https://storage.googleapis.com/...]` |

---

## การติดตั้งและตั้งค่า

### สิ่งที่ต้องมีก่อน

- Node.js 22+
- Google Cloud Project (เปิด Sheets API + Cloud Storage API)
- LINE Official Account + Messaging API
- Gemini API Key

### Environment Variables

สร้างไฟล์ `Secret Key.env`:

```env
LINE_CHANNEL_SECRET=xxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxx
GOOGLE_SHEET_ID=xxxx
GEMINI_API_KEY=xxxx
DASHBOARD_KEY=xxxx
ALLOWED_GROUP_IDS=Cxxxx,Cyyy   # เว้นว่าง = อนุญาตทุกกลุ่ม
```

### Service Account Credentials

วางไฟล์ key ที่ `credentials/qcs-bait-app-v5-daa46a58d50b.json`

สิทธิ์ที่ต้องมี:
- Google Sheets: **Editor**
- Google Cloud Storage (`aga-complaint-photos`): **Storage Object Creator**

### รันในเครื่อง

```bash
npm install
node src/index.js
```

---

## การ Deploy

โปรเจกต์รันบน **Google Cloud Run** — ต้อง deploy ผ่าน GitHub เสมอ (ห้ามแก้ไฟล์ตรงใน Cloud Shell)

> ดูขั้นตอนแบบละเอียดที่ [`docs/deploy.md`](docs/deploy.md)

**ขั้นตอน (Cloud Shell):**

```bash
# 1. ดึง code ล่าสุด
cd ~/aga-agent && git pull origin main

# 2. Build Docker image
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest

# 3. Deploy
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed \
  --region asia-southeast1

# 4. ดู logs เมื่อมีปัญหา
gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20
```

**Dashboard (Netlify):** push ขึ้น GitHub → Netlify deploy อัตโนมัติ ไม่ต้องทำอะไรเพิ่ม

---

## Dashboard

**URL:** `https://aga-complaint-agent-line.netlify.app/dashboard.html`

### ฟีเจอร์ทั้งหมด

**KPI Cards (แถวบน)**
- งานทั้งหมด / งานเปิด / งานปิด / % ปิด / เฉลี่ยเวลาปิด / ค้างเกิน 3 วัน

**กราฟ**
- ชนิดแมลง (Donut)
- พื้นที่/อาคาร Top 10 (Bar)
- แนวโน้มงานรายวัน 14 วันล่าสุด (Line)
- งานแยกตามกลุ่ม LINE (Bar)
- SLA — เวลาตอบสนอง พร้อมคำอธิบาย

**ตารางรายการงาน**
- คอลัมน์: WO, วันที่+เวลาแจ้ง, กลุ่ม LINE, ผู้แจ้ง, ชนิด, พื้นที่, ชั้น, สถานะ, SLA, ผู้ปิดงาน, วิธีปิด, รูป
- Sort ได้ทุก column (คลิกที่หัวตาราง)
- Filter: สถานะ, ชนิดแมลง, กลุ่ม LINE, ช่วงวันที่, คำค้นหา
- Pagination: 20/50/100/ทั้งหมด
- คลิก 📷 เปิดรูปปิดงานได้เลยในหน้า
- Export CSV

**SLA Badge**
- 🟢 ≤ 4 ชั่วโมง — ปิดงานทันมาตรฐาน
- 🟡 4–24 ชั่วโมง — ควรเร่งดำเนินการ
- 🔴 เกิน 24 ชั่วโมง — เกินมาตรฐาน ต้องติดตามด่วน

---

## ระบบแจ้งเตือน

ทำงานผ่าน Cloud Scheduler → เรียก endpoint `/notify` บน Cloud Run

### แจ้งเตือนงานค้าง (`?type=check`)

**เวลา:** 08:00, 12:00, 16:00 ทุกวัน (Cron: `0 8,12,16 * * *`)

แจ้งเตือนเมื่องานค้างเกิน 4 ชั่วโมงแล้วยังไม่ปิด:

```
⚠️ งานค้างเกิน 4 ชั่วโมง (3 งาน):
• W002 — หนู ตึก 100 ปี สมเด็จพระศรีฯ
• W003 — หนู ตึกสยามินทร์
• W007 — หนู อานันทมหิดล

วิธีปิดงาน: พิมพ์ใน LINE กลุ่มนี้
ตัวอย่าง: ปิดงาน W002 [วิธีที่ใช้กำจัด]
```

### สรุปรายวัน (`?type=daily`)

**เวลา:** 17:00 ทุกวัน (Cron: `0 17 * * *`)

```
📋 สรุปงานประจำวัน — 15/06/2026
━━━━━━━━━━━━━━━━━━━

รวมวันนี้ทั้งหมด: 10 งาน

✅ ปิดแล้ว (2 งาน):
• W001 — หนู ตึกสยามินทร์
• W008 — ปลวก ตึก A

⏳ ยังไม่ปิด (8 งาน):
• W002 — หนู ตึก 100 ปี สมเด็จพระศรีฯ
• W003 — หนู ตึกสยามินทร์
...
```

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|------|-----------|
| Runtime | Node.js 22 (Alpine Docker) |
| Web Framework | Express.js 5 |
| LINE Integration | @line/bot-sdk v11 |
| AI วิเคราะห์ข้อความ | Google Gemini (`gemini-3.1-flash-lite`) |
| ฐานข้อมูล | Google Sheets API v4 |
| เก็บรูปภาพ | Google Cloud Storage (`aga-complaint-photos`) |
| Hosting (Backend) | Google Cloud Run — asia-southeast1 |
| Hosting (Dashboard) | Netlify (auto-deploy จาก GitHub) |
| Dashboard UI | Tailwind CSS CDN + Chart.js |

---

## ⚠️ ไฟล์ที่ห้าม Commit

```
Secret Key.env
credentials/*.json
credentials/*.txt
```

---

## GitHub Repository

`https://github.com/13azukaoab/AGA-Complaint-Agent-LINE.git`
