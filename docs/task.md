# Task Tracking — AGA Complaint Agent (LINE)

อัปเดตล่าสุด: 16 มิถุนายน 2569

---

## ✅ เสร็จแล้ว

### Phase 1–4 — Core System
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint + กรองสรุปประชุม/ขอข้อมูล/นัดหมาย ไม่ให้สร้าง WO ผิด
- Google Sheets บันทึกข้อมูล (columns A–U)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System
- `src/index.js` — ตรวจ command `รับทราบ WXXX` / `ปิดงาน WXXX [วิธีปิด]`
- `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O–U)
- `src/notify.js` — endpoint `/notify` สำหรับ Cloud Scheduler
- Cloud Scheduler 2 jobs: `aga-notify-check` + `aga-notify-daily`
- ทดสอบ end-to-end ผ่าน: complaint → WO ID → รับทราบ → ปิดงาน
- เปิด Google Drive API ใน GCP project
- แก้ regex: รองรับ `ปิดงานW001` (ไม่มี space) และ `ปิดงาน W001` (มี space)
- เพิ่ม catchCount: ดึงจาก regex `/(\d+)\s*ตัว/` ใน closeMethod → column U

### Phase 7 — Notification System Overhaul
- `src/notify.js` ปรับใหม่ทั้งหมด — 3 mode:
  - `?type=morning` (8:30) — ส่งทุกกลุ่มใน `ALLOWED_GROUP_IDS` เสมอ: 🔴 งานค้างข้ามวัน / 🟢 ไม่มีค้าง
  - `?type=check` (12:00, 16:00) — งานเปิดวันนี้เท่านั้น, ไม่ส่งถ้าไม่มี
  - `?type=daily` (17:30) — สรุปรายวัน: งานวันนี้ทั้งหมด แยก ปิด/ยังไม่ปิด
- ลบ 4-hour threshold ออก
- เพิ่ม `formatThaiDate()` / `todayThaiDate()` — วันที่ DD/MM/YYYY พ.ศ.
- อัปเดต example text: `[วิธีที่ใช้กำจัด+จำนวนที่ได้]`

### Phase 8 — Dashboard
- `dashboard.html` — single-file HTML เชื่อม `/api/dashboard`
- KPI cards: งานทั้งหมด / เปิด / ปิด / % ปิด / เฉลี่ยปิด / ค้างเกิน 3 วัน
- กราฟ 7 ชุด: ชนิดแมลง, พื้นที่ Top10, ความรุนแรง, แนวโน้ม 14 วัน, กลุ่ม LINE, SLA, จำนวนที่จับได้/อาคาร, แนวโน้มรายเดือน 6 เดือน
- ตาราง: sort ทุก column, pagination, filter (สถานะ/ชนิด/กลุ่ม/ความรุนแรง/วันที่/ค้นหา)
- VS Mode (Tab): เปรียบเทียบเดือน/อาคาร/กลุ่ม LINE + metric cards + grouped bar charts
- Keyboard Shortcuts: ESC / 1 / 2 / / / ← → / R / C / ? + Help Panel
- Photo modal: หลายรูป + counter "1 / 4" + ลูกศรซ้าย-ขวา + keyboard navigate + ดาวน์โหลด
- Manual refresh (ปิด auto-refresh) เพื่อลด Google Sheets read quota
- Export CSV + PDF (print)
- DASHBOARD_KEY ป้องกัน unauthorized access
- Netlify redirect: `/` → `/dashboard.html`
- Deploy บน Netlify (auto-deploy จาก GitHub) ✅
- URL: `https://aga-complaint-agent-line.netlify.app/dashboard.html`

### Phase 9 — Commands & UX
- `index.js`: เพิ่ม command "dashboard" / "ขอลิงค์" → reply ลิงค์ Netlify (ใช้ replyToken ฟรี)

---

## ⏳ งานค้างปัจจุบัน

### 🔴 CRITICAL — Deploy Backend ขึ้น Cloud Run
Code ทั้งหมด commit ขึ้น GitHub แล้ว แต่ยังไม่ได้ deploy → ฟีเจอร์ใหม่ยังไม่มีผลในระบบ

```bash
# รันใน Cloud Shell
cd ~/aga-agent && git pull origin main
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed --region asia-southeast1
```

### 🔴 CRITICAL — ปรับ Cloud Scheduler (3 jobs)

```bash
# 1. เพิ่ม job ใหม่สำหรับ morning report 8:30
gcloud scheduler jobs create http aga-notify-morning \
  --schedule="30 8 * * *" \
  --uri="https://<YOUR_CLOUD_RUN_URL>/notify?type=morning" \
  --time-zone="Asia/Bangkok" \
  --location=asia-southeast1

# 2. ปรับ check จาก 8/12/16 → 12/16 เท่านั้น
gcloud scheduler jobs update http aga-notify-check \
  --schedule="0 12,16 * * *" \
  --location=asia-southeast1

# 3. เลื่อน daily จาก 17:00 → 17:30
gcloud scheduler jobs update http aga-notify-daily \
  --schedule="30 17 * * *" \
  --location=asia-southeast1
```

### ⚠️ Google Sheet — หัวคอลัมน์ U
- พิมพ์ "จำนวนที่ติด" ใน Sheet row 1 คอลัมน์ U ด้วยตัวเอง

---

## ✅ ระบบพร้อม Production (รอ Deploy + Scheduler เท่านั้น)

---

## 📁 ไฟล์หลักของโปรเจกต์

| ไฟล์ | หน้าที่ |
|------|--------|
| `src/index.js` | Webhook handler + routing คำสั่งทั้งหมด |
| `src/sheets.js` | อ่าน/เขียน Google Sheets (columns A–U) |
| `src/notify.js` | Endpoint /notify — morning / check / daily |
| `src/gemini.js` | เรียก Gemini AI + กรองข้อความที่ไม่ใช่ complaint |
| `dashboard.html` | Dashboard (VS Mode, Charts, Photo modal, Shortcuts) |
| `netlify.toml` | Redirect `/` → `/dashboard.html` |
| `CLAUDE.md` | กฎ deploy + commit |
| `docs/deploy.md` | ขั้นตอน deploy แบบละเอียด |
| `docs/task.md` | ไฟล์นี้ — tracking งาน |

---

## 🛠 คำสั่งที่ใช้บ่อย

```bash
# ดู logs ล่าสุด
gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20

# ดู commit ที่ผ่านมา
git log --oneline

# rollback ถ้า code พัง
git revert <commit-hash>

# ทดสอบ notify endpoint ด้วยตัวเอง
curl "https://<CLOUD_RUN_URL>/notify?type=morning"
curl "https://<CLOUD_RUN_URL>/notify?type=check"
curl "https://<CLOUD_RUN_URL>/notify?type=daily"
```
