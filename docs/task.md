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

---

## 🔴 งานค้าง — ต้องทำก่อน

### 1. Deploy โค้ดล่าสุด (ยังไม่ได้ deploy หลังแก้ Drive + regex)

รันใน **Cloud Shell**:

```bash
cd ~/aga-agent
git pull origin main
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed \
  --region asia-southeast1
```

### 2. ทดสอบ Drive Upload หลัง Deploy

| ขั้น | วิธีทดสอบ | ผลที่คาดหวัง |
|------|-----------|------------|
| ส่งรูปในกลุ่ม LINE | แนบรูป แล้วพิมพ์ `ปิดงาน WXXX` ภายใน 5 นาที | Bot ตอบยืนยัน |
| เช็ค Google Sheet | ดู column T | ต้องมี Drive URL ของรูป |
| เช็ค Google Drive | เปิด [AGA-Complaint-Photos](https://drive.google.com/drive/folders/1HcY1doc7d4G_z5tUo3VPDc_sXZvyxeHq) | รูปต้องขึ้นใน folder |

---

## 🔵 Phase ที่ยังไม่ได้เริ่ม

### Phase 5 — Vision AI วิเคราะห์รูปภาพแมลง

**เป้าหมาย:** ให้ Gemini อ่านรูปที่ลูกค้าส่งมา แล้ววิเคราะห์ว่าเป็นแมลงอะไร / ความรุนแรงระดับไหน

**สถานะ:** Gemini model รองรับรูปภาพอยู่แล้ว (`gemini-1.5-flash`) — รอเริ่ม

**งานที่ต้องทำใน Phase 5:**
- [ ] รับรูปจาก LINE Webhook (message type = `image`)
- [ ] ดึง binary content จาก LINE API
- [ ] ส่งรูปให้ Gemini วิเคราะห์พร้อม prompt
- [ ] บันทึกผลการวิเคราะห์ลง Sheets (คอลัมน์ใหม่)
- [ ] ทดสอบ end-to-end

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
