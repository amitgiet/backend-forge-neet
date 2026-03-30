require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testTTS() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Let's try gemini-2.0-flash which supports multimodal output
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); 

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: "Hello, this is a test of the Gemini TTS system." }] }],
            generationConfig: {
                responseModalities: ["AUDIO"]
            }
        });

        const part = result.response.candidates[0].content.parts.find(p => p.inlineData);
        if (part) {
            console.log("MimeType:", part.inlineData.mimeType);
            console.log("Data size (base64):", part.inlineData.data.length);
            fs.writeFileSync('test_audio.raw', Buffer.from(part.inlineData.data, 'base64'));
            console.log("Wrote test_audio.raw");
        } else {
            console.log("No audio part found!");
            console.log("Response:", JSON.stringify(result.response, null, 2));
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

testTTS();
