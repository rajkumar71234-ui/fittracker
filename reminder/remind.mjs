// Meal reminders — run by GitHub Actions at 9:00 AM, 1:00 PM and 8:30 PM India time (free).
// For every user who turned reminders on: if that meal isn't logged today, send a phone notification.
import admin from 'firebase-admin';
import webpush from 'web-push';

const APP = 'https://rajkumar71234-ui.github.io/fittracker/';
const ADMIN = 'rajkumar71234@gmail.com';
const SLOTS = { breakfast: ['Breakfast', '🍳'], lunch: ['Lunch', '🍛'], dinner: ['Dinner', '🍲'] };

if (!process.env.FIREBASE_SA) { console.error('The FIREBASE_SA secret is missing — add it in GitHub → Settings → Secrets → Actions.'); process.exit(1); }
function readKey(raw) {
  let s = String(raw).replace(/^﻿/, '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  if (/^['"]/.test(s) && /['"]$/.test(s)) s = s.slice(1, -1).trim();
  const tries = [s];
  if (!s.startsWith('{')) { try { tries.push(Buffer.from(s, 'base64').toString('utf8').trim()); } catch (e) {} }
  const i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i > 0 && j > i) tries.push(s.slice(i, j + 1));
  for (const t of tries) { try { const o = JSON.parse(t); if (o && o.private_key && o.client_email) return o; } catch (e) {} }
  const kind = !s ? 'empty' : s[0] === '{' ? 'starts with { but is not a complete key file' : /^\d/.test(s) ? 'starts with a number' : 'does not start with {';
  console.error(`The FIREBASE_SA secret is not the Firebase key file (it is ${s.length} characters and ${kind}). Open the downloaded .json file, copy ALL of it (it starts with { and contains "private_key"), and paste it again into the secret.`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(readKey(process.env.FIREBASE_SA)) });
const db = admin.firestore();

const ist = new Date(Date.now() + 330 * 60000);
const date = ist.toISOString().slice(0, 10), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
const test = /^true$/i.test(process.env.TEST || '');
let slot = (process.env.SLOT || '').trim().toLowerCase();
if (!slot) slot = mins >= 480 && mins < 720 ? 'breakfast' : mins >= 750 && mins < 1020 ? 'lunch' : mins >= 1200 && mins < 1410 ? 'dinner' : '';

// push keys live in Firestore (only this server can read them); made once on the first run
const cfgRef = db.doc('config/push');
let cfg = (await cfgRef.get()).data();
if (!cfg || !cfg.publicKey || !cfg.privateKey) {
  const k = webpush.generateVAPIDKeys();
  cfg = { publicKey: k.publicKey, privateKey: k.privateKey, created: new Date().toISOString() };
  await cfgRef.set(cfg);
  console.log('Created new push keys.');
}
console.log('PUBLIC_KEY=' + cfg.publicKey);
if (!SLOTS[slot]) { console.log(`No reminder at this time (India ${date} ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}).`); process.exit(0); }
webpush.setVapidDetails(APP, cfg.publicKey, cfg.privateKey);

const [label, icon] = SLOTS[slot];
const payload = JSON.stringify({ title: `${icon} ${label} time`, body: `Please take your ${label.toLowerCase()}. Already eaten? Tap and tell me what you ate.`, slot, url: APP + '?talk=' + slot });
const users = await db.collection('users').where('remind.on', '==', true).get();
let sent = 0, skipped = 0, removed = 0;
for (const u of users.docs) {
  const x = u.data(), subs = Array.isArray(x.push) ? x.push : [];
  if (!subs.length) continue;
  if (test && x.email !== ADMIN) continue;                       // test run: only the admin's phone
  if (!test) {
    if ((x.remindSent || {})[slot] === date) { skipped++; continue; }            // already reminded today
    const day = (await u.ref.collection('days').doc(date).get()).data() || {};
    if ((day.meals || []).some(m => m.slot === slot)) { skipped++; continue; }  // meal already added
  }
  const keep = [];
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3 * 3600, urgency: 'high' }); keep.push(s); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) removed++;                // phone unsubscribed — forget it
      else { keep.push(s); console.log('Push failed:', e.statusCode, String(e.body || e.message).slice(0, 150)); }
    }
  }
  const upd = {};
  if (!test) upd[`remindSent.${slot}`] = date;
  if (keep.length !== subs.length) upd.push = keep;
  if (Object.keys(upd).length) await u.ref.update(upd);
}
console.log(`${label} ${date}: sent ${sent}, skipped ${skipped} (already eaten / already reminded), removed ${removed} old phones.`);
process.exit(0);
