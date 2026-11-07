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
const forceSlot = (process.env.SLOT || '').trim().toLowerCase();       // manual run: 'setup' = only make keys
const DEF = { breakfast: '09:00', lunch: '13:00', dinner: '20:30' };
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const WINDOW = 180;                                                     // still remind up to 3 h late (GitHub can run late)

const cfgRef = db.doc('config/push');
let cfg = (await cfgRef.get()).data();
if (!cfg || !cfg.publicKey || !cfg.privateKey) {
  const k = webpush.generateVAPIDKeys();
  cfg = { publicKey: k.publicKey, privateKey: k.privateKey, created: new Date().toISOString() };
  await cfgRef.set(cfg);
  console.log('Created new push keys.');
}
console.log('PUBLIC_KEY=' + cfg.publicKey);
if (forceSlot === 'setup') { console.log('Setup only.'); process.exit(0); }
webpush.setVapidDetails(APP, cfg.publicKey, cfg.privateKey);

const payloadFor = slot => { const [label, icon] = SLOTS[slot]; return JSON.stringify({ title: `${icon} ${label} time`, body: `Please take your ${label.toLowerCase()}. Already eaten? Tap and tell me what you ate.`, slot, url: APP + '?talk=' + slot }); };
const users = await db.collection('users').where('remind.on', '==', true).get();
let sent = 0, skipped = 0, removed = 0, notDue = 0;
for (const u of users.docs) {
  const x = u.data(); let subs = Array.isArray(x.push) ? x.push : [];
  if (!subs.length) continue;
  if (test && x.email !== ADMIN) continue;                       // test run: only the admin's phone
  const times = Object.assign({}, DEF, (x.remind && x.remind.times) || {});
  let due = [];
  if (test) due = [SLOTS[forceSlot] ? forceSlot : 'lunch'];
  else for (const slot of Object.keys(SLOTS)) {
    const t = toMin(times[slot]) ?? toMin(DEF[slot]);
    if (SLOTS[forceSlot] && slot !== forceSlot) continue;
    if (mins < t || mins >= t + WINDOW) { notDue++; continue; }
    if ((x.remindSent || {})[slot] === date) { skipped++; continue; }
    due.push(slot);
  }
  if (!due.length) continue;
  let day = null;
  const upd = {};
  for (const slot of due) {
    if (!test) {
      if (day === null) day = (await u.ref.collection('days').doc(date).get()).data() || {};
      upd[`remindSent.${slot}`] = date;                                          // checked for today
      if ((day.meals || []).some(m => m.slot === slot)) { skipped++; continue; } // meal already added
    }
    const keep = [];
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payloadFor(slot), { TTL: 3 * 3600, urgency: 'high' }); keep.push(s); sent++; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) removed++;              // phone unsubscribed — forget it
        else { keep.push(s); console.log('Push failed:', e.statusCode, String(e.body || e.message).slice(0, 150)); }
      }
    }
    if (keep.length !== subs.length) { subs = keep; upd.push = keep; }
  }
  if (Object.keys(upd).length) await u.ref.update(upd);
}
console.log(`India ${date} ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}: sent ${sent}, skipped ${skipped} (already eaten / already reminded), not due ${notDue}, removed ${removed} old phones.`);
process.exit(0);
