const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

/**
 * วิเคราะห์ข้อความจากกลุ่ม LINE
 * คืนค่า JSON หรือ null ถ้าไม่ใช่การแจ้งปัญหา
 */
async function analyzeComplaint(text) {
  const prompt = `
คุณคือระบบวิเคราะห์การแจ้งปัญหาแมลงในอาคาร
วิเคราะห์ข้อความนี้แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

ข้อความ: "${text}"

ถ้าข้อความนี้เป็นการแจ้งปัญหาเกี่ยวกับแมลงหรือสัตว์รบกวน ให้ตอบแบบนี้:
{
  "is_complaint": true,
  "pest_type": "ชนิดแมลงหรือสัตว์ (เช่น มดปีก, แมลงสาบ, ปลวก, แมลงวัน, หนู, แมงมุม)",
  "location": "อาคาร/ตึก/หน่วยที่พบ (เช่น ตึก 72 ปี, หน่วย NICU, ศูนย์เต้านม, ห้องอาหาร) ไม่รวมชั้น",
  "floor": "ชั้นที่พบ เช่น ชั้น 2, ชั้น 7 (ถ้าไม่ระบุใส่ ไม่ระบุ)",
  "severity": "น้อย หรือ ปานกลาง หรือ มาก",
  "contact_name": "ชื่อผู้ติดต่อในข้อความ เช่น คุณแข, คุณ TOR (ถ้าไม่มีใส่ ไม่ระบุ)",
  "contact_phone": "เบอร์โทรศัพท์ในข้อความ เช่น 024194620 (ถ้าไม่มีใส่ ไม่ระบุ)",
  "summary": "สรุปปัญหาสั้นๆ ภาษาไทย"
}

ถ้าข้อความนี้ไม่เกี่ยวกับการแจ้งปัญหาแมลง ให้ตอบแบบนี้:
{
  "is_complaint": false
}

กฎ:
- ถ้าไม่ระบุชนิดแมลงชัดเจน ให้เดาจากบริบท
- ถ้าไม่ระบุสถานที่ ให้ใส่ "ไม่ระบุ"
- severity: น้อย=เห็นนิดหน่อย, ปานกลาง=พอมี, มาก=เยอะมาก/รุนแรง
- สกัดชื่อผู้ติดต่อและเบอร์โทรจากข้อความโดยตรง เช่น "ติดต่อคุณแข เบอร์024194620"
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // ตัด markdown code block ถ้ามี
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

module.exports = { analyzeComplaint };
