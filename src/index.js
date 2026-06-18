require('dotenv').config({ path: require('path').resolve(__dirname, '../Secret Key.env') });
const express = require('express');
const { middleware } = require('@line/bot-sdk');
const { analyzeComplaint } = require('./gemini');
const {
  appendComplaint,
  getNextWorkOrderId,
  findRowByWorkOrderId,
  getRowData,
  updateWorkOrderStatus,
  getOpenWorkOrders,
  getAllWorkOrders,
} = require('./sheets');

const app = express();
const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// เก็บรูปภาพล่าสุดในแต่ละกลุ่ม (ใช้ตอนปิดงาน) TTL 5 นาที
const pendingPhotos = new Map();

async function getGroupName(groupId) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    if (!res.ok) return 'ไม่ระบุ';
    const data = await res.json();
    return data.groupName || 'ไม่ระบุ';
  } catch (e) {
    return 'ไม่ระบุ';
  }
}

async function getMemberName(groupId, userId) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    if (!res.ok) return 'ไม่ระบุ';
    const data = await res.json();
    return data.displayName || 'ไม่ระบุ';
  } catch (e) {
    return 'ไม่ระบุ';
  }
}

// Push ข้อความเข้ากลุ่ม LINE (กินโควต้า — ใช้เฉพาะ scheduler หรือกรณีตอบช้าเกิน 30 วิ)
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
      console.error(`   ❌ pushMessage fail (${res.status}):`, body);
    }
  } catch (e) {
    console.error('   ❌ pushMessage error:', e.message);
  }
}

// Reply ข้อความด้วย replyToken (ฟรี ไม่กินโควต้า — ใช้ตอบ event ที่คนพิมพ์เข้ามา ภายใน 30 วิ)
// return true ถ้าสำเร็จ, false ถ้า fail (เพื่อให้ caller fallback ไป pushMessage)
async function replyMessage(replyToken, text) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`   ❌ replyMessage fail (${res.status}):`, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error('   ❌ replyMessage error:', e.message);
    return false;
  }
}

// ส่งข้อความ: ลอง reply ก่อน (ฟรี), ถ้า fail → fallback push (กิน quota แต่ไม่มี timeout 30 วิ)
async function safeReply(replyToken, groupId, text) {
  const ok = await replyMessage(replyToken, text);
  if (!ok) {
    console.log('   🔄 reply fail → fallback pushMessage');
    await pushMessage(groupId, text);
  }
}

// แปลง timestamp ไทย (พ.ศ.) → format สั้น เช่น "17/06/69 13:33"
function formatShortTimestamp(ts) {
  if (!ts) return '?';
  try {
    const parts = ts.match(/(\d+)\/(\d+)\/(\d+)[,\s]+(\d+):(\d+)/);
    if (!parts) return ts;
    const [, day, month, yearBE, hour, min] = parts;
    return `${day.padStart(2,'0')}/${month.padStart(2,'0')}/${String(yearBE).slice(-2)} ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
  } catch (e) {
    return ts;
  }
}

// ดาวน์โหลดรูปจาก LINE แล้วอัปโหลดขึ้น Google Cloud Storage
async function uploadPhotoToGCS(messageId, woId) {
  try {
    const { Storage } = require('@google-cloud/storage');
    const storageOptions = {};
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const path = require('path');
      storageOptions.keyFilename = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');
    }
    const storage = new Storage(storageOptions);
    const bucket = storage.bucket('aga-complaint-photos');

    // ดาวน์โหลดรูปจาก LINE
    const lineRes = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    if (!lineRes.ok) return null;

    const buffer = Buffer.from(await lineRes.arrayBuffer());

    // อัปโหลดขึ้น GCS
    const filename = `${woId}_${Date.now()}.jpg`;
    const file = bucket.file(filename);
    await file.save(buffer, { contentType: 'image/jpeg' });

    return `https://storage.googleapis.com/aga-complaint-photos/${filename}`;
  } catch (e) {
    console.error('   ❌ uploadPhotoToGCS error:', e.message);
    return null;
  }
}

// จัดการ "ปิดงาน WXXX [วิธีปิด]"
async function handleClose(groupId, senderName, woId, closeMethod, timestamp, pendingPhotoMessageId, replyToken) {
  const rowNumber = await findRowByWorkOrderId(woId);
  if (!rowNumber) {
    await safeReply(replyToken, groupId, `ไม่พบ ${woId} — ตรวจสอบหมายเลขอีกครั้ง`);
    return;
  }

  const rowData = await getRowData(rowNumber);
  const currentStatus = rowData[14] || 'เปิด';

  if (currentStatus === 'ปิด') {
    await safeReply(replyToken, groupId, `${woId} ปิดแล้วก่อนหน้านี้`);
    return;
  }

  // อัปโหลดรูปขึ้น GCS ทุกรูปที่รอไว้
  let finalMethod = closeMethod || 'ไม่ระบุ';
  if (pendingPhotoMessageId && pendingPhotoMessageId.length > 0) {
    const urls = [];
    for (let i = 0; i < pendingPhotoMessageId.length; i++) {
      const gcsUrl = await uploadPhotoToGCS(pendingPhotoMessageId[i], `${woId}_${i + 1}`);
      if (gcsUrl) urls.push(gcsUrl);
    }
    if (urls.length > 0) {
      finalMethod = (closeMethod || '') + ' ' + urls.map(u => `[รูป: ${u}]`).join(' ');
    }
  }

  // ดึงจำนวนที่ติดจากข้อความ เช่น "หนูติดแผ่นกาว 2ตัว" → 2
  const catchMatch = finalMethod.match(/(\d+)\s*ตัว/);
  const catchCount = catchMatch ? parseInt(catchMatch[1]) : null;

  await updateWorkOrderStatus(rowNumber, {
    status: 'ปิด',
    acknowledger: rowData[15] || '',
    ackTime: rowData[16] || '',
    closer: senderName,
    closeTime: timestamp,
    closeMethod: finalMethod,
    catchCount,
  });

  await safeReply(replyToken, groupId, `${woId} ปิดแล้ว โดย ${senderName} ✅`);
  console.log(`   ✅ ${woId} ปิดงาน โดย ${senderName}${catchCount !== null ? ` (จับได้ ${catchCount} ตัว)` : ''}`);
}

// หมายเหตุ: bot ตอบ/สร้าง WO ให้ทุกกลุ่มที่ถูกเพิ่มเข้าไป
// ALLOWED_GROUP_IDS ใช้เฉพาะใน notify.js (เลือกกลุ่มที่รับ morning alert)

app.post('/webhook', middleware(lineConfig), async (req, res) => {
  res.status(200).send('OK');

  const events = req.body.events;

  for (const event of events) {
    if (event.source.type !== 'group') continue;

    const groupId = event.source.groupId;

    const timestamp = new Date(event.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // เก็บรูปภาพไว้รอปิดงาน (รองรับหลายรูป, TTL 5 นาที)
    if (event.type === 'message' && event.message.type === 'image') {
      const existing = pendingPhotos.get(groupId);
      const now = Date.now();
      // ถ้ายังอยู่ในช่วง TTL เดิม → เพิ่มเข้า array, ถ้าหมด TTL → เริ่มใหม่
      if (existing && (now - existing.time) < 5 * 60 * 1000) {
        existing.messageIds.push(event.message.id);
      } else {
        pendingPhotos.set(groupId, {
          messageIds: [event.message.id],
          time: now,
        });
      }
      console.log('🖼️  เก็บรูปภาพรอปิดงาน:', groupId, '(', pendingPhotos.get(groupId).messageIds.length, 'รูป)');
      continue;
    }

    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text.trim();
    const senderName = event.source.userId
      ? await getMemberName(groupId, event.source.userId)
      : 'ไม่ระบุ';

    // ตรวจ command: "ขอลิงค์ dashboard" / "ดู dashboard" / คำใกล้เคียง
    if (/dashboard|แดชบอร์ด|ขอลิงค์|ลิงค์ดู/i.test(text)) {
      console.log(`\n📊 ขอลิงค์ dashboard โดย ${senderName}`);
      await replyMessage(event.replyToken,
        '📊 Dashboard AGA Complaint Agent\nhttps://aga-complaint-agent-line.netlify.app/dashboard.html'
      );
      continue;
    }

    // ตรวจ command: "งานค้าง" — แสดงงานที่ยังไม่ปิดในกลุ่มนี้ (ใช้ replyToken ฟรี)
    if (/^งานค้าง/i.test(text)) {
      console.log(`\n📂 ขอดูงานค้าง โดย ${senderName}`);
      const openWOs = await getOpenWorkOrders();
      const groupWOs = openWOs.filter(w => w.groupId === groupId);
      if (groupWOs.length === 0) {
        await replyMessage(event.replyToken, 'ไม่มีงานค้าง ✅');
      } else {
        const lines = [`📋 งานค้าง ${groupWOs.length} รายการ`, '━━━━━━━━━━━━━━'];
        for (const wo of groupWOs) {
          const floor = wo.floor && wo.floor !== 'ไม่ระบุ' ? ` ${wo.floor}` : '';
          const contact = [wo.contactName, wo.contactPhone]
            .filter(v => v && v !== 'ไม่ระบุ').join(' ');
          lines.push('');
          lines.push(`🟡 ${wo.workOrderId} — ${wo.pestType}`);
          lines.push(`📍 ${wo.location}${floor}`);
          lines.push(`🕐 ${formatShortTimestamp(wo.timestamp)} น.`);
          if (contact) lines.push(`📞 ${contact}`);
        }
        lines.push('');
        lines.push('━━━━━━━━━━━━━━');
        lines.push(`💬 ปิดงาน: พิมพ์ "ปิดงาน ${groupWOs[0].workOrderId} [วิธี+จำนวน]"`);
        await replyMessage(event.replyToken, lines.join('\n'));
      }
      continue;
    }

    // ตรวจ command: "ปิดงาน WXXX [วิธีปิด]" หรือ "WXXX ปิดงาน [วิธีปิด]"
    const closeMatch = text.match(/^ปิดงาน\s*(W\d+)\s*(.*)?$/i)
      || text.match(/^(W\d+)\s+ปิดงาน\s*(.*)?$/i);
    if (closeMatch) {
      const woId = closeMatch[1].toUpperCase();
      const closeMethod = (closeMatch[2] || '').trim();
      console.log(`\n🔒 ปิดงาน: ${woId} โดย ${senderName} — วิธี: ${closeMethod || 'ไม่ระบุ'}`);

      // เช็ครูปที่รอไว้ (ไม่เกิน 5 นาที) — รองรับหลายรูป
      const pending = pendingPhotos.get(groupId);
      let photoMessageIds = null;
      if (pending && (Date.now() - pending.time) < 5 * 60 * 1000) {
        photoMessageIds = pending.messageIds;
        pendingPhotos.delete(groupId);
      }

      await handleClose(groupId, senderName, woId, closeMethod, timestamp, photoMessageIds, event.replyToken);
      continue;
    }

    // ถ้าไม่ใช่ command → วิเคราะห์ complaint ปกติ
    console.log(`\n📨 ข้อความ: "${text}"`);

    const groupName = await getGroupName(groupId);
    const results = await analyzeComplaint(text);

    if (!results) {
      console.log('   ⚠️  Gemini วิเคราะห์ไม่ได้');
      continue;
    }

    const complaints = results.filter(r => r.is_complaint);
    if (complaints.length === 0) {
      console.log('   ➡️  ไม่ใช่การแจ้งปัญหา — ข้าม');
      continue;
    }

    const woMessages = [];
    for (const result of complaints) {
      const workOrderId = await getNextWorkOrderId();
      console.log(`   ✅ พบการแจ้งปัญหา! [${workOrderId}]`);

      const floor = result.floor && result.floor !== 'ไม่ระบุ' ? ` ${result.floor}` : '';
      const contact = [result.contact_name, result.contact_phone]
        .filter(v => v && v !== 'ไม่ระบุ').join(' ');

      const saved = await appendComplaint({
        timestamp,
        groupId,
        senderId: event.source.userId || 'ไม่ระบุ',
        groupName,
        senderName,
        pestType: result.pest_type,
        location: result.location,
        floor: result.floor || 'ไม่ระบุ',
        severity: result.severity,
        contactName: result.contact_name || 'ไม่ระบุ',
        contactPhone: result.contact_phone || 'ไม่ระบุ',
        rawMessage: text,
        summary: result.summary,
        workOrderId,
      });

      // บันทึก Sheet ไม่สำเร็จ → แจ้งเตือนแทนข้อความ "เปิดแล้ว" (กัน user เข้าใจผิด)
      if (!saved) {
        console.error(`   ❌ บันทึก ${workOrderId} ไม่สำเร็จ — ไม่ตอบว่าเปิดงาน`);
        woMessages.push(`⚠️ บันทึก Work Order ไม่สำเร็จ (ระบบขัดข้อง)\nกรุณาแจ้งปัญหาซ้ำอีกครั้ง`);
        continue;
      }

      const lines = [
        '📋 แจ้งเตือน Work Order เปิดแล้ว',
        '━━━━━━━━━━━━',
        `หมายเลข: ${workOrderId}`,
        `สัตว์: ${result.pest_type}`,
        `พื้นที่: ${result.location}${floor}`,
        `ผู้แจ้ง: ${senderName}`,
      ];
      if (contact) lines.push(`ติดต่อ: ${contact}`);
      lines.push('', 'กรุณาดำเนินการและปิดงาน:');
      lines.push(`ตัวอย่าง: ปิดงาน ${workOrderId} [วิธีที่ใช้กำจัด+จำนวนที่ได้]`);

      woMessages.push(lines.join('\n'));
    }

    // Reply WO แรกด้วย replyToken (ฟรี), WO ถัดไป (ถ้ามี) ใช้ push
    await safeReply(event.replyToken, groupId, woMessages[0]);
    for (let i = 1; i < woMessages.length; i++) {
      await pushMessage(groupId, woMessages[i]);
    }

    console.log('---');
  }
});

app.get('/webhook', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('AGA Complaint Agent is running ✅'));

// API สำหรับ Dashboard — คืนข้อมูล Work Order ทั้งหมดเป็น JSON
// ป้องกันด้วย DASHBOARD_KEY (ถ้าตั้ง env ไว้) — ?key=xxx
app.get('/api/dashboard', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const key = process.env.DASHBOARD_KEY;
  if (key && req.query.key !== key) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const data = await getAllWorkOrders();
    res.json({ ok: true, count: data.length, updatedAt: new Date().toISOString(), data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Mount notify endpoint
app.use('/notify', require('./notify'));

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
