# Task Tracking — AGA Complaint Agent (LINE)

อัปเดตล่าสุด: 15 มิถุนายน 2569

---

## ✅ เสร็จแล้ว

### Phase 1–4 — Core System
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint
- Google Sheets บันทึกข้อมูล (columns A–M)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System (เสร็จ 100%)
- `src/index.js` — ตรวจ command `รับทราบ WXXX` / `ปิดงาน WXXX [วิธีปิด]`
- `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O–T)
- `src/notify.js` — endpoint `/notify` สำหรับ Cloud Scheduler
- Cloud Scheduler 2 jobs: `aga-notify-check` + `aga-notify-daily`
- ทดสอบ end-to-end ผ่าน: complaint → WO ID → รับทราบ → ปิดงาน
- เปิด Google Drive API ใน GCP project
- แก้ Drive upload: อัปโหลดเข้า folder `AGA-Complaint-Photos`
- แก้ regex: รองรับ `ปิดงานW001` (ไม่มี space) และ `ปิดงาน W001` (มี space)

### Dashboard — Real-time (เสร็จ 100%)
- `dashboard.html` — single-file HTML เชื่อม `/api/dashboard` endpoint
- KPI cards: งานทั้งหมด / เปิด / ปิด / % ปิด / เฉลี่ยปิด / ค้างเกิน 3 วัน
- กราฟ 6 ชุด: ชนิดแมลง, พื้นที่ Top10, ความรุนแรง, แนวโน้ม 14 วัน, กลุ่ม LINE, SLA
- ตาราง: sort ทุก column, pagination, filter (สถานะ/ชนิด/กลุ่ม/ความรุนแรง/วันที่/ค้นหา)
- คอลัมน์: กลุ่ม LINE, ชื่อผู้แจ้ง, SLA badge, ลิงก์รูป Drive 📷
- Export CSV
- DASHBOARD_KEY ป้องกัน unauthorized access
- Deploy บน Netlify (เชื่อม GitHub auto-deploy) ✅
- URL: `https://aga-complaint-agent-line.netlify.app/dashboard.html`

---

## ✅ ระบบพร้อม Production แล้ว (15 มิ.ย. 2569)

ทุก feature หลักทำงานได้ครบแล้ว — ไม่มีงานค้างเร่งด่วน

---

## 📁 ไฟล์หลักของโปรเจกต์

| ไฟล์ | หน้าที่ |
|------|--------|
| `src/index.js` | Webhook handler หลัก |
| `src/sheets.js` | อ่าน/เขียน Google Sheets |
| `src/notify.js` | Endpoint สำหรับ Cloud Scheduler |
| `src/gemini.js` | เรียก Gemini AI |
| `src/drive.js` | อัปโหลดรูปไป Google Drive |
| `CLAUDE.md` | กฎ deploy + commit |
| `docs/deploy.md` | ขั้นตอน deploy แบบละเอียด |

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
