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

// Reply ข้อความด้วย replyToken (ฟรี ไม่กินโควต้า — ใช้ตอบ event ที่คนพิมพ์เข้ามา ภายใน 30 วิ)
async function replyMessage(replyToken, text) {
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
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
  } catch (e) {
    console.error('   ❌ replyMessage error:', e.message);
  }
}

// ดาวน์โหลดรูปจาก LINE แล้วอัปโหลดขึ้น Google Drive
async function uploadPhotoToDrive(messageId, woId, authClient) {
  try {
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth: authClient });

    // ดาวน์โหลดรูปจาก LINE
    const lineRes = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    if (!lineRes.ok) return null;

    const buffer = Buffer.from(await lineRes.arrayBuffer());

    // อัปโหลดขึ้น Google Drive
    const { Readable } = require('stream');
    const stream = Readable.from(buffer);

    const driveRes = await drive.files.create({
      requestBody: {
        name: `${woId}_close_photo.jpg`,
        mimeType: 'image/jpeg',
        parents: ['1HcY1doc7d4G_z5tUo3VPDc_sXZvyxeHq'],
      },
      media: {
        mimeType: 'image/jpeg',
        body: stream,
      },
    });

    const fileId = driveRes.data.id;

    // ให้สิทธิ์อ่านแบบ public
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (e) {
    console.error('   ❌ uploadPhotoToDrive error:', e.message);
    return null;
  }
}

// จัดการ "ปิดงาน WXXX [วิธีปิด]"
async function handleClose(groupId, senderName, woId, closeMethod, timestamp, pendingPhotoMessageId, authClient) {
  const rowNumber = await findRowByWorkOrderId(woId);
  if (!rowNumber) {
    await pushMessage(groupId, `ไม่พบ ${woId} — ตรวจสอบหมายเลขอีกครั้ง`);
    return;
  }

  const rowData = await getRowData(rowNumber);
  const currentStatus = rowData[14] || 'เปิด';

  if (currentStatus === 'ปิด') {
    await pushMessage(groupId, `${woId} ปิดแล้วก่อนหน้านี้`);
    return;
  }

  // อัปโหลดรูปถ้ามี
  let finalMethod = closeMethod || 'ไม่ระบุ';
  if (pendingPhotoMessageId && authClient) {
    const driveUrl = await uploadPhotoToDrive(pendingPhotoMessageId, woId, authClient);
    if (driveUrl) {
      finalMethod = (closeMethod || '') + ` [รูป: ${driveUrl}]`;
    }
  }

  await updateWorkOrderStatus(rowNumber, {
    status: 'ปิด',
    acknowledger: rowData[15] || '',
    ackTime: rowData[16] || '',
    closer: senderName,
    closeTime: timestamp,
    closeMethod: finalMethod,
  });

  await pushMessage(groupId, `${woId} ปิดแล้ว โดย ${senderName} ✅`);
  console.log(`   ✅ ${woId} ปิดงาน โดย ${senderName}`);
}

const allowedGroups = process.env.ALLOWED_GROUP_IDS
  ? process.env.ALLOWED_GROUP_IDS.split(',').map(id => id.trim()).filter(id => id.length > 0)
  : [];

app.post('/webhook', middleware(lineConfig), async (req, res) => {
  res.status(200).send('OK');

  const events = req.body.events;

  for (const event of events) {
    if (event.source.type !== 'group') continue;

    const groupId = event.source.groupId;
    if (allowedGroups.length > 0 && !allowedGroups.includes(groupId)) continue;

    const timestamp = new Date(event.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // เก็บรูปภาพล่าสุดไว้รอปิดงาน (TTL 5 นาที)
    if (event.type === 'message' && event.message.type === 'image') {
      pendingPhotos.set(groupId, {
        messageId: event.message.id,
        userId: event.source.userId,
        time: Date.now(),
      });
      console.log('🖼️  เก็บรูปภาพรอปิดงาน:', groupId);
      continue;
    }

    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text.trim();
    const senderName = event.source.userId
      ? await getMemberName(groupId, event.source.userId)
      : 'ไม่ระบุ';

    // ตรวจ command: "งานค้าง" — แสดงงานที่ยังไม่ปิดในกลุ่มนี้ (ใช้ replyToken ฟรี)
    if (/^งานค้าง/i.test(text)) {
      console.log(`\n📂 ขอดูงานค้าง โดย ${senderName}`);
      const openWOs = await getOpenWorkOrders();
      const groupWOs = openWOs.filter(w => w.groupId === groupId);
      if (groupWOs.length === 0) {
        await replyMessage(event.replyToken, 'ไม่มีงานค้าง ✅');
      } else {
        const list = groupWOs
          .map(w => `${w.workOrderId} — ${w.pestType} ${w.location}`)
          .join('\n');
        await replyMessage(event.replyToken, `งานค้าง ${groupWOs.length} รายการ:\n${list}`);
      }
      continue;
    }

    // ตรวจ command: "ปิดงาน WXXX [วิธีปิด]"
    const closeMatch = text.match(/^ปิดงาน\s*(W\d+)\s*(.*)?$/i);
    if (closeMatch) {
      const woId = closeMatch[1].toUpperCase();
      const closeMethod = (closeMatch[2] || '').trim();
      console.log(`\n🔒 ปิดงาน: ${woId} โดย ${senderName} — วิธี: ${closeMethod || 'ไม่ระบุ'}`);

      // เช็ครูปที่รอไว้ (ไม่เกิน 5 นาที)
      const pending = pendingPhotos.get(groupId);
      let photoMessageId = null;
      let authForDrive = null;
      if (pending && (Date.now() - pending.time) < 5 * 60 * 1000) {
        photoMessageId = pending.messageId;
        // ดึง authClient สำหรับ Drive upload
        const { google } = require('googleapis');
        const authOptions = {
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        };
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          const path = require('path');
          authOptions.keyFile = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');
        }
        const auth = new google.auth.GoogleAuth(authOptions);
        authForDrive = await auth.getClient();
        pendingPhotos.delete(groupId);
      }

      await handleClose(groupId, senderName, woId, closeMethod, timestamp, photoMessageId, authForDrive);
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

    const woIds = [];
    for (const result of complaints) {
      const workOrderId = await getNextWorkOrderId();
      console.log(`   ✅ พบการแจ้งปัญหา! [${workOrderId}]`);

      await appendComplaint({
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

      woIds.push(`${workOrderId} — ${result.pest_type} ${result.location}`);
    }

    // Reply รวมทุก WO ในบรรทัดเดียว
    await pushMessage(groupId, `รับแจ้ง ${woIds.join(' | ')} ✅`);

    console.log('---');
  }
});

app.get('/webhook', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('AGA Complaint Agent is running ✅'));

// Mount notify endpoint
app.use('/notify', require('./notify'));

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
