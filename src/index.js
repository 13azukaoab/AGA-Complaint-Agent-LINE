// IPv4 first — Cloud Run + Node 22 มีปัญหา DNS IPv6 ทำ connection ค้าง
require('dns').setDefaultResultOrder('ipv4first');

// Wrap node-fetch + agent keepAlive:false — ป้องกัน "Premature close" จาก stale socket บน Cloud Run
// ครอบทุก fetch() call รวมถึง @google/generative-ai (Gemini) และ LINE API
const https = require('https');
const _nodeFetchBase = require('node-fetch');
const _noKeepaliveAgent = new https.Agent({ keepAlive: false });
const _nodeFetch = (url, opts = {}) => _nodeFetchBase(url, { agent: _noKeepaliveAgent, ...opts });
_nodeFetch.Headers = _nodeFetchBase.Headers;
_nodeFetch.Request = _nodeFetchBase.Request;
_nodeFetch.Response = _nodeFetchBase.Response;
globalThis.fetch = _nodeFetch;
globalThis.Headers = _nodeFetchBase.Headers;
globalThis.Request = _nodeFetchBase.Request;
globalThis.Response = _nodeFetchBase.Response;

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
  appendClosePhoto,
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

// เก็บงานที่เพิ่งปิดในแต่ละกลุ่ม (ใช้ผูกรูปที่วางหลังปิดงาน) TTL 5 นาที
// groupId → { woId, rowNumber, time }
const recentCloses = new Map();
const PHOTO_TTL_MS = 5 * 60 * 1000;

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
// text = string เดียว หรือ array ของ string (ส่งการ์ดแยกได้ — LINE รับสูงสุด 5 ข้อความ/reply)
// return true ถ้าสำเร็จ, false ถ้า fail (เพื่อให้ caller fallback ไป pushMessage)
async function replyMessage(replyToken, text) {
  try {
    const texts = (Array.isArray(text) ? text : [text]).slice(0, 5);
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken,
        messages: texts.map((t) => ({ type: 'text', text: t })),
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
    const texts = Array.isArray(text) ? text : [text];
    for (const t of texts) await pushMessage(groupId, t);
  }
}

// ─── Flex message ────────────────────────────────────────────────
// ส่ง Flex ผ่าน reply (ฟรี ไม่กิน push quota) — ใช้พรีวิว/สรุป on-demand
async function sendFlexReply(replyToken, altText, contents) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'flex', altText, contents }] }),
    });
    if (!res.ok) { console.error('   ❌ flex reply fail:', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('   ❌ flex reply error:', e.message); return false; }
}

// การ์ดตัวอย่าง "สรุปรายสัปดาห์" (ดีไซน์ A+C) — ข้อมูล sample สำหรับพรีวิวดีไซน์
function buildSampleWeeklyFlex() {
  const kpi = (n, l, color) => ({
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '8px',
    contents: [
      { type: 'text', text: n, size: 'xxl', weight: 'bold', color, align: 'center' },
      { type: 'text', text: l, size: 'xxs', color: '#6B7280', align: 'center', margin: 'xs' },
    ],
  });
  const ICON = { termite: 'https://storage.googleapis.com/aga-complaint-photos/icons/termite.png' };
  // icon = emoji (text) หรือ URL รูป (isUrl=true)
  const pest = (icon, name, w, ct, isUrl) => ({
    type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm', alignItems: 'center',
    contents: [
      isUrl
        ? { type: 'box', layout: 'vertical', width: '22px', height: '22px', flex: 0, contents: [{ type: 'image', url: icon, size: 'full', aspectMode: 'fit' }] }
        : { type: 'text', text: icon, flex: 0, size: 'sm' },
      { type: 'text', text: name, flex: 3, size: 'sm', color: '#1F2937' },
      { type: 'box', layout: 'horizontal', flex: 5, height: '8px', backgroundColor: '#E9EDF2', cornerRadius: '4px',
        contents: [{ type: 'box', layout: 'vertical', width: w, backgroundColor: '#2563EB', cornerRadius: '4px', contents: [{ type: 'filler' }] }] },
      { type: 'text', text: ct, flex: 0, size: 'sm', weight: 'bold', align: 'end', color: '#1F2937' },
    ],
  });
  // แถวอาคาร top: อันดับ + ชื่อ + จำนวน
  const bldg = (rank, name, ct) => ({
    type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'sm', alignItems: 'center',
    contents: [
      { type: 'text', text: rank, flex: 0, size: 'sm', weight: 'bold', color: '#2563EB' },
      { type: 'text', text: name, flex: 1, size: 'sm', color: '#1F2937', wrap: true },
      { type: 'text', text: ct, flex: 0, size: 'sm', weight: 'bold', color: '#1F2937', align: 'end' },
    ],
  });
  const sep = () => ({ type: 'separator', margin: 'lg', color: '#ECEFF3' });
  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1E40AF', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📊 สรุปงานรายสัปดาห์', color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: '22–28 กันยายน 2569 · ไม่รวมงานแจ้งซ้ำ', color: '#DBEAFE', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [kpi('14', 'งานทั้งหมด', '#2563EB'), kpi('11', 'ปิดแล้ว', '#059669'), kpi('3', 'ค้าง', '#D97706')] },
        { type: 'box', layout: 'vertical', margin: 'lg', contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: 'อัตราปิดงาน', size: 'sm', weight: 'bold', color: '#374151' },
            { type: 'text', text: '79%', size: 'sm', weight: 'bold', color: '#059669', align: 'end' },
          ] },
          { type: 'box', layout: 'horizontal', height: '10px', backgroundColor: '#E9EDF2', cornerRadius: '6px', margin: 'sm',
            contents: [{ type: 'box', layout: 'vertical', width: '79%', backgroundColor: '#059669', cornerRadius: '6px', contents: [{ type: 'filler' }] }] },
        ] },
        sep(),
        { type: 'text', text: '🐾 แยกชนิดสัตว์รบกวน', weight: 'bold', size: 'sm', margin: 'lg' },
        pest('🐀', 'หนู', '100%', '6'),
        pest(ICON.termite, 'ปลวก', '50%', '3', true),
        pest('🪳', 'แมลงสาบ', '33%', '2'),
        pest('🦟', 'ยุง', '17%', '1'),
        pest('🐜', 'มด', '17%', '1'),
        pest('▫️', 'อื่นๆ', '17%', '1'),
        sep(),
        { type: 'text', text: '🏢 อาคารที่แจ้งเยอะสุด (TOP 3)', weight: 'bold', size: 'sm', margin: 'lg' },
        bldg('1.', 'ตึกสยามินทร์', '4'),
        bldg('2.', 'อาคาร 100 ปีฯ', '3'),
        bldg('3.', 'ตึก 72 ปี', '2'),
        { type: 'box', layout: 'horizontal', backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '10px', margin: 'lg', alignItems: 'center',
          contents: [
            { type: 'text', text: '🐀 หนูที่จับได้รวม', size: 'sm', weight: 'bold', color: '#374151', flex: 1 },
            { type: 'text', text: '7 ตัว', size: 'md', weight: 'bold', color: '#D97706', align: 'end', flex: 0 },
          ] },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', backgroundColor: '#FFF7ED', paddingAll: '12px',
      contents: [
        { type: 'text', text: '🟡 คงค้าง 3 งาน', weight: 'bold', size: 'sm', color: '#D97706' },
        { type: 'text', text: 'W411 · W415 · W417 — พิมพ์ "งานค้าง" ดูรายละเอียด', size: 'xs', color: '#92400E', wrap: true, margin: 'xs' },
      ],
    },
  };
}

// การ์ดตัวอย่าง "สรุปรายเดือน" (ดีไซน์ M1 = weekly + แถบเทียบเดือนก่อน)
function buildSampleMonthlyFlex() {
  const ICON = { termite: 'https://storage.googleapis.com/aga-complaint-photos/icons/termite.png' };
  const kpi = (n, l, color) => ({
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '8px',
    contents: [
      { type: 'text', text: n, size: 'xxl', weight: 'bold', color, align: 'center' },
      { type: 'text', text: l, size: 'xxs', color: '#6B7280', align: 'center', margin: 'xs' },
    ],
  });
  const cmp = (l, v, color) => ({
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#F6F8FB', cornerRadius: '8px', paddingAll: '8px',
    contents: [
      { type: 'text', text: l, size: 'xxs', color: '#6B7280' },
      { type: 'text', text: v, size: 'sm', weight: 'bold', color },
    ],
  });
  const pest = (icon, name, w, ct, isUrl) => ({
    type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm', alignItems: 'center',
    contents: [
      isUrl
        ? { type: 'box', layout: 'vertical', width: '22px', height: '22px', flex: 0, contents: [{ type: 'image', url: icon, size: 'full', aspectMode: 'fit' }] }
        : { type: 'text', text: icon, flex: 0, size: 'sm' },
      { type: 'text', text: name, flex: 3, size: 'sm', color: '#1F2937' },
      { type: 'box', layout: 'horizontal', flex: 5, height: '8px', backgroundColor: '#E9EDF2', cornerRadius: '4px',
        contents: [{ type: 'box', layout: 'vertical', width: w, backgroundColor: '#2563EB', cornerRadius: '4px', contents: [{ type: 'filler' }] }] },
      { type: 'text', text: ct, flex: 0, size: 'sm', weight: 'bold', align: 'end', color: '#1F2937' },
    ],
  });
  const bldg = (rank, name, ct) => ({
    type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'sm', alignItems: 'center',
    contents: [
      { type: 'text', text: rank, flex: 0, size: 'sm', weight: 'bold', color: '#2563EB' },
      { type: 'text', text: name, flex: 1, size: 'sm', color: '#1F2937', wrap: true },
      { type: 'text', text: ct, flex: 0, size: 'sm', weight: 'bold', color: '#1F2937', align: 'end' },
    ],
  });
  const sep = () => ({ type: 'separator', margin: 'lg', color: '#ECEFF3' });
  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1E40AF', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📅 สรุปงานรายเดือน', color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: 'กันยายน 2569 · ไม่รวมงานแจ้งซ้ำ', color: '#DBEAFE', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [kpi('58', 'งานทั้งหมด', '#2563EB'), kpi('52', 'ปิดแล้ว', '#059669'), kpi('6', 'ค้าง', '#D97706')] },
        { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: [cmp('อัตราปิดงาน', '90% ▲5%', '#059669'), cmp('เทียบเดือน ส.ค.', '49→58 ▲18%', '#2563EB')] },
        sep(),
        { type: 'text', text: '🐾 แยกชนิดสัตว์รบกวน', weight: 'bold', size: 'sm', margin: 'lg' },
        pest('🐀', 'หนู', '100%', '24'),
        pest(ICON.termite, 'ปลวก', '58%', '14', true),
        pest('🪳', 'แมลงสาบ', '38%', '9'),
        pest('🦟', 'ยุง', '21%', '5'),
        pest('🐜', 'มด', '17%', '4'),
        pest('▫️', 'อื่นๆ', '8%', '2'),
        sep(),
        { type: 'text', text: '🏢 อาคารที่แจ้งเยอะสุด (TOP 3)', weight: 'bold', size: 'sm', margin: 'lg' },
        bldg('1.', 'ตึกสยามินทร์', '12'),
        bldg('2.', 'อาคาร 100 ปีฯ', '9'),
        bldg('3.', 'ตึก 72 ปี', '7'),
        { type: 'box', layout: 'horizontal', backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '10px', margin: 'lg', alignItems: 'center',
          contents: [
            { type: 'text', text: '🐀 หนูที่จับได้รวม', size: 'sm', weight: 'bold', color: '#374151', flex: 1 },
            { type: 'text', text: '31 ตัว', size: 'md', weight: 'bold', color: '#D97706', align: 'end', flex: 0 },
          ] },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', backgroundColor: '#FFF7ED', paddingAll: '12px',
      contents: [
        { type: 'text', text: '🟡 คงค้าง 6 งาน', weight: 'bold', size: 'sm', color: '#D97706' },
        { type: 'text', text: 'พิมพ์ "งานค้าง" ดูรายละเอียด', size: 'xs', color: '#92400E', margin: 'xs' },
      ],
    },
  };
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
    // บน Cloud Run (K_SERVICE) → ใช้ default service account ผ่าน metadata (ADC)
    //   — SA มีสิทธิ์ bucket แล้ว จึงไม่ต้องใช้ key file (key file ไม่มีใน container อยู่แล้ว)
    // เฉพาะรันบนเครื่อง local เท่านั้นที่ fallback ไปใช้ key file (ถ้ามีไฟล์)
    if (!process.env.K_SERVICE && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const path = require('path');
      const fs = require('fs');
      const keyFile = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');
      if (fs.existsSync(keyFile)) storageOptions.keyFilename = keyFile;
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
    closer: senderName,
    closeTime: timestamp,
    closeMethod: finalMethod,
    catchCount,
  });

  // จำงานที่เพิ่งปิด — เผื่อมีรูปวางตามมาหลังปิดงาน (ภายใน 5 นาที)
  recentCloses.set(groupId, { woId, rowNumber, time: Date.now() });

  // นับงานค้างที่เหลือในกลุ่มนี้ (หลังปิดงานนี้แล้ว)
  const remaining = await getOpenWorkOrders();
  const groupRemaining = remaining.filter(w => w.groupId === groupId);

  let replyMsg;
  if (groupRemaining.length === 0) {
    replyMsg = [
      `✅ ${woId} ปิดแล้ว โดย ${senderName}`,
      '━━━━━━━━━━━━━━',
      '📋 สถานะงานกลุ่มนี้: ไม่มีงานค้าง',
      'ดำเนินการครบทุกรายการแล้ว',
    ].join('\n');
  } else {
    const lines = [
      `✅ ${woId} ปิดแล้ว โดย ${senderName}`,
      '━━━━━━━━━━━━━━',
      `📋 คงเหลือในกลุ่มนี้ ${groupRemaining.length} งาน`,
    ];
    for (const w of groupRemaining) {
      const floor = w.floor && w.floor !== 'ไม่ระบุ' ? ` ${w.floor}` : '';
      lines.push(`• ${w.workOrderId} ${w.pestType} — ${w.location}${floor}`);
    }
    lines.push('💬 พิมพ์ "ปิดงาน Wxxx [วิธี]" เพื่อปิดงานถัดไป');
    replyMsg = lines.join('\n');
  }

  await safeReply(replyToken, groupId, replyMsg);
  console.log(`   ✅ ${woId} ปิดงาน โดย ${senderName}${catchCount !== null ? ` (จับได้ ${catchCount} ตัว)` : ''} — เหลือค้าง ${groupRemaining.length} งาน`);
}

// normalize สำหรับเทียบสถานที่/ชั้น/ชนิด (ตัดช่องว่าง)
function normKey(s) {
  return (s || '').toString().trim().replace(/\s+/g, '');
}

// หางาน "ต้นฉบับ" ของการแจ้งซ้ำ — match กลุ่ม+สถานที่+ชนิดเดียวกัน (ไม่เอางานที่เป็นแจ้งซ้ำเอง)
// คืน WO ID ของงานล่าสุดที่ตรง หรือ null ถ้าไม่พบ
async function findOriginalWO(groupId, location, floor, pestType) {
  try {
    const all = await getAllWorkOrders();
    const matches = all.filter(w =>
      w.groupId === groupId &&
      !w.isFollowup &&
      w.workOrderId &&
      normKey(w.location) === normKey(location) &&
      normKey(w.pestType) === normKey(pestType) &&
      // ชั้นตรงกัน หรือฝั่งใดฝั่งหนึ่งไม่ระบุ → ยอมรับ
      (normKey(w.floor) === normKey(floor) || !normKey(floor) || normKey(floor) === 'ไม่ระบุ'
        || !normKey(w.floor) || normKey(w.floor) === 'ไม่ระบุ')
    );
    if (matches.length === 0) return null;
    return matches[matches.length - 1].workOrderId; // ล่าสุด (อยู่ท้ายชีต)
  } catch (e) {
    console.error('   ❌ findOriginalWO error:', e.message);
    return null;
  }
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

    if (event.type === 'message' && event.message.type === 'image') {
      const now = Date.now();

      // ① ถ้าเพิ่งปิดงานในกลุ่มนี้ (ภายใน 5 นาที) → ผูกรูปกับงานที่ปิดไปเลย (รูปวางหลังปิดงาน)
      const rc = recentCloses.get(groupId);
      if (rc && (now - rc.time) < PHOTO_TTL_MS) {
        const gcsUrl = await uploadPhotoToGCS(event.message.id, `${rc.woId}_after`);
        if (gcsUrl) {
          await appendClosePhoto(rc.rowNumber, gcsUrl);
          console.log(`🖼️  ผูกรูปหลังปิดงาน → ${rc.woId}`);
        }
        continue;
      }

      // ② ไม่งั้นเก็บรูปไว้รอปิดงาน (รองรับหลายรูป, TTL 5 นาที)
      const existing = pendingPhotos.get(groupId);
      if (existing && (now - existing.time) < PHOTO_TTL_MS) {
        existing.messageIds.push(event.message.id);
      } else {
        pendingPhotos.set(groupId, { messageIds: [event.message.id], time: now });
      }
      console.log('🖼️  เก็บรูปภาพรอปิดงาน:', groupId, '(', pendingPhotos.get(groupId).messageIds.length, 'รูป)');
      continue;
    }

    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text.trim();
    const senderName = event.source.userId
      ? await getMemberName(groupId, event.source.userId)
      : 'ไม่ระบุ';

    // ตรวจ command: "พรีวิวสรุปเดือน" / "พรีวิวเดือน" — โชว์ Flex ตัวอย่างสรุปรายเดือน (reply ฟรี)
    if (/^(พรีวิวสรุปเดือน|พรีวิวเดือน|preview month)\s*$/i.test(text)) {
      console.log(`\n🧪 พรีวิว Flex สรุปรายเดือน โดย ${senderName}`);
      await sendFlexReply(event.replyToken, '📅 สรุปงานรายเดือน', buildSampleMonthlyFlex());
      continue;
    }

    // ตรวจ command: "พรีวิวสรุป" — โชว์ Flex ตัวอย่างสรุปรายสัปดาห์ (reply ฟรี ใช้ทดสอบดีไซน์)
    if (/^(พรีวิวสรุป|ทดสอบสรุป|preview)\s*$/i.test(text)) {
      console.log(`\n🧪 พรีวิว Flex สรุปรายสัปดาห์ โดย ${senderName}`);
      await sendFlexReply(event.replyToken, '📊 สรุปงานรายสัปดาห์', buildSampleWeeklyFlex());
      continue;
    }

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
          if (wo.summary && wo.summary !== 'ไม่ระบุ') {
            const s = wo.summary.length > 60 ? wo.summary.slice(0, 60) + '…' : wo.summary;
            lines.push(`📝 ${s}`);
          }
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

    // ตรวจ command ปิดงาน — รองรับหลายรูปแบบ + typo
    // คำกริยาปิดงานที่รับ: ปิด, ปอด(typo), จบ, เคลียร์/เคลีย, เสร็จ
    // รูปแบบที่จับได้ เช่น: "ปิดงาน W028", "ปิด W028", "จบงาน W028 กาว 1ตัว",
    //   "เคลียร์งาน W028", "W028 ปิดงาน", "W028 เสร็จแล้ว", "W028 จบ"
    const CLOSE_VERB = '(?:ป[ิอ]ด|จบ|เคลียร์|เคลีย|เสร็จ)';
    const closeMatch =
         text.match(new RegExp(`^${CLOSE_VERB}\\s*(?:งาน)?\\s*(W\\d+)\\s*(.*)?$`, 'i'))
      || text.match(new RegExp(`^(W\\d+)\\s+${CLOSE_VERB}\\s*(?:งาน|แล้ว)?\\s*(.*)?$`, 'i'));
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
      const floor = result.floor && result.floor !== 'ไม่ระบุ' ? ` ${result.floor}` : '';
      const contact = [result.contact_name, result.contact_phone]
        .filter(v => v && v !== 'ไม่ระบุ').join(' ');

      // ตรวจว่าเป็นการแจ้งซ้ำ/ตามงานไหม → หางานต้นฉบับ
      const isFollowup = !!result.is_followup;
      const isClarification = !!result.is_clarification;
      let dupOf = '';
      if (isFollowup) {
        dupOf = await findOriginalWO(groupId, result.location, result.floor || 'ไม่ระบุ', result.pest_type) || '';
        console.log(`   🔁 แจ้งซ้ำ! [${workOrderId}]${dupOf ? ` — ซ้ำกับ ${dupOf}` : ' — ไม่พบงานเดิม'}`);
      } else if (isClarification) {
        console.log(`   💬 ชี้แจงลูกค้า [${workOrderId}] — จะสร้างและปิดอัตโนมัติ`);
      } else {
        console.log(`   ✅ พบการแจ้งปัญหา! [${workOrderId}]`);
      }

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
        isFollowup,
        dupOf,
      });

      // บันทึก Sheet ไม่สำเร็จ → แจ้งเตือนแทนข้อความ "เปิดแล้ว" (กัน user เข้าใจผิด)
      if (!saved) {
        console.error(`   ❌ บันทึก ${workOrderId} ไม่สำเร็จ — ไม่ตอบว่าเปิดงาน`);
        woMessages.push(`⚠️ บันทึก Work Order ไม่สำเร็จ (ระบบขัดข้อง)\nกรุณาแจ้งปัญหาซ้ำอีกครั้ง`);
        continue;
      }

      // ชี้แจงลูกค้า → สร้าง WO แล้วปิดทันที ไม่แจ้งเตือนในกลุ่ม
      if (isClarification) {
        const clrRow = await findRowByWorkOrderId(workOrderId);
        if (clrRow) {
          await updateWorkOrderStatus(clrRow, {
            status: 'ปิด',
            closer: senderName,
            closeTime: timestamp,
            closeMethod: 'ชี้แจงกับลูกค้า',
            catchCount: null,
          });
        }
        console.log(`   💬 ${workOrderId} ปิดอัตโนมัติ (ชี้แจงลูกค้า)`);
        continue; // ไม่แจ้งเตือนในกลุ่ม
      }

      let lines;
      if (isFollowup) {
        // งานแจ้งซ้ำ — ไม่นับเป็นงานค้าง ไม่ต้องปิดซ้ำ
        lines = [
          '📌 รับแจ้ง — ตามงาน/แจ้งซ้ำ',
          '━━━━━━━━━━━━',
          `หมายเลข: ${workOrderId}`,
          `สัตว์: ${result.pest_type}`,
          `พื้นที่: ${result.location}${floor}`,
        ];
        if (contact) lines.push(`ติดต่อ: ${contact}`);
        if (dupOf) lines.push('', `🔁 ซ้ำกับงาน ${dupOf} — ไม่นับเป็นงานใหม่`, 'ℹ️ ปิดที่งานต้นฉบับ ไม่ต้องปิดงานนี้');
        else lines.push('', '🔁 เป็นการแจ้งซ้ำ แต่ไม่พบงานเดิม', 'ℹ️ โปรดตรวจสอบ/ระบุงานต้นฉบับในชีต');
      } else {
        lines = [
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
      }

      woMessages.push(lines.join('\n'));
    }

    // ส่งทุก WO เป็นการ์ดแยกกัน ในการ reply ครั้งเดียว (ฟรี ไม่กิน push quota)
    // LINE รับได้สูงสุด 5 ข้อความ/reply — ถ้าเกิน 5 WO ในข้อความเดียว ส่วนเกินค่อยใช้ push (หายากมาก)
    await safeReply(event.replyToken, groupId, woMessages);
    for (let i = 5; i < woMessages.length; i++) {
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
    console.error('   ❌ /api/dashboard error:', e.message, e.stack);
    res.status(500).json({
      ok: false,
      error: e.message,
      sheetId: process.env.GOOGLE_SHEET_ID ? 'set' : 'NOT SET',
      kService: process.env.K_SERVICE ? 'set' : 'NOT SET',
      gac: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'set' : 'NOT SET',
      hint: 'Check Cloud Run logs: gcloud run services logs read aga-complaint-agent --region asia-southeast1 --limit=20',
    });
  }
});

// Mount notify endpoint
app.use('/notify', require('./notify'));

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
