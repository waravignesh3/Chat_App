import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
const firebaseConfig = {
    apiKey: "AIzaSyDwhvKl7bPGmZnc87MIFOem_klK1SWbXV4",
    authDomain: "chat-app-956bb.firebaseapp.com",
}
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();