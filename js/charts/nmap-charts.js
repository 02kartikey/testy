/* ════════════════════════════════════════════════════════════════════
   charts/nmap-charts.js
   NMAP radar + bar.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { NMAP_DIMS } from '../engine/nmap.js';
import { CHARTS, destroyChart, stanineColor, CHART_ALPHA } from './core.js';

function buildNMAPCharts() {
  const nmap = S.nmap.scores;
  if (!nmap) return;

  const dims = nmap.dims;
  const labels = dims.map(d => d.abbr);
  const stanines = dims.map(d => d.stanine);
  const pcts = dims.map(d => d.pct);
  const colors = dims.map(d => stanineColor(d.stanine));

  // ── 1. Radar ──
  destroyChart('nmap-radar');
  const radarCtx = document.getElementById('chart-nmap-radar');
  if (radarCtx) {
    CHARTS['nmap-radar'] = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Stanine',
          data: stanines,
          backgroundColor: 'rgba(124,58,237,0.12)',
          borderColor: '#7c3aed',
          pointBackgroundColor: colors,
          pointBorderColor: '#fff',
          pointRadius: 7,
          borderWidth: 2.5,
          fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 9,
            ticks: { stepSize: 3, font: { size: 10 }, callback: v => v === 3 ? '🔴Low' : v === 6 ? '🟡Avg' : v === 9 ? '🟢High' : '' },
            pointLabels: { font: { family: 'Poppins', size: 10, weight: '700' }, color: '#2d3348' },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.07)' },
          }
        }
      }
    });
  }

  // ── 2. Vertical bar ──
  destroyChart('nmap-bar');
  const barCtx = document.getElementById('chart-nmap-bar');
  if (barCtx) {
    CHARTS['nmap-bar'] = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Stanine',
          data: stanines,
          backgroundColor: colors.map(c => c + 'bb'),
          borderColor: colors,
          borderWidth: 2, borderRadius: 8, borderSkipped: false,
        }, {
          type: 'line',
          label: 'Average (5)',
          data: Array(dims.length).fill(5),
          borderColor: 'rgba(107,114,128,0.5)',
          borderDash: [5,5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12, generateLabels: (chart) => [
            ...Chart.defaults.plugins.legend.labels.generateLabels(chart),
            { text: '🔴 1–3 Needs Attention · 🟡 4–6 Developing · 🟢 7–9 Strength', fillStyle: 'transparent', strokeStyle: 'transparent', fontColor: '#6b7280', textDecoration: 'none' }
          ]}},
          tooltip: {
            callbacks: {
              label: ctx => ctx.datasetIndex === 0
                ? ` Stanine ${ctx.raw}: ${dims[ctx.dataIndex].label} — ${ctx.raw<=3?'🔴 Needs Attention':ctx.raw<=6?'🟡 Developing':'🟢 Strength'}`
                : ` Average band`
            }
          }
        },
        scales: {
          y: { min: 0, max: 9, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 10, weight: '600' } } }
        }
      }
    });
  }

  // ── 3. Bubble chart ──
  destroyChart('nmap-bubble');
  const bubCtx = document.getElementById('chart-nmap-bubble');
  if (bubCtx) {
    CHARTS['nmap-bubble'] = new Chart(bubCtx, {
      type: 'bubble',
      data: {
        datasets: dims.map((d, i) => ({
          label: d.abbr,
          data: [{ x: i + 1, y: d.pct, r: Math.max(6, d.stanine * 4) }],
          backgroundColor: CHART_ALPHA(colors[i], 0.75),
          borderColor: colors[i],
          borderWidth: 2,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.y}% · stanine ${dims[ctx.datasetIndex].stanine}`
            }
          }
        },
        scales: {
          x: { display: false, min: 0, max: 10 },
          y: {
            min: 0, max: 100,
            title: { display: true, text: 'Raw Score %', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { callback: v => v + '%', font: { size: 10 } }
          }
        }
      }
    });
  }
}

/* ═══════════════════════════════════════
   DAAB CHARTS
═══════════════════════════════════════ */

export { buildNMAPCharts };
