import express from "express";
import bcrypt from "bcrypt";
import pool from "./db.js";

const router = express.Router();

/* =========================
   REGISTER
========================= */
router.post("/register", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  try {
    // ✅ Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ✅ Check existing user
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ?",
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user
    await pool.query(
      "INSERT INTO users (name, email, password, provider, lastSeen, isOnline) VALUES (?, ?, ?, 'local', 'Offline', false)",
      [`${firstName.trim()} ${lastName.trim()}`, normalizedEmail, hashedPassword]
    );

    return res.json({
      success: true,
      message: "User registered successfully"
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* =========================
   LOGIN
========================= */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // ✅ Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ✅ Find user
    const [users] = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = ?",
      [normalizedEmail]
    );

    const user = users[0];

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // ✅ Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        provider: user.provider,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline,
      },
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;