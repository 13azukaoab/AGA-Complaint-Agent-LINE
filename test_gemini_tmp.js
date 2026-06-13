require('dotenv').config({ path: './Secret Key.env' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

(async () => {
  try {
    const result = await model.generateContent('ตอบแค่คำว่า "ทดสอบสำเร็จ" เท่านั้น');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.log('ERROR:', err.message);
  }
})();
