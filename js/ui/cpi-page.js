import { S, _saveSession } from '../state.js';
import { CPI_AREAS, CPI_QS } from '../engine/cpi.js';
import { ENGINE } from '../engine/scorers.js';
import { goPage } from '../router.js';
import { startTimer, stopTimer } from './nmap-page.js';

function startCPI() {

  const resumingCpi = S.cpi.answers.some(a =>
    Array.isArray(a) ? a.length > 0 : a !== null
  );

  if (!resumingCpi) {
    S.cpi.answers = Array.from({ length: 20 }, () => []);
    S.cpi.currentQ = 0;
  }

  if (!resumingCpi) S.cpi.startTime = Date.now();

  startTimer('cpi-timer', S.cpi);
  goPage('cpi');
  renderCPIQ();
}

function renderCPIQ() {
  const qi = S.cpi.currentQ;
  const q = CPI_QS[qi];

  const done = S.cpi.answers.filter(a => a.length > 0).length;
  const pct = Math.round(done / 20 * 100);

  document.getElementById('cpi-ptxt').textContent = pct + '%';
  document.getElementById('cpi-pbar').style.width = pct + '%';

  renderCPIMap();

  const currentSelections = S.cpi.answers[qi] || [];
  const atMax = currentSelections.length >= 3;

  let optsHtml = '';
  q.opts.forEach((opt, i) => {
    const sel = currentSelections.includes(i);
    const disabled = !sel && atMax;

    optsHtml += `
      <div class="copt ${sel ? 'sel' : ''} ${disabled ? 'copt-disabled' : ''}" onclick="cpiSel(${i})">
        <div class="copt-radio"><div class="copt-radio-dot"></div></div>
        <span class="copt-txt">${opt}</span>
      </div>`;
  });

  const selCount = currentSelections.length;
  const isLast = qi === 19;
  const allDone = S.cpi.answers.every(a => a.length > 0);
  const canContinue = selCount > 0;

  const navHtml = `
    <div class="qnav">
      <button class="btn btn-outline btn-sm" onclick="cpiNav(-1)" ${qi === 0 ? 'disabled' : ''}>← Back</button>
      <div class="qnav-answered"><strong>${done}</strong> of 20 answered</div>
      ${isLast
        ? `<button class="btn btn-m1 btn-sm" onclick="submitCPI()" ${!allDone ? 'disabled' : ''}>Finish Module 3 ✓</button>`
        : `<button class="btn btn-dark btn-sm" onclick="cpiNav(1)" ${!canContinue ? 'disabled' : ''}>Continue →</button>`}
    </div>`;

  document.getElementById('cpi-qarea').innerHTML = `
    <div class="pill-badge pb-m1" style="margin-bottom:1.25rem">🧠 Discover Your Interests</div>
    <div class="q-progress-strip">
      <div class="q-progress-nums">
        <div class="q-progress-current">Question ${qi + 1} <span>of 20</span></div>
        <div class="q-progress-pct">${pct}% complete</div>
      </div>
      <div class="prog-track">
        <div class="prog-fill" style="width:${pct}%;background:var(--m1)"></div>
      </div>
    </div>

    <div class="qtext">${q.q}</div>

    ${atMax
      ? `<div style="font-size:12px;color:var(--brand2);font-weight:600;margin-bottom:8px">
           ✓ Maximum 3 options selected — deselect one to change.
         </div>`
      : `<div style="font-size:12px;color:var(--ink3);margin-bottom:8px">
           Select up to <strong>3 options</strong> that feel most like you.
           <strong>${selCount}/3 selected.</strong>
         </div>`}

    <div class="opts">${optsHtml}</div>
    ${navHtml}
  `;

  // Mobile nav
  const mn = document.getElementById('cpi-mobile-nav');
  if (mn) {
    mn.innerHTML = `
      <button class="btn btn-outline btn-sm" style="flex:1" onclick="cpiNav(-1)" ${qi === 0 ? 'disabled' : ''}>← Back</button>
      ${isLast
        ? `<button class="btn btn-m1" style="flex:2" onclick="submitCPI()" ${!allDone ? 'disabled' : ''}>Finish Module 3 ✓</button>`
        : `<button class="btn btn-dark" style="flex:2" onclick="cpiNav(1)" ${!canContinue ? 'disabled' : ''}>Continue →</button>`}
    `;
  }
}

function cpiSel(i) {
  const arr = S.cpi.answers[S.cpi.currentQ];
  const idx = arr.indexOf(i);

  if (idx !== -1) {
    arr.splice(idx, 1);
  } else if (arr.length < 3) {
    arr.push(i);
  }

  renderCPIQ();
  _saveSession('cpi');
}

function cpiNav(d) {
  S.cpi.currentQ = Math.max(0, Math.min(19, S.cpi.currentQ + d));
  renderCPIQ();
  window.scrollTo(0, 56);
  _saveSession('cpi');
}

function cpiJump(i) {
  S.cpi.currentQ = i;
  renderCPIQ();
}

function renderCPIMap() {
  const map = document.getElementById('cpi-qmap');
  if (!map) return;

  let h = '';

  for (let i = 0; i < 20; i++) {
    const arr = S.cpi.answers[i];
    const done = arr.length > 0;
    const cur = i === S.cpi.currentQ;

    const col = done ? CPI_AREAS[arr[0]].color : '';

    h += `
      <div class="qdot ${done ? 'done' : ''} ${cur ? 'cur' : ''}"
           style="${done ? 'background:' + col : ''}"
           onclick="cpiJump(${i})">
        ${i + 1}
      </div>`;
  }

  map.innerHTML = h;
}

function submitCPI() {
  stopTimer(S.cpi);
  S.cpi.scores = ENGINE.scoreCPI(S.cpi.answers);
  goPage('transition3');
}

export {
  startCPI,
  renderCPIQ,
  cpiSel,
  cpiNav,
  cpiJump,
  renderCPIMap,
  submitCPI
};
