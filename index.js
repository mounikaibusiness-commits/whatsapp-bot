import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const { Client, LocalAuth } = pkg;

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp Client Ready!");
});

// ✅ Allowed numbers
const allowedNumbers = ["919652017834@c.us","918008493876@c.us"];

// ✅ Helper: read chat history
function getChatHistory(number) {
  const path = `./mychat/${number}.txt`;
  if (!fs.existsSync(path)) return "";

  let chatData = fs.readFileSync(path, "utf-8").trim();

  // ✅ Limit by file size first (keep last ~200KB of chat)
  const MAX_SIZE = 200 * 1024; // 200 KB (safe context size)
  if (chatData.length > MAX_SIZE) {
    chatData = chatData.slice(-MAX_SIZE);
  }

  // ✅ Optional: Filter last N months (if your log includes timestamps)
  // Extract only recent lines (e.g., last 3 months)
  const lines = chatData.split("\n");
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentLines = lines.filter(line => {
    // Extract [DD/MM/YY, HH:MM:SS] from "[29/04/25, 10:10:26 PM] ..."
    const match = line.match(/\[(\d{2})\/(\d{2})\/(\d{2})/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(`20${year}-${month}-${day}`);
      return date >= threeMonthsAgo;
    }
    return true; // keep lines without dates
  });

  // ✅ If after filtering it's still huge, keep last N lines only
  const MAX_LINES = 400; // roughly last few hundred exchanges
  const trimmedLines = recentLines.slice(-MAX_LINES);

  return trimmedLines.join("\n");
}


// ✅ Helper: append new message lines to chat file
function appendToChatFile(number, sender, message) {
  const path = `./mychat/${number}.txt`;
  const timestamp = new Date().toLocaleString("en-IN", {
    hour12: true,
  });
  const formatted = `[${timestamp}] ${sender}: ${message}\n`;
  fs.appendFileSync(path, formatted);
}

// ✅ Gemini API call
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
- If the message includes jokes, emojis, or teasing, respond in the same playful way.
- Maintain continuity with the ongoing conversation context.

Below is the previous chat followed by the latest message.

Chat History:
${chatHistory}

User's Latest Message:
${userMessage}

Now write only Sairamireddy's next WhatsApp message.
Do NOT explain, translate, mention AI and don't using emoji in every message — just reply naturally in Sairamireddy voice.
`;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    return (
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Hmm..."
    );
  } catch (error) {
    console.error("❌ Gemini API error:", error.response?.data || error.message);
    return "male message chayava ";
  }
}

client.on("message", async (msg) => {
  console.log("📩 Message received from:", msg.from, "Message:", msg.body);

  if (!allowedNumbers.includes(msg.from)) {
    console.log("❌ Ignored message from unauthorized number:", msg.from);
    return;
  }

  // Append user message first
  appendToChatFile(msg.from, "Suresh", msg.body);

  // Read updated chat history
  const chatHistory = getChatHistory(msg.from);

  // Generate AI reply
  const aiText = await generateReply(msg.body, chatHistory);

  // Prefix as Sairamireddy
  const finalReply = `${aiText}`;

  // Send reply
  await msg.reply(finalReply);

  // Append AI reply to chat file
  appendToChatFile(msg.from, "Sairamireddy", aiText);

  console.log("🤖 Replied with:", aiText);
});

client.initialize();
