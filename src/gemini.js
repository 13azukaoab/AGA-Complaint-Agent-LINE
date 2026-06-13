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
  "location": "สถานที่ที่พบ (เช่น ห้อง 111, ห้องอาหาร, ชั้น 3)",
  "severity": "น้อย หรือ ปานกลาง หรือ มาก",
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
