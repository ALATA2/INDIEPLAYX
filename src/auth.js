import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

export const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user already exists in Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      const names = (user.displayName || "").split(" ");
      const firstName = names[0] || "Utente";
      const lastName = names.slice(1).join(" ") || "";

      await setDoc(userDocRef, {
        email: user.email,
        firstName: firstName,
        lastName: lastName,
        age: 18,
        isSeller: false,
        role: "user",
        createdAt: new Date().toISOString()
      });
    }
    return user;
  } catch (error) {
    throw error;
  }
};

export const registerUser = async (email, password, userData = {}) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Invia email di verifica reale dell'indirizzo email
    await sendEmailVerification(user);

    // Crea un documento utente in Firestore con dati aggiuntivi
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      ...userData,
      createdAt: new Date().toISOString()
    });

    return user;
  } catch (error) {
    throw error;
  }
};

export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    throw error;
  }
};

export const subscribeToAuthChanges = (callback) => {
  onAuthStateChanged(auth, callback);
};
