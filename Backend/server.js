import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 5000;
app.use("/login", authroutes);
mongoose.connect("mongodb://localhost:27017/chatapp",)
.then(()=>console.log("database connected"))
.catch((err)=>console.log(err));


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});