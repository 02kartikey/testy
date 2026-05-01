/* ════════════════════════════════════════════════════════════════════
   charts/daab-charts.js
   DAAB bar + radar.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { DAAB_SUBS } from '../engine/daab.js';
import { CHARTS, destroyChart, stanineColor } from './core.js';

function buildDAAbCharts() {
  const daabSubs = ['va','pa','na','lsa','hma','ar','ma','sa'];
  const subLabels = { va:'Verbal', pa:'Perceptual', na:'Numerical', lsa:'Legal', hma:'Health', ar:'Abstract', ma:'Mechanical', sa:'Spatial' };
  const subEmoji  = { va:'📝', pa:'👁️', na:'🔢', lsa:'⚖️', hma:'🏥', ar:'🔷', ma:'⚙️', sa:'📐' };

  const available = daabSubs.filter(k => S.daab[k].scores);
  if (!available.length) return;

  const labels   = available.map(k => subLabels[k]);
  const stanines = available.map(k => S.daab[k].scores.stanine);
  const raws     = available.map(k => S.daab[k].scores.raw);
  const maxes    = available.map(k => S.daab[k].scores.max);
  const colors   = stanines.map(stanineColor);

  // ── 1. Bar with annotation line ──
  destroyChart('daab-bar');
  const barCtx = document.getElementById('chart-daab-bar');
  if (barCtx) {
    CHARTS['daab-bar'] = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Stanine',
          data: stanines,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2, borderRadius: 8, borderSkipped: false,
        }, {
          type: 'line',
          label: 'Average (5)',
          data: Array(available.length).fill(5),
          borderColor: 'rgba(107,114,128,0.55)',
          borderDash: [6,4],
          borderWidth: 2,
          pointRadius: 0, fill: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family:'Inter', size:11 }, boxWidth:12, generateLabels: (chart) => [
            ...Chart.defaults.plugins.legend.labels.generateLabels(chart),
            { text: '🔴 1–3 Needs Attention · 🟡 4–6 Developing · 🟢 7–9 Strength', fillStyle: 'transparent', strokeStyle: 'transparent', fontColor: '#6b7280' }
          ]}},
          tooltip: {
            callbacks: {
              label: ctx => ctx.datasetIndex === 0
                ? ` Stanine ${ctx.raw} (${S.daab[available[ctx.dataIndex]].scores.label}) — ${ctx.raw<=3?'🔴 Needs Attention':ctx.raw<=6?'🟡 Developing':'🟢 Strength'}`
                : ' Average'
            }
          }
        },
        scales: {
          y: { min: 0, max: 9, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1 } },
          x: { grid: { display: false }, ticks: { font: { family:'Poppins', size:11, weight:'600' } } }
        }
      }
    });
  }

  // ── 2. Radar ──
  destroyChart('daab-radar');
  const radCtx = document.getElementById('chart-daab-radar');
  if (radCtx) {
    CHARTS['daab-radar'] = new Chart(radCtx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Stanine',
          data: stanines,
          backgroundColor: 'rgba(245,158,11,0.12)',
          borderColor: '#f59e0b',
          pointBackgroundColor: colors,
          pointBorderColor: '#fff',
          pointRadius: 6,
          borderWidth: 2.5, fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 9,
            ticks: { stepSize: 3, font: { size: 10 }, callback: v => v === 3 ? '🔴Low' : v === 6 ? '🟡Avg' : v === 9 ? '🟢High' : '' },
            pointLabels: { font: { family:'Poppins', size:10, weight:'700' }, color:'#2d3348' },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.07)' },
          }
        }
      }
    });
  }

  // ── 3. Stacked bar: raw vs remaining ──
  destroyChart('daab-stacked');
  const stkCtx = document.getElementById('chart-daab-stacked');
  if (stkCtx) {
    CHARTS['daab-stacked'] = new Chart(stkCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Correct',
          data: raws,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2, borderRadius: 0, borderSkipped: false,
          stack: 'a',
        }, {
          label: 'Missed',
          data: available.map((k,i) => maxes[i] - raws[i]),
          backgroundColor: 'rgba(156,163,175,0.18)',
          borderColor: 'rgba(156,163,175,0.35)',
          borderWidth: 1, borderRadius: 0, borderSkipped: false,
          stack: 'a',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family:'Inter', size:11 }, boxWidth:12 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const k = available[ctx.dataIndex];
                return ctx.datasetIndex === 0
                  ? ` Correct: ${ctx.raw} / ${maxes[ctx.dataIndex]}`
                  : ` Missed: ${ctx.raw}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { family:'Poppins', size:11 } } },
          y: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size:11 } } }
        }
      }
    });
  }
}


export { buildDAAbCharts };
