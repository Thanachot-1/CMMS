import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD-b_9AxLPyW64BPZPWPrEN6L8bE8snD1s",
  authDomain: "tungaloybidding.firebaseapp.com",
  databaseURL: "https://tungaloybidding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tungaloybidding",
  storageBucket: "tungaloybidding.firebasestorage.app",
  messagingSenderId: "225561706650",
  appId: "1:225561706650:web:6adc040c2cdcac5d8f5f23",
  measurementId: "G-X3FEE454KP"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
