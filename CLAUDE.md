- ใช้ font "Noto Sans Thai" ในการสร้างหากเป็น infographic/ .html
- สอนการสร้างให้เข้าใจอย่างง่าย
- บอกด้วยว่าอันไหนไฟล์หรือหน้าต่างไหน ให้เปิดไว้ก่อน 
- เน้นภาษาที่เข้าใจง่าย และกระชับ
- ถ้าอันไหนไม่มั่นใจ ทำchoice มาให้user เป็นคนเลือกและตัดสินใจด้วย
- ทำinfographic ต่อเมื่อ user สั่ง
- หาก prompt ก่อนหน้าเป็นการสร้าง infographic แล้วคำสั่งต่อไป ช่วยถามมาอีกทีด้วยว่า ยังให้สร้าง info graphic ต่ออยู่ไหม
- agent ตอบuserแบบกระชับและได้ใจความ

---

## กฎการ Commit (สำคัญ)

**commit ทุกครั้งที่งานชิ้นใหญ่เสร็จ** — อย่ารวม phase หลายอันไว้ใน commit เดียว เพื่อป้องกัน code เสียหายแล้ว rollback ไม่ได้

**เมื่อไหร่ต้อง commit:**
- เขียน code ครบ 1 feature / 1 phase เสร็จ
- แก้ bug สำคัญเสร็จ
- ก่อน deploy ทุกครั้ง
- ก่อนเริ่มแก้ไขใหญ่ (เพื่อมี checkpoint ย้อนกลับ)

**รูปแบบ commit message:**
```
Phase X: สรุปสั้นๆ ว่าทำอะไร

- รายละเอียดข้อ 1
- รายละเอียดข้อ 2
```

**ถ้า code เสียหาย rollback ด้วย:**
```bash
git log --oneline          # ดู commit ที่ผ่านมา
git revert <commit-hash>   # ย้อนกลับ commit นั้น (ปลอดภัย)
```

---

## กฎการ Deploy (สำคัญ — ห้ามข้าม)

โปรเจกต์นี้รันบน **Google Cloud Run** — ต้อง deploy ผ่าน **GitHub** เสมอ ห้ามแก้ไฟล์ตรงๆ ใน Cloud Shell (เคยพังเพราะ heredoc + ภาษาไทยทำให้ไฟล์เสีย) ดูรายละเอียดเต็มที่ `docs/deploy.md`

**ขั้นตอน Deploy มาตรฐาน (6 ขั้น):**

| ขั้น | ที่ไหน | คำสั่ง |
|------|--------|--------|
| 1. แก้ code | เครื่อง local | — |
| 2. commit | PowerShell | `git add .` → `git commit -m "..."` |
| 3. push | PowerShell | `git push origin main` |
| 4. pull | Cloud Shell | `cd ~/aga-agent && git pull origin main` |
| 5. build | Cloud Shell | `gcloud builds submit --tag asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest` |
| 6. deploy | Cloud Shell | `gcloud run deploy aga-complaint-agent --image asia-southeast1-docker.pkg.dev/qcs-bait-app-v5/cloud-run-source-deploy/aga-complaint-agent:latest --platform managed --region asia-southeast1` |

**ข้อห้าม / ข้อควรระวัง:**
- ❌ ห้ามใช้ `cat > file << 'EOF'` เขียนไฟล์ภาษาไทยใน Cloud Shell — ตัว `$` และ backtick จะพัง
- ❌ ห้าม commit ไฟล์ลับ: `Secret Key.env`, `credentials/*.json`, `credentials/*.txt`
- ✅ `Dockerfile` ใช้ `node:22-alpine` (เพราะ `@line/bot-sdk` v11 ต้องการ Node 22+)
- ✅ ดู logs เวลา error: `gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20`
- ✅ Repo GitHub: `https://github.com/13azukaoab/AGA-Complaint-Agent-LINE.git`
