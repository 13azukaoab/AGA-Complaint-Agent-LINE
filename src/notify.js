// notify.js — endpoint สำหรับ Cloud Scheduler
// GET /notify?type=check  → ตรวจ WO ค้างนาน >30 นาที
// GET /notify?type=daily  → สรุปรายวัน 17:00

const express = require('express');
const router = express.Router();
const { getOpenWorkOrders, getTodaySummary } = require('./sheets');

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

  // จัดกลุ่มตาม groupId
  const byGroup = {};
  for (const wo of openWOs) {
    if (wo.status !== 'เปิด') continue; // เฉพาะที่ยังไม่มีคนรับทราบ
    const createdAt = parseThaiTimestamp(wo.timestamp);
    if (!createdAt) continue;
    const elapsed = now - createdAt.getTime();
    if (elapsed < thirtyMin) continue; // ยังไม่ถึง 30 นาที

    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  let sent = 0;
  for (const [groupId, wos] of Object.entries(byGroup)) {
    const list = wos.map(w => `• ${w.workOrderId} ${w.pestType} ${w.location}`).join('\n');
    const msg = `⚠️ งานที่ยังไม่มีคนรับทราบ (>30 นาที):\n${list}\n\nพิมพ์ "รับทราบ WXXX" เพื่อรับงาน`;
    await pushMessage(groupId, msg);
    sent++;
  }

  console.log(`[notify/check] ส่งแจ้งเตือน ${sent} กลุ่ม`);
  return { checked: openWOs.length, alertsSent: sent };
}

// สรุปรายวัน
async function sendDailySummary() {
  const openWOs = await getOpenWorkOrders();

  // จัดกลุ่มตาม groupId
  const byGroup = {};
  for (const wo of openWOs) {
    if (!byGroup[wo.groupId]) {
      byGroup[wo.groupId] = { groupName: wo.groupName, open: [], acknowledged: [] };
    }
    if (wo.status === 'เปิด') byGroup[wo.groupId].open.push(wo);
    else if (wo.status === 'รับทราบ') byGroup[wo.groupId].acknowledged.push(wo);
  }

  let sent = 0;
  for (const [groupId, data] of Object.entries(byGroup)) {
    if (data.open.length === 0 && data.acknowledged.length === 0) continue;

    const lines = [];
    lines.push(`📋 สรุปงานคงค้าง — ${new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}`);

    if (data.open.length > 0) {
      lines.push(`\n🔴 ยังไม่มีคนรับ (${data.open.length} งาน):`);
      data.open.forEach(w => lines.push(`  • ${w.workOrderId} ${w.pestType} ${w.location}`));
    }

    if (data.acknowledged.length > 0) {
      lines.push(`\n🟡 รับทราบแล้ว รอปิด (${data.acknowledged.length} งาน):`);
      data.acknowledged.forEach(w => lines.push(`  • ${w.workOrderId} ${w.pestType} ${w.location} (${w.acknowledger})`));
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
