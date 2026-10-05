# คู่มือ Deploy — AGA Complaint Agent บน Google Cloud Run

> Project: **aga-complaint-line** | Region: **asia-southeast1** (Singapore)
> Service: **aga-complaint-agent** | URL: `https://aga-complaint-agent-929114248743.asia-southeast1.run.app`
> Repo: `https://github.com/13azukaoab/AGA-Complaint-Agent-LINE.git`

---

## 🆕 หมายเหตุการย้าย Project (28 ก.ย. 2569)

ย้ายจาก project เดิม `qcs-bait-app-v5` (ถูกลบโดยไม่ตั้งใจ 2 ครั้ง → Cloud Run พัง) มาที่ **`aga-complaint-line`** (#929114248743) ใส่ **lien กันลบ** แล้ว

**สิ่งที่ต่างจากเดิม (project ใหม่):**
- **Service account:** ใช้ default compute `929114248743-compute@developer.gserviceaccount.com` (เดิมใช้ custom `complaint-sheet-writer@...`)
- **Secrets:** ตั้งเป็น **env vars ตรงๆ** บน service (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `GEMINI_API_KEY`, `GOOGLE_SHEET_ID`) — ยังไม่ได้ใช้ Secret Manager
- **Google Sheet:** แชร์ให้ SA ใหม่เป็น Editor แล้ว
- **GCS bucket** `aga-complaint-photos`: ยังอยู่ project เก่า — ให้สิทธิ์ SA ใหม่ (`storage.objectAdmin`) แล้ว
  > ⚠️ ต.ค. 2569: ยกเลิกการเก็บรูปจาก LINE แล้ว (ตัด dependency `@google-cloud/storage`) — **แต่ห้ามลบ bucket นี้** เพราะยังเก็บไอคอนปลวกที่ Flex สรุปใช้ (`icons/termite.png`) + รูปเก่าที่ลิงก์ในชีต
- **Gemini key:** อยู่ project `gen-lang-client-0566996785` (คนละตัว) ใช้ข้ามได้
- ตั้ง `--no-cpu-throttling --memory=512Mi` เพื่อให้ async task หลังส่ง response ทำงานได้

> ⬇️ ส่วน "Setup ครั้งแรก" ด้านล่างเป็นวิธีของ **project เดิม** (Secret Manager + custom SA) เก็บไว้อ้างอิง

---

## 🔄 Flow การ Deploy ปกติ (ใช้ทุกครั้งที่แก้ code)

> **หลักการ:** แก้ code ที่เครื่อง local → push ขึ้น GitHub → Cloud Shell pull → build → deploy
> **ห้าม** แก้ไฟล์ตรงๆ ใน Cloud Shell เด็ดขาด (เคยพังเพราะ heredoc + ภาษาไทยทำให้ไฟล์เสีย)

### ขั้นที่ 1-3 — ทำที่เครื่อง local (PowerShell)

```powershell
cd "C:\Users\advan\Claude_Cowork\Complaint Agent (LINE)"
git add .
git commit -m "อธิบายสั้นๆ ว่าทำอะไร"
git push origin main
```

### ขั้นที่ 4-6 — ทำที่ Google Cloud Shell

```bash
# 4. ดึง code ล่าสุดจาก GitHub
cd ~/aga-agent && git pull origin main

# 5. Build Docker image
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/aga-complaint-line/cloud-run-source-deploy/aga-complaint-agent:latest

# 6. Deploy ขึ้น Cloud Run
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/aga-complaint-line/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed \
  --region asia-southeast1
```

---

## ⚠️ ข้อควรระวัง

- ❌ **ห้ามใช้ `cat > file << 'EOF'`** เขียนไฟล์ภาษาไทยใน Cloud Shell — `$` และ backtick จะถูก bash ตีความทำให้ไฟล์เสีย
- ❌ **ห้าม commit ไฟล์ลับ:** `Secret Key.env`, `credentials/*.json`, `credentials/*.txt` (อยู่ใน `.gitignore` แล้ว)
- ✅ **Dockerfile ใช้ `node:22-alpine`** — เพราะ `@line/bot-sdk` v11 ต้องการ Node 22+
- ✅ Secrets ทั้งหมดเก็บใน **Secret Manager** ไม่ได้ฝังใน image

---

## 🔍 เช็ค logs เวลา deploy แล้ว error

```bash
# ดู logs ล่าสุด 20 บรรทัด
gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20

# ดู logs แบบ real-time (ตามดูสดๆ)
gcloud run services logs tail aga-complaint-agent --region asia-southeast1
```

**Error ที่เคยเจอ + วิธีแก้:**

| อาการ | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| `container failed to start ... PORT 8080` | code crash ตอน start | ดู logs หาบรรทัดที่ error |
| `SyntaxError: Invalid regular expression flags` | ไฟล์เสียจาก heredoc | clone repo ใหม่จาก GitHub |
| `@line/bot-sdk requires node >=22` | Node version ต่ำไป | Dockerfile ใช้ `node:22-alpine` |
| `The bot is not a member of the group` | bot ไม่ได้อยู่ในกลุ่ม | add bot เข้ากลุ่ม LINE ก่อน |

---

## 🆘 ถ้า Cloud Shell repo พัง (clone ใหม่ทั้งหมด)

```bash
cd ~ && rm -rf ~/aga-agent && git clone https://github.com/13azukaoab/AGA-Complaint-Agent-LINE.git ~/aga-agent
```

> หมายเหตุ: ต้อง `cd ~` ออกมาก่อน ห้าม `rm -rf` folder ที่กำลังยืนอยู่

---

## 📦 Setup ครั้งแรก (ทำครั้งเดียว — ทำไปแล้ว)

<details>
<summary>กดดูขั้นตอน setup ครั้งแรก (Secret Manager, IAM)</summary>

### เก็บ Secrets ใน Secret Manager

```bash
gcloud config set project qcs-bait-app-v5
gcloud services enable run.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com

# สร้าง secrets
gcloud secrets create LINE_CHANNEL_SECRET --replication-policy="automatic"
gcloud secrets create LINE_CHANNEL_ACCESS_TOKEN --replication-policy="automatic"
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
gcloud secrets create GOOGLE_SHEET_ID --replication-policy="automatic"
gcloud secrets create ALLOWED_GROUP_IDS --replication-policy="automatic"
gcloud secrets create GCP_SERVICE_ACCOUNT_KEY --replication-policy="automatic"

# ใส่ค่า (แทนที่ YOUR_VALUE ด้วยค่าจริงจาก Secret Key.env)
echo -n "YOUR_LINE_CHANNEL_SECRET" | gcloud secrets versions add LINE_CHANNEL_SECRET --data-file=-
echo -n "YOUR_LINE_CHANNEL_ACCESS_TOKEN" | gcloud secrets versions add LINE_CHANNEL_ACCESS_TOKEN --data-file=-
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
echo -n "1YfBK8qo_G4yoX4FowueuYDcoa3vbIqEhcv6xaI3Qp8s" | gcloud secrets versions add GOOGLE_SHEET_ID --data-file=-
echo -n "" | gcloud secrets versions add ALLOWED_GROUP_IDS --data-file=-
gcloud secrets versions add GCP_SERVICE_ACCOUNT_KEY --data-file="credentials/qcs-bait-app-v5-daa46a58d50b.json"
```

### Deploy ครั้งแรก (ผูก secrets ทั้งหมด)

```bash
gcloud run deploy aga-complaint-agent \
  --image asia-southeast1-docker.pkg.dev/aga-complaint-line/cloud-run-source-deploy/aga-complaint-agent:latest \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --service-account complaint-sheet-writer@qcs-bait-app-v5.iam.gserviceaccount.com \
  --update-secrets=LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest \
  --update-secrets=LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest \
  --update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --update-secrets=GOOGLE_SHEET_ID=GOOGLE_SHEET_ID:latest \
  --update-secrets=ALLOWED_GROUP_IDS=ALLOWED_GROUP_IDS:latest \
  --update-secrets=/secrets/gcp-key.json=GCP_SERVICE_ACCOUNT_KEY:latest \
  --set-env-vars=GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key.json \
  --no-cpu-throttling \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi
```

> **สำคัญ:** ต้องมี `--no-cpu-throttling` + `--memory=512Mi` เพื่อให้ async task (เรียก Gemini + เขียน Sheet หลังส่ง response แล้ว) ทำงานได้

### ให้สิทธิ์ Service Account อ่าน Secrets

```bash
gcloud projects add-iam-policy-binding qcs-bait-app-v5 \
  --member="serviceAccount:complaint-sheet-writer@qcs-bait-app-v5.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### อัปเดต LINE Webhook URL

1. เปิด [LINE Developers Console](https://developers.line.biz)
2. เลือก Channel **AGA Pest Control (Dizzy)**
3. **Messaging API → Webhook URL** → ใส่ `https://aga-complaint-agent-929114248743.asia-southeast1.run.app/webhook`
4. กด **Verify** → ต้องขึ้น Success

</details>

---

## 💰 สรุปค่าใช้จ่าย

| รายการ | Free Tier | ที่คาดว่าใช้ |
|--------|-----------|------------|
| Cloud Run requests | 2M req/month | ~หลักพัน/month → **ฟรี** |
| Cloud Run CPU/RAM | 180,000 vCPU-sec/month | idle ไม่คิดเงิน → **ฟรี** |
| Secret Manager | 10,000 access/month | น้อยมาก → **ฟรี** |
| Gemini API (3.1 Flash Lite) | จ่ายตามใช้ | ~0.001 บาท/ข้อความ → เครดิต 400 บาทใช้ได้ ~3-4 ปี |
