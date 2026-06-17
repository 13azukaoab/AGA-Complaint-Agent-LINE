const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ชีต1';

const LOCAL_KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');

async function getSheetClient() {
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
}

// สร้าง WO ID ถัดไป — อ่าน WO ID สูงสุดจาก column N แล้ว +1
// (ไม่นับ row เพราะ ghost rows ทำให้นับผิด)
async function getNextWorkOrderId() {
  try {
    const { sheets } = await getSheetClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!N2:N`,
    });
    const rows = res.data.values || [];
    let maxNum = 0;
    rows.forEach(r => {
      if (r && r[0]) {
        const m = String(r[0]).match(/W(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
      }
    });
    return 'W' + String(maxNum + 1).padStart(3, '0');
  } catch (err) {
    console.error('   ❌ getNextWorkOrderId error:', err.message);
    return 'W' + Date.now();
  }
}

// หา row number จาก WO ID (เช่น "W001") — return number หรือ null
async function findRowByWorkOrderId(woId) {
  try {
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
  } catch (err) {
    console.error('   ❌ findRowByWorkOrderId error:', err.message);
    return null;
  }
}

// อ่านข้อมูล row เดียวจาก Sheet (คืน array ของ cell values)
async function getRowData(rowNumber) {
  try {
    const { sheets } = await getSheetClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}:U${rowNumber}`,
    });
    return (res.data.values || [[]])[0];
  } catch (err) {
    console.error('   ❌ getRowData error:', err.message);
    return [];
  }
}

// อัปเดต status ของ WO (รับทราบ หรือ ปิด)
// column O=สถานะ, P=ผู้รับทราบ, Q=เวลารับทราบ, R=ผู้ปิด, S=เวลาปิด, T=วิธีปิด, U=จำนวนที่ติด
async function updateWorkOrderStatus(rowNumber, fields) {
  try {
    const { sheets } = await getSheetClient();
    const row = [
      fields.status || '',
      fields.acknowledger || '',
      fields.ackTime || '',
      fields.closer || '',
      fields.closeTime || '',
      fields.closeMethod || '',
      fields.catchCount !== undefined ? fields.catchCount : '',
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!O${rowNumber}:U${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    console.log(`   📊 อัปเดต WO row ${rowNumber} ✅`);
  } catch (err) {
    console.error('   ❌ updateWorkOrderStatus error:', err.message);
  }
}

// ดึง WO ทั้งหมดที่มีสถานะ "เปิด" สำหรับระบบแจ้งเตือน
async function getOpenWorkOrders() {
  try {
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
      if (status === 'เปิด' || status === 'รับทราบ') {
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
          acknowledger: row[15],
          ackTime: row[16],
        });
      }
    }
    return open;
  } catch (err) {
    console.error('   ❌ getOpenWorkOrders error:', err.message);
    return [];
  }
}

// ดึงสรุปสถิติของวันนี้
async function getTodaySummary() {
  try {
    const { sheets } = await getSheetClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:T`,
    });
    const rows = res.data.values || [];
    const today = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
    let open = 0, acknowledged = 0, closed = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      if (!row[0].includes(today.split('/')[0])) continue; // เช็คปีเดียวกัน
      const ts = row[0];
      // เช็คว่าเป็นวันนี้ (เปรียบเทียบวัน/เดือน)
      const todayStr = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit' });
      if (!ts.startsWith(today.split('/')[0] + '/' + today.split('/')[1].padStart(2,'0'))) {
        // ลองเช็คแบบอื่น
      }
      const status = row[14];
      if (status === 'เปิด') open++;
      else if (status === 'รับทราบ') acknowledged++;
      else if (status === 'ปิด') closed++;
    }
    return { open, acknowledged, closed };
  } catch (err) {
    console.error('   ❌ getTodaySummary error:', err.message);
    return { open: 0, acknowledged: 0, closed: 0 };
  }
}

// เพิ่ม complaint ใหม่ลง Sheet (columns A-T)
// ใช้ .update() แทน .append() เพื่อหลีกเลี่ยง ghost rows ทำให้ข้อมูลไปผิด row
async function appendComplaint(data) {
  try {
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
      '',                // P — ผู้รับทราบ
      '',                // Q — เวลารับทราบ
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
  } catch (err) {
    console.error('   ❌ บันทึก Sheet ไม่สำเร็จ:', err.message);
  }
}

// ดึง Work Order ทั้งหมด (สำหรับ Dashboard) — คืน array ของ object
async function getAllWorkOrders() {
  try {
    const { sheets } = await getSheetClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:U`,
    });
    const rows = res.data.values || [];
    return rows
      .filter(r => r && r[13]) // ต้องมี WO ID (column N)
      .map(r => ({
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
        closer: r[17] || '',
        closeTime: r[18] || '',
        closeMethod: r[19] || '',
        catchCount: r[20] ? parseInt(r[20]) : null,
      }));
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
  getOpenWorkOrders,
  getTodaySummary,
  getAllWorkOrders,
};
