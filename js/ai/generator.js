/* ════════════════════════════════════════════════════════════════════
   ai/generator.js
   Main AI generation entry — abort, cooldown, generateAIReport, _personaliseReport, _callAPIWithStream.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { _CLIENT_RL, _AI_QUEUE, _fetchWithRetry } from './rate-limit.js';
import { buildReportPrompt } from './prompt.js';
import { _showPill, _hidePill, _updatePillMsg, _showToast } from './pill.js';
import { _buildFallbackReport } from './fallback.js';
import { renderAIReport, showAIError, showAILoading } from './render.js';

var _aiAbortCtrl  = null;

/* ── Save report + assessments to server-side SQLite ────────────────
   Called after window._lastAIReport is set (both AI + fallback paths).
   POSTs registration + per-module raw answers/scores + the report
   text to /api/save-report. Fire-and-forget — a save failure must
   never block the user from seeing or downloading their report.

   We capture the sessionId at trigger time, since the user could
   theoretically start a new session before this fires.
──────────────────────────────────────────────────────────────────── */
function _saveReportToServer(report) {
  const expectedSessionId = (typeof S !== 'undefined' && S.sessionId) ? S.sessionId : null;
  if (!expectedSessionId) {
    console.warn('[Save] No sessionId — skipping server save');
    return;
  }

  // Build the per-module assessments payload from the global state.
  const cpi  = S.cpi;
  const sea  = S.sea;
  const nmap = S.nmap;
  const daab = S.daab;
  const st   = S.student;

  const assessments = {
    cpi:  { raw_answers: cpi.answers,  scores: cpi.scores,  duration: cpi.duration  || 0 },
    sea:  { raw_answers: sea.answers,  scores: sea.scores,  duration: sea.duration  || 0 },
    nmap: { raw_answers: nmap.answers, scores: nmap.scores, duration: nmap.duration || 0 },
  };
  ['va','pa','na','lsa','hma','ar','ma','sa'].forEach(function(k) {
    if (daab[k]) {
      assessments['daab_' + k] = {
        raw_answers: daab[k].answers,
        scores:      daab[k].scores,
        duration:    daab[k].duration || 0,
      };
    }
  });

  const payload = {
    sessionId:   expectedSessionId,
    student:     st || {},
    assessments: assessments,
    report:      report || null,
  };

  fetch('/api/save-report', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
    .then(function(r) {
      if (!r.ok) console.warn('[Save] server error:', r.status);
      else       console.log('[Save] ✅  report + assessments saved');
    })
    .catch(function(e) { console.warn('[Save] failed:', e.message); });
}

/* ── Request lock — true while a generation is in-flight ──
   Exported as an object so render.js can mutate .value across the
   module boundary (imported primitives are read-only bindings). ── */
const _aiState = { generating: false };

/* ── Cancel an in-flight report generation ── */
function cancelReport() {
  if (_aiAbortCtrl) { _aiAbortCtrl.abort(); }
  _aiState.generating = false;
  _hidePill();
  // Restore idle UI so the user can try again
  document.getElementById('ai-report-idle').style.display    = 'block';
  document.getElementById('ai-report-loading').style.display = 'none';
  document.getElementById('ai-report-error').style.display   = 'none';
  document.getElementById('ai-report-output').style.display  = 'none';
  const genBtn    = document.getElementById('ai-report-btn');
  const cancelBtn = document.getElementById('ai-cancel-btn');
  if (genBtn)    { genBtn.disabled = false; genBtn.style.display    = 'inline-flex'; genBtn.style.opacity = '1'; }
  if (cancelBtn) { cancelBtn.style.display = 'none'; }
}

/* ── Cooldown countdown: updates error message with remaining seconds ── */
function _startCooldownCountdown(waitMs) {
  const btn = document.getElementById('ai-report-btn');
  const msgEl = document.getElementById('ai-error-msg');
  if (!msgEl || !btn) return;

  const endTime = Date.now() + waitMs;
  btn.disabled = true; btn.style.opacity = '.45'; btn.style.cursor = 'not-allowed';

  const tick = setInterval(function() {
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(tick);
      btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
      if (msgEl) msgEl.textContent = 'You can generate a new report now.';
      return;
    }
    if (msgEl) msgEl.textContent = `Please wait ${remaining} second${remaining !== 1 ? 's' : ''} before generating another report.`;
  }, 1000);
}

/* ── Main entry point ── */
async function generateAIReport() {
  // ── DUPLICATE-REQUEST LOCK ──────────────────────────────────────
  // If a generation is already running, ignore the click entirely.
  // This prevents multiple simultaneous OpenAI calls from rapid
  // button presses, page focus-regain events, or keyboard repeat.
  if (_aiState.generating) { return; }

  // ── CLIENT-SIDE RATE LIMIT ──────────────────────────────────────
  const rlCheck = _CLIENT_RL.check();
  if (!rlCheck.allowed) {
    showAIError(rlCheck.message);
    // If there's a cooldown, start a countdown so the user knows when to retry.
    if (rlCheck.reason === 'cooldown' && rlCheck.waitMs > 0) {
      _startCooldownCountdown(rlCheck.waitMs);
    }
    return;
  }
  // ───────────────────────────────────────────────────────────────

  _aiState.generating = true;

  const cpi  = S.cpi.scores;
  const sea  = S.sea.scores;
  const nmap = S.nmap.scores;
  const daab = S.daab;
  const st   = S.student;

  if (!cpi || !sea || !nmap) {
    _aiState.generating = false;
    showAIError('Assessment data is incomplete. Please complete all modules before generating the report.');
    return;
  }

  // Abort any lingering previous request (safety net for edge cases)
  if (_aiAbortCtrl) { _aiAbortCtrl.abort(); }
  _aiAbortCtrl = new AbortController();
  const signal = _aiAbortCtrl.signal;

  // ── Build DAAB payload (only completed sub-tests) ──
  const daabSubs = ['va','pa','na','lsa','hma','ar','ma','sa'];
  const daabPayload = {};
  daabSubs.forEach(function(k) {
    if (daab[k] && daab[k].scores) {
      daabPayload[k] = {
        raw: daab[k].scores.raw, max: daab[k].scores.max,
        stanine: daab[k].scores.stanine, label: daab[k].scores.label
      };
    }
  });

  const stNorm = {
    fullName: st.fullName, firstName: st.firstName, lastName: st.lastName || '',
    gender: st.gender || 'Not specified', age: st.age || null,
    school: st.school, student_class: st.class, section: st.section || null
  };

  const prompt = buildReportPrompt(stNorm, cpi, sea, nmap, daabPayload);

  showAILoading(true);
  _showPill('Generating your report…');

  const loadingMsgs = [
    'Reading your career interest profile\u2026',
    'Analysing your personality dimensions\u2026',
    'Reviewing your SEL readiness data\u2026',
    'Cross-referencing aptitude scores\u2026',
    'Writing your personalised report\u2026',
    'Almost ready\u2026',
  ];
  let msgIdx = 0;
  const msgInterval = setInterval(function() {
    msgIdx = (msgIdx + 1) % loadingMsgs.length;
    const el = document.getElementById('ai-loading-msg');
    if (el) el.textContent = loadingMsgs[msgIdx];
    _updatePillMsg(loadingMsgs[msgIdx]); // keep pill in sync
  }, 2200);

  try {
    // ── Enqueue so we don't exceed concurrency limit ──
    const raw = await _AI_QUEUE.enqueue(function() {
      return _callAPIWithStream(prompt, st.firstName, signal);
    });

    clearInterval(msgInterval);
    if (signal.aborted) { _aiState.generating = false; _hidePill(); return; }

    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    let report;
    try { report = JSON.parse(cleaned); }
    catch(e) { throw new Error('Could not parse the AI response. Please try again.'); }

    if (!report || typeof report !== 'object') {
      throw new Error('AI returned an unexpected format. Please try again.');
    }

    window._lastAIReport = _personaliseReport(report, stNorm.firstName, stNorm.fullName);
    _CLIENT_RL.record();   // count this successful generation
    _hidePill();
    renderAIReport(window._lastAIReport);
    _showToast(stNorm.firstName); // notify user report is ready
    _saveReportToServer(window._lastAIReport); // persist registration + assessments + report to SQLite

  } catch (err) {
    clearInterval(msgInterval);

    // ── User cancelled — exit quietly ────────────────────────────────
    // We accept any of: AbortError, signal.aborted=true (the abort fired
    // but the underlying error was a downstream side-effect like
    // "Reader released"), or an explicit cancel-shaped message. This
    // covers the case where reader.cancel() throws something other than
    // a clean AbortError.
    if (err.name === 'AbortError' || (signal && signal.aborted)) {
      _aiState.generating = false;
      _hidePill();
      return;
    }

    // ── Auth / config errors — cannot fallback, show immediately ─────
    const isAuthErr = err.message && (
      err.message.includes('401') ||
      /api key|authentication|incorrect api key/i.test(err.message)
    );
    if (isAuthErr) {
      showAILoading(false);
      _hidePill();
      showAIError('Invalid or missing API key. Please check your configuration.');
      console.error('[AI Report]', err);
      return;
    }
    console.warn('[AI Report] Switching to rule-based fallback due to:', err.message);
    try {
      const fallbackReport = _buildFallbackReport(stNorm, cpi, sea, nmap, daabPayload);
      window._lastAIReport = _personaliseReport(fallbackReport, stNorm.firstName, stNorm.fullName);
      _hidePill();
      renderAIReport(window._lastAIReport);
      _showToast(stNorm.firstName);
      _saveReportToServer(window._lastAIReport); // persist registration + assessments + fallback report to SQLite
      setTimeout(function() {
        const outEl = document.getElementById('ai-report-output');
        if (!outEl) return;
        const notice = document.createElement('div');
        notice.style.cssText = 'background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 16px;margin-bottom:1.25rem;font-size:13px;color:#92400e;font-family:Poppins,sans-serif;display:flex;align-items:flex-start;gap:10px';
        notice.innerHTML = '<span style="font-size:16px;flex-shrink:0">⚡</span>' +
          '<div><strong>Instant Report</strong> — The AI service is temporarily busy. ' +
          'This report was generated instantly from your score data. ' +
          '<button onclick="generateAIReport()" style="background:none;border:none;color:#b45309;font-weight:700;cursor:pointer;padding:0;font-size:13px;text-decoration:underline">Regenerate with AI</button> when ready.</div>';
        outEl.insertBefore(notice, outEl.firstChild);
      }, 100);
    } catch (fallbackErr) {
      // Fallback itself failed — this is extremely unlikely but handle it
      showAILoading(false);
      _hidePill();
      showAIError('Unable to generate your report right now. Please try again in a moment.');
      console.error('[AI Report] Fallback also failed:', fallbackErr);
    }

  } finally {
    // Safety net: if the lock is somehow still held after the try/catch
    // resolves (e.g. an unhandled early return), release it now so the
    // button is never permanently stuck in a disabled state.
    if (_aiState.generating) { _aiState.generating = false; }
    _hidePill(); // always clean up the pill
  }
}

function _personaliseReport(report, firstName, fullName) {
  if (!report || typeof report !== 'object') return report;

  function sub(text) {
    if (typeof text !== 'string') return text;
    // __FULL_NAME__ first (longer), then __FIRST_NAME__.
    // \b boundaries mirror the server anonymiser so compound-name
    // placeholders restore cleanly without partial-word artifacts.
    return text
      .replace(/\b__FULL_NAME__\b/g,  fullName  || firstName || '')
      .replace(/\b__FIRST_NAME__\b/g, firstName || '');
  }

  const TEXT_FIELDS = [
    'holistic_summary', 'aptitude_profile', 'interest_profile',
    'internal_motivators', 'personality_profile', 'wellbeing_guidance',
    'stream_advice',
  ];

  const out = Object.assign({}, report);
  TEXT_FIELDS.forEach(function(f) { if (out[f]) out[f] = sub(out[f]); });

  if (Array.isArray(out.career_table)) {
    out.career_table = out.career_table.map(function(row) {
      if (!row || typeof row !== 'object') return row;
      return Object.assign({}, row, {
        rationale: sub(row.rationale),
        career:    sub(row.career),    // handles unlikely but possible name in career title
      });
    });
  }

  return out;
}

async function _callAPIWithStream(prompt, firstName, signal) {
  const systemPrompt = 'You are an expert educational psychologist and career counsellor writing warm, personalised assessment reports for students (Grades 9-12), their parents, and school counsellors. Be specific, data-grounded, and motivational. Return only valid JSON — no markdown, no preamble.';

  const response = await _fetchWithRetry('/api/ai-report', {
    method: 'POST',
    signal: signal,
    headers: {
      'Content-Type':   'application/json',
      'X-Session-ID':   (typeof S !== 'undefined' && S.sessionId) ? S.sessionId : '',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.65,
      max_tokens: 6000,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: prompt        },
      ],
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(function() { return {}; });
    throw new Error(errJson && errJson.error && errJson.error.message ? errJson.error.message : 'API error ' + response.status);
  }

  if (response.headers.get('X-Cache') === 'HIT') {
    const json = await response.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content : null;
    if (content) {
      console.log('[AI] Served from server cache');
      const el = document.getElementById('ai-loading-msg');
      if (el) el.textContent = 'Loading your report…';
      _updatePillMsg('Loading your report…');
      return content;
    }
  }
  // ─────────────────────────────────────────────────────────────────

  // ── Read SSE stream and accumulate content ──
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer      = '';

  // If the user cancels mid-stream, abort the reader so the while loop
  // exits with an AbortError rather than hanging until the server closes.
  // Without this, cancel falls through to the catch block in
  // generateAIReport which currently routes non-abort errors into the
  // rule-based fallback — i.e. user clicks Cancel and gets a fallback
  // report anyway. We propagate AbortError instead.
  const onAbort = () => {
    try { reader.cancel(); } catch (_) {}
  };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal && signal.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;

        try {
          const parsed = JSON.parse(payload);
          const delta  = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content
            ? parsed.choices[0].delta.content : '';
          accumulated += delta;

          // Show live progress every ~80 chars
          if (accumulated.length % 80 < delta.length) {
            const progressMsg = 'Writing report… (' + Math.round(accumulated.length / 50) + ' sections done)';
            const el = document.getElementById('ai-loading-msg');
            if (el) el.textContent = progressMsg;
            _updatePillMsg(progressMsg);
          }
        } catch(e) { /* ignore malformed SSE chunks */ }
      }
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  return accumulated;
}


export { _aiAbortCtrl, _aiState, cancelReport, _startCooldownCountdown, generateAIReport, _personaliseReport, _callAPIWithStream };
