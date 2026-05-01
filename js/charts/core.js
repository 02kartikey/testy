/* ════════════════════════════════════════════════════════════════════
   charts/core.js
   Chart.js registry + colour helpers. NO chart-builder imports here — buildCharts is in ui/results.js. This avoids cyclic imports.
════════════════════════════════════════════════════════════════════ */

const CHARTS = {};

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

// Tab switching
function switchChartTab(tab) {
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.chart-tab').forEach(t => {
    if (t.getAttribute('onclick') === `switchChartTab('${tab}')`) t.classList.add('active');
  });
  const panel = document.getElementById('chart-panel-' + tab);
  if (panel) panel.classList.add('active');
}

// Called from buildResults() after scores are ready


/* ── Colour helpers ── */
const CHART_ALPHA = (hex, a) => {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

function stanineColor(s, alpha) {
  // Zone: 1-3 = Red (Needs Attention), 4-6 = Yellow (Developing), 7-9 = Green (Strength)
  const hex = s <= 3 ? '#ef4444' : s <= 6 ? '#f59e0b' : '#10b981';
  if (!alpha) return hex;
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function stanineZoneLabel(s) {
  return s <= 3 ? '🔴 Needs Attention' : s <= 6 ? '🟡 Developing' : '🟢 Strength';
}

/* ═══════════════════════════════════════
   CPI CHARTS
═══════════════════════════════════════ */

export { CHARTS, destroyChart, switchChartTab, CHART_ALPHA, stanineColor, stanineZoneLabel };
