/* ════════════════════════════════════════════════════════════════════
   ui/results.js
   Results page builder — interpretations, careers, NMAP results, buildCharts dispatcher.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { CPI_AREAS } from '../engine/cpi.js';
import { NMAP_DIMS } from '../engine/nmap.js';
import { DAAB_SUBS } from '../engine/daab.js';
import { buildCPICharts } from '../charts/cpi-charts.js';
import { buildSELCharts } from '../charts/sea-charts.js';
import { buildNMAPCharts } from '../charts/nmap-charts.js';
import { buildDAAbCharts } from '../charts/daab-charts.js';
import { buildOverviewCharts } from '../charts/overview-charts.js';
import { buildDAABResults } from '../ui/daab-page.js';
import { generateAIReport } from '../ai/generator.js';
import { renderAIReport } from '../ai/render.js';

function buildResults() {
  const cpi=S.cpi.scores, sea=S.sea.scores, st=S.student;

  document.getElementById('res-name').textContent = st.fullName;
  document.getElementById('res-meta').textContent = st.class+(st.section?' '+st.section:'')+' · '+st.school+(st.schoolLocation?' · '+st.schoolLocation:'');
  document.getElementById('res-date').textContent = 'Completed '+new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // CPI bars
  document.getElementById('r-cpi-bars').innerHTML = cpi.ranked.map(a=>{
    const bc=a.level==='Strong'?'lvl-strong':a.level==='Moderate'?'lvl-moderate':'lvl-low';
    return `<div class="bar-row">
      <div class="bar-lbl">${a.label}</div>
      <div class="bar-track"><div class="bar-fill" data-pct="${a.pct}" style="background:${a.color}"></div></div>
      <div class="bar-score">${a.score}</div>
      <div class="bar-bdg ${bc}">${a.level}</div>
    </div>`;
  }).join('');

  // NSEAAS domain cards
  const domInfo={
    E:{label:'Emotional',color:'#1e3a5f',light:'#e4eef8',emoji:'😌'},
    S:{label:'Social',   color:'#0f766e',light:'#ccfbf1',emoji:'🤝'},
    A:{label:'Academic', color:'#b45309',light:'#fef3c7',emoji:'📚'}
  };
  document.getElementById('r-sea-domains').innerHTML = ['E','S','A'].map(d=>{
    const sc=sea.domScores[d],cl=sea.cls[d],di=domInfo[d];
    return `<div class="sea-dom-card">
      <div class="sdc-name">${di.emoji} ${di.label}</div>
      <div class="sdc-score">${sc}<span class="sdc-denom">/20</span></div>
      <div class="sdc-lvl cls-${cl.cat}" style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px">${cl.level}</div>
    </div>`;
  }).join('');

  document.getElementById('r-sea-bars').innerHTML = ['E','S','A'].map(d=>{
    const sc=sea.domScores[d],cl=sea.cls[d],di=domInfo[d];
    return `<div class="bar-row">
      <div class="bar-lbl">${di.emoji} ${di.label}</div>
      <div class="bar-track"><div class="bar-fill" data-pct="${Math.round(sc/20*100)}" style="background:${di.color}"></div></div>
      <div class="bar-score">${sc}</div>
      <div class="bar-bdg cls-${cl.cat}">${cl.level}</div>
    </div>`;
  }).join('');

  // Animate bars after short delay
  setTimeout(()=>{ document.querySelectorAll('.bar-fill').forEach(el=>{ el.style.width=el.dataset.pct+'%'; }); }, 200);

  buildCareers(cpi, sea);
  buildNMAPResults(S.nmap.scores);
  buildDAABResults();
  buildInterp(cpi, sea);
  // Build interactive charts after scores are set
  setTimeout(buildCharts, 120);

  const idle = document.getElementById('ai-report-idle');
  const out  = document.getElementById('ai-report-output');
  const err  = document.getElementById('ai-report-error');
  const load = document.getElementById('ai-report-loading');
  const btn  = document.getElementById('ai-report-btn');

  if (window._lastAIReport && out) {
    // Already generated this session — just re-render.
    if (idle) idle.style.display = 'none';
    if (err)  err.style.display  = 'none';
    if (load) load.style.display = 'none';
    if (btn)  { btn.disabled = false; btn.style.opacity = '1'; }
    renderAIReport(window._lastAIReport);
  } else {
    // Auto-generate the AI report as soon as the assessment completes.
    // No manual trigger — the loading state appears immediately on the
    // results page, then renders itself.
    if (idle) idle.style.display = 'none';
    if (out)  out.style.display  = 'none';
    if (err)  err.style.display  = 'none';
    if (load) load.style.display = 'block';
    // Also hide the now-unnecessary trigger button if it exists.
    if (btn)  { btn.style.display = 'none'; }
    // Disable the PDF download button until the AI report finishes —
    // we want all 8 AI fields baked into the PDF.
    const pdfBtn = document.getElementById('pdf-download-btn');
    if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.classList.add('loading'); }
    setTimeout(function () {
      try { generateAIReport(); } catch (e) { console.error('[auto-AI] failed to start:', e); }
    }, 300);
  }
  // ─────────────────────────────────────────────────────────────────
}

function buildInterp(cpi, sea) {
  const top=cpi.top3[0];
  const emoOk=['A','B'].includes(sea.cls.E.cat);
  const socOk=['A','B'].includes(sea.cls.S.cat);
  const acaOk=['A','B'].includes(sea.cls.A.cat);
  const badCount=[emoOk,socOk,acaOk].filter(x=>!x).length;

  let adjustMsg, adjustCls;
  if(badCount===0)      { adjustMsg='Excellent adjustment across all three dimensions! 🌟'; adjustCls='cls-A'; }
  else if(badCount===1) { adjustMsg='Generally good — one area to give a little attention to.'; adjustCls='cls-C'; }
  else if(badCount===2) { adjustMsg='Two areas could use some focused support.'; adjustCls='cls-D'; }
  else                  { adjustMsg='All three areas would benefit from some support.'; adjustCls='cls-E'; }

  let narrative = `Your strongest career interest is <strong>${top.label}</strong> (score: ${top.score}/20 — ${top.level}), with great secondary interest in <strong>${cpi.top3[1].label}</strong> and <strong>${cpi.top3[2].label}</strong>. `;
  if (badCount===0) {
    narrative += `Your SEL readiness is healthy across all three dimensions — that's a fantastic foundation. You're set up to chase your interests with real confidence! 💪`;
  } else {
    const weak=[];
    if(!emoOk) weak.push('emotional SEL readiness');
    if(!socOk) weak.push('social connections');
    if(!acaOk) weak.push('academic engagement');
    narrative += `There are some signs of difficulty in ${weak.join(' and ')}. With the right support, you can work on these alongside your career goals — one doesn't have to wait for the other.`;
  }

  const notes=[];
  if(!emoOk) notes.push({cls:'cls-E',icon:'💙',title:'Emotional Support Could Help',msg:`Your emotional score is ${sea.domScores.E}/20 (Category ${sea.cls.E.cat}). Talking to a counsellor or a trusted teacher about any stress or worries at school can make a real difference.`});
  if(!socOk) notes.push({cls:'cls-D',icon:'🤝',title:'Building Social Connections',msg:`Your social score is ${sea.domScores.S}/20 (Category ${sea.cls.S.cat}). Joining clubs, group activities or team projects can be a great way to feel more connected at school.`});
  if(!acaOk) notes.push({cls:'cls-D',icon:'📚',title:'Academic Engagement Tip',msg:`Your academic score is ${sea.domScores.A}/20 (Category ${sea.cls.A.cat}). Trying different study strategies or asking a teacher for extra help could really boost your confidence.`});
  if(badCount===0) notes.push({cls:'cls-A',icon:'✅',title:'You\'re Well Adjusted!',msg:'Healthy scores across all three school dimensions. Keep up the great work — you\'re in a brilliant position to explore your future!'});

  document.getElementById('r-interp').innerHTML = `
    <div class="interp-summary-row">
      <div class="iscard">
        <div class="eyebrow">Your Top Career Interest</div>
        <div class="iscard-title">${top.label}</div>
        <div class="iscard-sub">Score: ${top.score}/20 · ${top.level}<br>2nd: ${cpi.top3[1].label} · 3rd: ${cpi.top3[2].label}</div>
      </div>
      <div class="iscard">
        <div class="eyebrow">SEL Readiness Summary</div>
        <div class="iscard-title"><span class="bar-bdg ${adjustCls}" style="display:inline-block;margin-bottom:5px">${adjustMsg.split('—')[0].split('!')[0].trim()}</span></div>
        <div class="iscard-sub">Emotional: Cat.${sea.cls.E.cat} &nbsp;·&nbsp; Social: Cat.${sea.cls.S.cat} &nbsp;·&nbsp; Academic: Cat.${sea.cls.A.cat}</div>
      </div>
    </div>
    <div class="narrative-block">${narrative}</div>
    ${notes.map(n=>`<div class="note-row">
      <div class="note-icon">${n.icon}</div>
      <div><div class="note-title">${n.title}</div><div class="note-msg">${n.msg}</div></div>
    </div>`).join('')}`;
}

const CAREER_DB = {
  st: [{t:'Software / AI Engineer',desc:'Build intelligent software systems and machine-learning models.',tags:['Tech','Analytical']},{t:'Robotics / Hardware Engineer',desc:'Design physical systems that blend mechanics and computing.',tags:['Tech','Engineering']},{t:'Data Scientist',desc:'Turn raw data into insights using statistics and ML.',tags:['Tech','Math']}],
  hms:[{t:'Doctor / Physician',desc:'Diagnose and treat illnesses across a wide range of specialities.',tags:['Medical','Empathy']},{t:'Pharmacist / Researcher',desc:'Develop medicines or manage pharmaceutical dispensing.',tags:['Medical','Science']},{t:'Healthcare Administrator',desc:'Manage hospital or clinic operations.',tags:['Medical','Management']}],
  lc: [{t:'Journalist / Content Creator',desc:'Report news or create media content for large audiences.',tags:['Communication','Writing']},{t:'Public Relations Specialist',desc:'Shape public perception of organisations.',tags:['Communication','Strategy']},{t:'Corporate Trainer',desc:'Train professional teams on specialised topics.',tags:['Communication','Teaching']}],
  cd: [{t:'UI/UX Designer',desc:'Create beautiful, user-friendly digital products.',tags:['Design','Tech']},{t:'Film / Theatre Director',desc:'Direct creative productions for screen or stage.',tags:['Arts','Leadership']},{t:'Graphic Designer / Animator',desc:'Produce visual assets for brands and media.',tags:['Design','Creative']}],
  lj: [{t:'Lawyer / Advocate',desc:'Represent clients in legal proceedings and negotiations.',tags:['Law','Analytical']},{t:'Judge / Legal Researcher',desc:'Interpret laws or conduct legal scholarship.',tags:['Law','Academic']},{t:'Policy Analyst',desc:'Analyse and advise on government or corporate policies.',tags:['Law','Research']}],
  ag: [{t:'IAS / IPS Officer',desc:'Serve in civil or police services to govern and protect the public.',tags:['Governance','Leadership']},{t:'Urban Planner',desc:'Plan and manage city infrastructure and services.',tags:['Governance','Planning']},{t:'NGO Programme Manager',desc:'Design and run community improvement programmes.',tags:['Governance','Social']}],
  er: [{t:'Professor / Researcher',desc:'Teach at university level and advance academic knowledge.',tags:['Academic','Research']},{t:'School Counsellor',desc:'Support student SEL readiness and development.',tags:['Education','Empathy']},{t:'Curriculum Designer',desc:'Create structured learning programmes and content.',tags:['Education','Creative']}],
  be: [{t:'Entrepreneur / Founder',desc:'Build your own venture from idea to reality.',tags:['Business','Leadership']},{t:'Investment Banker',desc:'Manage capital, evaluate deals, guide financial strategy.',tags:['Business','Finance']},{t:'Product Manager',desc:'Lead product development bridging tech and business.',tags:['Business','Tech']}],
  ps: [{t:'Social Worker / Counsellor',desc:'Support individuals and communities navigating hardship.',tags:['Service','Empathy']},{t:'HR Manager',desc:'Manage people, culture and talent in organisations.',tags:['Service','Business']},{t:'Community Development Officer',desc:'Plan and run upliftment programmes for communities.',tags:['Service','Social']}],
  sp: [{t:'Professional Athlete / Coach',desc:'Compete or coach at professional levels in your sport.',tags:['Sports','Discipline']},{t:'Sports Scientist / Analyst',desc:'Apply science to optimise athletic performance.',tags:['Sports','Science']},{t:'Physiotherapist',desc:'Help people recover from injury or improve fitness.',tags:['Sports','Medical']}],
};

function buildCareers(cpi, sea) {
  const acaOk=['A','B'].includes(sea.cls.A.cat), emoOk=['A','B'].includes(sea.cls.E.cat);
  let html=`<div style="font-size:13px;color:var(--ink3);margin-bottom:1.5rem;line-height:1.7">
    Based on your top interests: <strong>${cpi.top3.map(a=>a.label).join(', ')}</strong>. Here are some exciting paths to explore!
  </div>`;
  cpi.top3.forEach((area,rank)=>{
    const careers=CAREER_DB[area.id]||[];
    const rankLabel=['🥇 Best Match','🥈 Great Fit','🥉 Also Great'][rank];
    html+=`<div style="margin-bottom:2rem">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span style="background:${area.light};color:${area.color};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">${rankLabel}</span>
        <span style="font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;color:var(--ink)">${area.label}</span>
        <span style="font-size:12px;color:var(--ink3)">Score: ${area.score}/20</span>
      </div>
      <div class="cgrid">`;
    careers.forEach(c=>{
      let note='';
      if(!acaOk&&['Analytical','Research','Academic','Math'].some(t=>c.tags.includes(t)))
        note=`<div class="cc-note" style="color:var(--warn)">📌 Academic support could help build this path.</div>`;
      if(!emoOk&&['Empathy','Service','Medical'].some(t=>c.tags.includes(t)))
        note=`<div class="cc-note" style="color:var(--m2)">💙 SEL readiness support can strengthen this path.</div>`;
      html+=`<div class="cc">
        <div class="cc-title">${c.t}</div>
        <div class="cc-desc">${c.desc}</div>
        <div class="cc-tags">${c.tags.map(tg=>`<span class="cc-tag">${tg}</span>`).join('')}</div>
        ${note}
      </div>`;
    });
    html+=`</div></div>`;
  });
  document.getElementById('r-careers').innerHTML=html;
}

function buildNMAPResults(nmap) {
  if (!nmap) {
    document.getElementById('r-nmap-grid').innerHTML = '<p style="color:var(--ink3);font-size:13px">NMAP data not available.</p>';
    return;
  }

  // Dimension grid cards
  const gridHtml = nmap.dims.map(d => {
    const barPct = Math.round(d.raw / 14 * 100);
    return `<div class="nmap-dim-card">
      <div class="ndc-emoji">${d.emoji}</div>
      <div class="ndc-name">${d.abbr}</div>
      <div class="ndc-stanine">${d.stanine}<span style="font-size:14px;color:var(--ink4)">/9</span></div>
      <div class="ndc-interp ${d.cls}">${d.label}</div>
      <div class="ndc-bar-wrap"><div class="ndc-bar-fill" data-pct="${barPct}" style="width:0%"></div></div>
    </div>`;
  }).join('');
  document.getElementById('r-nmap-grid').innerHTML = gridHtml;
  setTimeout(() => {
    document.querySelectorAll('.ndc-bar-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
  }, 200);

  // Top 3 and bottom dimension narrative
  const top3 = nmap.sorted.slice(0, 3);
  const low   = nmap.sorted.slice(-2).filter(d => d.stanine <= 4);

  let narrative = `<div class="narrative-block" style="margin-bottom:1rem">
    Your strongest personality traits are <strong>${top3[0].emoji} ${top3[0].abbr}</strong> (Stanine ${top3[0].stanine} — ${top3[0].label}), 
    <strong>${top3[1].emoji} ${top3[1].abbr}</strong> (Stanine ${top3[1].stanine}), 
    and <strong>${top3[2].emoji} ${top3[2].abbr}</strong> (Stanine ${top3[2].stanine}). `;

  if (top3[0].stanine >= 7) {
    narrative += `These are genuine strengths to lean on as you explore your future. 💪`;
  } else if (top3[0].stanine >= 5) {
    narrative += `You have good foundations across multiple dimensions — with consistent effort these can become real strengths.`;
  } else {
    narrative += `Every dimension can grow with awareness and practice — you're already on the right track by reflecting on yourself!`;
  }
  narrative += `</div>`;

  // Growth tip cards for lower dims
  let growthHtml = '';
  if (low.length > 0) {
    growthHtml = low.map(d => {
      const tips = {
        ld: 'Try volunteering to lead a small group activity or class project — even small steps build leadership confidence.',
        as: 'Practice expressing your opinion once a day, even on small things. Start in safe spaces like with friends or family.',
        ca: 'Before your next decision, take 60 seconds to think about one possible consequence — this builds the cautiousness habit.',
        ad: 'The next time something changes unexpectedly, try listing one good thing that could come from the change.',
        et: 'Reflect at the end of each day: did I treat everyone fairly? Small daily check-ins build strong ethical habits.',
        cr: 'Try a "10 ideas" exercise — write 10 solutions to any problem, no matter how silly. Creativity grows with practice.',
        cu: 'Pick one topic you know nothing about and read about it for 10 minutes this week. Curiosity is a muscle!',
        ds: 'Start a simple daily checklist with just 3 tasks. Completing them consistently builds discipline over time.',
        pr: 'Next time you feel frustrated, pause and take 5 deep breaths before responding. Resilience is built one moment at a time.',
      };
      return `<div class="note-row" style="margin-bottom:8px">
        <div class="note-icon">${d.emoji}</div>
        <div>
          <div class="note-title">Growing your ${d.abbr} (Stanine ${d.stanine})</div>
          <div class="note-msg">${tips[d.id] || 'Focus on this dimension with small daily habits — growth is always possible!'}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Personality-career alignment note
  const cpi = S.cpi.scores;
  const topInterest = cpi ? cpi.top3[0] : null;
  const alignMap = {
    st:  ['cr','cu','ds'],
    hms: ['et','pr','cu'],
    lc:  ['as','cr','cu'],
    cd:  ['cr','ad','cu'],
    lj:  ['as','ca','et'],
    ag:  ['ld','ca','ds'],
    er:  ['cu','ds','et'],
    be:  ['ld','as','ad'],
    ps:  ['et','pr','ad'],
    sp:  ['pr','ds','ld'],
  };
  let alignHtml = '';
  if (topInterest) {
    const needed = alignMap[topInterest.id] || [];
    const strong = needed.filter(id => nmap.dims.find(d => d.id === id && d.stanine >= 6));
    const weak   = needed.filter(id => nmap.dims.find(d => d.id === id && d.stanine <= 4));
    if (needed.length) {
      const neededLabels = needed.map(id => nmap.dims.find(d => d.id === id)).filter(Boolean);
      alignHtml = `<div class="note-row" style="margin-bottom:8px;background:var(--m3l);border-color:rgba(124,58,237,.2)">
        <div class="note-icon">🎯</div>
        <div>
          <div class="note-title">Personality ↔ Career Alignment: ${topInterest.label}</div>
          <div class="note-msg">
            Key traits for this path: ${neededLabels.map(d => `<strong>${d.emoji} ${d.abbr}</strong>`).join(', ')}.
            ${strong.length ? `You already show strength in ${strong.map(id=>{ const d=nmap.dims.find(x=>x.id===id); return d?`${d.emoji} ${d.abbr}`:''; }).join(', ')} — great alignment! ✅` : ''}
            ${weak.length   ? `<br>Consider developing ${weak.map(id=>{ const d=nmap.dims.find(x=>x.id===id); return d?`${d.emoji} ${d.abbr}`:''; }).join(', ')} to strengthen this career path.` : ''}
          </div>
        </div>
      </div>`;
    }
  }

  document.getElementById('r-nmap-narrative').innerHTML = narrative + alignHtml + growthHtml;
}


// buildCharts — moved here from charts/core.js to avoid cyclic imports.
function buildCharts() {
  requestAnimationFrame(() => {
    buildCPICharts();
    buildSELCharts();
    buildNMAPCharts();
    buildDAAbCharts();
    buildOverviewCharts();
  });
}


export { buildResults, buildInterp, CAREER_DB, buildCareers, buildNMAPResults, buildCharts };
