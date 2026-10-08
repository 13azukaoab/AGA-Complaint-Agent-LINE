// mirrors.js — map "กลุ่มแสดง : กลุ่มต้นทางข้อมูล" สำหรับ Flex สรุป (weekly/monthly)
// ใช้ร่วมกันทั้ง index.js (คำสั่ง #สรุป* on-demand) และ notify.js (scheduled push)
//
// env SUMMARY_MIRRORS="DISPLAY1:SOURCE1,DISPLAY2:SOURCE2"
//   DISPLAY = กลุ่มที่แสดงการ์ดสรุป (บอทต้องอยู่ในกลุ่มนี้)
//   SOURCE  = กลุ่มที่เป็นเจ้าของข้อมูล (groupId ในชีต) ที่เอามาคำนวณ
//
// แนวคิด: "กลุ่มแสดง" เป็นกลุ่มหลังบ้าน ไม่มีข้อมูลของตัวเอง — สรุปทุกอย่างที่โชว์
// ในกลุ่มนี้มาจาก "กลุ่มต้นทาง" เสมอ (ทั้งพิมพ์คำสั่งเอง และ scheduled)
// กลุ่มที่อยากดูสรุปตัวเอง: ใส่ค่าเท่ากัน เช่น "Cxxx:Cxxx"

const summaryMirrors = (process.env.SUMMARY_MIRRORS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const [display, source] = pair.split(':').map((x) => (x || '').trim());
    return { display, source };
  })
  .filter((m) => m.display && m.source);

// คืน groupId ต้นทางข้อมูล สำหรับกลุ่มที่พิมพ์คำสั่ง/รับสรุป
// ถ้ากลุ่มนี้เป็น "กลุ่มแสดง" ใน mirror → คืน source · ไม่งั้น → คืนตัวเอง (กลุ่มปกติดูข้อมูลตัวเอง)
function resolveSummarySource(displayGroupId) {
  const m = summaryMirrors.find((x) => x.display === displayGroupId);
  return m ? m.source : displayGroupId;
}

module.exports = { summaryMirrors, resolveSummarySource };
