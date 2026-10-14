import { initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, getFirestore, collection, doc, addDoc, setDoc, onSnapshot, serverTimestamp, runTransaction, query, where, DEMO } from './backend.js';
import { firebaseConfig, SEASON } from './config.js';
import { asDate, isLocked, scoreOptions, standings, pointsFor } from './domain.js';

const db = getFirestore(initializeApp(firebaseConfig));
const auth = getAuth();
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user = null, admin = false, filter = 'upcoming', matches = [], picks = [], users = new Map();
let loaded = false, matchError = false;
const drafts = new Map(), saving = new Set();
const logos = {T1:'SKT',SKT:'SKT',GENG:'GenG',GEN:'GenG',G2:'G2',CFO:'CFO',KT:'KT',AL:'AL',FNC:'FNC',MKOI:'MKOI',TES:'TES','100T':'100T',BLG:'BLG',FLY:'FLY',HLE:'HLE',PSG:'PSG',SW:'SW',VKS:'VKS'};
const timeFormat = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'});
const dayFormat = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'});
$('timezone').textContent = `Times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
function message(text, error = false) { $('message').hidden = false; $('message').textContent = text; $('message').classList.toggle('error',error); }
async function attempt(action) { try { await action(); } catch(e) { message(e.code === 'permission-denied' ? 'This action was not permitted. Check that you are signed in and the Firebase rules are configured.' : (e.message || 'Something went wrong. Please try again.'),true); } }
$('sign-in').onclick = () => attempt(() => signInWithPopup(auth,new GoogleAuthProvider()));
$('sign-out').onclick = () => attempt(() => signOut(auth));
onAuthStateChanged(auth, async next => {
  user = next; admin = !!user; drafts.clear();
  $('sign-in').hidden = !!user; $('sign-out').hidden = !user;
  $('user-name').textContent = user?.displayName || '';
  render();
  if (!user) return;
  const uid = user.uid;
  await attempt(() => setDoc(doc(db,'users',uid), {uid,displayName:user.displayName || 'Player',updatedAt:serverTimestamp()}, {merge:true}));
});

// Date query also includes legacy manual matches without a season field.
const seasonQuery = query(collection(db,'matches'),where('startTime','>=',new Date(`${SEASON}-01-01T00:00:00Z`)),where('startTime','<',new Date(`${SEASON+1}-01-01T00:00:00Z`)));
onSnapshot(seasonQuery, snap => { matches = snap.docs.map(d => ({...d.data(),id:d.id})).sort((a,b) => +asDate(a.startTime)-+asDate(b.startTime)); loaded = true; matchError = false; render(); }, () => { loaded = true; matchError = true; render(); });
onSnapshot(collection(db,'picks'), snap => { picks = snap.docs.map(d => d.data()); render(); }, () => message('Predictions could not be loaded. Check your connection and Firebase read permissions.',true));
onSnapshot(collection(db,'users'), snap => { users = new Map(snap.docs.map(d => [d.id,d.data()])); render(); }, () => message('Player names could not be loaded.',true));
onSnapshot(doc(db,'system','sync'), snap => {
  const data = snap.data();
  $('sync-status').textContent = data?.lastSuccess && data.season === SEASON ? `Schedule checked ${asDate(data.lastSuccess).toLocaleString()}` : 'Community schedule · updated by friends';
}, () => { $('sync-status').textContent = 'Community schedule · updated by friends'; });
if (DEMO) {
  $('preview-banner').innerHTML = 'Design preview · fictional matches and sample players. Changes stay in this tab. <a href="./">Back to the real competition →</a>';
  $('sign-in').textContent = 'Try as a player';
}
document.querySelectorAll('[data-filter]').forEach(btn => btn.onclick = () => { filter = btn.dataset.filter; render(); });
// Update locks without replacing a focused control or a prediction being edited.
setInterval(() => { if (matches.some(m => document.querySelector(`[data-open="${CSS.escape(m.id)}"]`) && isLocked(m))) render(); },1000);

function logo(name, remote) {
  const key = name.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const fallback = `<span class="team-badge">${esc(key.slice(0,3))}</span>`;
  const url = typeof remote === 'string' && remote.startsWith('https://') ? remote : logos[key] ? `logos/${logos[key]}.png` : null;
  return url ? `<img class="logo" src="${esc(url)}" alt="" loading="lazy">` : fallback;
}
function ownPick(id) { return picks.find(p => p.matchId === id && p.userId === user?.uid); }
function render() {
  $('admin').hidden = !admin;
  const board = standings(matches,picks,users);
  const mine = picks.filter(p => p.userId === user?.uid && matches.some(m => m.id === p.matchId));
  $('stat-open').textContent = matches.filter(m => !isLocked(m)).length;
  $('upcoming-count').textContent = matches.filter(m => !m.result && m.status !== 'canceled').length;
  $('stat-picks').textContent = user ? mine.length : '—';
  $('stat-points').textContent = user ? (board.find(r => r.uid === user.uid)?.points || 0) : '—';
  $('stat-players').textContent = board.length;
  let rank = 0;
  $('leaderboard').innerHTML = board.length ? board.map((r,i) => { if (!i || r.points !== board[i-1].points) rank = i+1; return `<li class="${r.uid === user?.uid ? 'me' : ''}"><span class="rank">${rank}</span><span class="name">${esc(r.name)}${r.uid === user?.uid ? ' · you' : ''}</span><strong>${r.points} <small>pts</small></strong></li>`; }).join('') : '<li class="muted">The first prediction starts the competition.</li>';
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === filter)));
  const root = $('matches'); root.replaceChildren();
  if (!loaded) { root.innerHTML = '<div class="empty">Loading the match schedule…</div>'; return; }
  if (matchError) { root.innerHTML = '<div class="empty"><strong>Could not load matches</strong>Check your connection and reload. The schedule may require Firebase read permissions.</div>'; return; }
  if (filter === 'mine' && !user) { root.innerHTML = '<div class="empty"><strong>Your picks, all in one place.</strong>Sign in with Google above to get started.</div>'; return; }
  const visible = matches.filter(m => filter === 'mine' ? ownPick(m.id) : filter === 'results' ? m.result || m.status === 'canceled' : !m.result && m.status !== 'canceled');
  if (filter === 'results') visible.reverse();
  if (!visible.length) { root.innerHTML = `<div class="empty"><strong>${filter === 'results' ? 'The story is still being written.' : filter === 'mine' ? 'Your next great prediction starts here.' : 'Waiting for the next matchup.'}</strong>${filter === 'results' ? 'Finished matches will appear here with the results.' : filter === 'mine' ? 'Choose an upcoming match and save your pick.' : 'Worlds 2026 matches will appear when the schedule is added.'}</div>`; return; }
  let day = '';
  for (const match of visible) {
    const label = dayFormat.format(asDate(match.startTime));
    if (label !== day) { const heading = document.createElement('h3'); heading.className = 'day-heading'; heading.textContent = label; root.append(heading); day = label; }
    root.append(matchCard(match));
  }
}
function matchCard(m) {
  const card = document.createElement('article'); card.className = 'match';
  const locked = isLocked(m), saved = ownPick(m.id), draft = drafts.get(m.id) || {...saved};
  if (!locked) card.dataset.open = m.id;
  const series = m.series || 'BO1';
  const status = m.status === 'canceled' ? 'Canceled' : m.status === 'postponed' ? 'Postponed · picks paused' : m.result ? 'Final' : locked ? 'Locked · awaiting result' : 'Picks open';
  card.innerHTML = `<div class="match-top"><span>${timeFormat.format(asDate(m.startTime))} · ${esc(series)}${m.stage ? ` · ${esc(m.stage)}` : ''}</span><span class="badge ${locked ? '' : 'open'}">${status}</span></div><div class="teams"><div class="team">${logo(m.teamA,m.teamALogo)}<span>${esc(m.teamA)}</span></div><strong class="${m.resultScore ? 'result-score' : 'versus'}">${m.resultScore ? esc(m.resultScore.replace('-', ' : ')) : 'VS'}</strong><div class="team">${logo(m.teamB,m.teamBLogo)}<span>${esc(m.teamB)}</span></div></div>`;
  card.querySelectorAll('img').forEach(img => img.onerror = () => { const badge = document.createElement('span'); badge.className = 'team-badge'; badge.textContent = img.parentElement.textContent.trim().slice(0,3); img.replaceWith(badge); });
  if (!locked) {
    const controls = document.createElement('div');
    controls.innerHTML = `<div class="pick-options"><button data-pick="A" aria-pressed="${draft.pick === 'A'}">${esc(m.teamA)}</button><button data-pick="B" aria-pressed="${draft.pick === 'B'}">${esc(m.teamB)}</button></div><div class="pick-bottom">${series !== 'BO1' ? '<label>Exact score (optional)<select aria-label="Exact series score"></select></label>' : '<span class="muted">Pick the winning team</span>'}<button class="primary save">${user ? saved ? 'Update pick' : 'Save pick' : 'Sign in to save'}</button></div><p class="saved-note"></p>`;
    const select = controls.querySelector('select'), save = controls.querySelector('.save'), note = controls.querySelector('.saved-note');
    const refresh = () => {
      controls.querySelectorAll('[data-pick]').forEach(b => { b.setAttribute('aria-pressed',String(b.dataset.pick === draft.pick)); b.disabled = saving.has(m.id); });
      if (select) { select.innerHTML = '<option value="">Winner only</option>' + scoreOptions(series,draft.pick).map(s => `<option>${s}</option>`).join(''); select.value = draft.exactScore || ''; select.disabled = !draft.pick || saving.has(m.id); }
      save.disabled = saving.has(m.id); save.textContent = saving.has(m.id) ? 'Saving…' : user ? saved ? 'Update pick' : 'Save pick' : 'Sign in to save';
      note.textContent = drafts.has(m.id) ? 'Unsaved changes' : saved ? `Saved: ${saved.pick === 'A' ? m.teamA : m.teamB}${saved.exactScore ? ` · ${saved.exactScore}` : ''}` : 'Picks lock at the scheduled start time.';
    };
    controls.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { draft.pick = b.dataset.pick; draft.exactScore = null; drafts.set(m.id,draft); refresh(); });
    if (select) select.onchange = () => { draft.exactScore = select.value || null; drafts.set(m.id,draft); refresh(); };
    save.onclick = () => attempt(async () => {
      if (!user) { await signInWithPopup(auth,new GoogleAuthProvider()); return; }
      if (!draft.pick) { message('Choose a team first.'); return; }
      const uid = user.uid, userName = user.displayName || 'Player';
      saving.add(m.id); refresh();
      try {
        await runTransaction(db, async tx => {
          const latest = await tx.get(doc(db,'matches',m.id));
          if (!latest.exists() || isLocked(latest.data())) throw new Error('This match has locked. Your prediction was not changed.');
          if (latest.data().teamA !== m.teamA || latest.data().teamB !== m.teamB) throw new Error('The teams changed. Please review this matchup again.');
          tx.set(doc(db,'picks',`${uid}_${m.id}`),{userId:uid,userName,matchId:m.id,pick:draft.pick,exactScore:series === 'BO1' ? null : draft.exactScore || null,updatedAt:serverTimestamp()});
        });
        drafts.delete(m.id); message('Prediction saved. Good luck!');
      } finally { saving.delete(m.id); render(); }
    });
    refresh(); card.append(controls);
  } else {
    const text = document.createElement('p'); text.className = 'saved-note';
    text.textContent = m.status === 'canceled' ? 'Canceled matches do not count toward points.' : saved ? `Your pick: ${saved.pick === 'A' ? m.teamA : m.teamB}${saved.exactScore ? ` · ${saved.exactScore}` : ''}${m.result ? ` · +${pointsFor(m,saved)} points` : ''}` : 'You did not submit a prediction for this match.';
    card.append(text);
    const matchPicks = picks.filter(p => p.matchId === m.id);
    const details = document.createElement('details'); details.innerHTML = `<summary>Friends' predictions (${matchPicks.length})</summary>` + matchPicks.map(p => `<div class="friend-pick"><span>${esc(users.get(p.userId)?.displayName || p.userName || 'Player')}</span><span>${esc(p.pick === 'A' ? m.teamA : m.teamB)} ${esc(p.exactScore || '')}${m.result ? ` · +${pointsFor(m,p)}` : ''}</span></div>`).join(''); card.append(details);
  }
  if (admin) {
    const details = document.createElement('details');
    const outcomes = series === 'BO1' ? ['1-0','0-1'] : [...scoreOptions(series,'A'),...scoreOptions(series,'B')];
    details.innerHTML = `<summary>Manage result</summary><div class="admin-controls"><label>Final score<select><option value="">Choose result</option>${outcomes.map(s => `<option>${s}</option>`).join('')}<option value="clear">Clear result</option></select></label><button>Apply result</button></div><p class="muted">Manual changes pause automatic results for this match.</p>`;
    details.querySelector('button').onclick = () => attempt(async () => {
      const score = details.querySelector('select').value; if (!score) return;
      await setDoc(doc(db,'matches',m.id), {result:score === 'clear' ? null : Number(score.split('-')[0]) > Number(score.split('-')[1]) ? 'A' : 'B',resultScore:score === 'clear' ? null : score,status:score === 'clear' ? 'not_started' : 'finished',manualOverride:true},{merge:true}); message('Result updated.');
    }); card.append(details);
  }
  return card;
}
$('add-match').onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget, data = new FormData(form);
  attempt(async () => {
    const startTime = new Date(data.get('startTime'));
    if (startTime.getUTCFullYear() !== SEASON) throw new Error('Please choose a match date in Worlds 2026.');
    const teamA = data.get('teamA').trim(), teamB = data.get('teamB').trim();
    if (!teamA || !teamB || teamA === teamB) throw new Error('Enter two different teams.');
    await addDoc(collection(db,'matches'),{teamA,teamB,startTime,series:data.get('series'),season:SEASON,status:'not_started',result:null,resultScore:null,createdAt:serverTimestamp()}); form.reset(); message('Match added.');
  });
};
