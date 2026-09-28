// summary.js — คำนวณสถิติสรุปงาน (weekly/monthly) จาก Work Orders ใน Sheet
// ใช้โดย index.js (#สรุปสัปดาห์/#สรุปเดือน) + notify.js (scheduled push)
//
// กฎสำคัญ:
//   - ตัด "งานแจ้งซ้ำ" (isFollowup) ออกทุก metric
//   - นับตามกลุ่ม (groupId) + ช่วงเวลา
//   - จัดหมวดสัตว์ 6 กลุ่ม: หนู/ปลวก/แมลงสาบ/ยุง/มด/อื่นๆ
//   - อาคาร = นับตาม location (gemini normalize มาแล้วตอนแจ้ง)
//   - "หนูที่จับได้" = ผลรวม catchCount เฉพาะงานหมวดหนู

const PEST_ORDER = ['หนู', 'ปลวก', 'แมลงสาบ', 'ยุง', 'มด', 'อื่นๆ'];
const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// จัดหมวดชนิดสัตว์จาก pest_type (free text) → 1 ใน 6 หมวด
function categorizePest(pestType) {
  const p = (pestType || '').toString();
  if (/หนู/.test(p)) return 'หนู';
  if (/ปลวก/.test(p)) return 'ปลวก';
  if (/สาบ/.test(p)) return 'แมลงสาบ';
  if (/ยุง/.test(p)) return 'ยุง';
  if (/มด/.test(p)) return 'มด';
  return 'อื่นๆ';
}

// แปลง timestamp ไทย (พ.ศ.) → Date (ค.ศ.)
function parseThaiTimestamp(ts) {
  if (!ts) return null;
  const m = ts.toString().match(/(\d+)\/(\d+)\/(\d+)[,\s]+(\d+):(\d+)(?::(\d+))?/);
  if (!m) return null;
  const [, d, mo, yBE, h, mi, s = '0'] = m;
  return new Date(parseInt(yBE) - 543, parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi), parseInt(s));
}

// ── ช่วงเวลา ─────────────────────────────────────────────────────
function startOfDay(dt) { const d = new Date(dt); d.setHours(0, 0, 0, 0); return d; }
function mondayOf(dt) {
  const d = startOfDay(dt);
  const day = (d.getDay() + 6) % 7; // จันทร์=0 ... อาทิตย์=6
  d.setDate(d.getDate() - day);
  return d;
}
// สัปดาห์นี้ (จันทร์→ตอนนี้) สำหรับ on-demand
function thisWeekRange(now = new Date()) {
  return { from: mondayOf(now), to: now };
}
// สัปดาห์ที่แล้ว (จันทร์→อาทิตย์) สำหรับ scheduled จันทร์เช้า
function lastWeekRange(now = new Date()) {
  const from = mondayOf(now); from.setDate(from.getDate() - 7);
  const to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
  return { from, to };
}
// เดือนนี้ (วันที่1→ตอนนี้) สำหรับ on-demand
function thisMonthRange(now = new Date()) {
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}
// เดือนที่แล้ว สำหรับ scheduled วันที่1
function lastMonthRange(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // วันสุดท้ายเดือนก่อน
  return { from, to };
}

// label ช่วงวัน เช่น "22–28 กันยายน 2569" หรือ "29 ก.ย. – 5 ต.ค. 2569"
function formatRangeLabel(from, to) {
  const yBE = to.getFullYear() + 543;
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${TH_MONTH[to.getMonth()]} ${yBE}`;
  }
  return `${from.getDate()} ${TH_MONTH_ABBR[from.getMonth()]} – ${to.getDate()} ${TH_MONTH_ABBR[to.getMonth()]} ${yBE}`;
}
function formatMonthLabel(dt) {
  return `${TH_MONTH[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

// ── คำนวณสถิติหลัก ───────────────────────────────────────────────
// คืน { total, closed, open, closeRate, pests[], buildings[], ratCatch, openWOs[] }
function computeStats(workOrders, groupId, from, to) {
  const inRange = workOrders.filter((w) => {
    if (w.groupId !== groupId) return false;
    if (w.isFollowup) return false; // ตัดงานแจ้งซ้ำ
    const t = parseThaiTimestamp(w.timestamp);
    return t && t >= from && t <= to;
  });

  const total = inRange.length;
  const closed = inRange.filter((w) => w.status === 'ปิด').length;
  const open = total - closed;
  const closeRate = total ? Math.round((closed / total) * 100) : 0;

  // ชนิดสัตว์ตามหมวด (เรียงตาม PEST_ORDER)
  const pestCount = {};
  PEST_ORDER.forEach((k) => { pestCount[k] = 0; });
  let ratCatch = 0;
  const bldgCount = {};
  for (const w of inRange) {
    const cat = categorizePest(w.pestType);
    pestCount[cat]++;
    if (cat === 'หนู' && w.catchCount) ratCatch += Number(w.catchCount) || 0;
    const loc = (w.location || 'ไม่ระบุ').toString().trim() || 'ไม่ระบุ';
    bldgCount[loc] = (bldgCount[loc] || 0) + 1;
  }
  const pests = PEST_ORDER.map((name) => ({ name, count: pestCount[name] }));
  const buildings = Object.entries(bldgCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const openWOs = inRange.filter((w) => w.status !== 'ปิด').map((w) => w.workOrderId).filter(Boolean);

  return { total, closed, open, closeRate, pests, buildings, ratCatch, openWOs };
}

// สร้างบรรทัดงานค้างสำหรับ footer (จำกัดความยาว)
function openWOsLine(openWOs) {
  if (!openWOs.length) return 'ดำเนินการครบทุกรายการแล้ว ✅';
  const shown = openWOs.slice(0, 8).join(' · ');
  const more = openWOs.length > 8 ? ` +${openWOs.length - 8}` : '';
  return `${shown}${more} — พิมพ์ "งานค้าง" ดู`;
}

// ── ข้อมูลพร้อมใช้สำหรับ buildWeeklyFlex ─────────────────────────
// scheduled=true → สัปดาห์ที่แล้ว (จ-อา) · false → สัปดาห์นี้ (จ-ตอนนี้)
function weeklySummaryData(workOrders, groupId, { scheduled = false, now = new Date() } = {}) {
  const { from, to } = scheduled ? lastWeekRange(now) : thisWeekRange(now);
  const s = computeStats(workOrders, groupId, from, to);
  return { rangeLabel: formatRangeLabel(from, to), ...s, openWOsLine: openWOsLine(s.openWOs) };
}

// ── ข้อมูลพร้อมใช้สำหรับ buildMonthlyFlex (มีเทียบเดือนก่อน) ─────
function monthlySummaryData(workOrders, groupId, { scheduled = false, now = new Date() } = {}) {
  const { from, to } = scheduled ? lastMonthRange(now) : thisMonthRange(now);
  const s = computeStats(workOrders, groupId, from, to);
  // เดือนก่อนหน้าของ from (เพื่อเทียบ)
  const prevFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  const prevTo = new Date(from.getFullYear(), from.getMonth(), 0, 23, 59, 59, 999);
  const prev = computeStats(workOrders, groupId, prevFrom, prevTo);

  // เทียบงานเข้า
  let cmpStr = `${prev.total}→${s.total}`;
  if (prev.total > 0) {
    const pct = Math.round(((s.total - prev.total) / prev.total) * 100);
    cmpStr += ` ${pct >= 0 ? '▲' : '▼'}${Math.abs(pct)}%`;
  } else if (s.total > 0) {
    cmpStr += ' ▲ใหม่';
  }
  // เทียบอัตราปิด (percentage point)
  const rateDelta = s.closeRate - prev.closeRate;
  const closeRateDeltaStr = prev.total > 0 ? `${rateDelta >= 0 ? '▲' : '▼'}${Math.abs(rateDelta)}%` : '';

  return { monthLabel: formatMonthLabel(from), ...s, cmpStr, closeRateDeltaStr, openWOsLine: openWOsLine(s.openWOs) };
}

module.exports = {
  categorizePest, parseThaiTimestamp, computeStats,
  weeklySummaryData, monthlySummaryData,
  thisWeekRange, lastWeekRange, thisMonthRange, lastMonthRange,
  formatRangeLabel, formatMonthLabel,
};
