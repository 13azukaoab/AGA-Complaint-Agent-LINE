const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ชีต1';

const LOCAL_KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');

// ── Auth client cache (singleton) ──────────────────────────────
// สร้าง client ครั้งเดียว reuse ตลอด — google-auth-library refresh token เองอัตโนมัติ
// ลดการแลก OAuth token จาก "ทุก request" เหลือ "นานๆ ครั้ง" → กัน error "Premature close"
let _clientPromise = null;

function getSheetClient() {
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const authOptions = {
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      };
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        authOptions.keyFile = LOCAL_KEY_FILE;
      }
      const auth = new google.auth.GoogleAuth(authOptions);
      const authClient = await auth.getClient();
      return { sheets: google.sheets({ version: 'v4', auth: authClient }), authClient };
    })().catch((err) => {
      _clientPromise = null; // สร้างไม่สำเร็จ → ให้ลองใหม่ครั้งหน้า
      throw err;
    });
  }
  return _clientPromise;
}

// ── Retry wrapper สำหรับ transient network errors ──────────────
// retry เมื่อเจอ network สะดุด (Premature close / ECONNRESET ฯลฯ)
// ถ้าเจอ → ทิ้ง client cache แล้วสร้างใหม่ เผื่อ token/socket เสีย
const TRANSIENT = /Premature close|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|network socket disconnected|read ECONN/i;

async function withRetry(fn, label, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient = TRANSIENT.test(err.message || '');
      if (!isTransient || i === tries - 1) throw err;
      _clientPromise = null; // ทิ้ง client เสีย สร้างใหม่รอบหน้า
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      console.warn(`   ⚠️ retry ${label} (${i + 1}/${tries}) — ${err.message}`);
    }
  }
  throw lastErr;
}

// สร้าง WO ID ถัดไป — อ่าน WO ID สูงสุดจาก column N แล้ว +1
// (ไม่นับ row เพราะ ghost rows ทำให้นับผิด)
async function getNextWorkOrderId() {
  try {
    return await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!N2:N`,
      });
      const rows = res.data.values || [];
      let maxNum = 0;
      rows.forEach((r) => {
        if (r && r[0]) {
          const m = String(r[0]).match(/W(\d+)/i);
          if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
        }
      });
      return 'W' + String(maxNum + 1).padStart(3, '0');
    }, 'getNextWorkOrderId');
  } catch (err) {
    console.error('   ❌ getNextWorkOrderId error:', err.message);
    return 'W' + Date.now();
  }
}

// หา row number จาก WO ID (เช่น "W001") — return number หรือ null
async function findRowByWorkOrderId(woId) {
  try {
    return await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!N:N`,
      });
      const rows = res.data.values || [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] === woId) {
          return i + 1; // +1 เพราะ Sheet เริ่มที่ row 1
        }
      }
      return null;
    }, 'findRowByWorkOrderId');
  } catch (err) {
    console.error('   ❌ findRowByWorkOrderId error:', err.message);
    return null;
  }
}

// อ่านข้อมูล row เดียวจาก Sheet (คืน array ของ cell values)
async function getRowData(rowNumber) {
  try {
    return await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${rowNumber}:U${rowNumber}`,
      });
      return (res.data.values || [[]])[0];
    }, 'getRowData');
  } catch (err) {
    console.error('   ❌ getRowData error:', err.message);
    return [];
  }
}

// อัปเดต status ของ WO → "ปิด" (ระบบใช้แค่สถานะ เปิด/ปิด)
// column O=สถานะ, P=แจ้งซ้ำ?, Q=ซ้ำกับงาน, R=ผู้ปิด, S=เวลาปิด, T=วิธีปิด, U=จำนวนที่ติด
// ⚠️ ห้ามเขียนทับ P/Q ตอนปิดงาน — เขียนแยก O และ R:U เท่านั้น
async function updateWorkOrderStatus(rowNumber, fields) {
  try {
    await withRetry(async () => {
      const { sheets } = await getSheetClient();
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${SHEET_NAME}!O${rowNumber}`, values: [[fields.status || '']] },
            {
              range: `${SHEET_NAME}!R${rowNumber}:U${rowNumber}`,
              values: [[
                fields.closer || '',
                fields.closeTime || '',
                fields.closeMethod || '',
                fields.catchCount !== undefined && fields.catchCount !== null ? fields.catchCount : '',
              ]],
            },
          ],
        },
      });
    }, 'updateWorkOrderStatus');
    console.log(`   📊 อัปเดต WO row ${rowNumber} ✅`);
  } catch (err) {
    console.error('   ❌ updateWorkOrderStatus error:', err.message);
  }
}

// เพิ่ม URL รูปต่อท้ายช่อง "วิธีปิดงาน" (column T) — ใช้กรณีวางรูปหลังปิดงาน
async function appendClosePhoto(rowNumber, photoUrl) {
  try {
    await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const cur = await getRowData(rowNumber);
      const existing = cur[19] || ''; // column T
      const updated = existing ? `${existing} [รูป: ${photoUrl}]` : `[รูป: ${photoUrl}]`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!T${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[updated]] },
      });
    }, 'appendClosePhoto');
    console.log(`   🖼️  เพิ่มรูปหลังปิดงาน row ${rowNumber} ✅`);
    return true;
  } catch (err) {
    console.error('   ❌ appendClosePhoto error:', err.message);
    return false;
  }
}

// ดึง WO ทั้งหมดที่มีสถานะ "เปิด" สำหรับระบบแจ้งเตือน
async function getOpenWorkOrders() {
  try {
    return await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:U`,
      });
      const rows = res.data.values || [];
      const open = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const status = row[14]; // column O (index 14)
        const isFollowup = row[15] === 'ใช่'; // column P — งานแจ้งซ้ำ ไม่นับเป็นงานค้าง
        // ใช้แค่สถานะ เปิด/ปิด — งานที่ยังไม่ "ปิด" ถือว่าค้าง (รองรับข้อมูลเก่าที่เป็น "รับทราบ" ด้วย)
        // ข้ามงานแจ้งซ้ำ — ทีมปิดแค่งานต้นฉบับ ไม่ต้องปิดงานซ้ำ
        if (status && status !== 'ปิด' && !isFollowup) {
          open.push({
            rowNumber: i + 1,
            timestamp: row[0],
            groupId: row[1],
            groupName: row[3],
            pestType: row[5],
            location: row[6],
            floor: row[7] || '',
            severity: row[8],
            contactName: row[9] || '',
            contactPhone: row[10] || '',
            workOrderId: row[13], // column N (index 13)
            status,
          });
        }
      }
      return open;
    }, 'getOpenWorkOrders');
  } catch (err) {
    console.error('   ❌ getOpenWorkOrders error:', err.message);
    return [];
  }
}

// เพิ่ม complaint ใหม่ลง Sheet (columns A-T)
// ใช้ .update() แทน .append() เพื่อหลีกเลี่ยง ghost rows ทำให้ข้อมูลไปผิด row
async function appendComplaint(data) {
  try {
    await withRetry(async () => {
      const { sheets } = await getSheetClient();

      // หา last row ที่มี WO ID จริงๆ ใน column N แล้วเขียนต่อ
      const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!N:N`,
      });
      const nRows = checkRes.data.values || [];
      let lastDataRow = 1; // row 1 = header
      for (let i = nRows.length - 1; i >= 1; i--) {
        if (nRows[i] && nRows[i][0]) {
          lastDataRow = i + 1; // sheet row (1-based)
          break;
        }
      }
      const nextRow = lastDataRow + 1;

      const row = [
        data.timestamp,    // A
        data.groupId,      // B
        data.senderId,     // C
        data.groupName,    // D
        data.senderName,   // E
        data.pestType,     // F
        data.location,     // G
        data.floor,        // H
        data.severity,     // I
        data.contactName,  // J
        data.contactPhone ? `'${data.contactPhone}` : '', // K — ' นำหน้าบังคับ text ไม่ตัด 0
        data.rawMessage,   // L
        data.summary,      // M
        data.workOrderId,  // N
        'เปิด',            // O — สถานะเริ่มต้น
        data.isFollowup ? 'ใช่' : '', // P — แจ้งซ้ำ?
        data.dupOf || '',  // Q — ซ้ำกับงาน (เช่น W009)
        '',                // R — ผู้ปิดงาน
        '',                // S — เวลาปิด
        '',                // T — วิธีปิดงาน
        '',                // U — จำนวนที่ติด
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${nextRow}:U${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });

      console.log(`   📊 บันทึกลง Google Sheet [${data.workOrderId}] row ${nextRow} ✅`);
    }, 'appendComplaint');
    return true;
  } catch (err) {
    console.error('   ❌ บันทึก Sheet ไม่สำเร็จ:', err.message);
    return false;
  }
}

// ดึง Work Order ทั้งหมด (สำหรับ Dashboard) — คืน array ของ object
async function getAllWorkOrders() {
  try {
    return await withRetry(async () => {
      const { sheets } = await getSheetClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2:U`,
      });
      const rows = res.data.values || [];
      return rows
        .filter((r) => r && r[13]) // ต้องมี WO ID (column N)
        .map((r) => ({
          timestamp: r[0] || '',
          groupId: r[1] || '',
          groupName: r[3] || 'ไม่ระบุ',
          senderName: r[4] || 'ไม่ระบุ',
          pestType: r[5] || 'ไม่ระบุ',
          location: r[6] || 'ไม่ระบุ',
          floor: r[7] || 'ไม่ระบุ',
          severity: r[8] || 'ไม่ระบุ',
          contactName: r[9] || '',
          contactPhone: r[10] || '',
          summary: r[12] || '',
          workOrderId: r[13] || '',
          status: r[14] || 'เปิด',
          isFollowup: r[15] === 'ใช่', // column P — งานแจ้งซ้ำ
          dupOf: r[16] || '',          // column Q — ซ้ำกับงาน
          closer: r[17] || '',
          closeTime: r[18] || '',
          closeMethod: r[19] || '',
          catchCount: r[20] ? parseInt(r[20]) : null,
        }));
    }, 'getAllWorkOrders');
  } catch (err) {
    console.error('   ❌ getAllWorkOrders error:', err.message);
    return [];
  }
}

module.exports = {
  appendComplaint,
  getNextWorkOrderId,
  findRowByWorkOrderId,
  getRowData,
  updateWorkOrderStatus,
  appendClosePhoto,
  getOpenWorkOrders,
  getAllWorkOrders,
};
