// notify.js — endpoint สำหรับ Cloud Scheduler
// GET /notify?type=morning → รายงานงานค้างจากวันก่อน (8:30) — ส่งทุกกลุ่มใน ALLOWED_GROUP_IDS
// GET /notify?type=check   → งานเปิดวันนี้เท่านั้น (12:00, 16:00) — ส่งเฉพาะกลุ่มที่มีค้าง
// GET /notify?type=daily   → สรุปรายวัน (17:30)

const express = require('express');
const router = express.Router();
const { getOpenWorkOrders, getAllWorkOrders } = require('./sheets');

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const allowedGroups = process.env.ALLOWED_GROUP_IDS
  ? process.env.ALLOWED_GROUP_IDS.split(',').map(id => id.trim()).filter(id => id.length > 0)
  : [];

async function pushMessage(groupId, text) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
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
    if (!res.ok) {
      const body = await res.text();
      console.error(`   ❌ pushMessage fail (${res.status}) groupId=${groupId}:`, body);
    } else {
      console.log(`   ✅ pushMessage ok → groupId=${groupId}`);
    }
  } catch (e) {
    console.error('   ❌ pushMessage error:', e.message);
  }
}

// แปลง timestamp ไทย (พ.ศ.) → Date object (ค.ศ.)
// รองรับหลายรูปแบบ: "17/6/2569 13:33:00", "17/6/2569, 13:33:00", "17/6/2569 13:33"
function parseThaiTimestamp(ts) {
  if (!ts) return null;
  try {
    const parts = ts.match(/(\d+)\/(\d+)\/(\d+)[,\s]+(\d+):(\d+)(?::(\d+))?/);
    if (!parts) return null;
    const [, day, month, yearBE, hour, min, sec = '0'] = parts;
    const yearCE = parseInt(yearBE) - 543;
    return new Date(yearCE, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec));
  } catch (e) {
    return null;
  }
}

// format วันที่เป็น DD/MM/YYYY พ.ศ.
function formatThaiDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

function todayThaiDate() {
  return formatThaiDate(new Date());
}

// ตรวจว่า timestamp เป็นก่อนวันนี้หรือไม่
function isBeforeToday(timestamp) {
  const d = parseThaiTimestamp(timestamp);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ตรวจว่า timestamp เป็นวันนี้หรือไม่
function isToday(timestamp) {
  const d = parseThaiTimestamp(timestamp);
  if (!d) return false;
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
}

// 8:30 — รายงานงานค้างจากวันก่อน ส่งทุกกลุ่มใน ALLOWED_GROUP_IDS เสมอ
async function checkMorningOverdue() {
  const openWOs = await getOpenWorkOrders();

  // จัดกลุ่มงานค้างข้ามวัน (สร้างก่อนวันนี้)
  const byGroup = {};

  // เตรียม entry สำหรับทุก group ที่ configured (สำหรับส่ง 🟢 ถ้าไม่มีค้าง)
  for (const gid of allowedGroups) {
    byGroup[gid] = [];
  }

  // เพิ่ม group จาก WO ที่ค้างข้ามวัน (อาจไม่อยู่ใน allowedGroups)
  for (const wo of openWOs) {
    if (!isBeforeToday(wo.timestamp)) continue;
    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  const dateLabel = todayThaiDate();
  let sent = 0;

  for (const [groupId, wos] of Object.entries(byGroup)) {
    let msg;
    if (wos.length === 0) {
      msg = `วันที่ ${dateLabel}\n🟢 ไม่มีงานค้างในระบบก่อนหน้า`;
    } else {
      const lines = [
        `วันที่ ${dateLabel}`,
        `🔴 งานค้างจากวันก่อน (${wos.length} งาน):`,
        '━━━━━━━━━━━━━━',
      ];
      for (const w of wos) {
        const floor = w.floor && w.floor !== 'ไม่ระบุ' ? ` ${w.floor}` : '';
        const dateStr = w.timestamp ? w.timestamp.split(' ')[0] : '?';
        const contact = [w.contactName, w.contactPhone]
          .filter(v => v && v !== 'ไม่ระบุ').join(' ');
        lines.push('');
        lines.push(`🟡 ${w.workOrderId} — ${w.pestType}`);
        lines.push(`📍 ${w.location}${floor}`);
        lines.push(`🕐 แจ้งเมื่อ ${dateStr}`);
        if (contact) lines.push(`📞 ${contact}`);
      }
      lines.push('');
      lines.push('━━━━━━━━━━━━━━');
      lines.push('กรุณาปิดงานค้างโดยเร็ว');
      lines.push(`ตัวอย่าง: ปิดงาน ${wos[0].workOrderId} [วิธีที่ใช้กำจัด+จำนวนที่ได้]`);
      msg = lines.join('\n');
    }
    await pushMessage(groupId, msg);
    sent++;
  }

  console.log(`[notify/morning] ส่ง ${sent} กลุ่ม`);
  return { sent };
}

// 12:00 / 16:00 — งานเปิดวันนี้เท่านั้น ส่งเฉพาะกลุ่มที่มีค้าง
async function checkPendingWorkOrders() {
  const openWOs = await getOpenWorkOrders();

  // เฉพาะงานที่สร้างวันนี้และยังไม่ปิด
  const todayOpen = openWOs.filter(wo => isToday(wo.timestamp));

  const byGroup = {};
  for (const wo of todayOpen) {
    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = [];
    byGroup[wo.groupId].push(wo);
  }

  if (Object.keys(byGroup).length === 0) {
    console.log('[notify/check] ไม่มีงานค้างวันนี้ — ไม่ส่ง');
    return { checked: 0, alertsSent: 0 };
  }

  let sent = 0;
  for (const [groupId, wos] of Object.entries(byGroup)) {
    const lines = [
      `📋 งานที่ยังค้างอยู่ (${wos.length} งาน):`,
      '━━━━━━━━━━━━━━',
    ];
    for (const w of wos) {
      const floor = w.floor && w.floor !== 'ไม่ระบุ' ? ` ${w.floor}` : '';
      const contact = [w.contactName, w.contactPhone]
        .filter(v => v && v !== 'ไม่ระบุ').join(' ');
      lines.push('');
      lines.push(`🟡 ${w.workOrderId} — ${w.pestType}`);
      lines.push(`📍 ${w.location}${floor}`);
      lines.push(`🕐 ${w.timestamp ? w.timestamp.replace(/.*?(\d+:\d+).*/, '$1') + ' น.' : '?'}`);
      if (contact) lines.push(`📞 ${contact}`);
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━');
    lines.push(`💬 ปิดงาน: พิมพ์ "ปิดงาน ${wos[0].workOrderId} [วิธี+จำนวน]"`);
    await pushMessage(groupId, lines.join('\n'));
    sent++;
  }

  console.log(`[notify/check] ส่งแจ้งเตือน ${sent} กลุ่ม`);
  return { checked: todayOpen.length, alertsSent: sent };
}

// 17:30 — สรุปรายวัน: งานวันนี้ทั้งหมด แยก ปิดแล้ว/ยังไม่ปิด
async function sendDailySummary() {
  const allWOs = await getAllWorkOrders(); // มี groupId แล้ว (หลังแก้ sheets.js)
  const todayWOs = allWOs.filter(wo => isToday(wo.timestamp));

  // เตรียม entry สำหรับทุกกลุ่มใน ALLOWED_GROUP_IDS เสมอ — ส่งสรุปทุกวัน
  // (วันไหนไม่มีงาน → แจ้ง "วันนี้ไม่มีงาน" ให้กลุ่มรับรู้ว่าระบบทำงานปกติ)
  const byGroup = {};
  for (const gid of allowedGroups) {
    byGroup[gid] = { closed: [], notClosed: [] };
  }

  // ใส่งานวันนี้ลงแต่ละกลุ่ม (เพิ่มกลุ่มนอก allowedGroups ถ้ามีงานวันนี้)
  for (const wo of todayWOs) {
    if (!wo.groupId) continue;
    if (!byGroup[wo.groupId]) byGroup[wo.groupId] = { closed: [], notClosed: [] };
    if (wo.status === 'ปิด') byGroup[wo.groupId].closed.push(wo);
    else byGroup[wo.groupId].notClosed.push(wo);
  }

  const dateLabel = todayThaiDate();
  let sent = 0;

  for (const [groupId, data] of Object.entries(byGroup)) {
    const total = data.closed.length + data.notClosed.length;

    // วันที่ไม่มีงานเลย → ส่งข้อความสั้นแจ้งสถานะ
    if (total === 0) {
      await pushMessage(groupId, `📋 สรุปงานประจำวัน — ${dateLabel}\n━━━━━━━━━━━━━━━━━━━\n\n🟢 วันนี้ไม่มีงานแจ้งเข้ามา`);
      sent++;
      continue;
    }

    const lines = [];
    lines.push(`📋 สรุปงานประจำวัน — ${dateLabel}`);
    lines.push('━━━━━━━━━━━━━━━━━━━');
    lines.push(`\nรวมวันนี้ทั้งหมด: ${total} งาน`);

    if (data.closed.length > 0) {
      lines.push(`\n✅ ปิดแล้ว (${data.closed.length} งาน):`);
      data.closed.forEach(w => {
        const floor = w.floor && w.floor !== 'ไม่ระบุ' ? ` ${w.floor}` : '';
        lines.push(`\n• ${w.workOrderId} — ${w.pestType} ${w.location}${floor}`);
        const closeTime = w.closeTime ? w.closeTime.replace(/.*?(\d+:\d+).*/, '$1') : null;
        const closer = w.closer || null;
        if (closeTime || closer) {
          lines.push(`  🕐 ปิด ${closeTime ? closeTime + ' น.' : ''}${closer ? ` โดย ${closer}` : ''}`);
        }
        if (w.closeMethod && w.closeMethod !== 'ไม่ระบุ') {
          const method = w.closeMethod.replace(/\[รูป:.*?\]/g, '').trim();
          const catchStr = w.catchCount ? ` | จับได้ ${w.catchCount} ตัว` : '';
          if (method) lines.push(`  🔧 ${method}${catchStr}`);
          else if (w.catchCount) lines.push(`  🔧 จับได้ ${w.catchCount} ตัว`);
        } else if (w.catchCount) {
          lines.push(`  🔧 จับได้ ${w.catchCount} ตัว`);
        }
      });
    }

    if (data.notClosed.length > 0) {
      lines.push(`\n⏳ ยังไม่ปิด (${data.notClosed.length} งาน):`);
      data.notClosed.forEach(w => {
        const floor = w.floor && w.floor !== 'ไม่ระบุ' ? ` ${w.floor}` : '';
        lines.push(`• ${w.workOrderId} — ${w.pestType} ${w.location}${floor}`);
      });
    }

    await pushMessage(groupId, lines.join('\n'));
    sent++;
  }

  console.log(`[notify/daily] ส่งสรุปรายวัน ${sent} กลุ่ม`);
  return { groupsNotified: sent };
}

// handler เดียว ใช้ได้ทั้ง GET และ POST (Cloud Scheduler บาง job ตั้งเป็น POST)
async function handleNotify(req, res) {
  // ป้องกัน bot ภายนอก: ต้องมี header X-Notify-Key ตรงกับ env NOTIFY_KEY
  // (ถ้าไม่ตั้ง NOTIFY_KEY ไว้ = ข้ามการตรวจ เพื่อ backward-compat ตอน dev)
  const requiredKey = process.env.NOTIFY_KEY;
  if (requiredKey && req.get('X-Notify-Key') !== requiredKey) {
    console.warn(`[notify] ปฏิเสธ request ไม่มี key ที่ถูกต้อง — IP: ${req.ip}`);
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

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
}

router.get('/', handleNotify);
router.post('/', handleNotify);

module.exports = router;
