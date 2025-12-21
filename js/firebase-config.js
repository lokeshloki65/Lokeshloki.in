// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// TODO: Replace the following with your app's Firebase project configuration
// You can get this from Firebase Console -> Project Settings -> General -> "Your apps" section
const firebaseConfig = {
  apiKey: "AIzaSyCOBCwwbE7xjtVDEJQxSkX7pLZdInN8ggs",
  authDomain: "admin--portfolio.firebaseapp.com",
  projectId: "admin--portfolio",
  storageBucket: "admin--portfolio.firebasestorage.app",
  messagingSenderId: "241041092728",
  appId: "1:241041092728:web:39bec82f069cd8d1efbd8d"
};

// Initialize Firebase
let app, auth, db, storage, analytics;

try {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase Initialized Successfully");
} catch (error) {
    console.error("Firebase Initialization Failed. Please check your firebase-config.js credentials.", error);
}

export { auth, db, storage, analytics };
