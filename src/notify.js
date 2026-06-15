// notify.js — endpoint สำหรับ Cloud Scheduler
// GET /notify?type=check  → ตรวจ WO ค้างนาน >30 นาที
// GET /notify?type=daily  → สรุปรายวัน 17:00

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

// ตรวจงานค้าง >30 นาที ยังไม่มีคนรับทราบ
async function checkPendingWorkOrders() {
  const openWOs = await getOpenWorkOrders();
  const now = Date.now();
  const thirtyMin = 30 * 60 * 1000;

  // จัดกลุ่มตาม groupId — รวมทั้ง เปิด และ รับทราบ (ยังไม่ปิด)
  const byGroup = {};
  for (const wo of openWOs) {
    const createdAt = parseThaiTimestamp(wo.timestamp);
    if (!createdAt) continue;
    const elapsed = now - createdAt.getTime();
    if (elapsed < thirtyMin) continue; // ยังไม่ถึง 30 นาที

    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  let sent = 0;
  for (const [groupId, wos] of Object.entries(byGroup)) {
    const list = wos.map(w => `• ${w.workOrderId} — ${w.pestType} ${w.location}`).join('\n');
    const msg = `⚠️ งานค้างเกิน 30 นาที (${wos.length} งาน):\n${list}\n\nพิมพ์ "ปิดงาน WXXX [วิธี]" เมื่อทำเสร็จ`;
    await pushMessage(groupId, msg);
    sent++;
  }

  console.log(`[notify/check] ส่งแจ้งเตือน ${sent} กลุ่ม`);
  return { checked: openWOs.length, alertsSent: sent };
}

// สรุปรายวัน — แสดงงานวันนี้ทั้งหมด แยก ปิดแล้ว / ยังไม่ปิด
async function sendDailySummary() {
  const allWOs = await getAllWorkOrders();

  // วันนี้ในรูปแบบ "15/06/2026" (ค.ศ.) สำหรับเทียบ timestamp
  const now = new Date();
  const todayDay   = String(now.getDate()).padStart(2, '0');
  const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
  const todayYearCE = now.getFullYear();
  const todayYearBE = todayYearCE + 543; // timestamp ใน Sheet เป็น พ.ศ.

  // กรองเฉพาะงานวันนี้ — timestamp format: "15/6/2569 11:47:13"
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

  // จัดกลุ่มตาม groupId (ดึง groupId จาก getAllWorkOrders ไม่มี → ต้องใช้ getOpenWorkOrders เพิ่ม)
  // ใช้ groupId จาก openWOs map เทียบกับ workOrderId
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

  // วันที่สำหรับแสดงใน header (ค.ศ.)
  const dateLabel = `${todayDay}/${todayMonth}/${todayYearCE}`;

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
    if (type === 'daily') {
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
