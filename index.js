import pkg from "whatsapp-web.js";
import QRCode from "qrcode";
import express from "express";
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const { Client, LocalAuth } = pkg;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
  },
});

const app = express();
app.use(express.json());

let qrCodeDataUrl = "";

client.on("qr", async (qr) => {
  qrCodeDataUrl = await QRCode.toDataURL(qr);
  console.log("QR Code generated!");
});

client.on("ready", () => console.log("✅ WhatsApp Client Ready!"));

const allowedNumbers = ["919652017834@c.us", "918008493876@c.us"];

function getChatHistory(number) {
  const path = `./mychat/${number}.txt`;
  if (!fs.existsSync(path)) return "";

  let chatData = fs.readFileSync(path, "utf-8").trim();

  const MAX_SIZE = 200 * 1024; // 200 KB
  if (chatData.length > MAX_SIZE) chatData = chatData.slice(-MAX_SIZE);

  const lines = chatData.split("\n");
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentLines = lines.filter(line => {
    const match = line.match(/\[(\d{2})\/(\d{2})\/(\d{2})/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(`20${year}-${month}-${day}`);
      return date >= threeMonthsAgo;
    }
    return true;
  });

  const MAX_LINES = 400;
  return recentLines.slice(-MAX_LINES).join("\n");
}

function appendToChatFile(number, sender, message) {
  if (!fs.existsSync("./mychat")) fs.mkdirSync("./mychat");
  const path = `./mychat/${number}.txt`;
  const timestamp = new Date().toLocaleString("en-IN", { hour12: true });
  const formatted = `[${timestamp}] ${sender}: ${message}\n`;
  fs.appendFileSync(path, formatted);
}

async function generateReply(userMessage, chatHistory) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are writing WhatsApp replies as a person named "Sairamireddy".

Goals:
- Sound completely natural, casual, and emotionally consistent.
- Use the same tone, slang, and mix of Telugu + English words that appear in the chat history.
- Never sound robotic, explanatory, or formal.
- Keep sentences short like typical phone messages.
- Maintain continuity with the ongoing conversation context.

Chat History:
${chatHistory}

User's Latest Message:
${userMessage}

Now write only Sairamireddy's next WhatsApp message.
Do NOT explain, translate, mention AI and don't use emoji in every message — just reply naturally in Sairamireddy voice.
`;

  try {
    const response = await axios.post(
      url,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json" } }
    );

    return (
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Hmm..."
    );
  } catch (err) {
    console.error("❌ Gemini API error:", err.response?.data || err.message);
    return "Error generating reply.";
  }
}

client.on("message", async (msg) => {
  if (!allowedNumbers.includes(msg.from)) return;

  appendToChatFile(msg.from, "User", msg.body);
  const chatHistory = getChatHistory(msg.from);
  const aiText = await generateReply(msg.body, chatHistory);
  await msg.reply(aiText);
  appendToChatFile(msg.from, "Sairamireddy", aiText);
});

client.initialize();

// Endpoint to view QR code in browser
app.get("/qr", (req, res) => {
  if (!qrCodeDataUrl) return res.send("QR not generated yet.");
  res.send(`<h2>Scan this QR to connect WhatsApp</h2><img src="${qrCodeDataUrl}" />`);
});

// Simple health check
app.get("/", (req, res) => res.send("WhatsApp Bot Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
