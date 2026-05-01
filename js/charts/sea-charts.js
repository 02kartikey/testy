/* ════════════════════════════════════════════════════════════════════
   charts/sea-charts.js
   SEAA gauges + radar.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { SEA_DOMAINS } from '../engine/sea.js';
import { CHARTS, destroyChart } from './core.js';

function buildSELCharts() {
  const sea = S.sea.scores;
  if (!sea) return;

  // SEL: lower score = better adjustment. Map cat to color (A=green, E=red)
  const domInfo = {
    E: { label: 'Emotional', color: '#1e3a5f', light: '#e4eef8' },
    S: { label: 'Social',    color: '#0f766e', light: '#ccfbf1' },
    A: { label: 'Academic',  color: '#b45309', light: '#fef3c7' },
  };
  // Cat A = excellent (green), B=good, C=average, D=unsatisfactory, E=high concern (red)
  const catColor = { A:'#10b981', B:'#34d399', C:'#f59e0b', D:'#f97316', E:'#ef4444' };
  const doms = ['E','S','A'];

  // Bar colors REFLECT category, not domain — HIGH bar = HIGH concern = RED
  const barColors = doms.map(d => catColor[sea.cls[d].cat] || '#6b7280');

  // ── 1. Grouped bar — bar height = problem score, color = severity ──
  destroyChart('sel-bar');
  const barCtx = document.getElementById('chart-sel-bar');
  if (barCtx) {
    // Build zone annotation lines
    const selAnnotations = {
      zoneGreen: {
        type: 'box', xMin: -0.5, xMax: 2.5, yMin: 0, yMax: 8,
        backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)', borderWidth: 1,
      },
      zoneYellow: {
        type: 'box', xMin: -0.5, xMax: 2.5, yMin: 8, yMax: 14,
        backgroundColor: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)', borderWidth: 1,
      },
      zoneRed: {
        type: 'box', xMin: -0.5, xMax: 2.5, yMin: 14, yMax: 20,
        backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)', borderWidth: 1,
      },
    };
    CHARTS['sel-bar'] = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: doms.map(d => domInfo[d].label),
        datasets: [{
          label: '⚠ Problem Score (Higher = More Concern)',
          data: doms.map(d => sea.domScores[d]),
          backgroundColor: barColors.map(c => c + 'cc'),
          borderColor: barColors,
          borderWidth: 2.5, borderRadius: 10, borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, generateLabels: () => [
            { text: '🟢 0–8  Good Adjustment',    fillStyle: 'rgba(16,185,129,0.7)', fontColor: '#374151' },
            { text: '🟡 8–14  Moderate Concern',   fillStyle: 'rgba(245,158,11,0.7)', fontColor: '#374151' },
            { text: '🔴 14–20  Needs Attention',   fillStyle: 'rgba(239,68,68,0.7)',  fontColor: '#374151' },
          ]}},
          tooltip: {
            callbacks: {
              label: ctx => ` Score: ${ctx.raw}/20`,
              afterLabel: ctx => {
                const d = doms[ctx.dataIndex];
                const cl = sea.cls[d];
                return [` Category ${cl.cat}: ${cl.level}`, ` ↑ Higher bar = more difficulty`];
              }
            }
          }
        },
        scales: {
          y: {
            max: 20, beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            title: { display: true, text: '← Lower is better', font: { size: 10 }, color: '#6b7280' }
          },
          x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 12, weight: '600' } } }
        }
      }
    });
  }

  // ── 2. Custom gauges ──
  const gaugesEl = document.getElementById('chart-sel-gauges');
  if (gaugesEl) {
    gaugesEl.innerHTML = doms.map(d => {
      const sc = sea.domScores[d], cl = sea.cls[d], di = domInfo[d];
      const pct = Math.round(sc / 20 * 100);
      const cc = catColor[cl.cat] || '#6b7280';
      return `<div class="sel-gauge-item">
        <div class="sel-gauge-label">${di.label}</div>
        <div class="sel-gauge-track">
          <div class="sel-gauge-fill" data-label="${cl.level}"
            style="width:0%;background:${cc};transition:width 1.2s cubic-bezier(.22,1,.36,1)"
            data-target="${pct}">
          </div>
        </div>
        <div class="sel-gauge-score">${sc}<span style="font-size:11px;color:var(--ink4)">/20</span></div>
      </div>`;
    }).join('');
    // Animate after paint
    setTimeout(() => {
      document.querySelectorAll('.sel-gauge-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    }, 300);
  }

  // ── 3. Radar (inverted — higher on chart = better) ──
  destroyChart('sel-radar');
  const radarCtx = document.getElementById('chart-sel-radar');
  if (radarCtx) {
    const invertedScores = doms.map(d => 20 - sea.domScores[d]);
    CHARTS['sel-radar'] = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: ['Emotional\nAdjustment', 'Social\nAdjustment', 'Academic\nAdjustment'],
        datasets: [{
          label: 'Adjustment (higher = better)',
          data: invertedScores,
          backgroundColor: 'rgba(26,127,142,0.15)',
          borderColor: '#1a7f8e',
          pointBackgroundColor: '#1a7f8e',
          pointBorderColor: '#fff',
          pointRadius: 6,
          borderWidth: 2.5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 20,
            ticks: { stepSize: 5, font: { size: 10 } },
            pointLabels: { font: { family: 'Poppins', size: 11, weight: '600' }, color: '#2d3348' },
            grid: { color: 'rgba(0,0,0,0.07)' },
            angleLines: { color: 'rgba(0,0,0,0.08)' },
          }
        }
      }
    });
  }
}

/* ═══════════════════════════════════════
   NMAP CHARTS
═══════════════════════════════════════ */

export { buildSELCharts };
