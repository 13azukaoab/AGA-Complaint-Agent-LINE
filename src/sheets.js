const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ชีต1'; // ชื่อ tab ใน Google Sheet

// Local dev: ใช้ไฟล์ JSON โดยตรง
// Cloud Run: ใช้ GOOGLE_APPLICATION_CREDENTIALS ที่ชี้ไปยัง Secret Manager
const LOCAL_KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');

/**
 * สร้าง Google Sheets client
 * - Local: อ่าน JSON key จาก credentials/
 * - Cloud Run: ใช้ GOOGLE_APPLICATION_CREDENTIALS env var (mount จาก Secret Manager)
 */
async function getSheetClient() {
  const authOptions = {
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  };

  // ถ้าไม่มี env var → ใช้ไฟล์ local (สำหรับ dev เท่านั้น)
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    authOptions.keyFile = LOCAL_KEY_FILE;
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * เพิ่มแถวข้อมูล complaint ลงใน Google Sheet
 * @param {Object} data
 * @param {string} data.timestamp   - เวลาที่รับแจ้ง
 * @param {string} data.groupId     - LINE Group ID
 * @param {string} data.senderId    - LINE User ID ผู้ส่ง
 * @param {string} data.pestType    - ชนิดแมลง
 * @param {string} data.location    - สถานที่
 * @param {string} data.severity    - ระดับความรุนแรง
 * @param {string} data.rawMessage  - ข้อความต้นฉบับ
 * @param {string} data.summary     - สรุปจาก AI
 */
async function appendComplaint(data) {
  try {
    const sheets = await getSheetClient();
    const row = [
      data.timestamp,    // A — Timestamp
      data.groupId,      // B — Group ID
      data.senderId,     // C — Sender ID
      data.groupName,    // D — ชื่อกลุ่ม
      data.senderName,   // E — ชื่อผู้แจ้ง
      data.pestType,     // F — Pest ที่แจ้ง
      data.location,     // G — สถานที่/อาคาร
      data.floor,        // H — ชั้น
      data.severity,     // I — ระดับ
      data.contactName,  // J — ผู้ติดต่อ
      data.contactPhone, // K — เบอร์ติดต่อ
      data.rawMessage,   // L — ข้อความต้นฉบับ
      data.summary,      // M — สรุป
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:M1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row],
      },
    });

    console.log('   📊 บันทึกลง Google Sheet แล้ว ✅');
  } catch (err) {
    console.error('   ❌ บันทึก Sheet ไม่สำเร็จ:', err.message);
  }
}

module.exports = { appendComplaint };
