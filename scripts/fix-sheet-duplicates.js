/**
 * ลบ W035, W037 (ซ้ำ) และแก้ W040 floor ชั้น 1 → ชั้น 2
 * รัน: node scripts/fix-sheet-duplicates.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../Secret Key.env') });
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ชีต1';
const KEY_FILE = path.resolve(__dirname, '../credentials/qcs-bait-app-v5-daa46a58d50b.json');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // หา row index จาก column N (WO ID)
  const colN = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!N:N`,
  });
  const nRows = colN.data.values || [];
  const rowOf = {};
  for (let i = 0; i < nRows.length; i++) {
    if (nRows[i]?.[0]) rowOf[nRows[i][0]] = i + 1; // 1-based
  }

  console.log('พบ rows:', rowOf);

  const toDelete = ['W037', 'W035'];
  const deleteRowNums = toDelete
    .map(wo => rowOf[wo])
    .filter(Boolean)
    .sort((a, b) => b - a); // ลบจากล่างขึ้นบน เพื่อ index ไม่เลื่อน

  if (deleteRowNums.length === 0) {
    console.log('ไม่พบแถวที่จะลบ');
  }

  // ดึง sheetId (gid) ของ ชีต1
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetGid = meta.data.sheets.find(s => s.properties.title === SHEET_NAME)?.properties.sheetId;
  if (sheetGid === undefined) throw new Error('ไม่พบชีต: ' + SHEET_NAME);

  // ลบแถว W037 และ W035 (เรียงจากมากไปน้อย)
  for (const rowNum of deleteRowNums) {
    const woId = Object.keys(rowOf).find(k => rowOf[k] === rowNum);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
          },
        }],
      },
    });
    console.log(`✅ ลบ ${woId} (row ${rowNum}) แล้ว`);
  }

  // หา row ใหม่ของ W040 หลังลบ (index เลื่อน)
  const colN2 = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!N:N`,
  });
  const nRows2 = colN2.data.values || [];
  const w040Row = nRows2.findIndex(r => r?.[0] === 'W040') + 1;

  if (w040Row > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!H${w040Row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['ชั้น 2']] },
    });
    console.log(`✅ แก้ W040 floor → ชั้น 2 (row ${w040Row})`);
  } else {
    console.log('ไม่พบ W040');
  }

  console.log('\n🎉 เสร็จสิ้น');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
