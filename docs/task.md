# Task Tracking — AGA Complaint Agent (LINE)

อัปเดตล่าสุด: 17 มิถุนายน 2569

---

## ✅ เสร็จแล้ว — ระบบ Production พร้อมใช้งาน 100%

### Phase 1–4 — Core System
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint + กรองสรุปประชุม/ขอข้อมูล/นัดหมาย
- Google Sheets บันทึกข้อมูล (columns A–U)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System
- `src/index.js` — ตรวจ command `รับทราบ WXXX` / `ปิดงาน WXXX [วิธีปิด]`
- `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O–U)
- ทดสอบ end-to-end ผ่าน: complaint → WO ID → รับทราบ → ปิดงาน
- catchCount: ดึงจาก regex `/(\d+)\s*ตัว/` → column U

### Phase 7 — Notification System (เสร็จและทดสอบจริงแล้ว ✅)
- `src/notify.js` — 3 endpoint types ทำงานครบ:

| Type | เวลา | พฤติกรรม |
|------|------|---------|
| `?type=morning` | 08:30 | ส่งทุกกลุ่มใน `ALLOWED_GROUP_IDS`: 🔴 งานค้างข้ามวัน / 🟢 ไม่มีค้าง |
| `?type=check` | 12:00 | งานเปิดวันนี้เท่านั้น — ส่งเฉพาะกลุ่มที่มีค้าง |
| `?type=daily` | 17:30 | สรุปรายวัน: งานวันนี้ทั้งหมด แยก ปิด/ยังไม่ปิด |

- `src/sheets.js` — เพิ่ม `groupId` ใน `getAllWorkOrders()` (แก้ bug daily ไม่ส่ง)
- Cloud Scheduler 3 jobs: `aga-notify-morning` / `aga-notify-check` / `aga-notify-daily`
- `ALLOWED_GROUP_IDS=Cc0527ed1a845f03d9a01ab04b1835e56` set ใน Cloud Run env
- Security: `/notify` ป้องกันด้วย `X-Notify-Key` header — บอทภายนอกโดนบล็อก 403
- ลด 16:00 ออก (ทับซ้อนกับ 12:00) — `aga-notify-check` เหลือแค่ 12:00

### Phase 8 — Dashboard (เสร็จ 100%)
- `dashboard.html` — single-file HTML เชื่อม `/api/dashboard`
- KPI cards, กราฟ 7 ชุด (ชนิดแมลง/พื้นที่/SLA/แนวโน้ม/catchCount ฯลฯ)
- VS Mode: เปรียบเทียบเดือน/อาคาร/กลุ่ม LINE
- Keyboard Shortcuts: ESC / 1 / 2 / / / ← → / R / C / ?
- Photo modal: หลายรูป + ลูกศร + download
- Manual refresh, Export CSV + PDF
- Netlify redirect: `/` → `/dashboard.html`
- URL: `https://aga-complaint-agent-line.netlify.app/dashboard.html`

### Phase 9 — Commands & UX
- `index.js`: command "dashboard" / "ขอลิงค์" → reply ลิงค์ Netlify
- `index.js`: command "งานค้าง" → รายการงานที่ยังไม่ปิดในกลุ่ม
- Sheet column U หัวข้อ "จำนวนที่ติด" ✅

---

## 📋 สถานะระบบปัจจุบัน (17 มิ.ย. 2569)

| Component | สถานะ |
|-----------|-------|
| Cloud Run Backend | ✅ revision 00038-fdq |
| Netlify Dashboard | ✅ auto-deploy |
| Cloud Scheduler morning | ✅ 08:30 |
| Cloud Scheduler check | ✅ 12:00 (ลด 16:00 ออกแล้ว) |
| Cloud Scheduler daily | ✅ 17:30 |
| LINE Notify กลุ่ม | ✅ ยืนยันรับข้อความแล้ว |
| Security `/notify` | ✅ X-Notify-Key header — บอทภายนอก 403 |

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

# ทดสอบ notify endpoints
curl -s "https://aga-complaint-agent-396358198178.asia-southeast1.run.app/notify?type=morning" | python3 -m json.tool
curl -s "https://aga-complaint-agent-396358198178.asia-southeast1.run.app/notify?type=check" | python3 -m json.tool
curl -s "https://aga-complaint-agent-396358198178.asia-southeast1.run.app/notify?type=daily" | python3 -m json.tool

# rollback ถ้า code พัง
git log --oneline
git revert <commit-hash>

# deploy ใหม่
cd ~/aga-agent && git pull origin main
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
gcloud run deploy aga-complaint-agent --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest --platform managed --region asia-southeast1
```
