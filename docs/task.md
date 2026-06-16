# Task Tracking — AGA Complaint Agent (LINE)

อัปเดตล่าสุด: 16 มิถุนายน 2569

---

## ✅ เสร็จแล้ว

### Phase 1–4 — Core System
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint + กรองสรุปประชุม/ขอข้อมูล/นัดหมาย ไม่ให้สร้าง WO ผิด
- Google Sheets บันทึกข้อมูล (columns A–U)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System (เสร็จ 100%)
- `src/index.js` — ตรวจ command `รับทราบ WXXX` / `ปิดงาน WXXX [วิธีปิด]`
- `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O–U)
- `src/notify.js` — endpoint `/notify` สำหรับ Cloud Scheduler
- Cloud Scheduler 2 jobs: `aga-notify-check` + `aga-notify-daily`
- ทดสอบ end-to-end ผ่าน: complaint → WO ID → รับทราบ → ปิดงาน
- เปิด Google Drive API ใน GCP project
- แก้ Drive upload: อัปโหลดเข้า folder `AGA-Complaint-Photos`
- แก้ regex: รองรับ `ปิดงานW001` (ไม่มี space) และ `ปิดงาน W001` (มี space)
- เพิ่ม catchCount (จำนวนที่จับได้): ดึงจาก regex `/(\d+)\s*ตัว/` ใน closeMethod → เก็ม column U (Sheet)

### Dashboard — Real-time (เสร็จ 100%)
- `dashboard.html` — single-file HTML เชื่อม `/api/dashboard` endpoint
- KPI cards: งานทั้งหมด / เปิด / ปิด / % ปิด / เฉลี่ยปิด / ค้างเกิน 3 วัน
- กราฟ: ชนิดแมลง, พื้นที่ Top10, ความรุนแรง, แนวโน้ม 14 วัน, กลุ่ม LINE, SLA, จำนวนที่จับได้/อาคาร, แนวโน้มรายเดือน 6 เดือน
- ตาราง: sort ทุก column, pagination, filter (สถานะ/ชนิด/กลุ่ม/ความรุนแรง/วันที่/ค้นหา)
- คอลัมน์: กลุ่ม LINE, ชื่อผู้แจ้ง, SLA badge, จำนวนที่ติด (catchCount), ลิงก์รูปหลายอัน 📷 + ลูกศร < >
- Export CSV + PDF
- VS Mode (Tab): เปรียบเทียบเดือน/อาคาร/กลุ่ม LINE + metric cards + grouped bar charts
- Keyboard Shortcuts: ESC / 1 / 2 / / / ← → / R / C / ? + Help Panel
- Photo modal: เปิดหลายรูปพร้อม counter "1 / 4" + ลูกศรซ้าย-ขวา + keyboard ← → navigate
- Manual refresh (ปิด auto-refresh) เพื่อลด Google Sheets read quota
- DASHBOARD_KEY ป้องกัน unauthorized access
- Deploy บน Netlify (เชื่อม GitHub auto-deploy) ✅
- URL: `https://aga-complaint-agent-line.netlify.app/dashboard.html`

---

## ⏳ งานค้างปัจจุบัน

### Pending — Backend Deploy
- Code ทั้งหมด commit ขึ้น GitHub แล้ว (`src/sheets.js`, `src/index.js`, `src/gemini.js`)
- ต้อง deploy ขึ้น Cloud Run เพื่อให้ catchCount (column U) ทำงาน
- Command ใน Cloud Shell:
  ```bash
  cd ~/aga-agent && git pull origin main
  gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
  gcloud run deploy aga-complaint-agent --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest --platform managed --region asia-southeast1
  ```

### Pending — Google Sheet หัวคอลัมน์
- Column U ต้องใส่หัวเรื่อง "จำนวนที่ติด" ใน Sheet row 1

---

## ✅ ระบบพร้อม Production แล้ว (16 มิ.ย. 2569)

ทุก feature หลักทำงานได้ครบแล้ว — รอ deploy backend เท่านั้น

---

## 📁 ไฟล์หลักของโปรเจกต์

| ไฟล์ | หน้าที่ |
|------|--------|
| `src/index.js` | Webhook handler หลัก + ดึง catchCount จาก closeMethod |
| `src/sheets.js` | อ่าน/เขียน Google Sheets (columns A–U) |
| `src/notify.js` | Endpoint สำหรับ Cloud Scheduler |
| `src/gemini.js` | เรียก Gemini AI + กรองสรุปประชุม/ขอข้อมูล/นัดหมาย |
| `dashboard.html` | Dashboard หลัก (VS Mode, Keyboard Shortcuts, Photo modal) |
| `CLAUDE.md` | กฎ deploy + commit |
| `docs/deploy.md` | ขั้นตอน deploy แบบละเอียด |
| `docs/task.md` | ไฟล์นี้ — tracking งานที่เสร็จและค้าง |

---

## 🛠 คำสั่งที่ใช้บ่อย

```bash
# ดู logs ล่าสุด
gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20

# ดู commit ที่ผ่านมา
git log --oneline

# rollback ถ้า code พัง
git revert <commit-hash>
```
