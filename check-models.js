require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.log("No GEMINI_API_KEY found in .env");
  process.exit(1);
}

async function listModels() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models) {
      console.log("Available models:");
      data.models.forEach(m => {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(`- ${m.name} (generateContent supported)`);
        }
      });
    } else {
      console.log("Error fetching models:", data);
    }
  } catch(e) {
    console.error("Fetch failed:", e);
  }
}

listModels();
