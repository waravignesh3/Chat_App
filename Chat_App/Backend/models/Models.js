import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    photo: String
});

export default mongoose.model("User", userSchema);