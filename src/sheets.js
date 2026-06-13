const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');
const SHEET_NAME = 'Sheet1'; // ชื่อ tab ใน Google Sheet (ค่าเริ่มต้น)

/**
 * สร้าง Google Sheets client ที่ authenticate ด้วย Service Account
 */
async function getSheetClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
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
      data.timestamp,
      data.groupId,
      data.senderId,
      data.pestType,
      data.location,
      data.severity,
      data.rawMessage,
      data.summary,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
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
