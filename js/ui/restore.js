/* ════════════════════════════════════════════════════════════════════
   ui/restore.js
   Resume from saved-state — restoreUI rebuilds DOM into prior state.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { _goPageReal, PIP_IDX, goPage } from '../router.js';
import { DAAB_SUBS } from '../engine/daab.js';
import { renderCPIQ } from '../ui/cpi-page.js';
import { renderSEAPage, renderSEASidebarNav } from '../ui/sea-page.js';
import { renderNMAPPage, renderNMAPSidebarNav, startTimer } from '../ui/nmap-page.js';
import { renderDAABSub, renderDAABSideNav } from '../ui/daab-page.js';
import { buildResults } from '../ui/results.js';

function restoreUI() {
  // Determine where the user left off and resume
  const { sessionId, cpi, sea, nmap, daab } = S;
  if (!sessionId) { goPage('landing'); return; }

  // Results already generated
  if (sea.scores && cpi.scores && nmap.scores) {
    buildResults();
    goPage('results');
    return;
  }

  // Ready page (SEAA finished, awaiting results render)
  if (sea.scores) {
    goPage('ready');
    return;
  }
  if (nmap.scores) {
    // If CPI was also completed, show transition3
    if (cpi.scores) {
      goPage('transition3');
    } else if (cpi.startTime) {
      // CPI in progress
      goPage('cpi');
      renderCPIQ();
      startTimer('cpi-timer', S.cpi);
    } else {
      // finished NMAP, in DAAB or transition2
      if (daab.currentSub > 0 || Object.values(daab).some(m => m && m.answers && m.answers.some(a => a !== null))) {
        // DAAB in progress — restore sub-module
        const sub = DAAB_SUBS[daab.currentSub] || DAAB_SUBS[0];
        // Use startDAAB-like routing but without resetting answers
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-daab').classList.add('active');
        window.scrollTo(0, 0);
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
        renderDAABSub(daab.currentSub, true); // skipTimer=true on restore
      } else {
        goPage('transition2');
      }
      return;
    }
    return;
  }

  // NMAP in progress
  if (nmap.startTime) {
    goPage('nmap');
    renderNMAPPage();
    renderNMAPSidebarNav();
    startTimer('nmap-timer', S.nmap);
    return;
  }

  // Just registered, NMAP not yet started
  if (sessionId && !nmap.startTime) {
    // Show transition or register landing
    goPage('register');
    return;
  }

  // SEAA in progress (shouldn't reach here normally, but guard)
  if (sea.startTime) {
    goPage('nseaas');
    renderSEAPage();
    renderSEASidebarNav();
    startTimer('sea-timer', S.sea);
    return;
  }

  // CPI in progress
  if (cpi.startTime) {
    goPage('cpi');
    renderCPIQ();
    return;
  }

  goPage('landing');
}


export { restoreUI };
