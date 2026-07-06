// Firestore-backed reviews for the Firebase Hosting build. The 18k+ water
// bodies stay as bundled static JSON (read-only reference data); only the
// user-generated reviews live in Firestore, so they're shared across all
// visitors (unlike the localStorage reviews of the plain static build).
//
// The Firebase web config is a PUBLIC client identifier, not a secret — access
// is controlled by Firestore security rules (firestore.rules) and by the API
// key's HTTP-referrer restriction (locked to this app's domains). It's read from
// build-time env vars (client/.env.local) purely to keep literal values out of
// git so secret scanners stay quiet; copy client/.env.example to fill it in.

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import type { Review } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function fmt(ts: Timestamp | null): string {
  const d = ts ? ts.toDate() : new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** All published reviews for a water body, newest first. */
export async function getFirestoreReviews(waterbodyId: string): Promise<Review[]> {
  const q = query(collection(db, 'reviews'), where('waterbodyId', '==', waterbodyId));
  const snap = await getDocs(q);
  const rows: Review[] = snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id as unknown as number,
      author: String(d.author ?? ''),
      rating: Number(d.rating ?? 0),
      target_species: (d.target_species as string | null) ?? null,
      body: String(d.body ?? ''),
      created_at: fmt((d.created_at as Timestamp) ?? null),
    };
  });
  // Sort newest-first client-side (avoids needing a composite Firestore index).
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addFirestoreReview(
  waterbodyId: string,
  payload: { author: string; rating: number; target_species?: string; body: string },
): Promise<Review> {
  const ref = await addDoc(collection(db, 'reviews'), {
    waterbodyId,
    author: payload.author,
    rating: payload.rating,
    target_species: payload.target_species ?? null,
    body: payload.body,
    created_at: serverTimestamp(),
  });
  return {
    id: ref.id as unknown as number,
    author: payload.author,
    rating: payload.rating,
    target_species: payload.target_species ?? null,
    body: payload.body,
    created_at: fmt(null),
  };
}
