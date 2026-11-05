// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAwQjy-nLgPlJPhgPyxgd7JdQRyIt0SHhY",
  authDomain: "rekampus-3efcf.firebaseapp.com",
  projectId: "rekampus-3efcf",
  storageBucket: "rekampus-3efcf.firebasestorage.app",
  messagingSenderId: "866091171140",
  appId: "1:866091171140:web:ef602067728c3c5251eb11",
  measurementId: "G-PKNN6HG318"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    return user;
  } catch (error) {
    console.error("Auth Error:", error);
    alert(error.message);
  }
};