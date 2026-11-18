import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
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

export const resetUserPassword = async (email) => {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Inserisci prima il tuo indirizzo email nel campo Email.');
  await sendPasswordResetEmail(auth, cleanEmail);
};

export const subscribeToAuthChanges = (callback) => {
  const VIP_SELLER_EMAILS = ['danielepmp@yahoo.it'];
  const isVipSeller = (em) => Boolean(em && VIP_SELLER_EMAILS.includes(String(em).trim().toLowerCase()));
  onAuthStateChanged(auth, async (user) => {
    if (user && isVipSeller(user.email)) {
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const existing = snap.exists() ? snap.data() : {};
        if (!existing.isSeller || existing.role !== 'seller') {
          await setDoc(userRef, {
            email: user.email,
            firstName: existing.firstName || (user.displayName ? user.displayName.split(' ')[0] : 'Daniele'),
            lastName: existing.lastName || (user.displayName ? user.displayName.split(' ').slice(1).join(' ') : ''),
            age: existing.age || 30,
            isSeller: true,
            role: 'seller',
            sellerBrand: existing.sellerBrand || 'Daniele Studio',
            socialProfileType: existing.socialProfileType || 'professionista',
            verified: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      } catch (e) {
        console.warn('Auto-seller upgrade warning:', e);
      }
    }
    callback(user);
  });
};
