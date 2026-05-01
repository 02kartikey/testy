/* ════════════════════════════════════════════════════════════════════
   charts/cpi-charts.js
   CPI bar + donut charts.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { CPI_AREAS } from '../engine/cpi.js';
import { CHARTS, destroyChart, CHART_ALPHA } from './core.js';

function buildCPICharts() {
  const cpi = S.cpi.scores;
  if (!cpi) return;

  // ── 1. Horizontal Bar ──
  destroyChart('cpi-hbar');
  const hbarCtx = document.getElementById('chart-cpi-hbar');
  if (hbarCtx) {
    const ranked = cpi.ranked;
    CHARTS['cpi-hbar'] = new Chart(hbarCtx, {
      type: 'bar',
      data: {
        labels: ranked.map(a => a.abbr),
        datasets: [{
          label: 'Score',
          data: ranked.map(a => a.score),
          backgroundColor: ranked.map(a => CHART_ALPHA(a.color, 0.85)),
          borderColor:     ranked.map(a => a.color),
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` Score: ${ctx.raw} / 20  (${ranked[ctx.dataIndex].level})`
            }
          }
        },
        scales: {
          x: {
            max: 20, beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { display: false },
            ticks: { font: { family: 'Poppins', size: 11, weight: '600' } }
          }
        }
      }
    });
  }

  // ── 2. Donut ──
  destroyChart('cpi-donut');
  const donutCtx = document.getElementById('chart-cpi-donut');
  if (donutCtx) {
    const nonZero = cpi.ranked.filter(a => a.score > 0);
    CHARTS['cpi-donut'] = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: nonZero.map(a => a.abbr),
        datasets: [{
          data: nonZero.map(a => a.score),
          backgroundColor: nonZero.map(a => CHART_ALPHA(a.color, 0.82)),
          borderColor: nonZero.map(a => a.color),
          borderWidth: 2,
          hoverOffset: 10,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${cpi.ranked.find(a=>a.abbr===ctx.label)?.label || ctx.label}: ${ctx.raw} (${ctx.parsed}%)`
            }
          }
        }
      }
    });

    // Build custom legend
    const legend = document.getElementById('chart-cpi-legend');
    if (legend) {
      legend.innerHTML = nonZero.map(a =>
        `<div class="chart-legend-item">
          <div class="chart-legend-dot" style="background:${a.color}"></div>
          <span>${a.abbr}</span>
        </div>`
      ).join('');
    }
  }

  // ── Summary stats ──
  const statsEl = document.getElementById('chart-cpi-stats');
  if (statsEl && cpi.top3.length) {
    const total = cpi.ranked.reduce((s,a)=>s+a.score,0);
    statsEl.innerHTML = [
      { num: cpi.top3[0].label.split(' ')[0], lbl: 'Top Interest' },
      { num: cpi.top3[0].score, lbl: 'Top Score' },
      { num: cpi.ranked.filter(a=>a.level==='Strong').length, lbl: 'Strong Areas' },
      { num: total, lbl: 'Total Selections' },
    ].map(s =>
      `<div class="chart-stat-pill">
        <div class="chart-stat-num">${s.num}</div>
        <div class="chart-stat-lbl">${s.lbl}</div>
      </div>`
    ).join('');
  }
}

/* ═══════════════════════════════════════
   SEL CHARTS
═══════════════════════════════════════ */

export { buildCPICharts };
