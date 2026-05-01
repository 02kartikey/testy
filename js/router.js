/* ════════════════════════════════════════════════════════════════════
   router.js
   Page navigation, resume overlay, registration.
════════════════════════════════════════════════════════════════════ */

import { S, _clearSession, _restoreSession, _saveSession, DB, _isConfigured } from './state.js';
import { showDbStatus } from './db-status.js';
import { startNMAP, renderNMAPPage, renderNMAPSidebarNav, startTimer } from './ui/nmap-page.js';
import { renderCPIQ } from './ui/cpi-page.js';
import { renderSEAPage, renderSEASidebarNav } from './ui/sea-page.js';
import { renderDAABSub, renderDAABSideNav, clearDaabTimer } from './ui/daab-page.js';
import { buildResults } from './ui/results.js';

function navLogoClick() {
  const assessmentPages = ['nmap', 'daab', 'cpi', 'nseaas'];
  const currentPage = document.querySelector('.page.active');
  const currentId   = currentPage ? currentPage.id.replace('page-', '') : '';
  if (assessmentPages.includes(currentId)) {
    const ok = window.confirm('⚠️ You\'re in the middle of an assessment. Your progress is saved — you can resume when you come back. Leave anyway?');
    if (!ok) return;
    if (currentId === 'daab') {
      // Use the dedicated stop helper from daab-page.js — it owns the
      // timer state and resets it cleanly. (Earlier code reassigned an
      // imported `daabTimerInt` directly, which is a TypeError because
      // ES module imports are read-only bindings.)
      clearDaabTimer();
    }
  }
  goPage('landing');
}

function goPage(id) {
  _goPageReal(id);
  _saveSession(id);
  if (id === 'results') _clearSession();
}

// NOTE: DOMContentLoaded boot sequence is handled exclusively in main.js.
// Do NOT add a second DOMContentLoaded listener here — it causes double
// session restore and page freezes.

function _showResumeOverlay(savedPage) {
  _goPageReal('landing');

  const overlay = document.createElement('div');
  overlay.id = 'resume-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center',
    'background:rgba(15,23,42,0.72);backdrop-filter:blur(6px)',
  ].join(';');

  const moduleLabel = {
    nmap:'Module 1 — Personality',
    daab:'Module 2 — Aptitude',
    cpi:'Module 3 — Career Interests',
    nseaas:'Module 4 — Social-Emotional',
    transition:'Between Module 1 & 2',
    transition2:'Between Module 2 & 3',
    transition3:'Between Module 3 & 4',
  }[savedPage] || 'Assessment';
  const subLabel = savedPage === 'daab' && S.daab.currentSub != null
    ? ` · Sub-test ${S.daab.currentSub + 1} of 8`
    : '';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.25)">
      <div style="font-size:48px;margin-bottom:1rem">🔖</div>
      <h2 style="font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;margin-bottom:.5rem;color:#1e293b">Session saved</h2>
      <p style="font-size:14px;color:#64748b;margin-bottom:.25rem">You were in the middle of:</p>
      <p style="font-size:15px;font-weight:700;color:#7c3aed;margin-bottom:1.75rem">${moduleLabel}${subLabel}</p>
      <button id="btn-resume" style="width:100%;padding:.85rem;border-radius:12px;border:none;background:#7c3aed;color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:.75rem">
        ▶ Resume where I left off
      </button>
      <button id="btn-restart" style="width:100%;padding:.85rem;border-radius:12px;border:2px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:600;cursor:pointer">
        ↺ Start over (clear saved progress)
      </button>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('btn-resume').addEventListener('click', function() {
    overlay.remove();
    _doResume(savedPage);
  });

  document.getElementById('btn-restart').addEventListener('click', function() {
    overlay.remove();
    _clearSession();
    _goPageReal('landing');
  });
}

function _doResume(savedPage) {
  if (savedPage === 'nmap') {
    goPage('nmap');
    typeof renderNMAPPage === 'function' && renderNMAPPage();
    typeof renderNMAPSidebarNav === 'function' && renderNMAPSidebarNav();
    if (S.nmap.startTime) startTimer('nmap-timer', S.nmap);

  } else if (savedPage === 'daab') {
    goPage('daab');
    requestAnimationFrame(() => {
      typeof renderDAABSideNav === 'function' && renderDAABSideNav();
      typeof renderDAABSub === 'function' && renderDAABSub(S.daab.currentSub || 0, true);
    });

  } else if (savedPage === 'cpi') {
    goPage('cpi');
    typeof renderCPIQ === 'function' && renderCPIQ();
    if (S.cpi.startTime) startTimer('cpi-timer', S.cpi);

  } else if (savedPage === 'nseaas') {
    goPage('nseaas');
    typeof renderSEAPage === 'function' && renderSEAPage();
    typeof renderSEASidebarNav === 'function' && renderSEASidebarNav();
    if (S.sea.startTime) startTimer('sea-timer', S.sea);

  } else if (savedPage === 'transition' || savedPage === 'transition2' || savedPage === 'transition3') {
    _goPageReal(savedPage);

  } else if (savedPage === 'ready' || savedPage === 'results') {
    if (S.cpi.scores && S.sea.scores && S.nmap.scores) {
      typeof buildResults === 'function' && buildResults();
    }
    _goPageReal('results');
  }
}

const PIP_IDX = { landing:0, register:0, nmap:1, transition:1, daab:2, transition2:2, cpi:3, transition3:3, nseaas:4, ready:5, results:5 };

function _goPageReal(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (!target) { console.warn('[Router] No page element found for id:', id); return; }
  target.classList.add('active');
  window.scrollTo(0, 0);

  const a = PIP_IDX[id] ?? 0;
  for (let i = 0; i < 6; i++) {
    const p = document.getElementById('pip' + i);
    if (!p) continue;
    p.classList.remove('now', 'done');
    if (i < a) p.classList.add('done');
    else if (i === a) p.classList.add('now');
  }

  for (let i = 0; i < 5; i++) {
    const c = document.getElementById('con' + i);
    if (c) c.classList.toggle('done', i < a);
  }
}

var _registering = false;

async function doRegister() {
  if (_registering) return;

  const fn=document.getElementById('r-fn').value.trim(), ln=document.getElementById('r-ln').value.trim();
  const cls=document.getElementById('r-cls').value, sch=document.getElementById('r-sch').value.trim();
  const gen=document.getElementById('r-gen').value, con=document.getElementById('r-con').checked;
  const state=document.getElementById('r-state').value, city=document.getElementById('r-city').value;
  let ok=true;
  [['fn',fn],['ln',ln],['cls',cls],['sch',sch],['gen',gen],['state',state],['city',city]].forEach(([k,v])=>{
    const e=document.getElementById('e-'+k); e.style.display=v?'none':'block'; if(!v) ok=false;
  });
  document.getElementById('e-con').style.display=con?'none':'block';
  if (!con) ok=false;
  if (!ok) return;

  _registering = true;
  const submitBtn = document.querySelector('[onclick="doRegister()"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '.6'; }

  try {
    S.student = {
      firstName:fn, lastName:ln, fullName:fn+' '+ln,
      class:cls, section:document.getElementById('r-sec').value.trim(),
      school:sch, schoolState:state, schoolCity:city,
      schoolLocation: city + ', ' + state,
      age:document.getElementById('r-age').value,
      gender:gen, email:document.getElementById('r-email').value.trim(),
      registeredAt:new Date().toISOString(),
    };
    S.sessionId = 'NMSUITE-'+Date.now()+'-'+Math.random().toString(36).substr(2,6).toUpperCase();
    showDbStatus('saving','Saving your details…');
    const { error } = await DB.saveRegistration(S.student, S.sessionId);
    showDbStatus(error?'error':'saved', error?'Could not save — continuing anyway ✓':'✓ Details saved!');

    _saveSession('register');
    startNMAP();
  } catch (err) {
    // DB.saveRegistration already returns {error}; this catches anything
    // truly unexpected (e.g., a thrown DOM error from showDbStatus).
    console.error('[Register] unexpected error:', err);
    showDbStatus('error', 'Something went wrong — please try again.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
  } finally {
    // Always release the lock so a stuck flag can never freeze the form.
    _registering = false;
  }
}

export { navLogoClick, goPage, _showResumeOverlay, _doResume, PIP_IDX, _goPageReal, doRegister, _registering };
