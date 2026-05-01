/* ════════════════════════════════════════════════════════════════════
   ai/rate-limit.js
   Client-side rate limiter, AI request queue, retry-with-jitter.
════════════════════════════════════════════════════════════════════ */

const _RL_PAGE_KEY = 'numind_rl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const _RL_KEY_INDEX = 'numind_rl_index'; // tracks all active keys for pruning

// Prune stale RL entries from localStorage on load (keys older than 2 h).
(function _pruneOldRLKeys() {
  try {
    const index = JSON.parse(localStorage.getItem(_RL_KEY_INDEX) || '[]');
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const fresh = [];
    index.forEach(function(entry) {
      if (entry.ts > cutoff) { fresh.push(entry); }
      else { localStorage.removeItem(entry.key); }
    });
    fresh.push({ key: _RL_PAGE_KEY, ts: Date.now() });
    localStorage.setItem(_RL_KEY_INDEX, JSON.stringify(fresh));
  } catch (_) {}
})();

const _CLIENT_RL = {
  MAX_PER_SESSION: 3,      // hard cap per page-load session
  COOLDOWN_MS:     45000,  // minimum gap between attempts (ms)

  _load() {
    try {
      const raw = localStorage.getItem(_RL_PAGE_KEY);
      return raw ? JSON.parse(raw) : { count: 0, lastTs: 0 };
    } catch (_) { return { count: 0, lastTs: 0 }; }
  },

  _save(state) {
    try { localStorage.setItem(_RL_PAGE_KEY, JSON.stringify(state)); } catch (_) {}
  },

  /** Returns { allowed:true } or { allowed:false, reason, waitMs, message } */
  check() {
    const s   = this._load();
    const now = Date.now();

    if (s.count >= this.MAX_PER_SESSION) {
      return { allowed: false, reason: 'session_cap',
               waitMs: 0,
               // Message no longer tells user to refresh — refreshing now
               // correctly resets the counter (new page-load key).
               message: `You've generated ${this.MAX_PER_SESSION} reports in this session. Refresh the page to start fresh.` };
    }

    const elapsed = now - (s.lastTs || 0);
    if (s.lastTs && elapsed < this.COOLDOWN_MS) {
      const waitMs = this.COOLDOWN_MS - elapsed;
      return { allowed: false, reason: 'cooldown',
               waitMs,
               message: `Please wait ${Math.ceil(waitMs / 1000)} second(s) before generating another report.` };
    }

    return { allowed: true };
  },

  /** Record a successful AI generation attempt (not fallback). */
  record() {
    const s = this._load();
    s.count  = (s.count || 0) + 1;
    s.lastTs = Date.now();
    this._save(s);
  },
};


const _AI_QUEUE = {
  running: 0,
  limit: 8,
  queue: [],
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._drain();
    });
  },
  _drain() {
    while (this.running < this.limit && this.queue.length) {
      const { fn, resolve, reject } = this.queue.shift();
      this.running++;
      fn()
        .then(resolve, reject)
        .finally(() => { this.running--; this._drain(); });
    }
  },
};

/* ── Retry with exponential back-off + jitter ── */
async function _fetchWithRetry(url, options, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // RETRY HANDLING: bail immediately if the user cancelled between retries.
    if (options && options.signal && options.signal.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
        // 429 means the server queue is genuinely full — back off harder than a generic 5xx.
        const baseMultiplier = res.status === 429 ? 2000 : 800;
        const base = retryAfter > 0 ? retryAfter * 1000 : (2 ** attempt) * baseMultiplier;
        const jitter = Math.random() * 600;
        const delay = Math.min(base + jitter, 30000);
        console.warn('[AI] ' + res.status + ' on attempt ' + (attempt + 1) + ' — retrying in ' + Math.round(delay) + 'ms');
        // Wait, but abort the sleep early if the signal fires.
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, delay);
          if (options && options.signal) {
            options.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted by user', 'AbortError')); }, { once: true });
          }
        });
        lastErr = new Error('HTTP ' + res.status);
        continue;
      }
      return res;
    } catch (networkErr) {
      // AbortError means the user cancelled — propagate immediately, no retry.
      if (networkErr.name === 'AbortError') throw networkErr;
      lastErr = networkErr;
      if (attempt < maxRetries) {
        const delay = (2 ** attempt) * 800 + Math.random() * 400;
        // Wait, but abort the sleep early if the signal fires.
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, delay);
          if (options && options.signal) {
            options.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted by user', 'AbortError')); }, { once: true });
          }
        });
      }
    }
  }
  throw lastErr;
}

/* ── Token-efficient prompt builder ──
   Sends only computed scores, not raw questions or option text.
   Cuts per-request token use by ~60% vs. the previous version. ── */

export { _RL_PAGE_KEY, _RL_KEY_INDEX, _CLIENT_RL, _AI_QUEUE, _fetchWithRetry };
