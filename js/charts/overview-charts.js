/* ════════════════════════════════════════════════════════════════════
   charts/overview-charts.js
   Overview combined charts (radar + bar).
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { CPI_AREAS } from '../engine/cpi.js';
import { NMAP_DIMS } from '../engine/nmap.js';
import { DAAB_SUBS } from '../engine/daab.js';
import { SEA_DOMAINS } from '../engine/sea.js';
import { CHARTS, destroyChart, stanineColor } from './core.js';

function buildOverviewCharts() {
  const nmap = S.nmap.scores;
  const daabSubs = ['va','pa','na','lsa','hma','ar','ma','sa'];
  const subLabels = { va:'Verbal', pa:'Percept.', na:'Numer.', lsa:'Legal', hma:'Health', ar:'Abstract', ma:'Mechan.', sa:'Spatial' };
  const available = daabSubs.filter(k => S.daab[k].scores);

  // Build a combined array of all stanine dimensions
  const allLabels = [], allStanines = [], allColors = [], allGroups = [];

  if (nmap) {
    nmap.dims.forEach(d => {
      allLabels.push(d.abbr);
      allStanines.push(d.stanine);
      allColors.push(stanineColor(d.stanine));
      allGroups.push('Personality');
    });
  }
  available.forEach(k => {
    allLabels.push(subLabels[k]);
    allStanines.push(S.daab[k].scores.stanine);
    allColors.push(stanineColor(S.daab[k].scores.stanine));
    allGroups.push('Aptitude');
  });

  // ── 1. Big grouped bar ──
  destroyChart('overview-bar');
  const ovBarCtx = document.getElementById('chart-overview-bar');
  if (ovBarCtx && allLabels.length) {
    CHARTS['overview-bar'] = new Chart(ovBarCtx, {
      type: 'bar',
      data: {
        labels: allLabels,
        datasets: [{
          label: 'Stanine Score',
          data: allStanines,
          backgroundColor: allColors.map(c => c + 'cc'),
          borderColor: allColors,
          borderWidth: 2, borderRadius: 6, borderSkipped: false,
        }, {
          type: 'line',
          label: 'Average (5)',
          data: Array(allLabels.length).fill(5),
          borderColor: 'rgba(107,114,128,0.4)',
          borderDash: [6,4], borderWidth: 2,
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
              title: ctx => `${ctx[0].label} (${allGroups[ctx[0].dataIndex]})`,
              label: ctx => ctx.datasetIndex === 0
                ? ` Stanine: ${ctx.raw} — ${ctx.raw<=3?'🔴 Needs Attention':ctx.raw<=6?'🟡 Developing':'🟢 Strength'}`
                : ' Average'
            }
          }
        },
        scales: {
          y: { min: 0, max: 9, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1 } },
          x: { grid: { display: false }, ticks: { font: { family:'Poppins', size: 9, weight: '600' }, maxRotation: 45 } }
        }
      }
    });
  }

  // ── 2. Combined personality + aptitude radar ──
  destroyChart('overview-radar');
  const ovRadCtx = document.getElementById('chart-overview-radar');
  if (ovRadCtx && nmap && available.length) {
    const top5personality = nmap.sorted.slice(0, 5);
    const topAptitude = available.slice(0, 5);
    const radarLabels = [...top5personality.map(d => d.abbr), ...topAptitude.map(k => subLabels[k])];
    CHARTS['overview-radar'] = new Chart(ovRadCtx, {
      type: 'radar',
      data: {
        labels: radarLabels,
        datasets: [{
          label: 'Personality (Top 5)',
          data: [...top5personality.map(d => d.stanine), ...Array(topAptitude.length).fill(0)],
          backgroundColor: 'rgba(124,58,237,0.12)',
          borderColor: '#7c3aed',
          pointBackgroundColor: '#7c3aed',
          pointBorderColor: '#fff',
          pointRadius: 5, borderWidth: 2.5, fill: true,
        }, {
          label: 'Aptitude',
          data: [...Array(top5personality.length).fill(0), ...topAptitude.map(k => S.daab[k].scores.stanine)],
          backgroundColor: 'rgba(245,158,11,0.1)',
          borderColor: '#f59e0b',
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#fff',
          pointRadius: 5, borderWidth: 2.5, fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { family:'Inter', size:11 }, boxWidth:12 } } },
        scales: {
          r: {
            min: 0, max: 9,
            ticks: { stepSize: 3, font: { size: 9 }, callback: v => v===3?'🔴Low':v===6?'🟡Avg':v===9?'🟢High':'' },
            pointLabels: { font: { family:'Poppins', size:10, weight:'700' }, color:'#2d3348' },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.07)' },
          }
        }
      }
    });
  }

  // ── Summary stats ──
  const statsEl = document.getElementById('chart-overview-stats');
  if (statsEl) {
    const allStn = allStanines;
    const avg = allStn.length ? (allStn.reduce((a,b)=>a+b,0)/allStn.length).toFixed(1) : '-';
    const high = allStn.filter(s=>s>=7).length;
    const mid  = allStn.filter(s=>s>=4&&s<=6).length;
    const low  = allStn.filter(s=>s<=3).length;
    // SEL snapshot
    const sea = S.sea.scores;
    const cpi = S.cpi.scores;
    const seaSummary = sea
      ? `E: Cat${sea.cls.E.cat} · S: Cat${sea.cls.S.cat} · A: Cat${sea.cls.A.cat}`
      : '—';
    const cpiTop = cpi && cpi.top3.length ? cpi.top3.slice(0,2).map(a=>a.abbr).join(', ') : '—';
    statsEl.innerHTML = `
      <div class="chart-stat-pill" style="border-left:4px solid #10b981">
        <div class="chart-stat-num" style="color:#10b981">${high}</div>
        <div class="chart-stat-lbl">🟢 Strengths</div>
      </div>
      <div class="chart-stat-pill" style="border-left:4px solid #f59e0b">
        <div class="chart-stat-num" style="color:#f59e0b">${mid}</div>
        <div class="chart-stat-lbl">🟡 Developing</div>
      </div>
      <div class="chart-stat-pill" style="border-left:4px solid #ef4444">
        <div class="chart-stat-num" style="color:#ef4444">${low}</div>
        <div class="chart-stat-lbl">🔴 Needs Attention</div>
      </div>
      <div class="chart-stat-pill" style="border-left:4px solid #1a7f8e">
        <div class="chart-stat-num" style="color:#1a7f8e">${avg}</div>
        <div class="chart-stat-lbl">Avg Stanine</div>
      </div>
      <div class="chart-stat-pill" style="border-left:4px solid #7c6fcd;min-width:200px">
        <div class="chart-stat-num" style="font-size:13px;color:#7c6fcd">${seaSummary}</div>
        <div class="chart-stat-lbl">SEL Categories</div>
      </div>
      <div class="chart-stat-pill" style="border-left:4px solid #4f46e5;min-width:140px">
        <div class="chart-stat-num" style="font-size:13px;color:#4f46e5">${cpiTop}</div>
        <div class="chart-stat-lbl">Top Interests</div>
      </div>`;
  }
}


// Generated once per page load — changes on every F5/reload.

export { buildOverviewCharts };
