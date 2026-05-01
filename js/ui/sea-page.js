/* ════════════════════════════════════════════════════════════════════
   ui/sea-page.js
   SEAA / NSEAAS page rendering, navigation, submit.
════════════════════════════════════════════════════════════════════ */

import { S, saveState, _saveSession, DB } from '../state.js';
import { SEA_DOMAINS, Q_DOMAIN, SEA_TYPES, SEA_QS, DOMAIN_NAME, PAGE_THEMES, SEA_ENCOURAGE } from '../engine/sea.js';
import { ENGINE } from '../engine/scorers.js';
import { goPage } from '../router.js';
import { startTimer, stopTimer } from './nmap-page.js';

function startNSEAAS() {
  // If answers already exist (session restore), resume — don't wipe progress.
  const resumingSea = S.sea.answers.some(a => a !== null);
  if (!resumingSea) {
    S.sea.answers = new Array(60).fill(null);
    S.sea.currentPage = 0;
  }
  if (!resumingSea) S.sea.startTime = Date.now();
  startTimer('sea-timer', S.sea);
  _saveSession('transition3');
  goPage('nseaas'); renderSEAPage(); renderSEASidebarNav();
}

function renderSEAPage() {
  const pg = S.sea.currentPage;
  const [start, end] = PAGE_THEMES[pg].range;
  const totalDone = S.sea.answers.filter(a => a !== null).length;
  const pageDone  = S.sea.answers.slice(start, end).filter(a => a !== null).length;
  const isLastPage = pg === 5;
  const pct = Math.round(totalDone / 60 * 100);

  document.getElementById('sea-ptxt').textContent = pct + '%';
  document.getElementById('sea-pbar').style.width = pct + '%';

  // 6-dot progress strip
  let dotsHtml = '';
  for (let p = 0; p < 6; p++) {
    const [ps,pe] = PAGE_THEMES[p].range;
    const pDone = S.sea.answers.slice(ps,pe).filter(a=>a!==null).length;
    const cls = pDone===10 ? 'done' : p===pg ? 'active' : '';
    const fillPct = p===pg ? (pageDone/10*100) : 0;
    dotsHtml += `<div class="page-dot ${cls}">${p===pg?`<div class="page-dot-fill" style="width:${fillPct}%"></div>`:''}</div>`;
  }

  // Question rows
  let rowsHtml = '';
  for (let qi = start; qi < end; qi++) {
    const ans = S.sea.answers[qi];
    rowsHtml += `<div class="yn-row ${ans!==null?'answered':''}" id="ynrow-${qi}">
      <div class="yn-qnum">${qi+1}</div>
      <div class="yn-text">${SEA_QS[qi]}</div>
      <div class="yn-btns">
        <button class="yn-btn ${ans===1?'ysel':''}" onclick="seaAns(${qi},1)">YES</button>
        <button class="yn-btn ${ans===0?'nsel':''}" onclick="seaAns(${qi},0)">NO</button>
      </div>
    </div>`;
  }

  document.getElementById('sea-main').innerHTML = `
    <div class="sea-hdr">
      <div class="sea-hdr-top">
        <h3>💬 ${PAGE_THEMES[pg].label} — How are you at school?</h3>
        <div class="sea-pg-badge">Page ${pg+1} of 6</div>
      </div>
      <div class="sea-hdr-sub">Questions ${start+1}–${end} · Read each statement and answer YES or NO</div>
      <div style="margin-top:10px;font-size:13px;font-weight:700;color:var(--m2)">${SEA_ENCOURAGE[pg]}</div>
    </div>
    <div class="page-dots">${dotsHtml}</div>
    <div class="sea-warn" id="pg-warn">Please answer all ${10-pageDone} remaining question${10-pageDone>1?'s':''} before moving on.</div>
    <div class="yn-list">${rowsHtml}</div>`;

  document.getElementById('sea-pnav').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="seaPageNav(-1)" ${pg===0?'disabled':''}>← Back</button>
    <div class="sea-count-pill">${pageDone}/10 answered</div>
    ${isLastPage
      ? `<button class="btn btn-m2 btn-sm" onclick="trySubmitNSEAAS()">Finish Assessment ✓</button>`
      : `<button class="btn btn-m2 btn-sm" onclick="trySeaNextPage()">Continue →</button>`}`;

  renderSEASidebarNav();
}

function seaAns(qi, val) {
  S.sea.answers[qi] = val;
  const row = document.getElementById('ynrow-'+qi);
  if (row) {
    row.className = 'yn-row answered';
    const btns = row.querySelectorAll('.yn-btn');
    btns[0].className = 'yn-btn '+(val===1?'ysel':'');
    btns[1].className = 'yn-btn '+(val===0?'nsel':'');
  }
  const pg = S.sea.currentPage;
  const [start,end] = PAGE_THEMES[pg].range;
  const pageDone  = S.sea.answers.slice(start,end).filter(a=>a!==null).length;
  const totalDone = S.sea.answers.filter(a=>a!==null).length;
  const pct = Math.round(totalDone/60*100);
  const pill = document.querySelector('.sea-count-pill');
  if (pill) pill.textContent = pageDone+'/10 answered';
  document.getElementById('sea-ptxt').textContent = pct+'%';
  document.getElementById('sea-pbar').style.width = pct+'%';
  // update active dot fill
  const activeDot = document.querySelector('.page-dot.active .page-dot-fill');
  if (activeDot) activeDot.style.width = (pageDone/10*100)+'%';
  if (pageDone===10) { const w=document.getElementById('pg-warn'); if(w) w.style.display='none'; }
  _saveSession('nseaas');
  renderSEASidebarNav();
}

function trySeaNextPage() {
  const pg=S.sea.currentPage, [start,end]=PAGE_THEMES[pg].range;
  if (S.sea.answers.slice(start,end).filter(a=>a!==null).length < 10) {
    const w=document.getElementById('pg-warn');
    if (w) { w.style.display='block'; w.scrollIntoView({behavior:'smooth',block:'nearest'}); }
    return;
  }
  S.sea.currentPage++; renderSEAPage(); window.scrollTo(0,56); _saveSession('nseaas');
}

function seaPageNav(d) {
  const next=S.sea.currentPage+d;
  if (next>=0&&next<=5) { S.sea.currentPage=next; renderSEAPage(); window.scrollTo(0,56); _saveSession('nseaas'); }
}

function renderSEASidebarNav() {
  const nav=document.getElementById('sea-pagenav'); if(!nav) return;
  let h='';
  PAGE_THEMES.forEach((pt,i)=>{
    const [ps,pe]=pt.range, done=S.sea.answers.slice(ps,pe).filter(a=>a!==null).length===10;
    const active=i===S.sea.currentPage;
    h+=`<div class="pn-item ${done?'pg-done':active?'pg-active':''}">
      <div class="pn-num">${i+1}</div>
      <div class="pn-label">${pt.label} <span style="font-size:10px;opacity:.7">${pt.qs}</span></div>
      <div class="pn-check">✓</div>
    </div>`;
  });
  nav.innerHTML=h;
}

async function trySubmitNSEAAS() {
  const totalDone=S.sea.answers.filter(a=>a!==null).length;
  if (totalDone<60) {
    for (let p=0;p<6;p++) {
      const [ps,pe]=PAGE_THEMES[p].range;
      if (S.sea.answers.slice(ps,pe).filter(a=>a!==null).length<10) {
        S.sea.currentPage=p; renderSEAPage(); window.scrollTo(0,56); return;
      }
    }
  }
  stopTimer(S.sea);
  S.sea.scores = ENGINE.scoreNSEAAS(S.sea.answers, S.student.gender);
  await DB.markCompleted(S.sessionId);
  _saveSession('ready');
  goPage('ready');
}


export { startNSEAAS, renderSEAPage, seaAns, trySeaNextPage, seaPageNav, renderSEASidebarNav, trySubmitNSEAAS };
