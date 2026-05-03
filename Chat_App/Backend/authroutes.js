import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./models/user.js";

const router = express.Router();

const isDatabaseReady = () => mongoose.connection.readyState === 1;

router.post("/register", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  try {
    if (!isDatabaseReady()) {
      return res.status(503).json({ error: "Database unavailable. Please try again shortly." });
    }

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.toLowerCase().trim();

    if (normalizedFirstName.length < 2 || normalizedLastName.length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters long" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: `${normalizedFirstName} ${normalizedLastName}`,
      email: normalizedEmail,
      password: hashedPassword,
      provider: "local",
      bio: "Hey there! I am using Messenger.",
      lastSeen: "Offline",
      isOnline: false,
    });

    await newUser.save();

    return res.json({
      success: true,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!isDatabaseReady()) {
      return res.status(503).json({ error: "Database unavailable. Please try again shortly." });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        provider: user.provider,
        phone: user.phone,
        bio: user.bio,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline,
        privacy: user.privacy,
        notifications: user.notifications,
        pinnedChats: user.pinnedChats,
        archivedChats: user.archivedChats,
        blockedUsers: user.blockedUsers,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
