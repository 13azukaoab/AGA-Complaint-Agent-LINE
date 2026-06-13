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

const allowedGroups = process.env.ALLOWED_GROUP_IDS
  ? process.env.ALLOWED_GROUP_IDS.split(',').map(id => id.trim())
  : [];

app.post('/webhook', middleware(lineConfig), async (req, res) => {
  res.status(200).send('OK');

  const events = req.body.events;

  for (const event of events) {
    if (event.source.type !== 'group') continue;

    const groupId = event.source.groupId;
    if (allowedGroups.length > 0 && !allowedGroups.includes(groupId)) continue;

    const timestamp = new Date(event.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // รูปภาพ
    if (event.type === 'message' && event.message.type === 'image') {
      console.log('🖼️  รูปภาพจากกลุ่ม:', groupId);
      console.log('   เวลา:', timestamp);
      console.log('   [แนบรูปภาพ]');
      console.log('---');
      continue;
    }

    // ข้อความ text
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text;
    console.log(`\n📨 ข้อความ: "${text}"`);
    console.log('   เวลา:', timestamp);

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
    console.log('   🐛 แมลง   :', result.pest_type);
    console.log('   📍 สถานที่:', result.location);
    console.log('   ⚡ ระดับ  :', result.severity);
    console.log('   📝 สรุป   :', result.summary);

    // บันทึกลง Google Sheets
    await appendComplaint({
      timestamp,
      groupId,
      senderId: event.source.userId || 'ไม่ระบุ',
      pestType: result.pest_type,
      location: result.location,
      severity: result.severity,
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
