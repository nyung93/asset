import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let firestore: Firestore | undefined;

/** Credentials stay on the Node server; no Firebase Admin key is bundled into Vite. */
export function firebaseConfigured(): boolean {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  return !!(projectId && (
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  ));
}

export function database(): Firestore {
  if (firestore) return firestore;
  if (!firebaseConfigured()) throw new Error('Firebase server credentials are missing');
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const app = getApps().find(candidate => candidate.name === 'rich-grandma-tycoon') ?? initializeApp({
    projectId,
    credential: process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
      ? cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
      : applicationDefault(),
  }, 'rich-grandma-tycoon');
  firestore = getFirestore(app);
  return firestore;
}

export async function closeDatabase(): Promise<void> {
  if (!firestore) return;
  const current=firestore;
  firestore=undefined;
  await current.terminate();
}

export function setDatabaseForTests(fake: Firestore | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test database injection is disabled');
  firestore = fake;
}
