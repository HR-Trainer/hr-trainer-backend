const { GoogleGenAI } = require('@google/genai');

async function test() {
  const ai = new GoogleGenAI({ apiKey: 'dummy_key' });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }]
    });
    console.log(response);
  } catch (e) {
    console.error(e.message);
  }
}
test();
