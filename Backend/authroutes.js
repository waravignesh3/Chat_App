import express from 'express';
import axios from 'axios';
const router = express.Router();
import user from "../models/user.js";
router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const find = await user.findOne({
            username: username,
            password: password
        });
        if (find && password === find.password) {
            return res.json({ success: true, message: "Login successful" });
        }
        if (!find) {
            return res.status(401).json({ error: "Invalid username or password" });
        }
        res.json({ message: "Login successful" });
    } catch (error) {
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});

export default router;