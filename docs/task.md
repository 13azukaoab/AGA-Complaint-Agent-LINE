# Task Tracking — AGA Complaint Agent (LINE)

อัปเดตล่าสุด: 31 กรกฎาคม 2569

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

### Phase 10 — Bug Fixes & Notify Enhancement (18 มิ.ย. 2569)

**Bug Fixes:**
- `index.js`: regex ปิดงาน รองรับ 2 รูปแบบ — `"ปิดงาน W009 ..."` และ `"W009 ปิดงาน ..."` (เดิมรูปแบบที่ 2 กลายเป็นเปิด WO ใหม่)
- `index.js`: `handleClose` เปลี่ยน `pushMessage` → `safeReply` (ปิดงานแล้ว reply ไม่ขึ้นในบางกลุ่ม)
- Cloud Run `ALLOWED_GROUP_IDS`: เพิ่มกลุ่มที่ 2 — morning alert ส่งครบทั้ง 2 กลุ่มแล้ว
- `gemini.js`: เพิ่มกฎกรอง "ปิดงาน" ไม่ให้ Gemini จัดเป็น complaint

**Notify Format Upgrade:**
- 08:30: เพิ่มเบอร์ติดต่อ + format เหมือน "งานค้าง" (emoji/ชั้น/เวลา)
- 12:00: เปลี่ยน format ใหม่เหมือน "งานค้าง" (เดิมเป็น plain text)
- 17:30: เพิ่ม เวลาปิด / ผู้ปิด / วิธีปิด / จำนวนที่จับได้ ในส่วน ✅ ปิดแล้ว

**Canonical Building Names:**
- `gemini.js`: เพิ่ม location map 6 อาคาร (สยามมินทร์, 100ปีฯ, เฉลิมพระเกียรติ ฯลฯ)
- `scripts/fix-locations.js`: script แก้ชื่ออาคารใน Sheet ย้อนหลัง (รัน manual เมื่อต้องการ)
- แก้ข้อมูลเก่าใน Google Sheet 7 row แล้ว

### Phase 11 — Dashboard: Column Filter + Heatmap Upgrade (24 ก.ค. 2569)

**Column Filter (ตารางรายการงาน):**
- เพิ่มแถว filter ใต้หัวตาราง 13 คอลัมน์ — text input (WO/วันที่/ผู้แจ้ง/พื้นที่/ชั้น/วิธีปิด) + dropdown (กลุ่ม LINE/ชนิด/สถานะ/ผู้ปิดงาน)
- `passColFilters()` กรอง AND ร่วมกับ search box / date range เดิม
- ปุ่ม "ล้าง" reset ทุก column filter ด้วย

**Heatmap อาคาร×เดือน:**
- เปลี่ยนโทนสีน้ำเงิน → แดง (อ่านง่ายขึ้น)
- คลิกชื่อตึก หรือคลิกช่อง (cell) → drill-down ไปตารางรายการงาน (กรอง location, คลิก cell กรองเดือนนั้นด้วย)
- เพิ่มคอลัมน์ "แนวโน้ม" ▲/▼ เทียบเดือนล่าสุด vs เดือนก่อน
- Dropdown เลือกช่วงเดือน (3/6/12) และจำนวนตึกที่แสดง (5/10/20/ทั้งหมด)

**Bug Fix — Quick Date Preset:**
- แก้ `toISOString()` (UTC) → local date string ป้องกันวันที่เพี้ยนข้ามเขตเวลา
- "เดือนนี้" เดิม bug ใช้สิ้นเดือนก่อนหน้าเป็น `to` → แก้เป็นวันที่ 1 ถึงสิ้นเดือนปัจจุบันจริง
- "สัปดาห์นี้" แก้ให้ครอบจันทร์–อาทิตย์ (เดิม to = วันนี้)

ไฟล์ที่แก้: `dashboard.html` (commit `5255c0f`)

### Phase 12 — Summary in "งานค้าง" + Sheet Cleanup (24 ก.ค. 2569)

**Summary column M:**
- `src/sheets.js` — `getOpenWorkOrders()` เพิ่ม field `summary: row[12]` (column M)
- `src/index.js` — คำสั่ง "งานค้าง" แสดง 📝 สรุปเนื้อหา complaint (ตัด 60 ตัวอักษร)
- commit `01f239d` — deploy ผ่าน Cloud Build

**Sheet Cleanup (รัน script แล้ว):**
- ลบ W035, W037 (ซ้ำ) + แก้ W040 floor → ชั้น 2 ผ่าน `scripts/fix-sheet-duplicates.js`

**Diagram + gitignore:**
- ปรับ layout ผัง workflow `AGA-Complaint-Agent.drawio` + gitignore `.drawio.bkp` — commit `2b61189`

**ยกเลิกจาก TODO (user ตัดออก):**
- Monthly spend cap Gemini (ค่าใช้จ่ายต่ำ ~฿3/เดือน)
- อัปเกรด LINE OA plan (ใช้ Free ต่อ)

### Phase 13 — Dashboard: Excel-filter + a11y + กราฟชนิด×อาคาร (24 ก.ค. 2569)

**ตาราง "รายการงาน" — filter แบบ Excel (commit `3251d20`):**
- "วันที่แจ้ง" → popup เลือกช่วงวันที่ (from-to)
- "ผู้แจ้ง/ชนิด/พื้นที่/ผู้ปิดงาน" → multi-select checkbox + ค้นหา + เลือกทั้งหมด
- popup ใช้ `position:fixed` หนี clip ของ overflow-x · ปิดด้วยคลิกนอก/ESC/scroll

**a11y + popup flip (commit `de88642`):**
- muted text (slate-400 → slate-500) ใน light mode ผ่าน contrast 4.5:1 (เดิม 2.3-2.6) · dark mode คงเดิมผ่าน `body:not(.dark)` + helper `MUTED()`
- placeholder เข้มขึ้น · heatmap header/canvas ใช้สี mode-aware
- filter popup flip ขึ้นเมื่อพื้นที่ล่างจอไม่พอ

**กราฟใหม่ "ชนิดสัตว์รบกวน แยกตามอาคาร" (commit `66d918d` + `114d212`):**
- Stacked bar แนวนอน — แต่ละแท่ง = 1 อาคาร แบ่งสีตามชนิด (top 6 + "อื่นๆ")
- คลิกแท่ง → กรองตารางเฉพาะอาคารนั้น
- filter bar ของกราฟเอง (อิสระจากตาราง): อาคาร multi-check (เทียบหลายตึก) + เดือน dropdown + ชนิด multi-check + ล้าง
- สีชนิดคงที่ (`pestColorFor`) จัดตามความถี่รวม ไม่เปลี่ยนตาม filter

**กฎใหม่ใน CLAUDE.md (commit `646cb82`):**
- งาน design สำคัญ → ทำ preview/mockup ให้ user เลือกก่อนเขียนโค้ดจริง

ไฟล์ที่แก้: `dashboard.html`, `CLAUDE.md`

**⚠️ ค้างตรวจเอง:** Cloud Build deploy ของ commit `01f239d` (summary column M — backend) — ดูที่ Cloud Build History (gcloud ไม่ได้ติดตั้งบนเครื่อง local จึงเช็คแทนไม่ได้)

### Phase 14 — Dashboard: Sidebar redesign + หน้า "อาคาร × เดือน" + Building Normalize (30 ก.ค. 2569)

**Sidebar layout ใหม่ (แทน tab bar เดิม) — mockup 5B ที่ user เลือก:**
- Sidebar ซ้าย: ภาพรวม / เปรียบเทียบ VS / **อาคาร × เดือน (ใหม่)** / Heatmap ชั้น / Work Orders / รูปหลักฐาน / Export CSV-PDF / Shortcuts / ตั้งค่า-สมาชิก (placeholder)
- Mobile responsive (ทดสอบ iPhone 15 Pro 393×852): sidebar → drawer + hamburger ☰, grid ปรับเป็น 1-2 คอลัมน์
- commit `00234cc`, `b096de2`

**หน้าใหม่ "อาคาร × เดือน" — 6 มุมมอง + ฟีเจอร์เสริม 1-5 (ตาม mockup ที่ user เลือกทำทั้งหมด):**
- Heatmap อาคาร×เดือน (Top 15, ไล่สี 7 ระดับ) + Stacked Bar (Top 6 + อื่นๆ) + Δ% vs เดือนก่อน + Top Movers ↑↓ + Small Multiples 12 อาคาร
- **[1] Drill-down** — คลิกแถวอาคาร → modal รายการงาน (WO/วันที่/ชั้น/สถานะ/SLA/รูป)
- **[2] Auto-insight** — สรุปข้อความอัตโนมัติ (เทรนด์ MoM, hotspot ใหม่, อันดับ 1, งานค้าง)
- **[3] ดาวน์โหลด PNG** ปุ่ม ⬇ บน stacked bar
- **[4] เลือกช่วงเดือน** segment 3/6/12/ทั้งหมด
- **[5] KPI sparkline** ในการ์ด (งานรวม/hotspot#1/hotspot ใหม่/%ปิด)
- Filter ชนิดสัตว์แบบ **multi-select checkbox** (ใช้ร่วมกับ filter บนตารางหลัก ผ่าน `colState.pestType`)
- commit `00234cc`, `5ab777d`

**Bug fixes (แจ้งจาก user):**
- กราฟใน BPM โตไม่หยุด (Chart.js `responsive:true` บน canvas ที่ parent ไม่มี height ตายตัว) → wrap ด้วย `<div style="height:Xpx">` — commit `b096de2`
- PDF export กระจาย → print CSS หน้า BPM บังคับ 1 คอลัมน์ + ซ่อน sidebar
- ปุ่ม "รูปหลักฐาน" กดแล้วตารางว่าง (bug: search ไม่ครอบ closeMethod) → เปลี่ยนเป็น **แกลเลอรีรูป** (modal grid รวมรูปจากงานที่กรองอยู่)
- Small multiples ล้นกรอบมือถือ (canvas วัดค้าง 300px ตอน layout ยังไม่ reflow) → `max-width:100%` + `requestAnimationFrame` + resize handler
- เอากราฟ "งานตามความรุนแรง" ออกตามคำขอ
- commit `f652db3`

**Building Normalization — แก้ปัญหาอาคารซ้ำถูกแยกเป็นคนละพื้นที่ (สำคัญมาก):**
- User ส่งทะเบียนอาคารทางการ **67 อาคาร (Bldg_001–067, 5 กลุ่ม)** มาเทียบ
- สร้าง `docs/building-registry.md` — **single source of truth** (ทะเบียนเต็ม + คำ/สะกดที่ map เข้า + คู่ชื่อห้ามสับสน เช่น ศรีสังวาลย์≠ศรีสวรินทิรา)
- เพิ่มฟิลด์ `r.building` (normalize จาก `r.location`) ตอนโหลดข้อมูลครั้งเดียว ผ่าน `bpmBuildingOf()`
- **แก้ทั่วทั้ง dashboard ไม่ใช่แค่หน้า BPM** — filter คอลัมน์ "พื้นที่", กราฟ Top 10 พื้นที่, อาคาร×ชั้น (drill+heatmap), ชนิด×อาคาร, งานแจ้งซ้ำ ทั้งหมดเปลี่ยนมาใช้ `building`
- คง `location` ดิบไว้ที่ตาราง/ค้นหา/แกลเลอรีรูป/Export CSV (เก็บรายละเอียดหน่วยย่อย)
- ผลลัพธ์ verified: 90 ชื่อดิบ → 32 อาคารมาตรฐาน, total 186 ครบ, filter "ตึก 72 ปี" ได้ครบ 15 งานทุกหน่วยย่อย
- การตัดสินใจ: "หอพักพยาบาล" เดี่ยว→หอ 1 · หอพักนักศึกษาแพทย์≠ตึกปฏิบัติการสารสนเทศ (แยก) · ตึกวางแผนครอบครัวเก็บแยก · นอกทะเบียน→"อื่นๆ (นอกทะเบียน)"
- commit `bc1f48e`, `773ed52`

ไฟล์ที่แก้: `dashboard.html`, `docs/building-registry.md` (ใหม่), `mockups/5A-5B-5C-6*.html` (ใหม่)

### Phase 15 — gemini.js normalize + upgrade 3.6-flash (2 ส.ค. 2569) ✅ DONE

**สิ่งที่ทำ (commit `4b36b7d`):**
1. เพิ่ม normalize table 30+ alias เข้า prompt `src/gemini.js` (ครอบคลุมทะเบียน 67 อาคาร ที่ใช้จริง)
2. Warning คู่ชื่อคล้าย: ศรีสังวาลย์≠ศรีสวรินทิรา, อานันทมหิดล≠อานันทราช, ตึก 10≠อาคาร 100 ปี, ตึกนวมินทร์≠ตึก 84 ปี, หอพักนศพ.≠ปฏิบัติการสารสนเทศ
3. Conservative rule: ตรงชัดเจนเท่านั้น, สงสัย = คงชื่อดิบ (กัน over-normalize เช่น "ห้องยา 103")
4. Upgrade model `gemini-3.5-flash` → `gemini-3.6-flash` (Jul 21, 2026, output ถูกกว่า 17%)

**Test:**
- Local (`scratchpad/test_normalize.js`, 14 samples): 3.5-flash 12/14 OK + 2 correct fallback · 3.6-flash 12/14 OK + 2 correct fallback (identical)
- Production verified (2 ส.ค. 14:31): ข้อความจริง "ตึกสยามินทร์ ชั้น 2 ห้องจดหมายเหตุ" → Sheet บันทึก `location=ตึกสยามินทร์`, `floor=ชั้น 2` ถูกต้อง · W176 เปิด+ปิด+สรุปงานค้าง ครบรอบ

**Decision log (grill-me session):**
- Q1 quality vs cost → **quality** (ค่าใช้จ่ายจริง ~฿3/mo, mis-normalize เสียหายกว่าเซฟ)
- Q2 3.6 vs 3.5 flash → **3.6** (ใหม่กว่า, output ถูกกว่า, งานเป็น one-shot ไม่ใช่ agentic)
- Q3 rollout → **prompt + model รวม commit เดียว** (test local pass ทั้งคู่)
- Q4 timing → **deploy ทันที** (user online monitoring, blast ต่ำ, rollback = `git revert 4b36b7d`)

**ไฟล์ที่แก้:** `src/gemini.js`

**หมายเหตุ regression `findOriginalWO`:** followup ที่พิมพ์ alias เดิม (เช่น "ธนาคารเลือด") หลัง deploy → normalize เป็น "ตึก 72 ปี", จะไม่ match กับ WO เก่าที่เก็บ "ธนาคารเลือด" → สร้าง WO ใหม่แทน tag เป็น followup. Not fatal — พลาดแค่ flag, ระบบเปิดงานปกติ. รอข้อมูลเก่าอายุครบไม่ต้อง fix

---

## 📋 สถานะระบบปัจจุบัน (2 ส.ค. 2569)

| Component | สถานะ |
|-----------|-------|
| Cloud Run Backend | ✅ commit `4b36b7d` (Phase 15 — gemini.js normalize + 3.6-flash) |
| Gemini Model | ✅ `gemini-3.6-flash` (upgrade จาก 3.5-flash, 2 ส.ค.) |
| Netlify Dashboard | ✅ auto-deploy — sidebar redesign + หน้า "อาคาร × เดือน" (Phase 14) |
| Google Sheet Grid | ✅ ขยายอัตโนมัติเมื่อเต็ม (`ensureGridCapacity` — commit `26c7fb2`) |
| Cloud Scheduler morning (08:30) | ⏸️ **Paused ตั้งใจ** (user ยืนยัน 31 ก.ค. 2569) |
| Cloud Scheduler check (12:00) | ⏸️ **Paused ตั้งใจ** (user ยืนยัน 31 ก.ค. 2569) |
| Cloud Scheduler daily (17:30) | ✅ Enabled |
| ALLOWED_GROUP_IDS | ✅ 2 กลุ่ม: ศิริราช + Test |
| Security `/notify` | ✅ X-Notify-Key header |
| Building Name Normalize (Dashboard) | ✅ 32 อาคารมาตรฐาน จากทะเบียน 67 อาคาร — `docs/building-registry.md` |
| Building Name Normalize (gemini.js / ต้นทาง) | ✅ Deploy 2 ส.ค. — production verified (W176 = ตึกสยามินทร์) |

> ✅ **หมายเหตุ 31 ก.ค.:** user ยืนยันแล้วว่า pause morning (08:30) + check (12:00) **เป็นการตั้งใจ** ไม่ใช่ bug/ลืมเปิด — ตอนนี้กลุ่ม LINE จะได้รับแจ้งเตือนแค่สรุปรายวันตอนเย็น (17:30) เท่านั้น ถ้าต้องการเปิด morning/check กลับมาในอนาคต ไปที่ Cloud Scheduler console → เลือก job → กด Resume

---

## 🩹 ประวัติปัญหา (Incident Log)

> บันทึกปัญหาที่เจอจริงในระบบ production พร้อมสาเหตุ+วิธีแก้ — เผื่อเกิดซ้ำจะได้เช็ค pattern ได้เร็ว

### 31 ก.ค. 2569 — บอทตอบ "บันทึก Work Order ไม่สำเร็จ (ระบบขัดข้อง)" ทุกครั้ง

- **อาการ:** ทุกข้อความแจ้งงานใหม่ในกลุ่ม LINE ได้รับ `⚠️ บันทึก Work Order ไม่สำเร็จ (ระบบขัดข้อง)` — Gemini วิเคราะห์ได้ปกติ (เห็นข้อมูลครบ) แต่บันทึกไม่ติด
- **วิธีเช็คตอนเจอ:** `gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=30 | grep "บันทึก Sheet ไม่สำเร็จ"`
- **สาเหตุจริง (จาก log):** `Range ('ชีต1'!A188:U188) exceeds grid limits. Max rows: 187` — **Google Sheet มีกริดแค่ 187 แถว เต็มพอดี** (header + 186 งาน) ไม่ใช่ปัญหาสิทธิ์ Service Account (เป็น Editor อยู่แล้ว) — อ่าน Sheet ได้ปกติ (dashboard โชว์ข้อมูลได้) แต่เขียนแถวใหม่ไม่ได้เพราะ grid ไม่มีที่ว่าง
- **แก้ทันที:** เพิ่มแถวใน Google Sheet UI (เพิ่ม 1000 แถว)
- **แก้ถาวร:** commit `26c7fb2` — เพิ่ม `ensureGridCapacity()` ใน `src/sheets.js`: ดัก error "exceeds grid limits" → `appendDimension` ขยายกริด +500 แถวอัตโนมัติ แล้วเขียนใหม่ (ไม่ต้องเพิ่มแถวเองอีกตลอดไป)
- **บทเรียน:** "อ่านได้ เขียนไม่ได้" ไม่ได้แปลว่าสิทธิ์เสมอไป — เช็ค log จริงก่อนสรุป root cause

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
| `docs/building-registry.md` | ทะเบียนอาคารมาตรฐาน 67 อาคาร — ใช้ normalize dashboard + อ้างอิง train บอท |

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
