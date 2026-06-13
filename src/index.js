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

// Push ข้อความเข้ากลุ่ม LINE (1 บรรทัด ไม่รบกวน)
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

// จัดการ "รับทราบ WXXX"
async function handleAcknowledge(groupId, senderName, woId, timestamp) {
  const rowNumber = await findRowByWorkOrderId(woId);
  if (!rowNumber) {
    await pushMessage(groupId, `ไม่พบ ${woId} — ตรวจสอบหมายเลขอีกครั้ง`);
    return;
  }

  const rowData = await getRowData(rowNumber);
  const currentStatus = rowData[14] || 'เปิด'; // column O

  if (currentStatus === 'ปิด') {
    await pushMessage(groupId, `${woId} ปิดแล้วก่อนหน้านี้`);
    return;
  }

  await updateWorkOrderStatus(rowNumber, {
    status: 'รับทราบ',
    acknowledger: senderName,
    ackTime: timestamp,
    closer: rowData[17] || '',
    closeTime: rowData[18] || '',
    closeMethod: rowData[19] || '',
  });

  await pushMessage(groupId, `${woId} รับทราบแล้ว โดย ${senderName} ✅`);
  console.log(`   ✅ ${woId} รับทราบ โดย ${senderName}`);
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

    // ตรวจ command: "รับทราบ WXXX"
    const ackMatch = text.match(/^รับทราบ\s+(W\d+)/i);
    if (ackMatch) {
      console.log(`\n📋 รับทราบ: ${ackMatch[1]} โดย ${senderName}`);
      await handleAcknowledge(groupId, senderName, ackMatch[1].toUpperCase(), timestamp);
      continue;
    }

    // ตรวจ command: "ปิดงาน WXXX [วิธีปิด]"
    const closeMatch = text.match(/^ปิดงาน\s+(W\d+)\s*(.*)?$/i);
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
    const result = await analyzeComplaint(text);

    if (!result) {
      console.log('   ⚠️  Gemini วิเคราะห์ไม่ได้');
      continue;
    }

    if (!result.is_complaint) {
      console.log('   ➡️  ไม่ใช่การแจ้งปัญหา — ข้าม');
      continue;
    }

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

    // Reply สั้น 1 บรรทัด
    await pushMessage(groupId, `รับแจ้ง ${workOrderId} — ${result.pest_type} ${result.location} ✅`);

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
