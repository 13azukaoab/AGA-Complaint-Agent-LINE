require('dotenv').config({ path: require('path').resolve(__dirname, '../Secret Key.env') });
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ชีต1';
const LOCAL_KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');

// canonical building name map
const LOCATION_MAP = [
  { patterns: ['สยามมินทร์', 'สยามินทร์', 'ตึกสยามมินทร์', 'ตึกสยามินทร์'], canonical: 'ตึกสยามินทร์' },
  { patterns: ['ตึก100ปีพระศีร', 'ตึก100ปีสมเด็จ', 'ตึก 100 ปี สมเด็จพระศรีฯ', 'ตึก100 ปีสมเด็จพระศรี', 'ตึก100ปีสมเด็จพระศรี', 'ตึก 100 ปีสมเด็จพระศรี', 'ตึก 100ปีสมเด็จพระศรี'], canonical: 'อาคาร 100 ปี สมเด็จพระศรีนครินทร์' },
  { patterns: ['เฉลิมพระเกียรติ', 'อาคารเฉลิมพระเกียรติ'], canonical: 'อาคารเฉลิมพระเกียรติ' },
  { patterns: ['เจ้าฟ้ามหาจักรี', 'ตึกเจ้าฟ้ามหาจักรี'], canonical: 'ตึกเจ้าฟ้ามหาจักรี' },
  { patterns: ['อำนวยการ', 'ตึกอำนวยการ'], canonical: 'ตึกอำนวยการ' },
  { patterns: ['หอพักพยาบาล3', 'หอพักพยาบาล 3'], canonical: 'หอพักพยาบาล 3' },
];

function normalize(location) {
  if (!location) return null;
  const trimmed = location.trim();
  for (const { patterns, canonical } of LOCATION_MAP) {
    if (patterns.some(p => trimmed === p)) return canonical;
  }
  return null; // ไม่ต้องแก้
}

async function run() {
  const auth = new google.auth.GoogleAuth({
    keyFile: LOCAL_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  // อ่าน column G (location) ทั้งหมด
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!G2:G`,
  });

  const rows = res.data.values || [];
  const updates = [];

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i]?.[0] || '';
    const fixed = normalize(current);
    if (fixed && fixed !== current) {
      const rowNum = i + 2; // +2 เพราะ header row 1
      updates.push({ range: `${SHEET_NAME}!G${rowNum}`, values: [[fixed]] });
      console.log(`Row ${rowNum}: "${current}" → "${fixed}"`);
    }
  }

  if (updates.length === 0) {
    console.log('✅ ไม่มีชื่ออาคารที่ต้องแก้');
    return;
  }

  // batch update
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });

  console.log(`\n✅ แก้ไขแล้ว ${updates.length} row`);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
