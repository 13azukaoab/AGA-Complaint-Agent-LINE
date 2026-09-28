# 🚚 Migration Task — ย้ายบอทไป Project ใหม่

> **สร้างเมื่อ:** 28 กันยายน 2569
> **เหตุผล:** project เดิม `qcs-bait-app-v5` ถูกลบโดยไม่ตั้งใจ 2 ครั้ง (22 ก.ย. + ~27 ก.ย.) หลัง undelete แล้ว Cloud Run ฝั่ง backend sync ไม่กลับ (URL 404, deploy ไม่ได้) → ย้ายไป project ใหม่เฉพาะบอทเพื่อความสบายใจและตัดปัญหาถาวร

---

## 🎯 เป้าหมาย
ย้าย **เฉพาะ Cloud Run service** (`aga-complaint-agent`) ไป project ใหม่ โดยคงข้อมูลเดิมทั้งหมด (Google Sheet, รูปภาพ, Gemini key)

---

## 📌 ข้อมูลตั้งต้น (reference / สำหรับ rollback)

| รายการ | ค่า |
|--------|-----|
| Project เดิม | `qcs-bait-app-v5` (#396358198178) — ACTIVE + มี lien กันลบแล้ว |
| Project ใหม่ | `aga-complaint-line` *(ถ้าซ้ำ เติม suffix เช่น -2026)* |
| Cloud Run service | `aga-complaint-agent` |
| Region | `asia-southeast1` |
| URL เดิม (webhook) | `https://aga-complaint-agent-396358198178.asia-southeast1.run.app/webhook` |
| Google Sheet ID | `1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s` |
| GCS bucket รูป | `aga-complaint-photos` (คงไว้ที่ project เดิม — แค่ให้สิทธิ์ SA ใหม่) |
| Gemini key | อยู่ project `gen-lang-client-0566996785` — **ไม่ต้องแตะ** ใช้ข้ามได้ |

### Env vars ที่ service ต้องมี
| Key | หมายเหตุ |
|-----|---------|
| `LINE_CHANNEL_SECRET` | จาก Secret Key.env |
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก Secret Key.env |
| `GEMINI_API_KEY` | จาก Secret Key.env (คีย์เดิมใช้ได้) |
| `GOOGLE_SHEET_ID` | `1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s` |
| `ALLOWED_GROUP_IDS` | สำหรับ morning alert (เว้นว่างได้) |
| `DASHBOARD_KEY` | optional — ป้องกัน API dashboard |
| `NOTIFY_KEY` | optional — ป้องกัน endpoint /notify |

> ❌ ไม่ต้องตั้ง `GOOGLE_APPLICATION_CREDENTIALS` — บน Cloud Run auth ผ่าน metadata SA (`IS_CLOUD_RUN` path ใน `sheets.js`)

---

## ✅ Checklist (ทำตามลำดับ)

### ขั้นเตรียม
- [ ] **C0** commit checkpoint ก่อนเริ่ม (ไฟล์นี้) ← *กำลังทำ*

### ขั้นสร้าง Project + สิทธิ์
- [ ] **C1** สร้าง project ใหม่ + ผูก billing (`01F132-3C808D-BB0970`)
- [ ] **C2** เปิด API: `run`, `cloudbuild`, `artifactregistry`, `sheets`, `storage`
- [ ] **C3** ใส่ **lien กันลบ** project ใหม่ทันที (กันเหตุซ้ำ)

### ขั้น Deploy
- [ ] **C4** deploy ด้วย `gcloud run deploy --source .` (build+AR+deploy ในคำสั่งเดียว) พร้อม `--set-env-vars` + `--allow-unauthenticated`
- [ ] **C5** จด **URL ใหม่** ที่ได้

### ขั้นเชื่อมข้อมูล (สำคัญ — พลาดแล้ว auth พัง)
- [ ] **C6** หา email ของ runtime SA ใหม่ (`<projnum>-compute@developer.gserviceaccount.com`)
- [ ] **C7** **แชร์ Google Sheet** ให้ SA ใหม่ (สิทธิ์ Editor) ← ทำใน Google Sheet UI
- [ ] **C8** ให้สิทธิ์ SA ใหม่เข้า bucket `aga-complaint-photos` (`roles/storage.objectAdmin`)

### ขั้นสลับ LINE
- [ ] **C9** **แก้ LINE webhook URL → URL ใหม่** ← ทำใน LINE Developers Console
- [ ] **C10** กด **Verify** ใน LINE console

### ขั้นทดสอบ
- [ ] **C11** `curl <URL ใหม่>/` → ต้องได้ `AGA Complaint Agent is running ✅`
- [ ] **C12** พิมพ์ `งานค้าง` ในกลุ่ม → บอทตอบ (ต้องเห็น W409/W410/W411)
- [ ] **C13** ทดสอบแจ้ง complaint จริง → บอทเปิด W ใหม่ + เขียน Sheet

### ขั้นปิดงาน
- [ ] **C14** อัปเดต `cloudbuild.yaml`, `docs/deploy.md`, `README.md` เป็น project/URL ใหม่
- [ ] **C15** commit + push
- [ ] **C16** (ทีหลัง) พิจารณาย้าย bucket + ปิด service เดิม

---

## 🔙 Rollback
- Code checkpoint: commit ก่อนหน้า (`b3a2a18`) — โค้ดไม่เสีย
- Project เดิม `qcs-bait-app-v5` = ACTIVE + lien → ถ้า Google sync กลับมา ใช้ของเดิมได้ทันที (monitor URL เดิมยังรันอยู่)
- ถ้าย้ายไม่สำเร็จ: กลับไปใช้ webhook URL เดิม เมื่อ project เดิมฟื้น

---

## 📝 Log ความคืบหน้า
- 28 ก.ย. : สร้าง task นี้ + commit checkpoint
