/* ════════════════════════════════════════════════════════════════════
   ai/render.js
   Render AI report HTML, loading and error states.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { buildReportCharts } from '../charts/report-charts.js';
import { _aiState } from './generator.js';

function showAILoading(on) {
  document.getElementById('ai-report-idle').style.display    = on ? 'none' : 'block';
  document.getElementById('ai-report-loading').style.display = on ? 'block' : 'none';
  document.getElementById('ai-report-error').style.display   = 'none';
  document.getElementById('ai-report-output').style.display  = 'none';
  const btn       = document.getElementById('ai-report-btn');
  const cancelBtn = document.getElementById('ai-cancel-btn');
  if (btn) {
    btn.disabled     = on;
    btn.style.opacity = on ? '.45' : '1';
    btn.style.cursor  = on ? 'not-allowed' : 'pointer';
  }
  if (cancelBtn) {
    cancelBtn.style.display = on ? 'inline-flex' : 'none';
  }
}

function showAIError(msg) {
  document.getElementById('ai-report-idle').style.display    = 'none';
  document.getElementById('ai-report-loading').style.display = 'none';
  document.getElementById('ai-report-error').style.display   = 'block';
  document.getElementById('ai-report-output').style.display  = 'none';
  document.getElementById('ai-error-msg').textContent = msg;
  const btn       = document.getElementById('ai-report-btn');
  const cancelBtn = document.getElementById('ai-cancel-btn');
  if (btn)       { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
  if (cancelBtn) { cancelBtn.style.display = 'none'; }
  _aiState.generating = false; // release lock so the user can retry
  // Even if AI failed, allow the score-driven PDF to download.
  const pdfBtn = document.getElementById('pdf-download-btn');
  if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.classList.remove('loading'); }
}

function renderAIReport(data) {
  document.getElementById('ai-report-idle').style.display    = 'none';
  document.getElementById('ai-report-loading').style.display = 'none';
  document.getElementById('ai-report-error').style.display   = 'none';
  document.getElementById('ai-report-output').style.display  = 'block';
  const btn       = document.getElementById('ai-report-btn');
  const cancelBtn = document.getElementById('ai-cancel-btn');
  if (btn)       { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
  if (cancelBtn) { cancelBtn.style.display = 'none'; }
  _aiState.generating = false; // release lock — report is done
  // Now that the AI report is in window._lastAIReport, enable the PDF button.
  const pdfBtn = document.getElementById('pdf-download-btn');
  if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.classList.remove('loading'); }

  /* ── XSS GUARD: escape any string before interpolating into HTML.
     The AI response and the student-form values are both untrusted from
     a rendering standpoint — anything containing < > " ' & must be
     neutralised before it reaches innerHTML. ── */
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── helper: plain text → HTML paragraphs ── */
  function toHtml(text) {
    if (!text) return '';
    return text.split(/\n+/).filter(p => p.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('');
  }

  /* ── helper: render career table ── */
  function renderCareerTable(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    // Whitelist fit-classification values — anything else falls back to "Low"
    // so an AI hallucination of e.g. `High"; background:url(...)` cannot
    // escape the style attribute.
    const fitOk = v => (v === 'High' || v === 'Medium' || v === 'Low') ? v : 'Low';
    const fitColor = f => f === 'High' ? '#059669' : f === 'Medium' ? '#f59e0b' : '#6b7280';
    const fitBg    = f => f === 'High' ? '#d1fae5' : f === 'Medium' ? '#fef3c7' : '#f3f4f6';
    // Coerce numeric fields to numbers; fall back to 0 for anything weird.
    const num = v => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const rows_html = rows.map(r => {
      const rank   = num(r.rank);
      const pct    = Math.max(0, Math.min(100, Math.round(num(r.suitability_pct))));
      const iFit   = fitOk(r.interest_fit);
      const aFit   = fitOk(r.aptitude_fit);
      const pFit   = fitOk(r.personality_fit);
      return `
      <tr>
        <td style="font-weight:700;color:var(--ink);padding:12px 14px;border-bottom:1px solid var(--border)">${rank}</td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border)">
          <div style="font-weight:700;color:var(--ink);font-size:14px">${esc(r.career)}</div>
          <div style="font-size:12px;color:var(--ink3);margin-top:2px">${esc(r.cluster)}</div>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border);text-align:center">
          <span style="background:${fitBg(iFit)};color:${fitColor(iFit)};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">${iFit}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border);text-align:center">
          <span style="background:${fitBg(aFit)};color:${fitColor(aFit)};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">${aFit}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border);text-align:center">
          <span style="background:${fitBg(pFit)};color:${fitColor(pFit)};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">${pFit}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border);text-align:center">
          <div style="font-size:18px;font-weight:800;color:var(--brand)">${pct}%</div>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid var(--border);font-size:12px;color:var(--ink3)">${esc(r.stream)}</td>
      </tr>
      <tr>
        <td colspan="7" style="padding:4px 14px 14px 42px;border-bottom:1.5px solid var(--border2);font-size:13px;color:var(--ink2);line-height:1.6;background:#fafafa">${esc(r.rationale)}</td>
      </tr>`;
    }).join('');

    return `
      <div style="overflow-x:auto;margin-top:1.25rem">
        <table style="width:100%;border-collapse:collapse;font-family:'Poppins',sans-serif;background:var(--surface);border-radius:14px;overflow:hidden;box-shadow:var(--sh)">
          <thead>
            <tr style="background:linear-gradient(135deg,#0e4f5c,#1a7f8e);color:#fff">
              <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:700">#</th>
              <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:700">Career</th>
              <th style="padding:12px 14px;text-align:center;font-size:12px;font-weight:700">Interest</th>
              <th style="padding:12px 14px;text-align:center;font-size:12px;font-weight:700">Aptitude</th>
              <th style="padding:12px 14px;text-align:center;font-size:12px;font-weight:700">Personality</th>
              <th style="padding:12px 14px;text-align:center;font-size:12px;font-weight:700">Suitability</th>
              <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:700">Stream</th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>`;
  }

  /* ── Domain snapshot table ── */
  function buildDomainSnapshot() {
    const nmap = S.nmap.scores;
    const cpi  = S.cpi.scores;
    const sea  = S.sea.scores;
    const daabSubs = ['va','pa','na','lsa','hma','ar','ma','sa'];
    const available = daabSubs.filter(k => S.daab[k] && S.daab[k].scores);

    // Personality: average stanine
    const nmapAvg = nmap ? (nmap.dims.reduce((s,d)=>s+d.stanine,0)/nmap.dims.length).toFixed(1) : null;
    const nmapTop = nmap ? nmap.sorted[0].label : null;
    const nmapLevel = nmapAvg ? (nmapAvg>=7?'Strength':nmapAvg>=4?'Developing':'Needs Attention') : '—';
    const nmapColor = nmapAvg ? (nmapAvg>=7?'#059669':nmapAvg>=4?'#f59e0b':'#dc2626') : '#9ca3af';
    const nmapEmoji = nmapAvg ? (nmapAvg>=7?'🟢':nmapAvg>=4?'🟡':'🔴') : '⚪';

    // Aptitude: average stanine
    const daabAvg = available.length ? (available.reduce((s,k)=>s+S.daab[k].scores.stanine,0)/available.length).toFixed(1) : null;
    const daabLevel = daabAvg ? (daabAvg>=7?'Strength':daabAvg>=4?'Developing':'Needs Attention') : '—';
    const daabColor = daabAvg ? (daabAvg>=7?'#059669':daabAvg>=4?'#f59e0b':'#dc2626') : '#9ca3af';
    const daabEmoji = daabAvg ? (daabAvg>=7?'🟢':daabAvg>=4?'🟡':'🔴') : '⚪';

    // Interest: breadth (narrow/moderate/broad)
    let interestLabel = '—', interestColor = '#9ca3af', interestEmoji = '⚪';
    if (cpi) {
      const strongCount = cpi.ranked.filter(a=>a.level==='Strong').length;
      interestLabel = strongCount>=5?'Broad':strongCount>=2?'Moderate':'Narrow';
      interestColor = strongCount>=5?'#059669':strongCount>=2?'#f59e0b':'#dc2626';
      interestEmoji = strongCount>=5?'🟢':strongCount>=2?'🟡':'🔴';
    }

    // SEL: worst category
    let selLabel = '—', selColor = '#9ca3af', selEmoji = '⚪';
    if (sea) {
      const cats = [sea.cls.E.cat, sea.cls.S.cat, sea.cls.A.cat];
      const worst = cats.sort().reverse()[0];
      selLabel = worst==='A'?'Excellent':worst==='B'?'Good':worst==='C'?'Moderate':worst==='D'?'Unsatisfactory':'High Concern';
      selColor = worst<='B'?'#059669':worst==='C'?'#f59e0b':'#dc2626';
      selEmoji = worst<='B'?'🟢':worst==='C'?'🟡':'🔴';
    }

    const row = (icon, domain, level, detail, col, emoji) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;font-size:18px">${icon}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;font-weight:700;font-size:14px;color:#2d3348">${domain}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0">
          <span style="background:${col}20;color:${col};padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">${emoji} ${level}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280">${detail||'—'}</td>
      </tr>`;

    return `<div style="margin-bottom:1.75rem">
      <div style="font-family:'Poppins',sans-serif;font-size:15px;font-weight:800;color:#2d3348;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#0e4f5c,#1a7f8e);color:#fff;font-size:14px">📊</span>
        4-Domain Snapshot
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-family:'Poppins',sans-serif;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
          <thead>
            <tr style="background:linear-gradient(135deg,#0e4f5c,#1a7f8e);color:#fff">
              <th style="padding:10px 14px;text-align:left;font-size:12px;width:40px"></th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Domain</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Level</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${row('🧠','Personality (NMAP)', nmapLevel, nmapAvg?`Avg Stanine: ${nmapAvg}/9 · Top: ${nmapTop||'—'}`:'Complete NMAP test', nmapColor, nmapEmoji)}
            ${row('⚡','Aptitude (DAAB)', daabLevel, daabAvg?`Avg Stanine: ${daabAvg}/9`:'Complete DAAB test', daabColor, daabEmoji)}
            ${row('🎯','Career Interests (CPI)', interestLabel, cpi?`Top: ${cpi.top3.slice(0,2).map(a=>a.label).join(', ')}`:'Complete CPI test', interestColor, interestEmoji)}
            ${row('💚','Wellbeing (SEL)', selLabel, sea?`E:Cat${sea.cls.E.cat} · S:Cat${sea.cls.S.cat} · A:Cat${sea.cls.A.cat}`:'Complete NSEAAS test', selColor, selEmoji)}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  /* ── helper: inline chart container ── */
  function chartBox(id, title, sub, height, extra) {
    return `<div class="chart-box" style="margin-top:1.5rem;${extra||''}">
      <div class="chart-box-title">${title}</div>
      <div class="chart-box-sub">${sub}</div>
      <div class="chart-canvas-wrap" style="height:${height}px"><canvas id="${id}"></canvas></div>
    </div>`;
  }

  /* ── section renderer ── */
  function section(icon, title, colorFrom, colorTo, bgColor, borderColor, bodyHtml) {
    return `<div class="ai-section" style="border-color:${borderColor};background:${bgColor};margin-bottom:1.75rem;padding:1.75rem 2rem">
      <div class="ai-section-title" style="font-size:17px;margin-bottom:1rem">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,${colorFrom},${colorTo});color:#fff;font-size:16px;flex-shrink:0">${icon}</span>
        ${title}
      </div>
      ${bodyHtml}
    </div>`;
  }

  const st = S.student;

  /* ── Roadmap section builder ── */
  function buildRoadmap() {
    const cpi  = S.cpi.scores;
    const sea  = S.sea.scores;
    const nmap = S.nmap.scores;
    const daabSubs = ['va','pa','na','lsa','hma','ar','ma','sa'];
    const daabNames = {va:'Verbal',pa:'Perceptual',na:'Numerical',lsa:'Legal Studies',hma:'Health & Medical',ar:'Abstract Reasoning',ma:'Mechanical',sa:'Spatial'};
    const available = daabSubs.filter(k => S.daab[k] && S.daab[k].scores);

    // STRENGTH (use) = stanine 7+ in NMAP or DAAB
    const nmapStrengths = nmap ? nmap.dims.filter(d=>d.stanine>=7).map(d=>d.label) : [];
    const daabStrengths = available.filter(k=>S.daab[k].scores.stanine>=7).map(k=>daabNames[k]);
    const strengths = [...nmapStrengths, ...daabStrengths].slice(0,4);

    // GROWTH (fix) = stanine ≤3 in NMAP or DAAB
    const nmapGrowth = nmap ? nmap.dims.filter(d=>d.stanine<=3).map(d=>d.label) : [];
    const daabGrowth = available.filter(k=>S.daab[k].scores.stanine<=3).map(k=>daabNames[k]);
    const growthAreas = [...nmapGrowth, ...daabGrowth].slice(0,3);

    // EXPLORE (excites) = CPI top 3 interests
    const topInterests = cpi ? cpi.top3.map(a=>a.label) : [];

    // CONCERN (address) = SEL categories C, D, E
    const seaConcerns = sea ? Object.entries(sea.cls).filter(([d,cl])=>cl.cat>='C').map(([d,cl])=>{
      const lbl = {E:'Emotional',S:'Social',A:'Academic'};
      return `${lbl[d]} (Cat.${cl.cat} — ${cl.level})`;
    }) : [];

    const pillStyle = (col,bg) => `display:inline-block;background:${bg};color:${col};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin:3px 4px 3px 0`;

    const makeList = (items, col, bg) => items.length
      ? items.map(i=>`<span style="${pillStyle(col,bg)}">${i}</span>`).join('')
      : `<span style="${pillStyle('#9ca3af','#f9fafb')}">Nothing flagged — great!</span>`;

    return `<div style="background:linear-gradient(135deg,#f5f4fc 0%,#eaf8fb 100%);border:1.5px solid #c7d2fe;border-radius:16px;padding:1.75rem 2rem;margin-bottom:1.75rem">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#7c6fcd,#1a7f8e);color:#fff;font-size:18px;flex-shrink:0">🗺️</span>
        <div>
          <div style="font-family:'Poppins',sans-serif;font-size:17px;font-weight:800;color:#2d3348">My Learning Roadmap</div>
          <div style="font-size:12px;color:#6b7280;margin-top:1px">Personalised from your 4 assessment modules</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="background:#fff;border:1.5px solid #a7f3d0;border-radius:12px;padding:1rem">
          <div style="font-weight:700;font-size:13px;color:#059669;margin-bottom:8px">🟢 Use What's Strong</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Lean into these natural abilities:</div>
          ${makeList(strengths,'#059669','#d1fae5')}
          ${strengths.length===0?'<div style="font-size:12px;color:#9ca3af">Complete personality & aptitude tests to see your strengths.</div>':''}
        </div>
        <div style="background:#fff;border:1.5px solid #fecaca;border-radius:12px;padding:1rem">
          <div style="font-weight:700;font-size:13px;color:#dc2626;margin-bottom:8px">🔴 Fix What's Weak</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Build these up with practice:</div>
          ${makeList(growthAreas,'#dc2626','#fee2e2')}
        </div>
        <div style="background:#fff;border:1.5px solid #bfdbfe;border-radius:12px;padding:1rem">
          <div style="font-weight:700;font-size:13px;color:#1d4ed8;margin-bottom:8px">💡 Explore What Excites</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Your top career interest areas:</div>
          ${makeList(topInterests,'#1d4ed8','#eff6ff')}
        </div>
        <div style="background:#fff;border:1.5px solid #fed7aa;border-radius:12px;padding:1rem">
          <div style="font-weight:700;font-size:13px;color:#c2410c;margin-bottom:8px">⚡ Address SEL Concerns</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Focus support here for wellbeing:</div>
          ${makeList(seaConcerns,'#c2410c','#fff7ed')}
        </div>
      </div>
    </div>`;
  }

  /* ── Build HTML ── */
  let html = `
    <!-- COVER STRIP -->
    <div style="background:linear-gradient(135deg,#0e4f5c,#1a7f8e);border-radius:20px;padding:2rem 2.25rem;margin-bottom:1.75rem;color:#fff;position:relative;overflow:hidden">
      <div style="position:absolute;top:-30px;right:-30px;width:180px;height:180px;background:rgba(255,255,255,.05);border-radius:50%"></div>
      <div style="position:absolute;bottom:-40px;right:60px;width:120px;height:120px;background:rgba(255,255,255,.04);border-radius:50%"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;position:relative">
        <div>
          <div style="font-size:12px;font-weight:600;opacity:.75;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.4rem">NuMind MAPS — Personalised Assessment Report</div>
          <div style="font-family:'Nunito',sans-serif;font-size:26px;font-weight:800;margin-bottom:.3rem">${esc(st.fullName)}</div>
          <div style="font-size:14px;opacity:.85">${esc(st.class)}${st.section?' · Section '+esc(st.section):''} · ${esc(st.school)}</div>
          ${st.age ? `<div style="font-size:13px;opacity:.7;margin-top:.2rem">Age: ${esc(st.age)} · Gender: ${esc(st.gender)||'—'}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:13px;opacity:.8">
          <div style="font-weight:700;font-size:14px;margin-bottom:.3rem">Report Date</div>
          <div>${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
          <div style="margin-top:.5rem;font-weight:700;font-size:14px">Modules Assessed</div>
          <div>CPI · NSEAAS · NMAP · DAAB</div>
        </div>
      </div>
    </div>

    <!-- 1. HOLISTIC SUMMARY -->
    ${section('✦','Holistic Summary','#4f46e5','#7c3aed','#fafafe','rgba(79,70,229,.2)', toHtml(data.holistic_summary))}

    <!-- 2. APTITUDE PROFILE + DAAB Charts -->
    ${section('🔬','Aptitude Profile','#0e4f5c','#1a7f8e','#f0fafb','rgba(26,127,142,.2)',
      toHtml(data.aptitude_profile) +
      `<div class="chart-grid-2" style="margin-top:1.25rem">
        ${chartBox('chart-daab-bar-rpt','Aptitude Stanine Scores','Stanine 1–9 · dashed = average band',280,'')}
        ${chartBox('chart-daab-radar-rpt','Aptitude Radar','Multi-dimensional aptitude view',280,'max-width:340px')}
      </div>`
    )}

    <!-- 3. INTEREST PROFILE + CPI Charts -->
    ${section('🧠','Career Interest Profile','#1d4ed8','#4f46e5','#f5f6ff','rgba(79,70,229,.15)',
      toHtml(data.interest_profile) +
      `<div class="chart-grid-2" style="margin-top:1.25rem">
        ${chartBox('chart-cpi-hbar-rpt','Career Interest Ranking','Horizontal bar — score out of 20',300,'')}
        ${chartBox('chart-cpi-donut-rpt','Interest Distribution','Share of total selections per area',280,'')}
      </div>
      <div id="chart-cpi-legend-rpt" style="margin-top:.75rem;display:flex;flex-wrap:wrap;gap:6px"></div>`
    )}

    <!-- 4. INTERNAL MOTIVATORS -->
    ${section('🔥','Internal Motivators','#b45309','#d97706','#fffdf5','rgba(245,158,11,.2)', toHtml(data.internal_motivators))}

    <!-- 5. PERSONALITY PROFILE + NMAP Charts -->
    ${section('🌟','Personality Profile','#7c6fcd','#9c8fe8','#f7f5ff','rgba(124,111,205,.2)',
      toHtml(data.personality_profile) +
      `<div class="chart-grid-2" style="margin-top:1.25rem">
        ${chartBox('chart-nmap-radar-rpt','Personality Radar','9 dimensions · outer = stronger',300,'max-width:360px')}
        ${chartBox('chart-nmap-bar-rpt','Dimension Stanine Scores','Vertical bar · colour = strength band',280,'')}
      </div>`
    )}

    <!-- 6. WELLBEING + SEL Charts -->
    ${section('💙','SEL Readiness & Wellbeing','#0f766e','#0d9488','#f8fffd','rgba(13,148,136,.2)',
      toHtml(data.wellbeing_guidance) +
      `<div class="chart-grid-2" style="margin-top:1.25rem">
        ${chartBox('chart-sel-bar-rpt','SEL Domain Scores','Lower score = better adjustment (max 20)',240,'')}
        <div class="chart-box" style="margin-top:1.5rem">
          <div class="chart-box-title">SEL Readiness Gauges</div>
          <div class="chart-box-sub">Bar colour = category · 🟢 Cat A-B Good &nbsp; 🟡 Cat C Moderate &nbsp; 🔴 Cat D-E Needs Support</div>
          <div class="sel-gauge-row" id="chart-sel-gauges-report" style="margin-top:.75rem"></div>
        </div>
      </div>`
    )}

    <!-- 7a. ROADMAP + 4-DOMAIN SNAPSHOT -->
    ${buildRoadmap()}
    ${buildDomainSnapshot()}

    <!-- 7. CAREER RECOMMENDATIONS TABLE -->
    <div class="ai-section" style="border-color:rgba(26,127,142,.25);background:linear-gradient(135deg,#f0fafb,#eef2ff);margin-bottom:1.75rem;padding:1.75rem 2rem">
      <div class="ai-section-title" style="font-size:17px;margin-bottom:.5rem">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0e4f5c,#1a7f8e);color:#fff;font-size:16px;flex-shrink:0">🎯</span>
        Most Suited Career Preferences
      </div>
      <p style="color:var(--ink3);font-size:13px;margin-bottom:.25rem">Ranked by overall suitability based on Interest, Aptitude and Personality fit across all 4 modules.</p>
      ${renderCareerTable(Array.isArray(data.career_table) ? data.career_table : [])}
    </div>

    <!-- 8. STREAM ADVICE -->
    ${section('🏫','Stream & Pathway Advice','#15803d','#059669','#f0fdf4','rgba(5,150,105,.2)', toHtml(data.stream_advice))}

    <!-- DISCLAIMER + REGEN -->
    <div class="ai-disclaimer" style="margin-top:2rem">
      This report was generated by AI based on your psychometric assessment scores. It is intended as a guidance tool and should be reviewed with a qualified career counsellor before making major academic decisions.
    </div>
    <div style="text-align:center;margin-top:1rem">
      <button class="ai-regen-btn" onclick="generateAIReport()">↻ Regenerate Report</button>
    </div>`;

  document.getElementById('ai-report-output').innerHTML = html;

  /* ── Render -rpt variant charts into the inline report canvases ── */
  requestAnimationFrame(() => {
    buildReportCharts();
  });

  document.getElementById('ai-report-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════
   REPORT INLINE CHARTS (render into -rpt canvas IDs)
══════════════════════════════════════ */

export { showAILoading, showAIError, renderAIReport };
