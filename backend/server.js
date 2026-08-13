import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import authRoutes from "../routes/auth.js";   // ✅ only auth routes imported

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Define the list of allowed origins (guests)
const allowedOrigins = [
  'http://localhost:5173', // Your local frontend URL
  'http://localhost:3000', // Alternate local port
  process.env.FRONTEND_URL, // Deployed frontend URL
  /https:\/\/musical-xylophone-.*\.app\.github\.dev/ // The Codespaces URL pattern
].filter(Boolean);

// This is the new, more flexible CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the incoming origin is on our allowed list
    if (allowedOrigins.some(allowed => (allowed instanceof RegExp ? allowed.test(origin) : allowed === origin))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas Connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

// Use Routes
app.use("/api/auth", authRoutes);   // ✅ now login/register handled in auth.js

// Multer Setup (still needed for predict)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
app.get("/", (req, res) => {
  console.log("✅ Hello World route was hit!");
  res.send("Hello World! The server is running and reachable.");
});
const upload = multer({ storage });

// Example predict endpoint (keep this for later)
app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No image uploaded" });

    const imagePath = `/uploads/${req.file.filename}`;

    res.json({
      msg: "✅ Image uploaded successfully",
      imageUrl: imagePath,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
