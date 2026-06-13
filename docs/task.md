# Task Tracking — AGA Complaint Agent (LINE)

อัปเดต: 13 มิถุนายน 2569

---

## ✅ เสร็จแล้ว

### Phase 1-4 — Core System (เสร็จ 100%)
- LINE Webhook รับข้อความจากกลุ่ม
- Gemini AI วิเคราะห์ complaint
- Google Sheets บันทึกข้อมูล (columns A-M)
- Deploy บน Google Cloud Run ✅

### Phase 6 — Work Order Close System (code เสร็จแล้ว — รอ deploy)
- ✅ `src/index.js` — ตรวจ command "รับทราบ WXXX" / "ปิดงาน WXXX [วิธีปิด]"
- ✅ `src/sheets.js` — เพิ่ม WO ID (column N) + status columns (O-T)
- ✅ `src/notify.js` — endpoint `/notify` สำหรับ Cloud Scheduler

---

## 🔜 สิ่งที่ต้องทำต่อ (Phase 6 — ยังไม่เสร็จ)

### 1. เพิ่ม Column Header ใน Google Sheet
เปิด [AGA Complaint Log](https://docs.google.com/spreadsheets/d/1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s)
เพิ่ม header ที่ row 1:

| Column | Header |
|--------|--------|
| N1 | Work Order ID |
| O1 | สถานะ |
| P1 | ผู้รับทราบ |
| Q1 | เวลารับทราบ |
| R1 | ผู้ปิดงาน |
| S1 | เวลาปิด |
| T1 | วิธีปิดงาน |

### 2. Deploy ขึ้น Cloud Run
```bash
# PowerShell (เครื่อง local)
git push origin main

# Cloud Shell
cd ~/aga-agent && git pull origin main
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed --region asia-southeast1
```

### 3. ตั้ง Cloud Scheduler (ใน Cloud Console UI)
ไปที่ [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler) → สร้าง 2 jobs:

| Job | Cron | URL | คำอธิบาย |
|-----|------|-----|---------|
| aga-notify-check | `*/30 8-18 * * 1-6` | `https://aga-complaint-agent-396358198178.asia-southeast1.run.app/notify?type=check` | ตรวจงานค้าง >30 นาที ทุกครึ่งชั่วโมง |
| aga-notify-daily | `0 17 * * 1-6` | `https://aga-complaint-agent-396358198178.asia-southeast1.run.app/notify?type=daily` | สรุปรายวัน 17:00 |

> Time zone: `Asia/Bangkok`

### 4. ทดสอบ
- ส่งข้อความ complaint ในกลุ่ม → ตรวจ Sheet มี WO ID (N) + สถานะ "เปิด" (O)
- พิมพ์ "รับทราบ W001" → Sheet column P-Q มีข้อมูล + bot reply 1 บรรทัด
- พิมพ์ "ปิดงาน W001 กำจัดด้วยยา" → Sheet column R-T มีข้อมูล
- เรียก `/notify?type=check` → ตรวจว่า LINE group ได้รับแจ้งเตือน
- ทดสอบรูป: ส่งรูปก่อน → พิมพ์ "ปิดงาน W001" ภายใน 5 นาที → column T มี Drive URL

---

## 📋 Phase ที่ยังไม่ได้เริ่ม

| Phase | งาน | หมายเหตุ |
|-------|-----|---------|
| 5 | Vision AI — วิเคราะห์รูปภาพแมลง | model `gemini-3.1-flash-lite` รองรับแล้ว รอเริ่ม |

---

## 📁 ไฟล์ที่แก้ในงานนี้

| ไฟล์ | สถานะ |
|------|-------|
| `src/index.js` | ✅ แก้แล้ว (commit 78b0c89) |
| `src/sheets.js` | ✅ แก้แล้ว (commit 78b0c89) |
| `src/notify.js` | ✅ สร้างใหม่ (commit 78b0c89) |
| `CLAUDE.md` | ✅ เพิ่มกฎ deploy |
| `docs/deploy.md` | ✅ เขียน flow ใหม่ |
