import express from 'express';
import cors from 'cors';
import http from 'http';
import {Server} from 'socket.io';
import mongoose from 'mongoose';
import authroutes from "./authroutes.js";
import User from "./models/Models.js";
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5174",
        methods: ["GET", "POST"]
    }
});
app.use(cors());
app.use(express.json());
const PORT = 5000;
app.use("/login", authroutes);
mongoose.connect("mongodb://localhost:27017/chatapp",)
.then(()=>console.log("database connected"))
.catch((err)=>console.log(err));
app.post("/google-login", async (req, res) => {
    const { name, email, photo } = req.body;
    let user = await User.findOne({ email });
    if (!user) {
        user = new User({ name, email, photo });
        await user.save();
    }
    res.json(user);
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});