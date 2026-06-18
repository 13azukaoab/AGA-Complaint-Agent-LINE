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

Cloud Scheduler
      ├─► 08:30 /notify?type=morning ── รายงานงานค้างข้ามวัน
      ├─► 12:00 + 16:00 /notify?type=check ── งานเปิดวันนี้ที่ยังค้าง
      └─► 17:30 /notify?type=daily ── สรุปรายวัน

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
- กรองข้อความสรุปประชุม / ขอข้อมูล / นัดหมาย — ไม่สร้าง WO ผิด
- ข้อความสนทนาปกติ Bot ไม่ตอบ (ไม่รบกวนกลุ่ม)

### Work Order System
- ออก Work Order ID อัตโนมัติ (W001, W002, ...)
- บันทึกลง Google Sheet พร้อมข้อมูลครบถ้วน (columns A–U)
- ติดตาม Status: **เปิด → รับทราบ → ปิด**
- บันทึก catchCount (จำนวนที่จับได้) จาก `[X ตัว]` ในวิธีปิดงาน

### ปิดงานผ่าน LINE
- พิมพ์ `ปิดงาน W001 [วิธีที่ใช้+จำนวนที่ได้]` เพื่อปิดงาน
- แนบรูปภาพก่อนปิดงานได้ (รองรับหลายรูปต่อครั้ง ภายใน 5 นาที)
- รูปอัปโหลดขึ้น Google Cloud Storage อัตโนมัติ พร้อม URL บันทึกใน Sheet

### Dashboard
- ดูงานทั้งหมด real-time ผ่านเบราว์เซอร์ ไม่ต้องเปิด Google Sheet
- กราฟ 7 ชุด + VS Mode เปรียบเทียบ
- ตาราง: sort, filter หลายมิติ, ดูรูป popup + ดาวน์โหลดรูป
- Keyboard shortcuts ครบชุด
- Manual refresh — ไม่กิน read quota โดยไม่จำเป็น

### ระบบแจ้งเตือน
- **8:30** — รายงานงานค้างข้ามวัน พร้อมเบอร์ติดต่อ (ส่งทุกวัน ทุกกลุ่มใน ALLOWED_GROUP_IDS)
- **12:00** — งานวันนี้ที่ยังเปิดอยู่ รูปแบบ emoji พร้อมรายละเอียด (ส่งเฉพาะกลุ่มที่มีงานค้าง)
- **17:30** — สรุปรายวัน: แยกปิดแล้ว/ยังไม่ปิด พร้อมเวลาปิด/ผู้ปิด/วิธีปิด/จำนวนที่จับได้

---

## คำสั่ง LINE ที่ใช้งานได้

| คำสั่ง | ตัวอย่าง | ผลลัพธ์ |
|--------|---------|---------|
| แจ้งปัญหา (พิมพ์ปกติ) | `พบปลวกที่ห้องประชุมชั้น 3 ติดต่อคุณสมชาย 0812345678` | `รับแจ้ง W001 — ปลวก ห้องประชุม ✅` |
| รับทราบงาน | `รับทราบ W001` | บันทึกสถานะ รับทราบ |
| ปิดงาน (รูปแบบที่ 1) | `ปิดงาน W001 วางกับดักหนู 2 ตัว` | `W001 ปิดแล้ว โดย คุณสมชาย ✅` |
| ปิดงาน (รูปแบบที่ 2) | `W001 ปิดงาน ดักหนูได้ 2 ตัว` | `W001 ปิดแล้ว โดย คุณสมชาย ✅` |
| ปิดงานพร้อมรูป | ส่งรูป → พิมพ์ `ปิดงาน W001 วางกับดัก` ภายใน 5 นาที | บันทึกรูปใน GCS + URL ใน Sheet |
| ดูงานค้าง | `งานค้าง` | รายการงานที่ยังไม่ปิดในกลุ่มนี้ |
| ขอลิงค์ Dashboard | `ขอลิงค์ dashboard` หรือ `dashboard` | ลิงค์ Netlify Dashboard |

---

## โครงสร้างโปรเจกต์

```
aga-complaint-agent/
├── src/
│   ├── index.js        # Webhook handler — รับ LINE events, routing คำสั่งทั้งหมด
│   ├── sheets.js       # อ่าน/เขียน Google Sheets (Work Order CRUD)
│   ├── gemini.js       # เรียก Gemini AI วิเคราะห์ + normalize ชื่ออาคาร
│   └── notify.js       # Endpoint /notify — morning / check / daily
├── scripts/
│   └── fix-locations.js  # รัน manual เพื่อแก้ชื่ออาคารใน Sheet ย้อนหลัง
├── dashboard.html      # Single-file Dashboard (Tailwind CSS + Chart.js)
├── netlify.toml        # Redirect / → /dashboard.html
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
| O | สถานะ | `เปิด` / `รับทราบ` / `ปิด` |
| P | ผู้รับทราบ | `Oab` |
| Q | เวลารับทราบ | `15/6/2569 14:00:00` |
| R | ผู้ปิดงาน | `Oab` |
| S | เวลาปิด | `15/6/2569 16:50:00` |
| T | วิธีปิด + รูป | `วางกับดักหนู [รูป: https://storage.googleapis.com/...]` |
| U | จำนวนที่ติด | `2` (ตัวเลขจาก "X ตัว" ในวิธีปิด) |

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
ALLOWED_GROUP_IDS=Cxxxx,Cyyy   # เว้นว่าง = อนุญาตทุกกลุ่ม (morning report ส่งไปยัง IDs เหล่านี้)
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

**กราฟ (Tab ภาพรวม)**
- ชนิดแมลง (Donut)
- พื้นที่/อาคาร Top 10 (Bar)
- แนวโน้มงานรายวัน 14 วันล่าสุด (Line)
- งานแยกตามกลุ่ม LINE (Bar)
- SLA — เวลาตอบสนอง
- จำนวนที่จับได้ แยกตามอาคาร (Bar)
- แนวโน้มรายเดือน 6 เดือนล่าสุด (Line)

**VS Mode (Tab เปรียบเทียบ)**
- เลือก dimension: เดือน / อาคาร / กลุ่ม LINE
- เลือกฝั่ง A และ B เปรียบเทียบ metric: จำนวนงาน, จำนวนที่จับได้, % ปิด, SLA เฉลี่ย
- Grouped bar chart A vs B + doughnut ชนิดสัตว์แต่ละฝั่ง

**ตารางรายการงาน**
- คอลัมน์: WO, วันที่, กลุ่ม LINE, ผู้แจ้ง, ชนิด, พื้นที่, ชั้น, สถานะ, SLA, ผู้ปิดงาน, วิธีปิด, จำนวนที่ติด, รูป
- Sort ได้ทุก column
- Filter: สถานะ, ชนิดแมลง, กลุ่ม LINE, ช่วงวันที่, คำค้นหา
- Pagination: 20/50/100/ทั้งหมด
- คลิก 📷 เปิดดูรูปได้ในหน้า รองรับหลายรูป (ลูกศร ← → สลับรูป, keyboard ทำงานได้)
- ดาวน์โหลดรูปได้จาก modal
- Export CSV + PDF (print)

**Keyboard Shortcuts**

| ปุ่ม | หน้าที่ |
|------|--------|
| `1` | ไปหน้า ภาพรวม |
| `2` | ไปหน้า เปรียบเทียบ (VS) |
| `/` | Focus ช่องค้นหา |
| `← →` | เลื่อนหน้า table (หรือสลับรูปใน modal) |
| `R` | Refresh ข้อมูล |
| `C` | Clear filter ทั้งหมด |
| `?` | เปิด/ปิด help panel |
| `ESC` | ปิด modal / help panel |

**SLA Badge**
- 🟢 ≤ 4 ชั่วโมง — ปิดงานทันมาตรฐาน
- 🟡 4–24 ชั่วโมง — ควรเร่งดำเนินการ
- 🔴 เกิน 24 ชั่วโมง — เกินมาตรฐาน ต้องติดตามด่วน

---

## ระบบแจ้งเตือน

ทำงานผ่าน Cloud Scheduler → เรียก endpoint `/notify` บน Cloud Run

### 1. รายงานงานค้างข้ามวัน (`?type=morning`) — 08:30

ส่งให้ทุกกลุ่มใน `ALLOWED_GROUP_IDS` เสมอทุกวัน:

**กรณีมีงานค้าง:**
```
วันที่ 16/06/2569
🔴 งานค้างจากวันก่อน (1 งาน):
• W004 — หนู อาคาร A ชั้น 2 (แจ้งเมื่อ 14/06/2569) [รับทราบ]

กรุณาปิดงานค้างโดยเร็ว
ตัวอย่าง: ปิดงาน W004 [วิธีที่ใช้กำจัด+จำนวนที่ได้]
```

**กรณีไม่มีงานค้าง:**
```
วันที่ 16/06/2569
🟢 ไม่มีงานค้างในระบบก่อนหน้า
```

### 2. รายงานงานค้างวันนี้ (`?type=check`) — 12:00

ส่งเฉพาะกลุ่มที่มีงานเปิดอยู่วันนี้ (ถ้าไม่มี → ไม่ส่ง):

```
📋 งานค้าง — 16/06/2569 12:00
━━━━━━━━━━━━━━━━━━━

🟡 W005 — ปลวก
📍 อาคาร B ชั้น 3
🕐 แจ้งเมื่อ 16/06/2569
📞 คุณสมชาย 0812345678

วิธีปิดงาน: พิมพ์ใน LINE กลุ่มนี้
ตัวอย่าง: ปิดงาน W005 [วิธีที่ใช้กำจัด+จำนวนที่ได้]
```

### 3. สรุปรายวัน (`?type=daily`) — 17:30

```
📋 สรุปงานประจำวัน — 16/06/2569
━━━━━━━━━━━━━━━━━━━

รวมวันนี้ทั้งหมด: 3 งาน

✅ ปิดแล้ว (2 งาน):
• W005 — ปลวก อาคาร B ชั้น 3
  🕐 ปิด 16:50 น. โดย คุณสมชาย
  🔧 วางกับดักหนู | จับได้ 2 ตัว

⏳ ยังไม่ปิด (1 งาน):
• W007 — มด อาคาร D ชั้น 1
```

### Cloud Scheduler Config

| Job | Schedule | Type |
|-----|----------|------|
| `aga-notify-morning` | `30 8 * * *` | `?type=morning` |
| `aga-notify-check` | `0 12 * * *` | `?type=check` |
| `aga-notify-daily` | `30 17 * * *` | `?type=daily` |

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
| Dashboard UI | Tailwind CSS CDN + Chart.js 4.4.1 |
| Font | Noto Sans Thai |

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
