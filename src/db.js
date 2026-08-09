import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs,
} from 'firebase/firestore';

export async function fetchAccounts() {
  const snap = await getDocs(collection(db, 'accounts'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveAccount(acct) {
  const { id, ...data } = acct;
  await setDoc(doc(db, 'accounts', id), data);
}

export async function deleteAccount(id) {
  await Promise.all([
    deleteDoc(doc(db, 'accounts', id)),
    deleteDoc(doc(db, 'userdata', id)),
  ]);
}

export async function fetchUserData(userId) {
  const snap = await getDoc(doc(db, 'userdata', userId));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserData(userId, data) {
  await setDoc(doc(db, 'userdata', userId), data);
}
