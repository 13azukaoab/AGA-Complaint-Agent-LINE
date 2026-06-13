# Task Tracking — AGA Complaint Agent (LINE)

อัปเดต: 13 มิถุนายน 2569

---

## ✅ เสร็จแล้ว

### Phase 1-4 — Core System (เสร็จ 100%)
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint
- Google Sheets บันทึกข้อมูล (columns A-M)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System (เสร็จ 100% ✅)
- ✅ `src/index.js` — ตรวจ command "รับทราบ WXXX" / "ปิดงาน WXXX [วิธีปิด]"
- ✅ `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O-T)
- ✅ `src/notify.js` — endpoint `/notify` สำหรับ Cloud Scheduler
- ✅ Cloud Scheduler 2 jobs: `aga-notify-check` + `aga-notify-daily`
- ✅ ทดสอบ end-to-end ผ่าน: complaint → WO ID → รับทราบ → ปิดงาน
- ✅ เปิด Google Drive API ใน GCP project
- ✅ แก้ Drive upload: อัปโหลดเข้า folder `AGA-Complaint-Photos` (แก้ Service Account quota)
- ✅ แก้ regex: รองรับ `ปิดงานW001` (ไม่มี space) และ `ปิดงาน W001` (มี space)

---

## 🔜 สิ่งที่ต้องทำต่อ

### Deploy ล่าสุด (ยังไม่ได้ deploy หลังแก้ Drive + regex)
รัน Cloud Shell:
```bash
cd ~/aga-agent && git pull origin main
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
gcloud run deploy aga-complaint-agent --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest --platform managed --region asia-southeast1
```

### ทดสอบ Drive upload หลัง deploy
- ส่งรูปในกลุ่ม LINE → พิมพ์ `ปิดงาน WXXX` ภายใน 5 นาที
- ตรวจ column T ใน Sheet — ต้องมี Drive URL
- ตรวจ folder [AGA-Complaint-Photos](https://drive.google.com/drive/folders/1HcY1doc7d4G_z5tUo3VPDc_sXZvyxeHq) ว่ามีรูปขึ้น

---

## 📋 Phase ที่ยังไม่ได้เริ่ม

| Phase | งาน | หมายเหตุ |
|-------|-----|---------|
| 5 | Vision AI — วิเคราะห์รูปภาพแมลง | model `gemini-3.1-flash-lite` รองรับแล้ว รอเริ่ม |

---

## 📁 ไฟล์ที่แก้ในงานนี้

| ไฟล์ | สถานะ | commit |
|------|-------|--------|
| `src/index.js` | ✅ แก้แล้ว | a3ff7b1 |
| `src/sheets.js` | ✅ แก้แล้ว | 78b0c89 |
| `src/notify.js` | ✅ สร้างใหม่ | 78b0c89 |
| `CLAUDE.md` | ✅ เพิ่มกฎ deploy + commit | 8e7d711 |
| `docs/deploy.md` | ✅ เขียน flow ใหม่ | 8e7d711 |
| `docs/task.md` | ✅ อัปเดต | — |
