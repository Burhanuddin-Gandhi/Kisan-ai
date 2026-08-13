import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";   // only auth routes imported

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Make sure uploads directory exists programmatically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas Connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

// Use Routes
app.use("/api/auth", authRoutes);   // now login/register handled in auth.js

// Multer Setup (still needed for predict)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
app.get("/", (req, res) => {
  console.log("✅ Hello World route was hit!");
  res.send("Hello World! The server is running and reachable.");
});
const upload = multer({ storage });

// Gemini API call from backend
app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No image uploaded" });

    const imagePath = `/uploads/${req.file.filename}`;

    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Image = fileBuffer.toString("base64");

    // Clean and trim api key to remove whitespace or accidental outer quotes
    const rawKey = process.env.GEMINI_API_KEY;
    const geminiApiKey = rawKey ? rawKey.trim().replace(/^["']|["']$/g, "") : null;

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not defined in backend environments.");
    }

    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    const promptText = "You are an expert plant pathologist. Analyze this leaf or plant image. " +
      "If a disease is detected, identify it and provide: " +
      "1. name: The name of the disease (or 'Healthy' if no disease is detected). " +
      "2. description: A brief explanation of what the disease is, what causes it, and how it affects the plant. " +
      "3. remedy: Clear, actionable steps to treat or manage the disease. " +
      "4. severity: The severity level ('Low', 'Medium', 'High', or 'None' if healthy). " +
      "Format your output strictly as a JSON object with keys: 'name', 'description', 'remedy', 'severity'. " +
      "Do not include any markdown styling like ```json or ``` in the response. Just return the raw JSON object.";

    console.log("📡 Sending request to Google Gemini API...");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  data: base64Image,
                  mimeType: req.file.mimetype,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ Google Gemini API Request Failed. Payload:", JSON.stringify(errorData));
      throw new Error(errorData.error?.message || `Gemini API failed with status ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("No response received from Gemini.");
    }

    console.log("✅ Gemini Response parsed. Decoding JSON payload...");
    let analysisResult;
    try {
      // Strip markdown code block wrappers if present (e.g. ```json ... ```)
      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }
      analysisResult = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("❌ Failed to parse Gemini response as JSON. Raw text:", textResponse);
      throw new Error("Google returned invalid response format. Please try again.");
    }

    res.json({
      msg: "✅ Image analyzed successfully",
      imageUrl: imagePath,
      data: {
        plant: req.body.plant || "Unknown",
        disease: analysisResult.name,
        solution: analysisResult.remedy,
        severity: analysisResult.severity,
        imageUrl: imagePath,
      },
    });
  } catch (err) {
    console.error("❌ Error during predict route execution:", err);
    res.status(500).json({ msg: err.message || "Server error during diagnosis" });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
