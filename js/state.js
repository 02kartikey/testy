/* ════════════════════════════════════════════════════════════════════
   state.js
   Application state, server save helpers, and persistence helpers.

   Persistent storage moved from Supabase to a local SQLite DB on the
   server (see js/db.js + js/server.js). The DB object below is a thin
   wrapper that POSTs to the server's /api/save-registration endpoint;
   the server handles the actual DB write.
════════════════════════════════════════════════════════════════════ */

// Always "configured" now — the server owns the DB. Kept as a function
// rather than a constant `true` so callers depending on this name keep
// working with no behavioural surprises.
function _isConfigured() { return true; }

const DB = {

  async saveRegistration(student, sessionId) {
    try {
      const res = await fetch('/api/save-registration', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ student, sessionId }),
      });
      if (!res.ok) {
        const msg = await res.text();
        console.error('[DB] saveRegistration HTTP ' + res.status + ':', msg);
        return { data: null, error: { message: msg } };
      }
      const data = await res.json();
      console.log('[DB] Registration saved:', sessionId);
      return { data, error: null };
    } catch (err) {
      console.error('[DB] saveRegistration fetch failed:', err.message);
      return { data: null, error: { message: err.message } };
    }
  },

  // Kept as a stub for callers that still invoke it. Completion is now
  // recorded automatically by the server when /api/save-report fires.
  async markCompleted(sessionId) {
    return { data: null, error: null };
  },
};


const S = {
  student: {}, sessionId: null,
  cpi:  { answers: Array.from({length:20}, ()=>[]), scores: null, startTime: null, duration: 0, currentQ: 0 },
  sea:  { answers: new Array(60).fill(null), scores: null, startTime: null, duration: 0, currentPage: 0 },
  nmap: { answers: new Array(63).fill(null), scores: null, startTime: null, duration: 0, currentDim: 0 },
  daab: {
    va:  { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    pa:  { answers: new Array(50).fill(null), scores: null, startTime: null, duration: 0, currentPage: 0, timerStartedAt: null },
    na:  { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    lsa: { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    hma: { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    ar:  { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    ma:  { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    sa:  { answers: new Array(20).fill(null), scores: null, startTime: null, duration: 0, timerStartedAt: null },
    currentSub: 0,
  },
  timerInt: null,
};

const _SESSION_KEY = 'numind_session_v1';

function _saveSession(activePage) {
  try {
    const snap = {
      student:   S.student,
      sessionId: S.sessionId,
      cpi:  { answers: S.cpi.answers,  scores: S.cpi.scores,  duration: S.cpi.duration, currentQ: S.cpi.currentQ, startTime: S.cpi.startTime },
      sea:  { answers: S.sea.answers,  scores: S.sea.scores,  duration: S.sea.duration,  currentPage: S.sea.currentPage, startTime: S.sea.startTime },
      nmap: { answers: S.nmap.answers, scores: S.nmap.scores, duration: S.nmap.duration, currentDim: S.nmap.currentDim, startTime: S.nmap.startTime },
      daab: {
        va:  { answers: S.daab.va.answers,  scores: S.daab.va.scores,  duration: S.daab.va.duration,  currentPage: S.daab.va.currentPage  || 0, timerStartedAt: S.daab.va.timerStartedAt  || null },
        pa:  { answers: S.daab.pa.answers,  scores: S.daab.pa.scores,  duration: S.daab.pa.duration,  currentPage: S.daab.pa.currentPage  || 0, timerStartedAt: S.daab.pa.timerStartedAt  || null },
        na:  { answers: S.daab.na.answers,  scores: S.daab.na.scores,  duration: S.daab.na.duration,  currentPage: S.daab.na.currentPage  || 0, timerStartedAt: S.daab.na.timerStartedAt  || null },
        lsa: { answers: S.daab.lsa.answers, scores: S.daab.lsa.scores, duration: S.daab.lsa.duration, currentPage: S.daab.lsa.currentPage || 0, timerStartedAt: S.daab.lsa.timerStartedAt || null },
        hma: { answers: S.daab.hma.answers, scores: S.daab.hma.scores, duration: S.daab.hma.duration, currentPage: S.daab.hma.currentPage || 0, timerStartedAt: S.daab.hma.timerStartedAt || null },
        ar:  { answers: S.daab.ar.answers,  scores: S.daab.ar.scores,  duration: S.daab.ar.duration,  currentPage: S.daab.ar.currentPage  || 0, timerStartedAt: S.daab.ar.timerStartedAt  || null },
        ma:  { answers: S.daab.ma.answers,  scores: S.daab.ma.scores,  duration: S.daab.ma.duration,  currentPage: S.daab.ma.currentPage  || 0, timerStartedAt: S.daab.ma.timerStartedAt  || null },
        sa:  { answers: S.daab.sa.answers,  scores: S.daab.sa.scores,  duration: S.daab.sa.duration,  currentPage: S.daab.sa.currentPage  || 0, timerStartedAt: S.daab.sa.timerStartedAt  || null },
        currentSub: S.daab.currentSub,
      },
      activePage: activePage || null,
      savedAt: Date.now(),
    };
    localStorage.setItem(_SESSION_KEY, JSON.stringify(snap));
  } catch (e) {
    console.warn('[Session] Could not save snapshot:', e.message);
  }
}

function _clearSession() {
  try { localStorage.removeItem(_SESSION_KEY); } catch (_) {}
}

function _restoreSession() {
  try {
    const raw = localStorage.getItem(_SESSION_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap.savedAt || Date.now() - snap.savedAt > 4 * 60 * 60 * 1000) {
      _clearSession();
      return null;
    }
    S.student   = snap.student   || {};
    S.sessionId = snap.sessionId || null;

    if (snap.cpi) {
      if (Array.isArray(snap.cpi.answers)) {
        S.cpi.answers.splice(0, S.cpi.answers.length, ...snap.cpi.answers);
      }
      S.cpi.scores    = snap.cpi.scores    || null;
      S.cpi.duration  = snap.cpi.duration  || 0;
      S.cpi.startTime = snap.cpi.startTime || null;
      if (snap.cpi.currentQ != null) S.cpi.currentQ = snap.cpi.currentQ;
    }

    if (snap.sea) {
      if (Array.isArray(snap.sea.answers)) {
        S.sea.answers.splice(0, S.sea.answers.length, ...snap.sea.answers);
      }
      S.sea.scores      = snap.sea.scores      || null;
      S.sea.duration    = snap.sea.duration    || 0;
      S.sea.currentPage = snap.sea.currentPage || 0;
      S.sea.startTime   = snap.sea.startTime   || null;
    }
    
    if (snap.nmap) {
      if (Array.isArray(snap.nmap.answers)) {
        S.nmap.answers.splice(0, S.nmap.answers.length, ...snap.nmap.answers);
      }
      S.nmap.scores     = snap.nmap.scores     || null;
      S.nmap.duration   = snap.nmap.duration   || 0;
      S.nmap.currentDim = snap.nmap.currentDim || 0;
      S.nmap.startTime  = snap.nmap.startTime  || null;
    }

    if (snap.daab) {
      ['va','pa','na','lsa','hma','ar','ma','sa'].forEach(k => {
        if (!snap.daab[k]) return;
        if (Array.isArray(snap.daab[k].answers)) {
          S.daab[k].answers.splice(0, S.daab[k].answers.length, ...snap.daab[k].answers);
        }
        S.daab[k].scores   = snap.daab[k].scores   || null;
        S.daab[k].duration = snap.daab[k].duration || 0;
        if (snap.daab[k].currentPage != null) {
          S.daab[k].currentPage = snap.daab[k].currentPage;
        }
        if (snap.daab[k].timerStartedAt != null) {
          S.daab[k].timerStartedAt = snap.daab[k].timerStartedAt;
        }
      });
      S.daab.currentSub = snap.daab.currentSub || 0;
    }
    console.log('[Session] Restored from snapshot (page:', snap.activePage, ')');
    return snap.activePage || null;
  } catch (e) {
    console.warn('[Session] Could not restore snapshot:', e.message);
    _clearSession();
    return null;
  }
}

function saveState() {
  if (!S.sessionId) return;
  try {
    // timerInt is a live interval handle — don't serialise it
    const snapshot = JSON.parse(JSON.stringify({ ...S, timerInt: null }));
    // Stamp with savedAt so the boot-time sweeper can age out stale keys.
    snapshot._savedAt = Date.now();
    localStorage.setItem('nm_state_' + S.sessionId, JSON.stringify(snapshot));
    localStorage.setItem('nm_last_session', S.sessionId);
  } catch (e) {
    console.warn('[NM] saveState failed:', e);
  }
}

function loadState() {
  try {
    const sid = localStorage.getItem('nm_last_session');
    if (!sid) return false;
    const raw = localStorage.getItem('nm_state_' + sid);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // Merge into S — keep live references (timerInt stays null from parsed)
    Object.assign(S, parsed);
    S.timerInt = null; // always reset live timer handle
    return true;
  } catch (e) {
    console.warn('[NM] loadState failed (corrupt data?):', e);
    return false;
  }
}

function clearState() {
  try {
    const sid = localStorage.getItem('nm_last_session');
    if (sid) localStorage.removeItem('nm_state_' + sid);
    localStorage.removeItem('nm_last_session');
  } catch (e) {
    console.warn('[NM] clearState failed:', e);
  }
}

/* ── Sweep stale nm_state_* keys ─────────────────────────────────────
   Each saveState() call writes to a key namespaced by sessionId.
   clearState() only removes the *most recent* one, so on a shared/kiosk
   device, every restart leaves an orphaned snapshot behind. Without
   sweeping, localStorage fills its 5-10 MB quota over time and
   silently breaks new sessions (the next saveState throws QuotaExceeded).

   Strategy: at module load, iterate all keys matching nm_state_* and
   drop any whose embedded _savedAt is older than 4 hours, OR whose
   payload is unparseable. This runs once per page load — cheap.
─────────────────────────────────────────────────────────────────────*/
(function _sweepStaleNmStateKeys() {
  try {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    const lastSid = localStorage.getItem('nm_last_session');
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('nm_state_')) continue;
      // Never sweep the currently-tracked session — _restoreSession on
      // boot may still need it.
      if (lastSid && k === 'nm_state_' + lastSid) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) { toDelete.push(k); continue; }
        const parsed = JSON.parse(raw);
        // Old entries written before _savedAt was added will lack the
        // field — treat them as stale (this is a one-time migration).
        if (!parsed || typeof parsed._savedAt !== 'number' || parsed._savedAt < cutoff) {
          toDelete.push(k);
        }
      } catch (_) {
        // Corrupt JSON — drop it.
        toDelete.push(k);
      }
    }
    toDelete.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    if (toDelete.length) console.log(`[NM] Swept ${toDelete.length} stale nm_state_* key(s)`);
  } catch (e) {
    // localStorage might be unavailable (private mode, etc.) — silently skip.
    console.warn('[NM] sweep failed:', e && e.message);
  }
})();

export { _isConfigured, DB, S, _SESSION_KEY, _saveSession, _clearSession, _restoreSession, saveState, loadState, clearState };
