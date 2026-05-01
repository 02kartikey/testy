/* ════════════════════════════════════════════════════════════════════
   main.js
   Application entry point. This file:
     1. Imports every module so they execute their side-effects
        (constants, listeners, etc.) in the correct order.
     2. Re-exposes selected functions on the global window object so
        inline onclick="..." attributes in index.html keep working.
     3. Wires the DOMContentLoaded boot sequence and beforeunload save.

   To use: replace the old <script src="app.js"> tag in index.html with
       <script type="module" src="js/main.js"></script>
════════════════════════════════════════════════════════════════════ */

// ── Persistence + DB ──
import { S, DB, saveState, loadState, clearState, _isConfigured,
         _saveSession, _clearSession, _restoreSession } from './state.js';
import { showDbStatus } from './db-status.js';

// ── Routing & registration ──
import { navLogoClick, goPage, _showResumeOverlay, _doResume, _goPageReal,
         doRegister, PIP_IDX } from './router.js';

// Expose routing functions immediately after router loads — before remaining
// imports — so inline onclick="goPage(...)" buttons never see "not defined"
// even if a later import throws.
window.goPage        = goPage;
window.navLogoClick  = navLogoClick;
window._goPageReal   = _goPageReal;
window._showResumeOverlay = _showResumeOverlay;
window._doResume     = _doResume;
window.doRegister    = doRegister;

// ── Engine constants & scorers ──
import { CPI_AREAS, CPI_QS } from './engine/cpi.js';
import { SEA_DOMAINS, SEA_QS, DOMAIN_NAME, SEA_ENCOURAGE } from './engine/sea.js';
import { ENGINE } from './engine/scorers.js';
import { NMAP_DIMS, NMAP_RAW_STMTS, NMAP_PAGES, NMAP_ENCOURAGE } from './engine/nmap.js';
import { DAAB_SUBS, DAAB_KEYS, DAAB_VA_QS, DAAB_PA_QS, DAAB_NA_QS,
         DAAB_LSA_QS, DAAB_HMA_QS, DAAB_AR_QS, DAAB_MA_QS, DAAB_SA_QS,
         DAAB_SA_ROW_IMAGES, scoreDAAB, getStanine, stanineLabel } from './engine/daab.js';

// ── UI pages ──
import { startCPI, renderCPIQ, cpiSel, cpiNav, cpiJump, renderCPIMap, submitCPI } from './ui/cpi-page.js';
import { startNSEAAS, renderSEAPage, seaAns, trySeaNextPage, seaPageNav,
         renderSEASidebarNav, trySubmitNSEAAS } from './ui/sea-page.js';
import { startNMAP, renderNMAPPage, nmapAns, tryNmapNextPage, nmapPageNav,
         renderNMAPSidebarNav, trySubmitNMAP, startTimer, stopTimer } from './ui/nmap-page.js';
import { startDAAB, renderDAABSub, advanceDAABSub, finishDAAB,
         renderVA, renderPA, renderNA, renderMCQ, renderAR, renderMA, renderSA,
         buildDAABResults } from './ui/daab-page.js';
import { buildResults, buildCharts, buildCareers, buildNMAPResults } from './ui/results.js';
import { initStateDropdown, populateCities } from './ui/registration.js';
import { restoreUI } from './ui/restore.js';

// ── Charts ──
import { switchChartTab, destroyChart } from './charts/core.js';
import { buildCPICharts } from './charts/cpi-charts.js';
import { buildSELCharts } from './charts/sea-charts.js';
import { buildNMAPCharts } from './charts/nmap-charts.js';
import { buildDAAbCharts } from './charts/daab-charts.js';
import { buildOverviewCharts } from './charts/overview-charts.js';
import { buildReportCharts } from './charts/report-charts.js';

// ── AI generation ──
import { generateAIReport, cancelReport } from './ai/generator.js';
import { renderAIReport, showAILoading, showAIError } from './ai/render.js';

// ── PDF ──
import { downloadPDF } from './pdf/download.js';

// ── DOM patches (side-effect import: rewires answer callbacks) ──
import './dom-patches.js';

/* ─────────────────────────────────────────────────────────────────
   Re-expose to window for inline onclick="…" attributes in index.html.
   This is the bridge between ESM-scoped imports and HTML-attribute
   string lookups. If an inline handler exists in index.html, its
   identifier MUST be exposed here.
───────────────────────────────────────────────────────────────── */
Object.assign(window, {
  // routing
  navLogoClick, goPage, _showResumeOverlay, _doResume, _goPageReal, doRegister,
  // assessment entry / nav
  startCPI, cpiSel, cpiNav, cpiJump, submitCPI,
  startNSEAAS, seaAns, trySeaNextPage, seaPageNav, trySubmitNSEAAS,
  startNMAP, nmapAns, tryNmapNextPage, nmapPageNav, trySubmitNMAP,
  startDAAB, renderDAABSub, advanceDAABSub, finishDAAB,
  // results & charts
  buildResults, buildCharts, switchChartTab,
  // registration helpers
  initStateDropdown, populateCities,
  // AI + PDF entry points
  generateAIReport, cancelReport, renderAIReport, downloadPDF,
  // expose state + engine for debugging / for any inline JS that reads it
  S, DB, ENGINE,
});

/* ─────────────────────────────────────────────────────────────────
   Bootstrap — DOMContentLoaded handler (originally inline at line 221
   of the old app.js) restores any in-progress session.
───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function _initSession() {
  // Try to restore a saved session from sessionStorage; if found, show
  // the resume overlay so the user can continue where they left off.
  try {
    const savedPage = _restoreSession();
    const midPages = ['nmap','daab','cpi','nseaas','transition','transition2','transition3'];
    if (savedPage && midPages.includes(savedPage)) {
      _showResumeOverlay(savedPage);
    } else if (savedPage === 'ready' || savedPage === 'results') {
      _goPageReal(savedPage);
    }
  } catch (e) {
    console.warn('[NM] init failed:', e);
  }

  // Init registration UI (state/city dropdowns).
  if (typeof initStateDropdown === 'function') {
    try { initStateDropdown(); } catch (e) {}
  }
});

/* Save state when the page is about to unload */
window.addEventListener('beforeunload', () => {
  try { saveState(); } catch (e) {}
});

console.log('[NuMind] modules loaded');
