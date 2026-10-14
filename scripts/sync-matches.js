import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { normalizeMatch, reconcile } from './normalize-match.js';

async function main() {
  const token = process.env.PANDASCORE_TOKEN;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const season = Number(process.env.WORLDS_SEASON || 2026);
  const ids = (process.env.PANDASCORE_TOURNAMENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (!token || !serviceAccount || !ids.length || ids.some(n => !Number.isSafeInteger(n) || n <= 0) || season !== 2026) throw new Error('Configure PANDASCORE_TOKEN, FIREBASE_SERVICE_ACCOUNT and Worlds 2026 PANDASCORE_TOURNAMENT_IDS first.');
  const account = JSON.parse(serviceAccount);
  if (account.project_id !== 'lol-gummis') throw new Error('Firebase credential must belong to lol-gummis');
  initializeApp({credential:cert(account)});
  const db = getFirestore();
  const converted = [];
  let skipped = 0, complete = false;
  for (let page=1;page<=100;page++) {
    const url = new URL('https://api.pandascore.co/lol/matches');
    url.search = new URLSearchParams({'filter[tournament_id]':ids.join(','),sort:'id',per_page:'100',page:String(page)});
    let response;
    for (let retry=0;retry<4;retry++) {
      response = await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
      if (response.ok || (response.status !== 429 && response.status < 500)) break;
      await new Promise(resolve => setTimeout(resolve,Math.min(30000,1000 * 2 ** retry)));
    }
    if (!response.ok) throw new Error(`PandaScore request failed (HTTP ${response.status}); no matches were written.`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected provider response');
    for (const row of rows) { const match = normalizeMatch(row,season,ids); if (match) converted.push(match); else skipped++; }
    if (rows.length < 100) { complete = true; break; }
  }
  if (!complete || !converted.length) throw new Error('Provider returned no usable matches or exceeded pagination limit; existing data left untouched.');
  // Validate the entire import before writing, and keep the season update atomic.
  if (converted.length > 450) throw new Error('Import exceeds safe transaction size');
  const unique = [...new Map(converted.map(m => [m.id,m])).values()];
  let written = 0;
  await db.runTransaction(async tx => {
    const refs = unique.map(m => db.doc(`matches/${m.id}`));
    const snapshots = await tx.getAll(...refs);
    const plan = unique.map((m,i) => reconcile(snapshots[i].exists ? snapshots[i].data() : null,m));
    written = 0;
    for (let i=0;i<plan.length;i++) {
      if (!plan[i]) continue;
      const {id,...data} = plan[i];
      tx.set(refs[i],{...data,syncedAt:FieldValue.serverTimestamp()},{merge:true}); written++;
    }
    tx.set(db.doc('system/sync'),{season,lastSuccess:FieldValue.serverTimestamp(),provider:'PandaScore',matches:written,skipped},{merge:true});
  });
  console.log(`Updated ${written} Worlds ${season} matches; ${skipped} await confirmed teams or dates.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
