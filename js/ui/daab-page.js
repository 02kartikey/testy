/* ════════════════════════════════════════════════════════════════════
   ui/daab-page.js
   DAAB sub-test rendering, timers, navigation, results, AR/MA/SA renderers.
════════════════════════════════════════════════════════════════════ */

import { S, saveState, _saveSession } from '../state.js';
import { DAAB_SUBS, DAAB_KEYS, DAAB_VA_QS, DAAB_PA_QS, DAAB_NA_QS, DAAB_LSA_QS, DAAB_HMA_QS, scoreDAAB, getStanine, stanineLabel, DAAB_AR_QS, DAAB_MA_QS, DAAB_SA_ROW_IMAGES, DAAB_SA_QS } from '../engine/daab.js';
import { goPage, PIP_IDX } from '../router.js';

/* ── DAAB Timer ── */
let daabTimerInt = null;
let daabSecondsLeft = 0;

function startDaabTimer(seconds, onExpire) {
  if (daabTimerInt) clearInterval(daabTimerInt);
  daabSecondsLeft = seconds;
  updateDaabTimerDisplay();
  daabTimerInt = setInterval(() => {
    daabSecondsLeft--;
    updateDaabTimerDisplay();
    if (daabSecondsLeft <= 0) {
      clearInterval(daabTimerInt);
      onExpire();
    }
  }, 1000);
}

function stopDaabTimer(mod) {
  clearInterval(daabTimerInt); daabTimerInt = null;
  mod.duration = mod.startTime ? Math.floor((Date.now() - mod.startTime) / 1000) : 0;
}

/* ── clearDaabTimer ───────────────────────────────────────────────────
   Bare timer-stop for callers (e.g., router.navLogoClick) that need to
   abandon the test without recording duration on a specific sub-test.
   Use stopDaabTimer(mod) when you also want to update mod.duration.
─────────────────────────────────────────────────────────────────────*/
function clearDaabTimer() {
  if (daabTimerInt) clearInterval(daabTimerInt);
  daabTimerInt = null;
}

function updateDaabTimerDisplay() {
  // Update in-content timer (old id kept for back-compat if any renderer still uses it)
  const el = document.getElementById('daab-timer-val');
  // Update sidebar timer
  const sideEl = document.getElementById('daab-timer-display');
  const m = Math.floor(daabSecondsLeft / 60);
  const s = daabSecondsLeft % 60;
  const txt = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  const urgentClass = daabSecondsLeft <= 30 ? ' urgent' : '';
  if (el) { el.textContent = txt; el.className = 'daab-timer-val' + urgentClass; }
  if (sideEl) { sideEl.textContent = txt; sideEl.className = 'timer-val daab-timer-val' + urgentClass; }
}

function startDAAB() {
  // If answers already exist (session restore), resume — don't wipe progress.
  const resumingDaab = ['va','pa','na','lsa','hma','ar','ma','sa'].some(k => S.daab[k].answers.some(a => a !== null));
  if (!resumingDaab) {
    S.daab.currentSub = 0;
    ['va','pa','na','lsa','hma','ar','ma','sa'].forEach(k => {
      S.daab[k].answers = new Array(DAAB_KEYS[k].length).fill(null);
      S.daab[k].scores = null; S.daab[k].startTime = null; S.daab[k].duration = 0; S.daab[k].timerStartedAt = null;
    });
    S.daab.pa.currentPage = 0;
    S.daab.va.currentPage = 0;
    S.daab.na.currentPage = 0;
    S.daab.lsa.currentPage = 0;
    S.daab.hma.currentPage = 0;
    S.daab.ar.currentPage = 0;
    S.daab.ma.currentPage = 0;
  }
  // Make page visible first so getElementById works, then render
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-daab').classList.add('active');
  window.scrollTo(0, 0);
  // Update pip trail + connectors
  const a = PIP_IDX['daab'] ?? 0;
  for (let i = 0; i < 6; i++) {
    const p = document.getElementById('pip' + i);
    if (!p) continue;
    p.classList.remove('now','done');
    if (i < a) p.classList.add('done');
    else if (i === a) p.classList.add('now');
  }
  for (let i = 0; i < 5; i++) {
    const c = document.getElementById('con' + i);
    if (c) c.classList.toggle('done', i < a);
  }
  renderDAABSideNav();
  renderDAABSub(S.daab.currentSub || 0, resumingDaab); // skipTimer when resuming
  // Save AFTER renderDAABSub so timerStartedAt is captured in the snapshot.
  _saveSession('daab');
}


function renderDAABSideNav() {
  const nav = document.getElementById('daab-subnav');
  if (!nav) return;
  nav.innerHTML = DAAB_SUBS.map((sub, i) => {
    const cur = S.daab.currentSub;
    const isDone   = i < cur;
    const isActive = i === cur;
    const cls = isDone ? 'done' : isActive ? 'active' : '';
    return `<div class="daab-sub-btn ${cls}">
      <div class="daab-sub-num">${isDone ? '✓' : sub.emoji}</div>
      <span class="daab-sub-label">${sub.abbr} — ${sub.label.split(' ')[0]}</span>
      ${isDone ? '<span class="dsb-check" style="color:var(--m4)">✓</span>' : ''}
    </div>`;
  }).join('');
  _updateDaabSidebarOverall();
}

function renderDAABSub(idx, skipTimer) {
  S.daab.currentSub = idx;
  renderDAABSideNav();
  renderDAABMobileNav();
  const sub = DAAB_SUBS[idx];
  const mod = S.daab[sub.key];
  if (!skipTimer) {
    mod.startTime = Date.now();
    mod.timerStartedAt = Date.now(); // wall-clock anchor for refresh-resume
  }

  const area = document.getElementById('daab-subtest-area');
  if (!area) return;

  if (sub.key === 'va') renderVA(area, sub, mod);
  else if (sub.key === 'pa') renderPA(area, sub, mod);
  else if (sub.key === 'na') renderNA(area, sub, mod);
  else if (sub.key === 'lsa') renderMCQ(area, sub, mod, DAAB_LSA_QS);
  else if (sub.key === 'hma') renderMCQ(area, sub, mod, DAAB_HMA_QS);
  else if (sub.key === 'ar')  renderAR(area, sub, mod);
  else if (sub.key === 'ma')  renderMA(area, sub, mod);
  else if (sub.key === 'sa')  renderSA(area, sub, mod);

  if (!skipTimer) {
    startDaabTimer(sub.time, () => advanceDAABSub(sub.key));
  } else {

    const elapsed = (mod.timerStartedAt && isFinite(mod.timerStartedAt))
      ? Math.floor((Date.now() - mod.timerStartedAt) / 1000)
      : 0;
    const remaining = Math.max(sub.time - elapsed, 0);
    const MIN_GRACE_SECONDS = 10;

    if (remaining <= 0 && mod.timerStartedAt && isFinite(mod.timerStartedAt)) {

      console.log(`[DAAB] Timer expired during refresh for ${sub.key} — auto-advancing after grace period.`);
      startDaabTimer(MIN_GRACE_SECONDS, () => advanceDAABSub(sub.key));
    } else {
      const resumeFrom = Math.max(remaining > 0 ? remaining : sub.time, MIN_GRACE_SECONDS);
      startDaabTimer(resumeFrom, () => advanceDAABSub(sub.key));
    }
  }
}

function renderDAABMobileNav() {
  const el = document.getElementById('daab-mobile-subnav');
  if (!el) return;
  const cur = S.daab.currentSub;
  el.innerHTML = DAAB_SUBS.map((sub, i) => {
    const isDone = i < cur;
    const isActive = i === cur;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
      <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;
        background:${isDone?'var(--m4)':isActive?'var(--m4l)':'var(--bg3)'};
        border:2px solid ${isDone||isActive?'var(--m4)':'var(--border2)'};
        color:${isDone?'#fff':isActive?'var(--m4)':'var(--ink4)'}">
        ${isDone?'✓':sub.emoji}
      </div>
      <div style="font-size:9px;font-weight:700;color:${isActive?'var(--m4)':'var(--ink4)'};letter-spacing:.03em">${sub.abbr}</div>
    </div>`;
  }).join('');
}

function advanceDAABSub(key) {
  const idx = DAAB_SUBS.findIndex(s => s.key === key);
  stopDaabTimer(S.daab[key]);
  if (idx + 1 < DAAB_SUBS.length) {
    const next = DAAB_SUBS[idx + 1];
    const area = document.getElementById('daab-subtest-area');
    if (area) {
      area.innerHTML = `<div style="text-align:center;padding:4rem 1rem">
        <div style="font-size:52px;margin-bottom:1rem">✅</div>
        <h2 style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;margin-bottom:.5rem">${DAAB_SUBS[idx].label} complete!</h2>
        <p style="color:var(--ink3);margin-bottom:2rem">Next: <strong>${next.emoji} ${next.label}</strong></p>
        <div style="color:var(--ink4);font-size:13px">Starting in a moment…</div>
      </div>`;
    }
    window.scrollTo(0, 0);
    renderDAABSideNav();
    setTimeout(() => { renderDAABSub(idx + 1); window.scrollTo(0, 56); }, 1500);
  } else {
    finishDAAB();
  }
}

async function finishDAAB() {
  scoreDAAB();
  _saveSession('transition2');
  goPage('transition2');
}

/* ── Header helper ── */
function daabHeader(sub, mod) {
  const done = mod.answers.filter(a => a !== null).length;
  const pct = Math.round(done / mod.answers.length * 100);
  return `
    <div class="daab-hdr">
      <div class="daab-hdr-top">
        <div class="daab-hdr-inner">
          <div class="daab-hdr-icon">${sub.emoji}</div>
          <div>
            <div class="daab-hdr-title">${sub.label}</div>
            <div class="daab-hdr-sub">${sub.total} questions · ${sub.time/60} min timed</div>
          </div>
        </div>
        <span class="daab-mod-badge">Module 2 · DAAB</span>
      </div>
    </div>
    <div class="daab-progress">
      <div class="daab-prog-row">
        <span class="eyebrow">Progress</span>
        <span class="daab-prog-pct" id="daab-prog-pct">${pct}%</span>
      </div>
      <div class="daab-prog-track"><div class="daab-prog-fill" id="daab-prog-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function updateDaabProgress(mod) {
  const done = mod.answers.filter(a => a !== null).length;
  const pct = Math.round(done / mod.answers.length * 100);
  const fill = document.getElementById('daab-prog-fill');
  if (fill) fill.style.width = pct + '%';
  const pctEl = document.getElementById('daab-prog-pct');
  if (pctEl) pctEl.textContent = pct + '%';
  // update sidebar overall bar
  _updateDaabSidebarOverall();
  // Persist answers after every DAAB selection
  _saveSession('daab');
}

function _updateDaabSidebarOverall() {
  const totalAns = DAAB_SUBS.reduce((acc, s) => acc + S.daab[s.key].answers.filter(a=>a!==null).length, 0);
  const totalQ   = DAAB_SUBS.reduce((acc, s) => acc + s.total, 0);
  const pct = Math.round(totalAns / totalQ * 100);
  const bar = document.getElementById('daab-overall-bar');
  const txt = document.getElementById('daab-overall-pct');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = pct + '%';
}

/* ══ VA Renderer (paginated: 10 per page) ══ */
function renderVA(area, sub, mod) {
  const opts4 = ['A','B','C','D'];
  const opts5 = ['A','B','C','D','E'];
  if (mod.currentPage === undefined) mod.currentPage = 0;

  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageQs = DAAB_VA_QS.slice(start, end);
    const done = mod.answers.filter(a=>a!==null).length;

    // Page pills
    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < 2; p++) {
      const pDone = mod.answers.slice(p*10, p*10+10).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    const instrMap = { 0: '📖 <strong>Q1–5:</strong> Find the SYNONYM of the capitalised word. &nbsp; <strong>Q6–10:</strong> Find the ANTONYM.', 1: '📖 <strong>Q11–15:</strong> Find the grammatically incorrect part. &nbsp; <strong>Q16–20:</strong> Find the meaning of the proverb.' };

    let cardsHtml = pageQs.map((q, li) => {
      const i = start + li;
      const sel = mod.answers[i];
      const letters = q.opts.length === 5 ? opts5 : opts4;
      const optsHtml = q.opts.map((o, oi) => `
        <div class="daab-opt ${sel===oi?'selected':''}" onclick="daabVASel(${i},${oi})">
          <span class="daab-opt-ltr">${letters[oi]}</span>${o}
        </div>`).join('');
      return `<div class="daab-qcard" id="vacard-${i}">
        <div class="daab-qnum">Q${i+1} · Part ${q.part}</div>
        ${q.instr ? `<div style="font-size:12px;color:var(--ink3);margin-bottom:5px">${q.instr}</div>` : ''}
        ${q.word ? `<div style="font-size:17px;font-weight:800;color:var(--m4);margin-bottom:.5rem;letter-spacing:.04em">${q.word}</div>` : ''}
        ${q.sentence ? `<div style="font-size:13px;color:var(--ink2);margin-bottom:.5rem;font-style:italic">"${q.sentence}"</div>` : ''}
        <div class="daab-opts">${optsHtml}</div>
      </div>`;
    }).join('');

    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    const isLast = pg === 1;

    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">${instrMap[pg]}</div>` +
      pillsHtml + cardsHtml +
      `<div class="daab-warn" id="va-warn">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill">${done}/20 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabVANext()">
          ${isLast ? 'Submit VA →' : 'Next Page →'}
        </button>
      </div>`;
    window.scrollTo(0, 56);
  }

  window.daabVANext = () => {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    if (pageDone < 10) {
      const w = document.getElementById('va-warn');
      if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    if (pg === 1) { advanceDAABSub('va'); return; }
    mod.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  window.daabVASel = (qi, oi) => {
    mod.answers[qi] = oi;
    updateDaabProgress(mod);
    const card = document.getElementById('vacard-' + qi);
    if (card) {
      const q = DAAB_VA_QS[qi];
      const letters = q.opts.length === 5 ? opts5 : opts4;
      card.querySelector('.daab-opts').innerHTML = q.opts.map((o, oi2) => `
        <div class="daab-opt ${oi2===oi?'selected':''}" onclick="daabVASel(${qi},${oi2})">
          <span class="daab-opt-ltr">${letters[oi2]}</span>${o}
        </div>`).join('');
      const done = mod.answers.filter(a=>a!==null).length;
      const pill = document.querySelector('.daab-answered-pill');
      if (pill) pill.textContent = done+'/20 answered';
      const w = document.getElementById('va-warn');
      const pg = mod.currentPage, start = pg*10, end=start+10;
      if (w && mod.answers.slice(start,end).filter(a=>a!==null).length===10) w.style.display='none';
    }
  };

  buildPage();
}

/* ══ PA Renderer ══ */
function renderPA(area, sub, mod) {
  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageQ = DAAB_PA_QS.slice(start, end);
    const done = mod.answers.filter(a=>a!==null).length;

    // Page pills
    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < 5; p++) {
      const pDone = mod.answers.slice(p*10, p*10+10).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    let rowsHtml = pageQ.map((pair, li) => {
      const qi = start + li;
      const sel = mod.answers[qi];
      return `<div class="daab-sd-row">
        <div>
          <div class="daab-sd-num">Q${qi+1}</div>
          <div class="daab-sd-pair">${pair}</div>
        </div>
        <div class="daab-sd-btns">
          <button class="daab-sd-btn ${sel==='S'?'sel-S':''}" onclick="daabPASel(${qi},'S')">S</button>
          <button class="daab-sd-btn ${sel==='D'?'sel-D':''}" onclick="daabPASel(${qi},'D')">D</button>
        </div>
      </div>`;
    }).join('');

    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    const isLast = pg === 4;

    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">👁 <strong>S</strong> = Same &nbsp;|&nbsp; <strong>D</strong> = Different. Compare each pair carefully.</div>` +
      pillsHtml +
      `<div class="daab-sd-grid">${rowsHtml}</div>
      <div class="daab-warn" id="pa-warn">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill">${done}/50 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabPANext()">
          ${isLast ? 'Submit PA →' : 'Next Page →'}
        </button>
      </div>`;
  }

  window.daabPASel = (qi, val) => {
    mod.answers[qi] = val;
    updateDaabProgress(mod);
    const pg = mod.currentPage;
    const start = pg * 10;
    // Update just the buttons for that row
    const rows = document.querySelectorAll('.daab-sd-row');
    const li = qi - start;
    if (rows[li]) {
      rows[li].querySelectorAll('.daab-sd-btn').forEach((btn, bi) => {
        btn.className = 'daab-sd-btn' + (bi===0 && val==='S' ? ' sel-S' : bi===1 && val==='D' ? ' sel-D' : '');
      });
    }
    const done = mod.answers.filter(a=>a!==null).length;
    const pill = document.querySelector('.daab-answered-pill');
    if (pill) pill.textContent = done+'/50 answered';
  };

  window.daabPANext = () => {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    if (pageDone < 10) {
      const w = document.getElementById('pa-warn');
      if (w) w.style.display = 'block';
      return;
    }
    if (pg === 4) { advanceDAABSub('pa'); return; }
    mod.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  buildPage();
}

/* ══ NA Renderer (paginated: 10 per page) ══ */
function renderNA(area, sub, mod) {
  if (mod.currentPage === undefined) mod.currentPage = 0;
  const opts5 = ['A','B','C','D','E'];

  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageQs = DAAB_NA_QS.slice(start, end);
    const done = mod.answers.filter(a=>a!==null).length;

    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < 2; p++) {
      const pDone = mod.answers.slice(p*10, p*10+10).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    const cardsHtml = pageQs.map((q, li) => {
      const i = start + li;
      const sel = mod.answers[i];
      const optsHtml = q.opts.map((o, oi) => `
        <div class="daab-opt ${sel===oi?'selected':''}" onclick="daabNASel(${i},${oi})">
          <span class="daab-opt-ltr">${opts5[oi]}</span>${o}
        </div>`).join('');
      return `<div class="daab-qcard" id="nacard-${i}">
        <div class="daab-qnum">Q${i+1}</div>
        <div class="daab-na-math">${q.q}</div>
        <div class="daab-opts">${optsHtml}</div>
      </div>`;
    }).join('');

    const isLast = pg === 1;
    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">🔢 Solve each arithmetic problem and select the correct answer. Choose from options A–E.</div>` +
      pillsHtml + cardsHtml +
      `<div class="daab-warn" id="na-warn">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill">${done}/20 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabNANext()">
          ${isLast ? 'Submit NA →' : 'Next Page →'}
        </button>
      </div>`;
  }

  window.daabNANext = () => {
    const pg = mod.currentPage;
    const pageDone = mod.answers.slice(pg*10, pg*10+10).filter(a=>a!==null).length;
    if (pageDone < 10) {
      const w = document.getElementById('na-warn');
      if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    if (pg === 1) { advanceDAABSub('na'); return; }
    mod.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  window.daabNASel = (qi, oi) => {
    mod.answers[qi] = oi;
    updateDaabProgress(mod);
    const card = document.getElementById('nacard-' + qi);
    if (card) {
      card.querySelector('.daab-opts').innerHTML = DAAB_NA_QS[qi].opts.map((o, oi2) => `
        <div class="daab-opt ${oi2===oi?'selected':''}" onclick="daabNASel(${qi},${oi2})">
          <span class="daab-opt-ltr">${opts5[oi2]}</span>${o}
        </div>`).join('');
      const done = mod.answers.filter(a=>a!==null).length;
      const pill = document.querySelector('.daab-answered-pill');
      if (pill) pill.textContent = done+'/20 answered';
      const w = document.getElementById('na-warn');
      const pg = mod.currentPage;
      if (w && mod.answers.slice(pg*10,pg*10+10).filter(a=>a!==null).length===10) w.style.display='none';
    }
  };

  buildPage();
}

/* ══ Generic MCQ Renderer (LSA + HMA) — paginated 10/page ══ */
function renderMCQ(area, sub, mod, questions) {
  const opts = ['A','B','C','D'];
  if (mod.currentPage === undefined) mod.currentPage = 0;

  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = Math.min(start + 10, questions.length);
    const pageQs = questions.slice(start, end);
    const done = mod.answers.filter(a=>a!==null).length;
    const totalPages = Math.ceil(questions.length / 10);

    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < totalPages; p++) {
      const pDone = mod.answers.slice(p*10, Math.min(p*10+10, questions.length)).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    const cardsHtml = pageQs.map((q, li) => {
      const i = start + li;
      const sel = mod.answers[i];
      const optsHtml = q.opts.map((o, oi) => `
        <div class="daab-opt ${sel===oi?'selected':''}" onclick="daabMCQSel('${sub.key}',${i},${oi})">
          <span class="daab-opt-ltr">${opts[oi]}</span>${o}
        </div>`).join('');
      return `<div class="daab-qcard" id="mcqcard-${sub.key}-${i}">
        <div class="daab-qnum">Q${i+1}</div>
        <div class="daab-qtext">${q.q}</div>
        <div class="daab-opts">${optsHtml}</div>
      </div>`;
    }).join('');

    const isLast = pg === totalPages - 1;
    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">📋 Choose the single best answer for each question.</div>` +
      pillsHtml + cardsHtml +
      `<div class="daab-warn" id="mcq-warn-${sub.key}">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill">${done}/20 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabMCQNext('${sub.key}',${totalPages})">
          ${isLast ? `Submit ${sub.abbr} →` : 'Next Page →'}
        </button>
      </div>`;
  }

  window.daabMCQNext = (key, totalPages) => {
    const m = S.daab[key];
    const pg = m.currentPage;
    const end = Math.min(pg*10+10, questions.length);
    const pageDone = m.answers.slice(pg*10, end).filter(a=>a!==null).length;
    const pageSize = end - pg*10;
    if (pageDone < pageSize) {
      const w = document.getElementById('mcq-warn-' + key);
      if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    if (pg === totalPages - 1) { advanceDAABSub(key); return; }
    m.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  window.daabMCQSel = (key, qi, oi) => {
    S.daab[key].answers[qi] = oi;
    updateDaabProgress(S.daab[key]);
    const card = document.getElementById(`mcqcard-${key}-${qi}`);
    if (card) {
      card.querySelector('.daab-opts').innerHTML = questions[qi].opts.map((o, oi2) => `
        <div class="daab-opt ${oi2===oi?'selected':''}" onclick="daabMCQSel('${key}',${qi},${oi2})">
          <span class="daab-opt-ltr">${opts[oi2]}</span>${o}
        </div>`).join('');
      const done = S.daab[key].answers.filter(a=>a!==null).length;
      const pill = document.querySelector('.daab-answered-pill');
      if (pill) pill.textContent = done+'/20 answered';
      const pg = S.daab[key].currentPage;
      const end = Math.min(pg*10+10, questions.length);
      const w = document.getElementById('mcq-warn-' + key);
      if (w && S.daab[key].answers.slice(pg*10,end).filter(a=>a!==null).length===(end-pg*10)) w.style.display='none';
    }
  };

  buildPage();
}

/* ══ DAAB Results Builder ══ */
function buildDAABResults() {
  const grid = document.getElementById('r-daab-grid');
  if (!grid) return;
  if (!S.daab.va.scores) { grid.innerHTML = '<p style="color:var(--ink3);font-size:13px">DAAB data not available.</p>'; return; }

  grid.innerHTML = DAAB_SUBS.map(sub => {
    const sc = S.daab[sub.key].scores;
    if (!sc) return '';
    const segs = Array.from({length:9}, (_,i) =>
      `<div class="daab-stanine-seg ${i < sc.stanine ? 'filled' : ''}"></div>`).join('');
    return `<div class="daab-dim-card">
      <div class="daab-dim-top">
        <span class="daab-dim-icon">${sub.emoji}</span>
        <div>
          <div class="daab-dim-name">${sub.label}</div>
          <div class="daab-dim-abbr">${sub.abbr}</div>
        </div>
      </div>
      <div class="daab-dim-scores">
        <div class="daab-score-box">
          <div class="daab-score-label">Raw Score</div>
          <div class="daab-score-val">${sc.raw}</div>
          <div class="daab-score-max">out of ${sc.max}</div>
        </div>
        <div class="daab-score-box stanine">
          <div class="daab-score-label">Stanine</div>
          <div class="daab-score-val">${sc.stanine}</div>
          <div class="daab-score-max">out of 9</div>
        </div>
      </div>
      <div class="daab-stanine-bar">
        <div class="daab-stanine-track">${segs}</div>
        <div class="daab-stanine-lbl">Stanine 1 (lowest) → 9 (highest)</div>
        <div class="daab-stanine-interp">${sc.label}</div>
      </div>
    </div>`;
  }).join('');
}


/* ── AR Questions (image-based) ── */

function renderAR(area, sub, mod) {
  const LETTERS = ['A','B','C','D','E'];
  if (mod.currentPage === undefined) mod.currentPage = 0;

  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const done = mod.answers.filter(a=>a!==null).length;

    // Page pills
    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < 2; p++) {
      const pDone = mod.answers.slice(p*10, p*10+10).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    const cardsHtml = DAAB_AR_QS.slice(start, end).map((q, li) => {
      const qi = start + li;
      const sel = mod.answers[qi];
      const optsHtml = LETTERS.map((lbl, oi) =>
        `<button class="daab-ar-opt ${sel===oi?'sel':''}" id="ar-opt-${qi}-${oi}"
          onclick="arSelectOpt(${qi},${oi})" aria-label="Answer ${lbl}">${lbl}</button>`
      ).join('');
      return `<div class="daab-ar-qcard ${sel!==null?'answered':''}" id="ar-qcard-${qi}">
        <div class="daab-ar-qhdr">
          <span class="daab-ar-qnum">Q${qi+1}.</span>
          <span class="daab-ar-qlbl">Problem Figures → Answer Figures</span>
          <span class="daab-ar-badge" ${sel!==null?'':'style="display:none"'} id="ar-badge-${qi}">✓ Answered</span>
        </div>
        <img class="daab-ar-strip" src="data:image/png;base64,${q.img}" alt="Q${qi+1} figure series" loading="lazy"/>
        <div class="daab-ar-opts" id="ar-opts-${qi}">${optsHtml}</div>
      </div>`;
    }).join('');

    const isLast = pg === 1;
    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">🔷 <strong>Instructions:</strong> Each row shows 4 Problem Figures that follow a pattern, then 5 Answer Figures (A–E). Find which answer figure continues the series and click it.</div>` +
      pillsHtml + cardsHtml +
      `<div class="daab-warn" id="ar-warn">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill" id="ar-answered-pill">${done}/20 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabARNext()">
          ${isLast ? 'Submit AR →' : 'Next Page →'}
        </button>
      </div>`;
    window.scrollTo(0, 56);
  }

  window.daabARNext = () => {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    if (pageDone < 10) {
      const w = document.getElementById('ar-warn');
      if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    if (pg === 1) { advanceDAABSub('ar'); return; }
    mod.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  window.arSelectOpt = (qi, oi) => {
    mod.answers[qi] = oi;
    updateDaabProgress(mod);
    LETTERS.forEach((_, i) => {
      const btn = document.getElementById(`ar-opt-${qi}-${i}`);
      if (btn) btn.className = 'daab-ar-opt' + (i === oi ? ' sel' : '');
    });
    const card = document.getElementById('ar-qcard-' + qi);
    if (card) card.classList.add('answered');
    const badge = document.getElementById('ar-badge-' + qi);
    if (badge) badge.style.display = '';
    const done = mod.answers.filter(a=>a!==null).length;
    const pill = document.getElementById('ar-answered-pill');
    if (pill) pill.textContent = done + '/20 answered';
    const pg = mod.currentPage;
    const w = document.getElementById('ar-warn');
    if (w && mod.answers.slice(pg*10, pg*10+10).filter(a=>a!==null).length===10) w.style.display='none';
  };

  buildPage();
}



function renderMA(area, sub, mod) {
  const LETTERS = ['A','B','C','D'];
  if (mod.currentPage === undefined) mod.currentPage = 0;

  function buildPage() {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const done = mod.answers.filter(a=>a!==null).length;

    // Page pills
    let pillsHtml = '<div class="daab-page-pills">';
    for (let p = 0; p < 2; p++) {
      const pDone = mod.answers.slice(p*10, p*10+10).every(a=>a!==null);
      const cls = p < pg ? 'done' : p === pg ? 'active' : '';
      pillsHtml += `<div class="daab-page-pill ${cls}">${p+1}</div>`;
    }
    pillsHtml += '</div>';

    const cardsHtml = DAAB_MA_QS.slice(start, end).map((q, li) => {
      const qi = start + li;
      const sel = mod.answers[qi];
      const optsHtml = q.opts.map((opt, oi) =>
        `<div class="daab-ma-opt ${sel===oi?'sel':''}" id="ma-opt-${qi}-${oi}"
          onclick="maSelectOpt(${qi},${oi})">
          <span class="daab-ma-opt-ltr">${LETTERS[oi]}</span>
          <span>${opt}</span>
        </div>`
      ).join('');
      const imgHtml = q.img
        ? `<img class="daab-ma-diagram" src="data:image/png;base64,${q.img}" alt="Diagram for Q${qi+1}" />`
        : '';
      return `<div class="daab-ma-qcard ${sel!==null?'answered':''}" id="ma-qcard-${qi}">
        <div class="daab-ma-qhdr">
          <span class="daab-ma-qnum">Q${qi+1}.</span>
          <span class="daab-ma-qtext">${q.q}</span>
          <span class="daab-ma-badge" ${sel!==null?'':'style="display:none"'} id="ma-badge-${qi}">✓ Answered</span>
        </div>
        ${imgHtml}
        <div class="daab-ma-opts" id="ma-opts-${qi}">${optsHtml}</div>
      </div>`;
    }).join('');

    const isLast = pg === 1;
    area.innerHTML = daabHeader(sub, mod) +
      `<div class="daab-instr">⚙️ <strong>Instructions:</strong> Each question tests your understanding of mechanical principles. Some questions include diagrams. Choose the best answer from the options given.</div>` +
      pillsHtml + cardsHtml +
      `<div class="daab-warn" id="ma-warn">Please answer all questions on this page before continuing.</div>
      <div class="daab-bot">
        <div class="daab-answered-pill" id="ma-answered-pill">${done}/20 answered</div>
        <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="daabMANext()">
          ${isLast ? 'Submit MA →' : 'Next Page →'}
        </button>
      </div>`;
    window.scrollTo(0, 56);
  }

  window.daabMANext = () => {
    const pg = mod.currentPage;
    const start = pg * 10, end = start + 10;
    const pageDone = mod.answers.slice(start, end).filter(a=>a!==null).length;
    if (pageDone < 10) {
      const w = document.getElementById('ma-warn');
      if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    if (pg === 1) { advanceDAABSub('ma'); return; }
    mod.currentPage++;
    buildPage();
    window.scrollTo(0, 56);
  };

  window.maSelectOpt = (qi, oi) => {
    mod.answers[qi] = oi;
    updateDaabProgress(mod);
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`ma-opt-${qi}-${i}`);
      if (el) el.className = 'daab-ma-opt' + (i === oi ? ' sel' : '');
    }
    const card = document.getElementById('ma-qcard-' + qi);
    if (card) card.classList.add('answered');
    const badge = document.getElementById('ma-badge-' + qi);
    if (badge) badge.style.display = '';
    const done = mod.answers.filter(a=>a!==null).length;
    const pill = document.getElementById('ma-answered-pill');
    if (pill) pill.textContent = done + '/20 answered';
    const pg = mod.currentPage;
    const w = document.getElementById('ma-warn');
    if (w && mod.answers.slice(pg*10, pg*10+10).filter(a=>a!==null).length===10) w.style.display='none';
  };

  buildPage();
}


/* ── SA Row Images (Spatial Ability) ── */

function renderSA(area, sub, mod) {

  function buildCards() {
    return DAAB_SA_QS.map((q, qi) => {
      // answers for this row are indices qi*4 to qi*4+3
      const base = qi * 4;
      const rowAnswers = [0,1,2,3].map(fi => mod.answers[base + fi]);
      const rowDone = rowAnswers.every(a => a !== null);

      const gridHtml = q.figs.map((fig, fi) => {
        const val = rowAnswers[fi];
        return `<div class="daab-sa-fig-col">
          <span class="daab-sa-fig-tag">${fig}</span>
          <div class="daab-sa-sr-group">
            <button class="daab-sa-sr-btn ${val==='S'?'sel-s':''}" id="sa-btn-${qi}-${fi}-S"
              onclick="saSelectAnswer(${qi},${fi},'S')">S</button>
            <button class="daab-sa-sr-btn ${val==='R'?'sel-r':''}" id="sa-btn-${qi}-${fi}-R"
              onclick="saSelectAnswer(${qi},${fi},'R')">R</button>
          </div>
        </div>`;
      }).join('');

      return `<div class="daab-sa-qcard ${rowDone?'complete':''}" id="sa-qcard-${qi}">
        <div class="daab-sa-qhdr">
          <span class="daab-sa-qnum">Q${qi+1}.</span>
          <span class="daab-sa-qlbl">Sample Figure → Test Figures</span>
          <span class="daab-sa-badge" ${rowDone?'':'style="display:none"'} id="sa-badge-${qi}">✓ Complete</span>
        </div>
        <img class="daab-sa-row-img" src="data:image/png;base64,${DAAB_SA_ROW_IMAGES[q.row]}" alt="Row ${qi+1} figures"/>
        <div class="daab-sa-answers-grid">${gridHtml}</div>
      </div>`;
    }).join('');
  }

  area.innerHTML = daabHeader(sub, mod) +
    `<div class="daab-instr">🧩 <strong>Instructions:</strong> Each row shows a <strong>Sample Figure</strong> followed by 4 Test Figures. Mark each Test Figure as <strong>S</strong> (Same orientation) or <strong>R</strong> (Reversed/mirror image).</div>
    <div class="daab-sa-legend">
      <div class="daab-sa-legend-item"><span class="daab-sa-chip daab-sa-chip-s">S</span> Same orientation</div>
      <div class="daab-sa-legend-item"><span class="daab-sa-chip daab-sa-chip-r">R</span> Reversed / mirror</div>
    </div>` +
    `<div id="sa-cards">${buildCards()}</div>
    <div class="daab-bot">
      <div class="daab-answered-pill" id="sa-answered-pill">0/20 answered</div>
      <button class="btn btn-lg" style="background:var(--m4);color:#fff" onclick="advanceDAABSub('sa')">Submit SA →</button>
    </div>`;

  saRefreshPill();

  window.saSelectAnswer = (qi, fi, val) => {
    const base = qi * 4;
    mod.answers[base + fi] = val;
    updateDaabProgress(mod);

    ['S','R'].forEach(v => {
      const btn = document.getElementById(`sa-btn-${qi}-${fi}-${v}`);
      if (btn) btn.className = 'daab-sa-sr-btn' + (v === val ? (val==='S' ? ' sel-s' : ' sel-r') : '');
    });

    const rowDone = [0,1,2,3].every(i => mod.answers[base + i] !== null);
    const card = document.getElementById('sa-qcard-' + qi);
    if (card) card.classList.toggle('complete', rowDone);
    const badge = document.getElementById('sa-badge-' + qi);
    if (badge) badge.style.display = rowDone ? '' : 'none';

    saRefreshPill();
  };

  function saRefreshPill() {
    const done = mod.answers.filter(a => a !== null).length;
    const pill = document.getElementById('sa-answered-pill');
    if (pill) pill.textContent = done + '/20 answered';
  }
}

/* ── END DAAB MODULE ── */

export { daabTimerInt, daabSecondsLeft, startDaabTimer, stopDaabTimer, clearDaabTimer, updateDaabTimerDisplay, startDAAB, renderDAABSideNav, renderDAABSub, renderDAABMobileNav, advanceDAABSub, finishDAAB, daabHeader, updateDaabProgress, _updateDaabSidebarOverall, renderVA, renderPA, renderNA, renderMCQ, buildDAABResults, renderAR, renderMA, renderSA };
