/* ════════════════════════════════════════════════════════════════════
   ai/pill.js
   AI generation status pill + toast UI.
════════════════════════════════════════════════════════════════════ */

function _ensurePillAndToast() {
  if (document.getElementById('ai-gen-pill')) return;

  // ── Floating pill ──────────────────────────────────
  const pill = document.createElement('div');
  pill.id = 'ai-gen-pill';
  pill.innerHTML = `
    <span id="ai-pill-spinner" style="
      display:inline-block;width:16px;height:16px;border-radius:50%;
      border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;
      animation:ai-spin 0.85s linear infinite;flex-shrink:0"></span>
    <span id="ai-pill-msg" style="font-size:13px;font-weight:600;letter-spacing:.01em">
      Generating your report…
    </span>
    <button onclick="cancelReport()" title="Cancel" style="
      background:rgba(255,255,255,.18);border:none;border-radius:6px;
      color:#fff;cursor:pointer;font-size:12px;font-weight:700;
      padding:2px 8px;margin-left:4px;line-height:1.6">✕</button>
  `;
  Object.assign(pill.style, {
    position:'fixed', bottom:'24px', right:'24px', zIndex:'9999',
    display:'none', alignItems:'center', gap:'10px',
    background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
    color:'#fff', padding:'10px 16px', borderRadius:'40px',
    boxShadow:'0 8px 24px rgba(79,70,229,.45)',
    fontFamily:"'Poppins',sans-serif",
    backdropFilter:'blur(8px)',
    transition:'opacity .3s,transform .3s',
  });
  document.body.appendChild(pill);

  // ── Completion toast ───────────────────────────────
  const toast = document.createElement('div');
  toast.id = 'ai-ready-toast';
  toast.innerHTML = `
    <span style="font-size:18px">✦</span>
    <span style="flex:1;font-size:14px;font-weight:600">Your AI Report is ready!</span>
    <a id="ai-toast-link" href="#ai-report-card" style="
      background:#fff;color:#4f46e5;border-radius:8px;
      padding:6px 14px;font-size:13px;font-weight:700;
      text-decoration:none;white-space:nowrap;flex-shrink:0">View Report ↓</a>
    <button onclick="_dismissToast()" style="
      background:rgba(255,255,255,.2);border:none;border-radius:6px;
      color:#fff;cursor:pointer;font-size:13px;font-weight:700;
      padding:4px 9px;line-height:1.6">✕</button>
  `;
  Object.assign(toast.style, {
    position:'fixed', top:'0', left:'0', right:'0', zIndex:'10000',
    display:'none', alignItems:'center', gap:'12px',
    background:'linear-gradient(90deg,#4f46e5,#7c3aed)',
    color:'#fff', padding:'14px 24px',
    fontFamily:"'Poppins',sans-serif",
    boxShadow:'0 4px 20px rgba(79,70,229,.5)',
    transform:'translateY(-100%)',
    transition:'transform .4s cubic-bezier(.22,1,.36,1)',
  });
  document.body.appendChild(toast);
}

function _showPill(msg) {
  _ensurePillAndToast();
  const pill = document.getElementById('ai-gen-pill');
  if (!pill) return;
  const msgEl = document.getElementById('ai-pill-msg');
  if (msgEl && msg) msgEl.textContent = msg;
  pill.style.display = 'flex';
  // Force reflow then fade-in
  requestAnimationFrame(() => { pill.style.opacity = '1'; pill.style.transform = 'translateY(0)'; });
}

function _hidePill() {
  const pill = document.getElementById('ai-gen-pill');
  if (!pill) return;
  pill.style.opacity = '0';
  pill.style.transform = 'translateY(8px)';
  setTimeout(() => { pill.style.display = 'none'; }, 320);
}

function _updatePillMsg(msg) {
  const el = document.getElementById('ai-pill-msg');
  if (el) el.textContent = msg;
}

function _showToast(studentName) {
  _ensurePillAndToast();
  const toast = document.getElementById('ai-ready-toast');
  if (!toast) return;
  const span = toast.querySelector('span:nth-child(2)');
  if (span) span.textContent = `${studentName ? studentName + "'s" : 'Your'} AI Report is ready!`;
  toast.style.display = 'flex';
  requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; });
  // Auto-dismiss after 8 s
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(_dismissToast, 8000);
}

function _dismissToast() {
  const toast = document.getElementById('ai-ready-toast');
  if (!toast) return;
  toast.style.transform = 'translateY(-100%)';
  setTimeout(() => { toast.style.display = 'none'; }, 420);
}

/* ── Active abort controller (one per user session) ── */

export { _ensurePillAndToast, _showPill, _hidePill, _updatePillMsg, _showToast, _dismissToast };
