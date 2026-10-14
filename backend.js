// The preview never imports Firebase or contacts the production database.
export const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const api = DEMO ? await import('./demo.js') : Object.assign({},
  ...await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js')
  ]));
export const { initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  getFirestore, collection, doc, addDoc, setDoc, onSnapshot, serverTimestamp, runTransaction, query, where } = api;
