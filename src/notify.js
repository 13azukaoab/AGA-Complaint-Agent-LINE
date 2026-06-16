// notify.js — endpoint สำหรับ Cloud Scheduler
// GET /notify?type=morning → รายงานงานค้างข้ามวัน (8:30) — ส่งทุกกลุ่มเสมอ
// GET /notify?type=check   → รายงาน WO วันนี้ที่ยังเปิดอยู่ (12:00, 16:00)
// GET /notify?type=daily   → สรุปรายวัน (17:30)

const express = require('express');
const router = express.Router();
const { getOpenWorkOrders, getAllWorkOrders } = require('./sheets');

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function pushMessage(groupId, text) {
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text }],
      }),
    });
  } catch (e) {
    console.error('   ❌ pushMessage error:', e.message);
  }
}

// แปลง timestamp ไทย → Date object (สำหรับคำนวณเวลาผ่านไป)
function parseThaiTimestamp(ts) {
  if (!ts) return null;
  try {
    // format: "13/6/2569 11:47:13" → แปลงปี พ.ศ. เป็น ค.ศ.
    const parts = ts.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/);
    if (!parts) return null;
    const [, day, month, yearBE, hour, min, sec] = parts;
    const yearCE = parseInt(yearBE) - 543;
    return new Date(yearCE, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec));
  } catch (e) {
    return null;
  }
}

// แปลง Date → "DD/MM/YYYY" พ.ศ.
function formatThaiDate(date) {
  if (!date) return '-';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

// วันนี้ในรูปแบบ "DD/MM/YYYY" พ.ศ.
function todayThaiDate() {
  return formatThaiDate(new Date());
}

// เริ่มต้นของวันนี้ (midnight) — ใช้เปรียบเทียบ
function todayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// รายงานงานค้างข้ามวัน (8:30) — ส่งทุกกลุ่มใน ALLOWED_GROUP_IDS เสมอ
// 🔴 ถ้ามีงานค้าง / 🟢 ถ้าไม่มี
async function checkMorningOverdue() {
  const openWOs = await getOpenWorkOrders();
  const midnight = todayMidnight();

  // กรองเฉพาะ WO ที่สร้างก่อนวันนี้ (ค้างข้ามวัน)
  const overdueWOs = openWOs.filter(wo => {
    const d = parseThaiTimestamp(wo.timestamp);
    return d && d < midnight;
  });

  // จัดกลุ่มตาม groupId
  const byGroup = {};
  for (const wo of overdueWOs) {
    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  // กลุ่มที่ต้องส่ง: จาก ALLOWED_GROUP_IDS (ส่งทุกกลุ่มไม่ว่าจะมีงานค้างหรือไม่)
  const allowedGroupIds = process.env.ALLOWED_GROUP_IDS
    ? process.env.ALLOWED_GROUP_IDS.split(',').map(id => id.trim()).filter(Boolean)
    : Object.keys(byGroup); // fallback: ส่งเฉพาะกลุ่มที่มีงานค้าง

  const dateStr = todayThaiDate();
  let sent = 0;

  for (const groupId of allowedGroupIds) {
    const wos = byGroup[groupId] || [];
    let msg;

    if (wos.length > 0) {
      const list = wos.map(w => {
        const d = parseThaiTimestamp(w.timestamp);
        return `• ${w.workOrderId} — ${w.pestType} ${w.location} (แจ้งเมื่อ ${formatThaiDate(d)}) [${w.status}]`;
      }).join('\n');
      const example = `ปิดงาน ${wos[0].workOrderId} [วิธีที่ใช้กำจัด+จำนวนที่ได้]`;
      msg = [
        `วันที่ ${dateStr}`,
        `🔴 งานค้างจากวันก่อน (${wos.length} งาน):`,
        list,
        '',
        'กรุณาปิดงานค้างโดยเร็ว',
        `ตัวอย่าง: ${example}`,
      ].join('\n');
    } else {
      msg = `วันที่ ${dateStr}\n🟢 ไม่มีงานค้างในระบบก่อนหน้า`;
    }

    await pushMessage(groupId, msg);
    sent++;
  }

  console.log(`[notify/morning] ส่ง ${sent} กลุ่ม (ค้างข้ามวัน: ${overdueWOs.length} รายการ)`);
  return { checked: openWOs.length, overdue: overdueWOs.length, sent };
}

// รายงานงานค้างวันนี้ (12:00, 16:00) — ส่งเฉพาะกลุ่มที่มีงานค้าง
async function checkPendingWorkOrders() {
  const openWOs = await getOpenWorkOrders();
  const midnight = todayMidnight();

  // กรองเฉพาะ WO ที่สร้างวันนี้
  const todayWOs = openWOs.filter(wo => {
    const d = parseThaiTimestamp(wo.timestamp);
    return d && d >= midnight;
  });

  // จัดกลุ่มตาม groupId
  const byGroup = {};
  for (const wo of todayWOs) {
    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  if (Object.keys(byGroup).length === 0) {
    console.log('[notify/check] ไม่มีงานค้างวันนี้ — ไม่ส่งแจ้งเตือน');
    return { checked: 0, alertsSent: 0 };
  }

  let sent = 0;
  for (const [groupId, wos] of Object.entries(byGroup)) {
    const list = wos.map(w => `• ${w.workOrderId} — ${w.pestType} ${w.location} [${w.status}]`).join('\n');
    const example = `ปิดงาน ${wos[0].workOrderId} [วิธีที่ใช้กำจัด+จำนวนที่ได้]`;
    const msg = [
      `📋 งานที่ยังค้างอยู่ (${wos.length} งาน):`,
      list,
      '',
      'วิธีปิดงาน: พิมพ์ใน LINE กลุ่มนี้',
      `ตัวอย่าง: ${example}`,
    ].join('\n');
    await pushMessage(groupId, msg);
    sent++;
  }

  console.log(`[notify/check] ส่งแจ้งเตือน ${sent} กลุ่ม`);
  return { checked: todayWOs.length, alertsSent: sent };
}

// สรุปรายวัน 17:30 — แสดงงานวันนี้ทั้งหมด แยก ปิดแล้ว / ยังไม่ปิด
async function sendDailySummary() {
  const allWOs = await getAllWorkOrders();

  const now = new Date();
  const todayDay   = String(now.getDate()).padStart(2, '0');
  const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
  const todayYearBE = now.getFullYear() + 543;

  // กรองเฉพาะงานวันนี้ — timestamp format: "16/6/2569 11:47:13"
  const todayWOs = allWOs.filter(wo => {
    if (!wo.timestamp) return false;
    const m = wo.timestamp.match(/^(\d+)\/(\d+)\/(\d+)/);
    if (!m) return false;
    const [, d, mo, y] = m;
    return parseInt(d) === parseInt(todayDay) &&
           parseInt(mo) === parseInt(todayMonth) &&
           parseInt(y) === todayYearBE;
  });

  if (todayWOs.length === 0) return { groupsNotified: 0 };

  // ดึง groupId จาก openWOs เทียบกับ workOrderId
  const openWOs = await getOpenWorkOrders();
  const woGroupMap = {};
  openWOs.forEach(wo => { woGroupMap[wo.workOrderId] = wo.groupId; });

  // จัดกลุ่มตาม groupId
  const byGroup = {};
  for (const wo of todayWOs) {
    const groupId = woGroupMap[wo.workOrderId];
    if (!groupId) continue;
    if (!byGroup[groupId]) byGroup[groupId] = { closed: [], notClosed: [] };
    if (wo.status === 'ปิด') byGroup[groupId].closed.push(wo);
    else byGroup[groupId].notClosed.push(wo);
  }

  const dateLabel = todayThaiDate();
  let sent = 0;

  for (const [groupId, data] of Object.entries(byGroup)) {
    const total = data.closed.length + data.notClosed.length;
    const lines = [];
    lines.push(`📋 สรุปงานประจำวัน — ${dateLabel}`);
    lines.push('━━━━━━━━━━━━━━━━━━━');
    lines.push(`\nรวมวันนี้ทั้งหมด: ${total} งาน`);

    if (data.closed.length > 0) {
      lines.push(`\n✅ ปิดแล้ว (${data.closed.length} งาน):`);
      data.closed.forEach(w => lines.push(`• ${w.workOrderId} — ${w.pestType} ${w.location}`));
    }

    if (data.notClosed.length > 0) {
      lines.push(`\n⏳ ยังไม่ปิด (${data.notClosed.length} งาน):`);
      data.notClosed.forEach(w => lines.push(`• ${w.workOrderId} — ${w.pestType} ${w.location}`));
    }

    await pushMessage(groupId, lines.join('\n'));
    sent++;
  }

  console.log(`[notify/daily] ส่งสรุปรายวัน ${sent} กลุ่ม`);
  return { groupsNotified: sent };
}

router.get('/', async (req, res) => {
  const type = req.query.type || 'check';

  try {
    if (type === 'morning') {
      const result = await checkMorningOverdue();
      res.json({ ok: true, type: 'morning', ...result });
    } else if (type === 'daily') {
      const result = await sendDailySummary();
      res.json({ ok: true, type: 'daily', ...result });
    } else {
      const result = await checkPendingWorkOrders();
      res.json({ ok: true, type: 'check', ...result });
    }
  } catch (err) {
    console.error('[notify] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
