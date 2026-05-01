/* ════════════════════════════════════════════════════════════════════
   db-status.js
   DB connectivity banner.
════════════════════════════════════════════════════════════════════ */

import { _isConfigured } from './state.js';

function showDbStatus(state, msg) {
  const w = document.getElementById('db-status');
  const d = document.getElementById('db-dot');
  const t = document.getElementById('db-msg');
  w.style.display = 'flex';
  d.className = 'db-dot ' + state;
  t.textContent = msg;
  if (state === 'saved' || state === 'error') {
    setTimeout(() => { w.style.display = 'none'; }, 3000);
  }
}


export { showDbStatus };
