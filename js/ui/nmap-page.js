/* ════════════════════════════════════════════════════════════════════
   ui/nmap-page.js
   NMAP page rendering, navigation, submit, timer helpers.
════════════════════════════════════════════════════════════════════ */

import { S, saveState, _saveSession } from '../state.js';
import { NMAP_DIMS, NMAP_RAW_STMTS, NMAP_QS, NMAP_PAGES, NMAP_PAGE_QS, NMAP_ENCOURAGE } from '../engine/nmap.js';
import { ENGINE } from '../engine/scorers.js';
import { goPage } from '../router.js';

function startNMAP() {
  // If answers already exist (session restore), resume — don't wipe progress.
  const resumingNmap = S.nmap.answers.some(a => a !== null);
  if (!resumingNmap) {
    S.nmap.answers = new Array(63).fill(null);
    S.nmap.currentDim = 0;
  }
  if (!resumingNmap) S.nmap.startTime = Date.now();
  startTimer('nmap-timer', S.nmap);
  goPage('nmap'); renderNMAPPage(); renderNMAPSidebarNav();
}

function renderNMAPPage() {
  const di = S.nmap.currentDim;
  const dim = NMAP_DIMS[di];
  const qIdxs = NMAP_PAGE_QS[di]; // 7 question indices for this dim
  const pageDone  = qIdxs.filter(k => S.nmap.answers[k] !== null).length;
  const totalDone = S.nmap.answers.filter(a => a !== null).length;
  const pct = Math.round(totalDone / 63 * 100);
  const isLast = di === 8;

  document.getElementById('nmap-ptxt').textContent = pct + '%';
  document.getElementById('nmap-pbar').style.width = pct + '%';
  let dotsHtml = '';
  for (let p = 0; p < 9; p++) {
    const qs = NMAP_PAGE_QS[p], done = qs.filter(k => S.nmap.answers[k] !== null).length === 7;
    const cls = done ? 'done' : p === di ? 'active' : '';
    dotsHtml += `<div class="nmap-dot ${cls}"></div>`;
  }
  let rowsHtml = '';
  qIdxs.forEach((k, local) => {
    const ans = S.nmap.answers[k];
    rowsHtml += `<div class="asn-row ${ans !== null ? 'answered' : ''}" id="asnrow-${k}">
      <div class="asn-qnum">${totalDone - pageDone + local + 1 > 63 ? '•' : (NMAP_PAGE_QS.slice(0,di).reduce((a,c)=>a+c.length,0)+local+1)}</div>
      <div class="asn-text">${NMAP_QS[k].text}</div>
      <div class="asn-btns">
        <button class="asn-btn ${ans===2?'a2sel':''}" onclick="nmapAns(${k},2)">Always</button>
        <button class="asn-btn ${ans===1?'a1sel':''}" onclick="nmapAns(${k},1)">Sometimes</button>
        <button class="asn-btn ${ans===0?'a0sel':''}" onclick="nmapAns(${k},0)">Never</button>
      </div>
    </div>`;
  });

  document.getElementById('nmap-qarea').innerHTML = `
    <div class="pill-badge" style="background:var(--m3l);color:var(--m3);margin-bottom:1.25rem">🌟 Personality Assessment · Dimension ${di+1} of 9</div>
    <div class="q-progress-strip">
      <div class="q-progress-nums">
        <div class="q-progress-current">Dimension ${di+1} <span>of 9</span></div>
        <div class="q-progress-pct">${pct}% complete</div>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:var(--m3)"></div></div>
    </div>
    <div class="nmap-dots">${dotsHtml}</div>
    <div class="nmap-section-hdr">
      <div class="nmap-section-emoji">${dim.emoji}</div>
      <div>
        <div class="nmap-section-title">${dim.label}</div>
        <div class="nmap-section-desc">${dim.desc}</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:var(--m3);margin-bottom:14px">${NMAP_ENCOURAGE[di]}</div>
    <div class="sea-warn" id="nmap-warn">Please answer all ${7-pageDone} remaining statement${7-pageDone!==1?'s':''} before moving on.</div>
    <div class="asn-list">${rowsHtml}</div>`;

  document.getElementById('nmap-pnav').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="nmapPageNav(-1)" ${di===0?'disabled':''}>← Back</button>
    <div class="nmap-count-pill">${pageDone}/7 answered</div>
    ${isLast
      ? `<button class="btn btn-m3 btn-sm" onclick="trySubmitNMAP()">Finish Assessment ✓</button>`
      : `<button class="btn btn-m3 btn-sm" onclick="tryNmapNextPage()">Continue →</button>`}`;

  renderNMAPSidebarNav();
}

function nmapAns(k, val) {
  S.nmap.answers[k] = val;
  const row = document.getElementById('asnrow-' + k);
  if (row) {
    row.className = 'asn-row answered';
    const btns = row.querySelectorAll('.asn-btn');
    btns[0].className = 'asn-btn ' + (val === 2 ? 'a2sel' : '');
    btns[1].className = 'asn-btn ' + (val === 1 ? 'a1sel' : '');
    btns[2].className = 'asn-btn ' + (val === 0 ? 'a0sel' : '');
  }
  const di = S.nmap.currentDim;
  const qIdxs = NMAP_PAGE_QS[di];
  const pageDone  = qIdxs.filter(k2 => S.nmap.answers[k2] !== null).length;
  const totalDone = S.nmap.answers.filter(a => a !== null).length;
  const pct = Math.round(totalDone / 63 * 100);
  const pill = document.querySelector('.nmap-count-pill');
  if (pill) pill.textContent = pageDone + '/7 answered';
  document.getElementById('nmap-ptxt').textContent = pct + '%';
  document.getElementById('nmap-pbar').style.width = pct + '%';
  if (pageDone === 7) { const w = document.getElementById('nmap-warn'); if (w) w.style.display = 'none'; }
  renderNMAPSidebarNav();
  _saveSession('nmap');
}

function tryNmapNextPage() {
  const di = S.nmap.currentDim;
  const qIdxs = NMAP_PAGE_QS[di];
  if (qIdxs.filter(k => S.nmap.answers[k] !== null).length < 7) {
    const w = document.getElementById('nmap-warn');
    if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    return;
  }
  S.nmap.currentDim++; renderNMAPPage(); window.scrollTo(0, 56); _saveSession('nmap');
}

function nmapPageNav(d) {
  const next = S.nmap.currentDim + d;
  if (next >= 0 && next <= 8) { S.nmap.currentDim = next; renderNMAPPage(); window.scrollTo(0, 56); _saveSession('nmap'); }
}

function renderNMAPSidebarNav() {
  const nav = document.getElementById('nmap-dimnav'); if (!nav) return;
  let h = '';
  NMAP_DIMS.forEach((dim, i) => {
    const qs = NMAP_PAGE_QS[i], done = qs.filter(k => S.nmap.answers[k] !== null).length === 7;
    const active = i === S.nmap.currentDim;
    h += `<div class="nmap-dn-item ${done ? 'dn-done' : active ? 'dn-active' : ''}">
      <div class="nmap-dn-num">${dim.emoji}</div>
      <div class="nmap-dn-label">${dim.abbr}</div>
      <div class="nmap-dn-check">✓</div>
    </div>`;
  });
  nav.innerHTML = h;
}

async function trySubmitNMAP() {
  const totalDone = S.nmap.answers.filter(a => a !== null).length;
  if (totalDone < 63) {
    for (let di = 0; di < 9; di++) {
      const qs = NMAP_PAGE_QS[di];
      if (qs.filter(k => S.nmap.answers[k] !== null).length < 7) {
        S.nmap.currentDim = di; renderNMAPPage(); window.scrollTo(0, 56); return;
      }
    }
  }
  stopTimer(S.nmap);
  S.nmap.scores = ENGINE.scoreNMAP(S.nmap.answers);
  _saveSession('transition');
  goPage('transition');
}

function startTimer(elId, mod) {
  if (S.timerInt) clearInterval(S.timerInt);
  S.timerInt = setInterval(()=>{
    const el=document.getElementById(elId); if(!el) return;
    const e=Math.floor((Date.now()-mod.startTime)/1000);
    el.textContent=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
  },1000);
}
function stopTimer(mod) {
  clearInterval(S.timerInt); S.timerInt=null;
  mod.duration=Math.floor((Date.now()-mod.startTime)/1000);
}


export { startNMAP, renderNMAPPage, nmapAns, tryNmapNextPage, nmapPageNav, renderNMAPSidebarNav, trySubmitNMAP, startTimer, stopTimer };
