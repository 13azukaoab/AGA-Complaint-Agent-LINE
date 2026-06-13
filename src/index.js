require('dotenv').config({ path: require('path').resolve(__dirname, '../Secret Key.env') });
const express = require('express');
const { middleware } = require('@line/bot-sdk');
const { analyzeComplaint } = require('./gemini');
const { appendComplaint } = require('./sheets');

const app = express();
const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

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

    const groupName = await getGroupName(groupId);
    const senderName = event.source.userId
      ? await getMemberName(groupId, event.source.userId)
      : 'ไม่ระบุ';

    if (event.type === 'message' && event.message.type === 'image') {
      console.log('🖼️  รูปภาพจากกลุ่ม:', groupName);
      continue;
    }

    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text;
    console.log(`\n📨 ข้อความ: "${text}"`);
    console.log('   กลุ่ม:', groupName, '| ผู้ส่ง:', senderName);

    const result = await analyzeComplaint(text);

    if (!result) {
      console.log('   ⚠️  Gemini วิเคราะห์ไม่ได้');
      continue;
    }

    if (!result.is_complaint) {
      console.log('   ➡️  ไม่ใช่การแจ้งปัญหา — ข้าม');
      continue;
    }

    console.log('   ✅ พบการแจ้งปัญหา!');

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
    });

    console.log('---');
  }
});

app.get('/webhook', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('AGA Complaint Agent is running ✅'));

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
