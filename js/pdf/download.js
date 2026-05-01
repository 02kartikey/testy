/* ════════════════════════════════════════════════════════════════════
   pdf/download.js
   Master PDF report generator — 10-page A4 with template-faithful layout, AI prose integration, dynamic footers.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';
import { NMAP_DIMS } from '../engine/nmap.js';

async function downloadPDF() {
  /* ════════════════════════════════════════════════════════════════════
     NuMind MAPS — Template-faithful 10-page A4 report
     Mirrors numind_maps_jspdf_template-1.jsx, wired to live S + AI data
  ════════════════════════════════════════════════════════════════════ */
  const btn = document.getElementById('pdf-download-btn');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  try {
    // ── Ensure jsPDF is loaded ─────────────────────────────────────
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load jsPDF'));
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Palette (matches template) ────────────────────────────────
    const PURPLE       = '#5B2D8E';
    const PURPLE_LIGHT = '#7B4BC4';
    const PURPLE_DARK  = '#3D1F63';
    const TEAL         = '#00B8D9';
    const YELLOW       = '#F5A623';
    const GREEN        = '#2ECC71';
    const PINK         = '#FF6B9D';
    const GRAY         = '#6B7280';
    const LIGHT_GRAY   = '#F3F4F6';
    const WHITE        = '#FFFFFF';
    const W = 210, H = 297;

    // ── Helpers (mirrors template) ────────────────────────────────
    const hex2rgb = (hex) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    const setFill = (hex) => doc.setFillColor.apply(doc, hex2rgb(hex));
    const setDraw = (hex) => doc.setDrawColor.apply(doc, hex2rgb(hex));
    const setTxtColor = (hex) => doc.setTextColor.apply(doc, hex2rgb(hex));

    const rect = (x, y, w, h, fill, draw, r) => {
      r = r || 0;
      if (fill) setFill(fill);
      if (draw) setDraw(draw);
      if (r > 0) doc.roundedRect(x, y, w, h, r, r, fill && draw ? 'FD' : fill ? 'F' : 'D');
      else doc.rect(x, y, w, h, fill && draw ? 'FD' : fill ? 'F' : 'D');
    };

    const txt = (text, x, y, opts) => {
      opts = opts || {};
      const size = opts.size || 10;
      const color = opts.color || '#1F2937';
      const bold = !!opts.bold;
      const align = opts.align || 'left';
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      setTxtColor(color);
      const drawOpts = { align: align };
      if (opts.maxWidth) drawOpts.maxWidth = opts.maxWidth;
      doc.text(String(text == null ? '' : text), x, y, drawOpts);
    };

    const line = (x1, y1, x2, y2, color, lw) => {
      doc.setLineWidth(lw || 0.3);
      setDraw(color || '#E5E7EB');
      doc.line(x1, y1, x2, y2);
    };

    const pill = (label, x, y, bgColor, textColor, w, h) => {
      bgColor = bgColor || PURPLE; textColor = textColor || WHITE;
      w = w || 28; h = h || 6;
      setFill(bgColor);
      doc.roundedRect(x, y - 4, w, h, 3, 3, 'F');
      txt(label, x + w / 2, y, { size: 7, color: textColor, bold: true, align: 'center' });
    };

    // ── Pull live data ────────────────────────────────────────────
    const safe = (v) => (v == null ? '' : String(v));
    const st  = (typeof S !== 'undefined' && S && S.student) ? S.student : {};
    const nmap = (typeof S !== 'undefined' && S && S.nmap && S.nmap.scores) ? S.nmap.scores : { dims: [], sorted: [] };
    const daab = (typeof S !== 'undefined' && S && S.daab) ? S.daab : null;
    const cpi  = (typeof S !== 'undefined' && S && S.cpi && S.cpi.scores) ? S.cpi.scores : { ranked: [], top3: [] };
    const sea  = (typeof S !== 'undefined' && S && S.sea && S.sea.scores) ? S.sea.scores : { domScores: { E:0, S:0, A:0 }, cls: {} };
    const ai   = window._lastAIReport || {};

    // ── AI prose helpers ──────────────────────────────────────────
    // The AI generator produces 8 fields. These helpers safely consume
    // them: aiText() returns the field with a fallback when missing,
    // aiHas() tells us whether AI prose is available at all (so we can
    // adjust headings), and drawProse() lays out a paragraph block with
    // automatic page breaks if the text overflows.
    const aiText = (key, fallback) => {
      const v = ai && typeof ai[key] === 'string' ? ai[key].trim() : '';
      return v || fallback || '';
    };
    const aiHas = (key) => !!(ai && typeof ai[key] === 'string' && ai[key].trim().length);

    /**
     * Draw a multi-paragraph prose block, breaking pages as needed.
     * Returns the new cy after drawing. Caller passes a redraw callback
     * to render the page header/student-bar each time a new page starts.
     */
    const drawProse = (text, cy, opts) => {
      opts = opts || {};
      const size      = opts.size      || 8.5;
      const color     = opts.color     || '#374151';
      const lineH     = opts.lineH     || 5;
      const paraGap   = opts.paraGap   || 4;
      const maxW      = opts.maxW      || (W - 28);
      const x         = opts.x         || 14;
      const bottom    = opts.bottom    || (H - 14);
      const pageStart = opts.pageStart || 32;
      const onNewPage = opts.onNewPage || function () {};
      const paras = String(text || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
      paras.forEach((para) => {
        const lines = doc.splitTextToSize(para, maxW);
        lines.forEach((ln) => {
          if (cy + lineH > bottom) {
            doc.addPage();
            onNewPage();
            cy = pageStart;
          }
          txt(ln, x, cy, { size: size, color: color });
          cy += lineH;
        });
        cy += paraGap;
      });
      return cy;
    };

    const studentName = safe(st.fullName) || 'Student';
    const grade       = safe(st.class) + (st.section ? ' ' + safe(st.section) : '');
    const schoolName  = safe(st.school);
    const dateStr     = new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });

    const stanineColor = (s) => s >= 7 ? PURPLE : s >= 4 ? PURPLE_LIGHT : PINK;
    const stanineBand  = (s) => s >= 7 ? 'Strength' : s >= 4 ? 'Developing' : 'Needs Attention';

    // ── 9 personality dims (live) ─────────────────────────────────
    // NOTE: scoreNMAP returns dims as { ...NMAP_DIMS[i], stanine, label, ... }
    // where the spread carries `label: 'Leadership & Motivation'` (dim title)
    // but the next field then overwrites `label` with the stanine band ('High').
    // So the resulting object has NO `name` and `label` is the band, not the
    // trait title. The original trait title is preserved as the `id` (lowercased
    // code) and most reliably recovered via positional lookup into NMAP_DIMS,
    // which is a module-level constant defined elsewhere in app.js.
    const NMAP_TITLES_FALLBACK = [
      'Leadership & Motivation','Assertiveness','Cautiousness','Adaptability & Flexibility',
      'Ethical Awareness','Creativity & Innovation','Curiosity & Learning','Discipline & Sincerity',
      'Patience & Resilience',
    ];
    const nmapTitleAt = (i) => {
      try {
        if (typeof NMAP_DIMS !== 'undefined' && NMAP_DIMS[i] && NMAP_DIMS[i].label) return NMAP_DIMS[i].label;
      } catch (e) {}
      return NMAP_TITLES_FALLBACK[i] || ('Dimension ' + (i + 1));
    };
    const personality9 = (nmap.dims && nmap.dims.length ? nmap.dims : [
      {}, {}, {}, {}, {}, {}, {}, {}, {},
    ]).slice(0, 9).map((d, i) => {
      const stn = d.stanine || 5;
      // Prefer explicit name if a future scorer provides one; otherwise positional NMAP_DIMS title.
      const title = d.name || nmapTitleAt(i);
      return { name: title, stanine: stn, label: stanineBand(stn) };
    });
    while (personality9.length < 9) {
      const i = personality9.length;
      personality9.push({ name: nmapTitleAt(i), stanine: 5, label: stanineBand(5) });
    }

    const topPersonality = personality9.slice().sort((a,b) => b.stanine - a.stanine).slice(0, 3);

    // ── 8 aptitude domains (live) ─────────────────────────────────
    // Real shape: S.daab is an object keyed by sub-test code (va, pa, na,
    // lsa, hma, ar, ma, sa); each S.daab[key].scores = { raw, max, stanine, label }.
    // Display order matches DAAB_SUBS (defined elsewhere in app.js).
    const DAAB_KEY_ORDER = ['va', 'pa', 'na', 'lsa', 'hma', 'ar', 'ma', 'sa'];
    const DAAB_TEMPLATE_LABELS = {
      va:  'Verbal Ability',
      pa:  'Perceptual Speed',
      na:  'Numerical Ability',
      lsa: 'Legal Studies Ability',
      hma: 'Health & Medical Apt.',
      ar:  'Abstract Reasoning',
      ma:  'Mechanical Ability',
      sa:  'Spatial Ability',
    };
    let aptitude8 = DAAB_KEY_ORDER.map((key) => {
      const sub = daab && daab[key];
      const sc = sub && sub.scores;
      const stanine = (sc && typeof sc.stanine === 'number' && sc.stanine > 0) ? sc.stanine : 5;
      return { name: DAAB_TEMPLATE_LABELS[key], stanine, label: (sc && sc.label) || stanineBand(stanine), key };
    });
    // Re-order to match the template's natural visual order: Verbal, Perceptual,
    // Numerical, Spatial, Mechanical, Abstract, Legal, Health/Medical
    const APT_DISPLAY_ORDER = ['va', 'pa', 'na', 'sa', 'ma', 'ar', 'lsa', 'hma'];
    aptitude8 = APT_DISPLAY_ORDER.map(k => aptitude8.find(a => a.key === k));

    const aptStrong   = aptitude8.filter(a => a.stanine >= 7).map(a => a.name);
    const aptEmerging = aptitude8.filter(a => a.stanine >= 4 && a.stanine <= 6).map(a => a.name);

    // ── Career interest (top 8) ──────────────────────────────────
    const cpiAll = (cpi.ranked && cpi.ranked.length ? cpi.ranked : []).map(r => ({
      label: r.label || r.name || '',
      score: typeof r.score === 'number' ? r.score : 0,
      level: r.level || (r.score >= 15 ? 'Strong' : r.score >= 8 ? 'Moderate' : 'Low'),
    }));
    while (cpiAll.length < 8) cpiAll.push({ label: '—', score: 0, level: 'Low' });
    const careers8 = cpiAll.slice(0, 8);
    const cpiColor = (lvl) => lvl === 'Strong' ? PURPLE : lvl === 'Moderate' ? PURPLE_LIGHT : PINK;
    const top3 = (cpi.top3 && cpi.top3.length >= 3 ? cpi.top3 : cpiAll.slice(0, 3));

    // ── SEAA cards (live) ────────────────────────────────────────
    const seaCat = (cat) => {
      if (cat === 'A' || cat === 'B') return { catLabel: 'Strong Readiness',     color: PURPLE };
      if (cat === 'C')                 return { catLabel: 'Developing Readiness', color: PURPLE_LIGHT };
      return                                  { catLabel: 'Support Needed',       color: PINK };
    };
    const seaCards = [
      Object.assign({ key:'S', title:'Social Adjustment',    score: sea.domScores.S || 0 }, seaCat((sea.cls.S||{}).cat)),
      Object.assign({ key:'E', title:'Emotional Adjustment', score: sea.domScores.E || 0 }, seaCat((sea.cls.E||{}).cat)),
      Object.assign({ key:'A', title:'Academic Adjustment',  score: sea.domScores.A || 0 }, seaCat((sea.cls.A||{}).cat)),
    ];
    seaCards.forEach(c => { c.label = c.catLabel; });

    // ── Integrated Fit Score ─────────────────────────────────────
    const avgPers = personality9.reduce((s,d) => s + d.stanine, 0) / personality9.length;
    const avgApt  = aptitude8.reduce((s,d) => s + d.stanine, 0) / aptitude8.length;
    const topInterestScore = (top3[0] && top3[0].score) || 0;
    const stanineToPct = (s) => ((s - 1) / 8) * 100;
    let fitRaw = (stanineToPct(avgPers) * 0.30) + (stanineToPct(avgApt) * 0.30) + ((topInterestScore / 20) * 100 * 0.40);
    seaCards.forEach(c => {
      if (c.label === 'Support Needed') fitRaw -= 7;
      else if (c.label === 'Developing Readiness') fitRaw -= 3;
    });
    const fitScore = Math.max(0, Math.min(100, Math.round(fitRaw)));
    const fitTier  = fitScore >= 75 ? 'Strong Fit' : fitScore >= 55 ? 'Emerging Fit' : 'Exploratory Fit';

    // ── Layout helpers ───────────────────────────────────────────
    // Note: page total isn't known up front because AI prose blocks may
    // overflow and add pages dynamically. We track which pages need a footer
    // here, then stamp all footers in one pass at the end using the doc's
    // actual page indices — this guarantees footer numbers always match
    // the physical page they sit on, even after AI overflow inserts pages.
    const footer = function () { /* no-op: footers are stamped at save time */ };

    const sectionHeader = (title, subtitle) => {
      rect(0, 0, W, 18, PURPLE);
      txt(title, 14, 11, { size: 14, color: WHITE, bold: true });
      if (subtitle) {
        const subLines = doc.splitTextToSize(subtitle, W - 28);
        txt(subLines[0], 14, 16, { size: 7, color: '#D8B4FE' });
      }
    };

    const studentBar = (y) => {
      y = y || 22;
      rect(10, y, W - 20, 8, LIGHT_GRAY, null, 1);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxtColor(PURPLE);
      doc.text(studentName, 14, y + 5.5);
      const nameW = doc.getTextWidth(studentName);
      const meta = '  |  ' + (grade || '—') + ' · ' + (schoolName || '—') + ' · ' + dateStr;
      txt(meta, 14 + nameW, y + 5.5, { size: 8, color: GRAY });
    };

    const stanineBar = (label, value, y, colorHex) => {
      txt(label, 67, y, { size: 7, color: '#1F2937', align: 'right' });
      const barX = 70, barW = W - barX - 20;
      rect(barX, y - 3.5, barW, 5, '#E5E7EB', null, 1);
      rect(barX, y - 3.5, (value / 9) * barW, 5, colorHex, null, 1);
      txt(String(value), barX + barW + 2, y, { size: 7, color: GRAY, bold: true });
    };

    /* ═══════════════════════════════════════════════
       PAGE 1 — COVER
    ═══════════════════════════════════════════════ */
    rect(0, 0, W, H, PURPLE_DARK);
    rect(0, 0, W, 80, PURPLE);
    rect(14, 12, 40, 14, PURPLE_LIGHT, null, 2);
    txt('NuMind™', 22, 21, { size: 12, color: WHITE, bold: true });
    txt('NURTURING MINDS, ACHIEVING OUTCOMES', 14, 30, { size: 5, color: '#D8B4FE' });
    txt('Comprehensive Multidimensional Assessment Report', 14, 50, { size: 9, color: '#D8B4FE' });
    txt('NuMind MAPS', 14, 68, { size: 28, color: WHITE, bold: true });
    txt('Multidimensional Assessment', 14, 80, { size: 14, color: '#C4B5FD' });
    txt('Personalized Success', 14, 88, { size: 14, color: '#C4B5FD' });
    line(14, 94, 80, 94, WHITE, 0.8);

    rect(14, 104, W - 28, 56, WHITE, null, 3);
    txt('Prepared For', 22, 114, { size: 8, color: GRAY });
    txt(studentName, 22, 126, { size: 18, color: '#1F2937', bold: true });
    line(22, 130, W - 22, 130, '#E5E7EB', 0.3);
    txt('Grade:', 22, 140, { size: 9, color: '#1F2937', bold: true });
    txt(grade || '—', 38, 140, { size: 9, color: '#1F2937' });
    txt('School:', 22, 148, { size: 9, color: '#1F2937', bold: true });
    txt(schoolName || '—', 38, 148, { size: 9, color: '#1F2937', maxWidth: W - 60 });
    txt('Date:', 22, 156, { size: 9, color: '#1F2937', bold: true });
    txt(dateStr, 35, 156, { size: 9, color: '#1F2937' });

    // Tagline panel — fills the previously empty mid-cover area.
    rect(14, 168, W - 28, 22, PURPLE_LIGHT, null, 3);
    txt('Your Personalised Career Development Report', W / 2, 178, { size: 11, color: WHITE, bold: true, align: 'center' });
    txt('Built from 4 evidence-based assessments and AI-powered insights', W / 2, 185, { size: 8, color: '#E9D5FF', align: 'center' });

    txt('The Four Dimensions Shaping Your Profile', 14, 200, { size: 9, color: '#D8B4FE' });
    ['NMAP', 'NAAB', 'NCPI', 'NSEAA'].forEach((p, i) => {
      const px = 14 + i * 47;
      setFill(WHITE); doc.roundedRect(px, 205, 43, 18, 3, 3, 'F');
      txt(p, px + 21, 216, { size: 10, color: PURPLE, bold: true, align: 'center' });
    });
    footer(1);

    /* ═══════════════════════════════════════════════
       PAGE 2 — WELCOME & 4 PILLARS
    ═══════════════════════════════════════════════ */
    doc.addPage();
    rect(0, 0, W, 18, PURPLE);
    txt('Welcome', 14, 9, { size: 8, color: '#D8B4FE' });
    txt(studentName, 14, 15, { size: 14, color: WHITE, bold: true });

    let cy = 28;
    // Use AI holistic_summary when present — this is the personalised
    // mentor narrative weaving all four modules into the student's story.
    // Falls back to the generic welcome blurb when no AI report is available.
    const welcomeFallback =
      'Welcome to your NuMind Integrated Career Development Report. This report is based on a multidimensional assessment designed to help you better understand your strengths, preferences, abilities, and readiness factors that influence academic and career decisions.\n\n' +
      'The purpose of this report is not merely to suggest careers, but to support informed decision-making by helping you understand your strengths, growth areas, and pathways that may align well with your profile.';
    const welcomeProse = aiText('holistic_summary', welcomeFallback);
    cy = drawProse(welcomeProse, cy, {
      size: 8.5, color: '#374151', lineH: 5, paraGap: 4,
      maxW: W - 28, x: 14, bottom: cy + 70,
      onNewPage: function () {
        rect(0, 0, W, 18, PURPLE);
        txt('Welcome (continued)', 14, 9, { size: 8, color: '#D8B4FE' });
        txt(studentName, 14, 15, { size: 14, color: WHITE, bold: true });
      },
    });
    cy += 2;

    rect(10, cy, W - 20, 8, PURPLE, null, 2);
    txt('\u2726 The Four Pillars of NuMind MAP \u2726', W / 2, cy + 5.5, { size: 9, color: WHITE, bold: true, align: 'center' });
    cy += 12;

    rect(10, cy, W - 20, 10, '#F5F3FF', '#E9D5FF', 2);
    const infoTxt = 'Each assessment plays a distinct role in shaping your Integrated Career Development Profile, helping you make informed and confident decisions about your future.';
    const infoL = doc.splitTextToSize(infoTxt, W - 30);
    txt(infoL.join('\n'), 14, cy + 5, { size: 8, color: '#374151' });
    cy += 14;

    const pillarData = [
      { code:'NMAP',  title:'NuMind Multidimensional Assessment of Personality', sub:'Understanding who you are at your core', body:'Evaluates 9 key personality dimensions that influence how you think, behave, and grow.', border:PURPLE },
      { code:'NAAB',  title:'NuMind Aptitude & Ability Battery',                 sub:'Discovering what you can do',            body:'Measures 8 essential cognitive abilities — verbal, numerical, spatial, abstract reasoning and more.', border:PURPLE_LIGHT },
      { code:'NCPI',  title:'NuMind Career Preference Inventory',                sub:'Identifying what you enjoy',             body:'Maps career interests across 10 domains to uncover environments and roles aligned with your preferences.', border:TEAL },
      { code:'NSEAA', title:'NuMind Social Emotional & Academic Adjustment',     sub:'Preparing you to thrive',                body:'Assesses emotional, social, and academic readiness ensuring long-term success and wellbeing.', border:YELLOW },
    ];
    pillarData.forEach((p, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const px = 10 + col * 97, py = cy + row * 36;
      rect(px, py, 93, 32, '#F9FAFB', p.border, 2);
      doc.setLineWidth(0.8); setDraw(p.border); doc.line(px, py, px, py + 32);
      txt(p.code,  px + 5, py + 7,  { size: 7,   color: p.border, bold: true });
      txt(p.title, px + 5, py + 12, { size: 7.5, color: '#1F2937', bold: true, maxWidth: 83 });
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); setTxtColor(p.border);
      const sub = doc.splitTextToSize(p.sub, 83); doc.text(sub, px + 5, py + 18);
      const body = doc.splitTextToSize(p.body, 83);
      txt(body.join('\n'), px + 5, py + 22, { size: 6.5, color: '#6B7280' });
    });
    cy += 76;

    txt('Know the Order of Your Report', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    const steps = [
      ['1', 'Profile Snapshot:',           'Quick overview of your overall profile across all four domains'],
      ['2', 'Assessment Insights:',        'Deep dive into Personality, Aptitude, Career Interest, and Wellbeing'],
      ['3', 'Career Alignment:',           'Integrated Career Fit Matrix combining all four domains'],
      ['4', 'Gap Analysis:',               'Comparison between your current profile and recommended pathway requirements'],
      ['5', 'Summary & Recommendations:',  'Final overview, suggested streams, next steps, and counsellor notes'],
    ];
    steps.forEach((row) => {
      rect(10, cy, W - 20, 8, LIGHT_GRAY, null, 1);
      setFill(PURPLE); doc.circle(16, cy + 4, 3, 'F');
      txt(row[0], 16, cy + 5.5, { size: 7, color: WHITE, bold: true, align: 'center' });
      txt(row[1], 22, cy + 5.5, { size: 8, color: PURPLE, bold: true });
      txt(row[2], 22 + doc.getTextWidth(row[1]) + 2, cy + 5.5, { size: 8, color: GRAY });
      cy += 10;
    });

    rect(10, cy, W - 20, 14, '#F5F3FF', PURPLE, 2);
    txt('Stronger Together', 14, cy + 7, { size: 9, color: PURPLE, bold: true });
    const stL = doc.splitTextToSize('These four pillars come together to provide a holistic, evidence-based view of your potential — empowering you to make informed decisions today for a more confident tomorrow.', W - 30);
    txt(stL.join('\n'), 14, cy + 12, { size: 7.5, color: '#374151' });

    footer(2);

    /* ═══════════════════════════════════════════════
       PAGE 3 — PROFILE SNAPSHOT
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Profile Snapshot', 'A quick overview of your overall profile, key strengths and growth areas');
    studentBar(20);

    cy = 32;
    rect(10, cy, W - 20, 18, '#F8FAFF', '#C4B5FD', 2);
    txt('How to read this section:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
    const howTo = 'For Personality, Aptitude, and Career Interest, higher scores indicate stronger alignment. For SEAA Readiness, lower scores indicate stronger readiness; higher scores indicate greater support may be helpful.';
    const howL = doc.splitTextToSize(howTo, W - 30);
    txt(howL.join('\n'), 14, cy + 11, { size: 7.5, color: '#374151' });
    cy += 22;

    const persStatus  = avgPers >= 6.5 ? 'Strength' : avgPers >= 4 ? 'Developing' : 'Support Needed';
    const aptStatus   = avgApt  >= 6.5 ? 'Strength' : avgApt  >= 4 ? 'Developing' : 'Support Needed';
    const cpiStatus   = topInterestScore >= 15 ? 'Strength' : topInterestScore >= 8 ? 'Developing' : 'Support Needed';
    const seaWorst    = seaCards.reduce((w, c) => {
      if (c.label === 'Support Needed') return 'Support Needed';
      if (c.label === 'Developing Readiness' && w !== 'Support Needed') return 'Developing';
      return w;
    }, 'Strength');
    const statusBg = (s) => s === 'Strength' ? '#F0FDF4' : s === 'Developing' ? '#EFF6FF' : '#FEFCE8';
    const statusBorder = (s) => s === 'Strength' ? GREEN : s === 'Developing' ? '#3B82F6' : YELLOW;

    const snapCards = [
      { title:'Personality',     status: persStatus, note: topPersonality.length ? 'Dominant: ' + topPersonality.slice(0,2).map(t => t.name).join(', ') : 'Personality profile across 9 dimensions.' },
      { title:'Aptitude',        status: aptStatus,  note: aptStrong.length ? 'Strong areas: ' + aptStrong.slice(0,2).join(', ') : 'Aptitude profile across 8 ability domains.' },
      { title:'Career Interest', status: cpiStatus,  note: top3[0] ? 'Top interest: ' + top3[0].label + ' (' + top3[0].score + '/20)' : 'Career interest mapped across domains.' },
      { title:'SEAA Readiness',  status: seaWorst,   note: seaCards.map(c => c.title.split(' ')[0] + ': ' + c.score + '/20').join(' · ') },
    ];
    snapCards.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const px = 10 + col * 97, py = cy + row * 40;
      rect(px, py, 93, 36, statusBg(c.status), statusBorder(c.status), 2);
      txt(c.title,  px + 7, py + 9,  { size: 9, color: statusBorder(c.status), bold: true });
      txt(c.status, px + 7, py + 16, { size: 10, color: '#1F2937', bold: true });
      line(px + 7, py + 19, px + 86, py + 19, '#E5E7EB', 0.2);
      const nL = doc.splitTextToSize(c.note, 79);
      txt(nL.slice(0,2).join('\n'), px + 7, py + 24, { size: 7, color: GRAY });
    });
    cy += 86;

    txt('Integrated Fit Score', 14, cy, { size: 10, color: '#1F2937', bold: true });
    cy += 5;
    rect(10, cy, W - 20, 28, PURPLE_DARK, null, 3);
    txt('Alignment Score', 18, cy + 8, { size: 9, color: '#D8B4FE' });
    txt(fitScore + ' / 100', 18, cy + 18, { size: 14, color: WHITE, bold: true });
    txt(fitTier, 18, cy + 24, { size: 7, color: '#C4B5FD' });
    const fitDesc = 'This index combines strength-based domains (personality, aptitude, interests) with readiness indicators (SEAA) to provide an integrated view of overall fit and developmental readiness.';
    const fitL = doc.splitTextToSize(fitDesc, 90);
    txt(fitL.join('\n'), 110, cy + 10, { size: 7.5, color: '#E9D5FF' });
    cy += 34;

    rect(10, cy, W - 20, 10, LIGHT_GRAY, null, 2);
    txt('Note:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
    txt('Results reflect both strengths and readiness indicators. Developing and support areas represent opportunities for growth, not limitations.', 24, cy + 6, { size: 7.5, color: GRAY });

    footer(3);

    /* ═══════════════════════════════════════════════
       PAGE 4 — PERSONALITY PROFILE
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Personality Profile', 'The Personality Graph highlights your strengths across 9 important personality traits and how they may relate to personal growth and career fit');
    studentBar(20);
    cy = 32;

    rect(10, cy, W - 20, 7, LIGHT_GRAY, null, 1);
    setFill(PURPLE);       doc.circle(18, cy + 3.5, 2.5, 'F'); txt('Strength',        22, cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PURPLE_LIGHT); doc.circle(52, cy + 3.5, 2.5, 'F'); txt('Developing',      56, cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PINK);         doc.circle(92, cy + 3.5, 2.5, 'F'); txt('Needs Attention', 96, cy + 5, { size: 7.5, color: '#1F2937' });
    cy += 11;

    rect(10, cy, W - 20, 62, '#FAFAFA', '#E5E7EB', 2);
    txt('Personality Stanine Scores — 9 Dimensions', 14, cy + 6, { size: 8, color: GRAY, bold: true });
    personality9.forEach((d, i) => stanineBar(d.name, d.stanine, cy + 14 + i * 5.5, stanineColor(d.stanine)));
    for (let i = 1; i <= 9; i++) {
      const bx = 70 + ((i - 1) / 8) * (W - 90);
      txt(String(i), bx, cy + 64, { size: 6, color: GRAY, align: 'center' });
    }
    cy += 68;

    rect(10, cy, W - 20, 18, '#F5F3FF', '#C4B5FD', 2);
    txt('Personality Graph:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
    const pgL = doc.splitTextToSize('Graphical interpretations are based on the Stanine (Standard Nine) Scale, where scores are reported across a 1–9 range, with 1–3 = Needs attention, 4–6 = Developing, and 7–9 = Strength.', W - 40);
    txt(pgL.join('\n'), 14, cy + 12, { size: 7.5, color: '#374151' });
    cy += 22;

    rect(10, cy, W - 20, 10, '#F5F3FF', PURPLE, 2);
    doc.setLineWidth(1.5); setDraw(PURPLE); doc.line(10, cy, 10, cy + 10);
    txt('Scores are indicative and should not be considered final. They reflect the current state at the time of assessment and may change over time.', 15, cy + 6, { size: 7.5, color: '#374151', maxWidth: W - 30 });
    cy += 15;

    txt('Top 3 Dominant Traits', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    [0, 1, 2].forEach((idx) => {
      const trait = topPersonality[idx] || { name:'—', stanine:0, label:'—' };
      const px = 10 + idx * 63;
      rect(px, cy, 59, 12, LIGHT_GRAY, '#D1D5DB', 2);
      txt('0' + (idx + 1), px + 5, cy + 8, { size: 9, color: PURPLE, bold: true });
      txt(trait.name, px + 16, cy + 6, { size: 7.5, color: '#1F2937', bold: true, maxWidth: 42 });
      txt(trait.label + ' · ' + trait.stanine + '/9', px + 16, cy + 11, { size: 7, color: GRAY });
    });
    cy += 18;

    txt('Description of Personality Parameters', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    const traitDescs = {
      'Leadership & Motivation':    'Shows initiative, drive and willingness to take responsibility. Shapes how a student approaches goals and engagement.',
      'Assertiveness':              "Ability to express views confidently. Influences comfort with healthy competition and standing by one's ideas.",
      'Cautiousness':               'Alertness, careful thinking and consideration of risks. Shapes how thoughtfully a student approaches decisions.',
      'Adaptability & Flexibility': 'Openness to change and adjusting to new situations. Influences how well a student responds to transitions and feedback.',
      'Ethical Awareness':          'Sensitivity toward values and responsibility. Shapes integrity, accountability and ethical decision making.',
      'Creativity & Innovation':    'Originality, imagination and openness to new ideas. Supports problem solving and innovative thinking.',
      'Curiosity & Learning':       'Interest in exploring and engaging with new knowledge. Influences motivation for learning and growth.',
      'Discipline & Sincerity':     'Consistency, responsibility and commitment to tasks. Supports organisation and follow-through.',
      'Patience & Resilience':      'Emotional steadiness and ability to cope with setbacks. Influences how a student manages challenges over time.',
    };
    personality9.forEach((d, i) => {
      const num = '0' + (i + 1);
      const desc = traitDescs[d.name] || (d.name + ' — score ' + d.stanine + '/9 (' + stanineBand(d.stanine) + ').');
      const col = i % 2, row = Math.floor(i / 2);
      const px = 10 + col * 97, py = cy + row * 22;
      rect(px, py, 93, 18, '#F0F9FF', '#BAE6FD', 2);
      txt(num,    px + 5,  py + 7, { size: 8, color: PURPLE_LIGHT, bold: true });
      txt(d.name, px + 14, py + 7, { size: 8, color: '#1F2937', bold: true, maxWidth: 75 });
      const dL = doc.splitTextToSize(desc, 83);
      txt(dL.slice(0,2).join('\n'), px + 5, py + 13, { size: 6.5, color: GRAY });
    });
    cy += Math.ceil(personality9.length / 2) * 22 + 4;

    // AI Personality Insight — uses personality_profile when available;
    // otherwise renders weakness-driven bullet suggestions.
    if (aiHas('personality_profile')) {
      // If title + first prose line wouldn't fit on this page, break first
      // so the title isn't orphaned at the bottom of the previous page.
      if (cy + 14 > H - 16) {
        doc.addPage();
        sectionHeader('Personality Insight (AI)', '');
        studentBar(20);
        cy = 32;
      }
      // Title bar
      rect(10, cy, W - 20, 7, '#EFF6FF', '#BFDBFE', 2);
      txt('Personality Insight (AI)', 14, cy + 5, { size: 9, color: '#1D4ED8', bold: true });
      cy += 9;
      // Prose body — paginates if long
      cy = drawProse(aiText('personality_profile', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 14, pageStart: 32,
        onNewPage: function () {
          sectionHeader('Personality Insight (continued)', '');
          studentBar(20);
        },
      });
    } else {
      const persWeak = personality9.slice().sort((a,b) => a.stanine - b.stanine).slice(0, 3);
      const suggMap = {
        'Leadership & Motivation':    'Take initiative on small group projects to build leadership confidence.',
        'Assertiveness':              'Practice expressing opinions in low-pressure settings such as class discussions.',
        'Cautiousness':               'Develop a habit of pausing to weigh options before deciding.',
        'Adaptability & Flexibility': 'Try new activities or routines weekly to build comfort with change.',
        'Ethical Awareness':          'Reflect on real situations and discuss right-vs-wrong reasoning with a mentor.',
        'Creativity & Innovation':    'Explore creative outlets — writing, design, problem-solving puzzles — regularly.',
        'Curiosity & Learning':       'Read across diverse topics and ask questions about how things work.',
        'Discipline & Sincerity':     'Use a planner and set small daily goals to build consistency.',
        'Patience & Resilience':      'Practice mindfulness and journaling to build emotional steadiness.',
      };
      rect(10, cy, W - 20, 22, '#EFF6FF', '#BFDBFE', 2);
      txt('Development Suggestions', 14, cy + 7, { size: 9, color: '#1D4ED8', bold: true });
      persWeak.forEach((d, i) => {
        const sug = suggMap[d.name] || ('Strengthen ' + d.name + ' through targeted practice and reflection.');
        txt('• ' + sug, 14, cy + 13 + i * 4, { size: 7.5, color: '#374151', maxWidth: W - 28 });
      });
    }

    footer(4);

    /* ═══════════════════════════════════════════════
       PAGE 5 — APTITUDE & ABILITY
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Aptitude & Ability Profile', 'Understand your strengths across different ability areas and emerging areas for development. Indicators of how abilities may align with future learning and career options.');
    studentBar(20);
    cy = 32;

    rect(10, cy, W - 20, 7, LIGHT_GRAY, null, 1);
    setFill(PURPLE);       doc.circle(18,  cy + 3.5, 2.5, 'F'); txt('Strong Aptitude Area',  22,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PURPLE_LIGHT); doc.circle(62,  cy + 3.5, 2.5, 'F'); txt('Emerging Area',         66,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PINK);         doc.circle(96,  cy + 3.5, 2.5, 'F'); txt('Area for Development', 100, cy + 5, { size: 7.5, color: '#1F2937' });
    cy += 11;

    rect(10, cy, W - 20, 56, '#FAFAFA', '#E5E7EB', 2);
    txt('Aptitude Stanine Scores — 8 Domains', 14, cy + 6, { size: 8, color: GRAY, bold: true });
    aptitude8.forEach((d, i) => stanineBar(d.name, d.stanine, cy + 14 + i * 5.5, stanineColor(d.stanine)));
    for (let i = 1; i <= 9; i++) {
      const bx = 70 + ((i - 1) / 8) * (W - 90);
      txt(String(i), bx, cy + 57, { size: 6, color: GRAY, align: 'center' });
    }
    cy += 62;

    rect(10, cy, W - 20, 16, '#F5F3FF', '#C4B5FD', 2);
    txt('Aptitude Graph:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
    txt('Graphical interpretations are based on the Stanine (Standard Nine) Scale, where scores are reported across a 1–9 range, with 1–3 = Area of Development, 4–6 = Emerging Area, and 7–9 = Strong Aptitude Area.', 14, cy + 11, { size: 7, color: '#374151', maxWidth: W - 28 });
    cy += 20;

    rect(10,  cy, 93, 22, '#F0FDF4', GREEN,     2);
    txt('Strong Aptitude Areas', 14, cy + 7, { size: 8, color: GREEN, bold: true });
    txt(aptStrong.length ? aptStrong.slice(0,3).join('\n') : '— building foundational strengths —', 14, cy + 13, { size: 8, color: '#1F2937' });

    rect(107, cy, 93, 22, '#EFF6FF', '#3B82F6', 2);
    txt('Emerging Areas', 111, cy + 7, { size: 8, color: '#3B82F6', bold: true });
    txt(aptEmerging.length ? aptEmerging.slice(0,3).join('\n') : 'No emerging areas at present', 111, cy + 13, { size: 8, color: '#1F2937' });
    cy += 27;

    // AI Aptitude Insight — uses aptitude_profile when present;
    // otherwise renders the deterministic relevance line.
    const aptDomainMap = {
      'Verbal Ability':         ['Psychology', 'Law', 'Journalism'],
      'Perceptual Speed':       ['Data Analytics', 'Cybersecurity'],
      'Numerical Ability':      ['Finance', 'Data Science', 'AI/ML'],
      'Spatial Ability':        ['Architecture', 'UX/UI', 'Product Design'],
      'Mechanical Ability':     ['Engineering', 'Robotics'],
      'Abstract Reasoning':     ['Strategy', 'AI Research'],
      'Legal Studies Ability':  ['Law', 'Public Policy'],
      'Health & Medical Apt.':  ['Medicine', 'Biotechnology'],
    };
    if (aiHas('aptitude_profile')) {
      if (cy + 14 > H - 16) {
        doc.addPage();
        sectionHeader('Aptitude Insight (AI)', '');
        studentBar(20);
        cy = 32;
      }
      // Box header
      rect(10, cy, W - 20, 7, LIGHT_GRAY, null, 2);
      txt('Aptitude Insight (AI):', 14, cy + 5, { size: 8, color: '#1F2937', bold: true });
      cy += 9;
      cy = drawProse(aiText('aptitude_profile', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 14, pageStart: 32,
        onNewPage: function () {
          sectionHeader('Aptitude Insight (continued)', '');
          studentBar(20);
        },
      });
      cy += 2;
    } else {
      rect(10, cy, W - 20, 14, LIGHT_GRAY, null, 2);
      txt('Career Relevance Mapping:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
      const aptDomLine = aptStrong.slice(0,3).map(a => a.split(' ')[0] + ' → ' + (aptDomainMap[a] || []).slice(0,2).join('/')).join('  ·  ') ||
                         'Build strengths broadly across reasoning, language and quantitative skills.';
      txt(aptDomLine, 14, cy + 11, { size: 7, color: GRAY, maxWidth: W - 28 });
      cy += 18;
    }

    rect(10, cy, W - 20, 10, '#EDE9FE', null, 2);
    txt('Suggested Career Domains Based on Aptitude', 14, cy + 4, { size: 8, color: PURPLE, bold: true });
    const suggDoms = (() => {
      const set = new Set();
      aptStrong.forEach(a => (aptDomainMap[a] || []).forEach(d => set.add(d)));
      if (set.size < 4) aptEmerging.forEach(a => (aptDomainMap[a] || []).forEach(d => set.add(d)));
      const out = Array.from(set).slice(0, 4);
      while (out.length < 4) out.push('Multidisciplinary');
      return out;
    })();
    suggDoms.forEach((d, i) => pill(d, 14 + i * 47, cy + 8.5, PURPLE, WHITE, 40, 6));
    cy += 16;

    txt('Understanding Aptitude Areas and Related Career Pathways', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    const tblHeaders = ['Aptitude Areas', 'Description', 'Potential Careers'];
    const tblColW = [40, 65, 85];
    const tblX    = [10, 50, 115];
    rect(10, cy, W - 20, 7, PURPLE, null, 0);
    tblHeaders.forEach((h, i) => txt(h, tblX[i] + 2, cy + 5, { size: 8, color: WHITE, bold: true }));
    cy += 7;
    const aptDescriptions = {
      'Verbal Ability':         ['Language understanding, expression and communication.',           'Psychology · Law · Journalism · Content · Policy'],
      'Perceptual Speed':       ['Quick visual scanning, comparison and attention to detail.',       'Data Analytics · Cybersecurity · Forensics'],
      'Numerical Ability':      ['Comfort with numbers, data and quantitative reasoning.',           'Finance · Actuarial · Data Science · AI/ML'],
      'Spatial Ability':        ['Visualizing shapes, patterns and space-based relationships.',      'Architecture · UX/UI · Product Design'],
      'Mechanical Ability':     ['Understanding machines, tools and mechanical reasoning.',          'Engineering · Industrial Automation · Mechatronics'],
      'Abstract Reasoning':     ['Pattern recognition, logical thinking and problem solving.',       'Strategy Consulting · Cognitive Science · AI Research'],
      'Legal Studies Ability':  ['Reasoning, argument formation and rule-based thinking.',           'Law · International Relations · Public Policy'],
      'Health & Medical Apt.':  ['Readiness for health, biology and clinical reasoning.',            'Medicine · Biotechnology · Clinical Psychology'],
    };
    const aptRows = aptitude8.slice().sort((a,b) => b.stanine - a.stanine).map(d => {
      const md = aptDescriptions[d.name] || ['—', '—'];
      return [d.name, md[0], md[1]];
    });
    aptRows.forEach((row, ri) => {
      const rowBg = ri % 2 === 0 ? WHITE : LIGHT_GRAY;
      rect(10, cy, W - 20, 10, rowBg, '#E5E7EB', 0);
      row.forEach((cell, ci) => {
        const cL = doc.splitTextToSize(safe(cell), tblColW[ci] - 4);
        txt(cL.slice(0,2).join('\n'), tblX[ci] + 2, cy + 5, { size: 6.5, color: '#374151' });
      });
      cy += 10;
    });

    rect(10, cy + 2, W - 20, 10, LIGHT_GRAY, null, 2);
    txt('Note:', 14, cy + 8, { size: 8, color: '#1F2937', bold: true });
    txt('Career options listed are indicative, not exhaustive. Explore additional pathways aligned with aptitude, interests, and academic performance.', 24, cy + 8, { size: 7.5, color: GRAY, maxWidth: W - 40 });

    footer(5);

    /* ═══════════════════════════════════════════════
       PAGE 6 — CAREER INTEREST
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Career Interest Profile', 'Career areas you may be most inclined toward. Primary and emerging interest clusters across career domains — helping explore pathways that connect with your preferences.');
    studentBar(20);
    cy = 32;

    rect(10, cy, W - 20, 7, LIGHT_GRAY, null, 1);
    setFill(PURPLE);       doc.circle(18,  cy + 3.5, 2.5, 'F'); txt('Strong Interest',   22,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PURPLE_LIGHT); doc.circle(56,  cy + 3.5, 2.5, 'F'); txt('Moderate Interest', 60,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PINK);         doc.circle(100, cy + 3.5, 2.5, 'F'); txt('Low Interest',     104, cy + 5, { size: 7.5, color: '#1F2937' });
    cy += 11;

    rect(10, cy, W - 20, 60, '#FAFAFA', '#E5E7EB', 2);
    txt('Career Interest Ranking — Score out of 20 per domain', 14, cy + 6, { size: 8, color: GRAY, bold: true });
    const barX2 = 70, barW2 = W - barX2 - 20;
    careers8.forEach((c, i) => {
      const y2 = cy + 14 + i * 6;
      txt(c.label, 67, y2, { size: 7, color: '#1F2937', align: 'right', maxWidth: 55 });
      rect(barX2, y2 - 3.5, barW2, 5, '#E5E7EB', null, 1);
      rect(barX2, y2 - 3.5, (Math.max(0, c.score) / 20) * barW2, 5, cpiColor(c.level), null, 1);
      txt(String(c.score), barX2 + barW2 + 2, y2, { size: 7, color: GRAY, bold: true });
    });
    for (let i = 0; i <= 20; i += 2) {
      const bx = barX2 + (i / 20) * barW2;
      txt(String(i), bx, cy + 62, { size: 5.5, color: GRAY, align: 'center' });
    }
    cy += 67;

    rect(10, cy, W - 20, 14, '#F5F3FF', '#C4B5FD', 2);
    txt('Career Interest Graph:', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
    txt('Scores in the Career Interest graph represent raw scores (0–20 scale) and reflect the student\'s relative interest levels across assessed career areas where 0-7 indicates Low Interest Area; 8-14 indicates Moderate Interest Area; 15-20 indicates Strong Interest Area.', 14, cy + 11, { size: 7, color: '#374151', maxWidth: W - 28 });
    cy += 20;

    rect(10, cy, W - 20, 10, '#F5F3FF', PURPLE, 2);
    doc.setLineWidth(1.5); setDraw(PURPLE); doc.line(10, cy, 10, cy + 10);
    txt('Scores are indicative and should not be considered final. They reflect the current state at the time of assessment and may change over time.', 15, cy + 6, { size: 7.5, color: '#374151', maxWidth: W - 30 });
    cy += 14;

    // Interest insight (AI) — sits above the cluster table when present.
    if (aiHas('interest_profile')) {
      if (cy + 14 > H - 16) {
        doc.addPage();
        sectionHeader('Interest Insight (AI)', '');
        studentBar(20);
        cy = 32;
      }
      txt('Interest Insight (AI)', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      cy = drawProse(aiText('interest_profile', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 14, pageStart: 32,
        onNewPage: function () {
          sectionHeader('Career Interest (continued)', '');
          studentBar(20);
        },
      });
      cy += 3;
    }

    txt('Interest Cluster Summary', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    const clusterHeaders = ['Cluster', 'Top Domain', 'Interpretation', 'Sample Career Pathways'];
    const cColX = [10, 35, 70, 135];
    const cColW = [25, 35, 65, 65];
    rect(10, cy, W - 20, 7, PURPLE, null, 0);
    clusterHeaders.forEach((h, i) => txt(h, cColX[i] + 2, cy + 5, { size: 8, color: WHITE, bold: true }));
    cy += 7;

    // Keys MUST match CPI_AREAS labels exactly (defined elsewhere in app.js).
    const careerPathwayMap = {
      'Science & Technology':         'Engineering · CS · Research · AI/ML',
      'Health & Medical Science':     'Medicine · Allied Health · Public Health',
      'Language & Communication':     'Journalism · Content · Linguistics · PR',
      'Creative Design & Perf. Arts': 'UX/UI · Animation · Visual Arts · Performing Arts',
      'Legal & Judiciary':            'Law · Policy · Civil Services',
      'Administration & Governance':  'Public Admin · Management · Civil Services',
      'Education & Research':         'Teaching · Academia · Research · EdTech',
      'Business & Entrepreneurship':  'Business · Finance · Startups · Consulting',
      'People & Service':             'Counselling · Social Work · NGO · HR',
      'Sports & Physical Perf.':      'Sports Science · Coaching · Athletics',
    };
    const aiCareerTable = (ai && Array.isArray(ai.career_table)) ? ai.career_table : null;
    const clusters = ['Primary', 'Secondary', 'Exploratory'].map((tag, i) => {
      const item = top3[i] || { label: '—', score: 0 };
      let pathways = careerPathwayMap[item.label] || 'Multiple aligned pathways';
      // Pull from AI career_table when available — prefer matched cluster name,
      // else fall back to positional row.
      if (aiCareerTable) {
        const matched = aiCareerTable.find(r => (r.cluster || '').toLowerCase().includes((item.label || '').split(' ')[0].toLowerCase()))
                        || aiCareerTable[i];
        if (matched) {
          pathways = matched.career || matched.pathways || matched.careers || pathways;
        }
      }
      const interp = i === 0 ? 'Areas you may be most naturally drawn toward based on current interests'
                   : i === 1 ? 'Additional areas that may also align well and offer related pathways'
                             : 'Emerging areas worth exploring through exposure and learning';
      return [tag, item.label, interp, pathways];
    });
    clusters.forEach((row, ri) => {
      const rowBg = ri % 2 === 0 ? WHITE : LIGHT_GRAY;
      rect(10, cy, W - 20, 14, rowBg, '#E5E7EB', 0);
      pill(row[0], cColX[0] + 2, cy + 6, ri === 0 ? PURPLE : ri === 1 ? PURPLE_LIGHT : '#6B7280', WHITE, 20, 6);
      txt(row[1], cColX[1] + 2, cy + 7, { size: 8, color: '#1F2937', bold: true, maxWidth: cColW[1] - 4 });
      const interpL = doc.splitTextToSize(row[2], cColW[2] - 4);
      txt(interpL.slice(0,2).join('\n'), cColX[2] + 2, cy + 6, { size: 7, color: GRAY });
      const pathsL = doc.splitTextToSize(row[3], cColW[3] - 4);
      txt(pathsL.slice(0,2).join('\n'), cColX[3] + 2, cy + 6, { size: 7, color: '#374151' });
      cy += 14;
    });

    // Internal motivators (AI) — short prose block below the cluster table.
    if (aiHas('internal_motivators')) {
      cy += 4;
      if (cy + 14 > H - 16) {
        doc.addPage();
        sectionHeader('What Drives You (AI)', '');
        studentBar(20);
        cy = 32;
      }
      txt('What Drives You (AI)', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      cy = drawProse(aiText('internal_motivators', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 14, pageStart: 32,
        onNewPage: function () {
          sectionHeader('Career Interest (continued)', '');
          studentBar(20);
        },
      });
    }

    footer(6);

    /* ═══════════════════════════════════════════════
       PAGE 7 — SEAA PROFILE
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Social Emotional Academic Adjustment Profile', 'Adjustment and readiness indicators across social, emotional and academic functioning — identifying strengths, developing areas and support needs');
    studentBar(20);
    cy = 32;

    rect(10, cy, W - 20, 7, LIGHT_GRAY, null, 1);
    setFill(PURPLE);       doc.circle(18,  cy + 3.5, 2.5, 'F'); txt('Strong Readiness (A–B)',   22,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PURPLE_LIGHT); doc.circle(68,  cy + 3.5, 2.5, 'F'); txt('Developing Readiness (C)', 72,  cy + 5, { size: 7.5, color: '#1F2937' });
    setFill(PINK);         doc.circle(118, cy + 3.5, 2.5, 'F'); txt('Support Needed (D–E)',    122, cy + 5, { size: 7.5, color: '#1F2937' });
    cy += 10;

    txt('SEAA Domain Scores — Problem Score out of 20 (Lower = Better)', 14, cy + 3, { size: 8, color: GRAY, bold: true });
    cy += 6;

    const seaDescs = [
      'Assesses peer relationships, social confidence, and ability to interact and collaborate effectively.',
      'Evaluates emotional awareness, regulation, resilience, and overall mental well-being.',
      'Measures study habits, focus, motivation, and the ability to manage academic responsibilities.',
    ];
    seaCards.forEach((c, i) => {
      const px = 10 + i * 66;
      rect(px, cy, 62, 42, '#FAFAFA', c.color, 2);
      txt(c.title, px + 4, cy + 7, { size: 7.5, color: c.color, bold: true });
      const dl = doc.splitTextToSize(seaDescs[i], 54);
      txt(dl.join('\n'), px + 4, cy + 13, { size: 5.5, color: GRAY });
      // Gauge arc (semicircle meter) — drawn with line segments
      const cx2 = px + 31, arcY = cy + 32, r = 12;
      // Background arc (grey)
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(2.5);
      for (let a = 180; a <= 360; a += 5) {
        const rad1 = (a * Math.PI) / 180, rad2 = ((a + 5) * Math.PI) / 180;
        doc.line(cx2 + r * Math.cos(rad1), arcY + r * Math.sin(rad1),
                 cx2 + r * Math.cos(rad2), arcY + r * Math.sin(rad2));
      }
      // Filled arc proportional to score (score out of 20, lower = better → invert)
      const fillPct = 1 - (c.score / 20);
      const fillDeg = Math.round(fillPct * 180);
      const [fr, fg, fb] = hex2rgb(c.color);
      doc.setDrawColor(fr, fg, fb); doc.setLineWidth(2.5);
      for (let a = 180; a <= 180 + fillDeg; a += 5) {
        const rad1 = (a * Math.PI) / 180, rad2 = ((a + 5) * Math.PI) / 180;
        doc.line(cx2 + r * Math.cos(rad1), arcY + r * Math.sin(rad1),
                 cx2 + r * Math.cos(rad2), arcY + r * Math.sin(rad2));
      }
      doc.setLineWidth(0.3);
      txt(c.score + '/20', cx2, arcY + 3, { size: 7, color: c.color, bold: true, align: 'center' });
      txt(c.label,         cx2, arcY + 8, { size: 5.5, color: c.color, align: 'center' });
    });
    cy += 48;

    rect(10, cy, W - 20, 10, LIGHT_GRAY, null, 2);
    txt('Scores are based on a 20-point scale per domain. Lower scores reflect stronger adjustment and readiness.', 14, cy + 6, { size: 7.5, color: GRAY });
    cy += 14;

    txt('Adjustment Snapshot', 14, cy, { size: 10, color: '#1F2937', bold: true });
    txt('A quick view of your current zone, key strengths and focus areas.', 14, cy + 5, { size: 8, color: GRAY });
    cy += 10;

    const seaSnapshot = [
      { strengthsByLabel: { 'Strong Readiness':['Builds positive peer relationships','Comfortable in group settings'], 'Developing Readiness':['Adapts well in peer settings','Maintains basic interactions'], 'Support Needed':['Shows readiness to engage','Open to building peer connections'] },
        focusByLabel:     { 'Strong Readiness':['Lead group activities','Mentor others'],                                   'Developing Readiness':['Build self-confidence','Manage peer influence'],            'Support Needed':['Build social confidence','Strengthen peer relationships'] } },
      { strengthsByLabel: { 'Strong Readiness':['Manages emotions effectively','Handles stress with composure'],            'Developing Readiness':['Demonstrates emotional awareness','Able to express feelings'], 'Support Needed':['Aware of emotional patterns','Open to emotional support'] },
        focusByLabel:     { 'Strong Readiness':['Sustain wellbeing routines','Help peers regulate'],                        'Developing Readiness':['Strengthen regulation','Reduce stress and worry'],          'Support Needed':['Build emotional regulation','Reduce stress and anxiety'] } },
      { strengthsByLabel: { 'Strong Readiness':['Strong study habits','Engaged learner'],                                   'Developing Readiness':['Willingness to learn','Engages in assigned tasks'],          'Support Needed':['Capable when supported','Open to learning strategies'] },
        focusByLabel:     { 'Strong Readiness':['Stretch learning goals','Take on independent projects'],                   'Developing Readiness':['Improve consistency','Time management'],                    'Support Needed':['Build study consistency','Develop focus & motivation'] } },
    ];
    seaSnapshot.forEach((s, i) => {
      const c = seaCards[i];
      const px = 10 + i * 66;
      const bgByLabel = c.label === 'Strong Readiness' ? '#F0FDF4' : c.label === 'Developing Readiness' ? '#F5F3FF' : '#FFF1F2';
      rect(px, cy, 62, 38, bgByLabel, c.color, 2);
      txt(c.title, px + 4, cy + 7, { size: 7.5, color: c.color, bold: true });
      pill(c.label, px + 4, cy + 13, c.color, WHITE, 54, 6);
      txt('Strengths', px + 4, cy + 20, { size: 7, color: '#1F2937', bold: true });
      (s.strengthsByLabel[c.label] || []).slice(0, 2).forEach((it, si) => txt('• ' + it, px + 4, cy + 24 + si * 4, { size: 6.5, color: GRAY }));
      line(px + 4, cy + 29, px + 58, cy + 29, '#E5E7EB', 0.2);
      txt('Focus Areas', px + 4, cy + 32, { size: 7, color: '#1F2937', bold: true });
      (s.focusByLabel[c.label] || []).slice(0, 2).forEach((it, fi) => txt('• ' + it, px + 4, cy + 36 + fi * 4, { size: 6.5, color: GRAY }));
    });
    cy += 43;

    txt('Dimension Summary', 14, cy, { size: 9, color: '#1F2937', bold: true });
    cy += 5;
    const dimHeaders = ['Dimension', 'Status', 'Interpretation'];
    const dimColX = [10, 65, 110];
    rect(10, cy, W - 20, 7, PURPLE, null, 0);
    dimHeaders.forEach((h, i) => txt(h, dimColX[i] + 2, cy + 5, { size: 8, color: WHITE, bold: true }));
    cy += 7;
    const interpByLabel = {
      'Strong Readiness':     'Strong adjustment with consistent positive functioning. Continue practices that sustain wellbeing.',
      'Developing Readiness': 'Emerging readiness; targeted strategies and consistent practice will strengthen this area.',
      'Support Needed':       'Higher concern — structured support and guidance are recommended to build readiness.',
    };
    seaCards.forEach((c, ri) => {
      rect(10, cy, W - 20, 14, ri % 2 === 0 ? WHITE : LIGHT_GRAY, '#E5E7EB', 0);
      txt(c.title, dimColX[0] + 2, cy + 7, { size: 8, color: '#1F2937' });
      pill(c.label, dimColX[1] + 2, cy + 7, c.color, WHITE, 42, 6);
      const interpL = doc.splitTextToSize(interpByLabel[c.label] || '—', 88);
      txt(interpL.slice(0,2).join('\n'), dimColX[2] + 2, cy + 5, { size: 6.5, color: GRAY });
      cy += 14;
    });
    cy += 4;

    if (aiHas('wellbeing_guidance')) {
      if (cy + 14 > H - 16) {
        doc.addPage();
        sectionHeader('Wellbeing Guidance (AI)', '');
        studentBar(20);
        cy = 32;
      }
      txt('Wellbeing Guidance (AI)', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      cy = drawProse(aiText('wellbeing_guidance', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 14, pageStart: 32,
        onNewPage: function () {
          sectionHeader('SEAA Profile (continued)', '');
          studentBar(20);
        },
      });
    } else {
      txt('Growth Support Pathway', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      const gspItems = [
        { step: 'Awareness', desc: 'Develop understanding of current strengths and growth areas.' },
        { step: 'Action',    desc: 'Practice routines and strategies that support improvement.'   },
        { step: 'Support',   desc: 'Use guidance and resources to sustain progress.'              },
      ];
      gspItems.forEach((g, i) => {
        const px = 10 + i * 66;
        rect(px, cy, 62, 18, LIGHT_GRAY, '#D1D5DB', 2);
        txt(g.step, px + 4, cy + 7, { size: 8.5, color: PURPLE, bold: true });
        const dl = doc.splitTextToSize(g.desc, 54);
        txt(dl.join('\n'), px + 4, cy + 13, { size: 7, color: GRAY });
      });
      cy += 22;

      rect(10, cy, W - 20, 8, LIGHT_GRAY, null, 2);
      txt('Consistent support, positive reinforcement, and collaboration help students grow with confidence.', 14, cy + 5, { size: 7.5, color: GRAY });
      cy += 12;
    }

    rect(10, cy, W - 20, 10, '#F5F3FF', PURPLE, 2);
    doc.setLineWidth(1.5); setDraw(PURPLE); doc.line(10, cy, 10, cy + 10);
    txt('These results provide a snapshot for guidance purposes only. They reflect the current state at the time of assessment and may evolve over time.', 15, cy + 6, { size: 7.5, color: '#374151', maxWidth: W - 30 });

    footer(7);

    /* ═══════════════════════════════════════════════
       PAGES 8–9 — GAP ANALYSIS
    ═══════════════════════════════════════════════ */
    const findApt  = (name) => aptitude8.find(a => a.name === name) || { name: name, stanine: 5 };
    const findPers = (name) => personality9.find(p => p.name === name) || { name: name, stanine: 5 };
    const seaToReadiness9 = (key) => {
      const ps = sea.domScores[key] || 10;
      return Math.max(1, Math.min(9, Math.round(9 - (ps / 20) * 8)));
    };

    // Maps canonical CPI cluster label → most relevant aptitude / personality
    // / SEAA dimension to highlight on the gap analysis chart.
    // Keys MUST match CPI_AREAS labels exactly.
    const pathwayMappings = {
      'Science & Technology':         { apt:'Numerical Ability',     pers:'Curiosity & Learning',    sea:'A' },
      'Health & Medical Science':     { apt:'Health & Medical Apt.', pers:'Patience & Resilience',   sea:'E' },
      'Language & Communication':     { apt:'Verbal Ability',        pers:'Curiosity & Learning',    sea:'S' },
      'Creative Design & Perf. Arts': { apt:'Spatial Ability',       pers:'Creativity & Innovation', sea:'E' },
      'Legal & Judiciary':            { apt:'Legal Studies Ability', pers:'Ethical Awareness',       sea:'A' },
      'Administration & Governance':  { apt:'Abstract Reasoning',    pers:'Leadership & Motivation', sea:'A' },
      'Education & Research':         { apt:'Verbal Ability',        pers:'Discipline & Sincerity',  sea:'A' },
      'Business & Entrepreneurship':  { apt:'Numerical Ability',     pers:'Leadership & Motivation', sea:'A' },
      'People & Service':             { apt:'Verbal Ability',        pers:'Ethical Awareness',       sea:'S' },
      'Sports & Physical Perf.':      { apt:'Mechanical Ability',    pers:'Discipline & Sincerity',  sea:'A' },
    };
    const pathwayDefaults = { apt:'Verbal Ability', pers:'Discipline & Sincerity', sea:'A' };

    const top4Pathways = (cpiAll.slice(0, 4).length === 4 ? cpiAll.slice(0, 4) : top3.concat(cpiAll).slice(0, 4));
    const pathwayGaps = top4Pathways.map((p, idx) => {
      const m = pathwayMappings[p.label] || pathwayDefaults;
      const aptD = findApt(m.apt); const persD = findPers(m.pers);
      const seaR = seaToReadiness9(m.sea);
      const seaName = m.sea === 'S' ? 'Social Readiness' : m.sea === 'E' ? 'Emotional Readiness' : 'Academic Readiness';
      return {
        title: 'Pathway ' + (idx + 1) + ' — ' + p.label,
        factors: [
          ['Aptitude Factor',    m.apt,   aptD.stanine,  7],
          ['Personality Factor', m.pers,  persD.stanine, 7],
          ['SEAA Factor',        seaName, seaR,          6],
        ],
      };
    });

    const drawPathwayGap = (pg, startY) => {
      rect(10, startY, W - 20, 8, PURPLE, null, 2);
      txt(pg.title, 14, startY + 6, { size: 9, color: WHITE, bold: true, maxWidth: W - 28 });
      let gy = startY + 12;
      pg.factors.forEach((f) => {
        const fType = f[0], fLabel = f[1], current = f[2], required = f[3];
        txt(fType, 14, gy, { size: 7.5, color: GRAY, bold: true });
        txt(fLabel, 14, gy + 5, { size: 8, color: '#1F2937' });
        const barX3 = 14, barW3 = W - 28;
        txt('Your Current Level', barX3, gy + 10, { size: 6.5, color: PURPLE });
        rect(barX3, gy + 11, barW3, 4, '#E5E7EB', null, 1);
        rect(barX3, gy + 11, (current / 9) * barW3, 4, PURPLE, null, 1);
        txt(current + '/9', barX3 + (current / 9) * barW3 + 1, gy + 14, { size: 6, color: PURPLE });
        txt('Typically Required', barX3, gy + 18, { size: 6.5, color: GRAY });
        rect(barX3, gy + 19, barW3, 4, '#E5E7EB', null, 1);
        rect(barX3, gy + 19, (required / 9) * barW3, 4, '#9CA3AF', null, 1);
        txt(required + '/9', barX3 + (required / 9) * barW3 + 1, gy + 22, { size: 6, color: GRAY });
        gy += 28;
      });
      return gy + 4;
    };

    doc.addPage();
    sectionHeader('Gap Analysis', 'Adjustment and readiness indicators across social, emotional and academic functioning — identifying strengths, developing areas and support needs');
    studentBar(20);
    cy = 32;
    const gapNote = 'For each recommended pathway, 3 key parameters are compared: 1 Aptitude factor, 1 Personality factor, and 1 SEAA readiness factor. Purple bars show your current level. Grey bars show the level typically required for that pathway.';
    const gnL = doc.splitTextToSize(gapNote, W - 28);
    txt(gnL.join('\n'), 14, cy + 4, { size: 8, color: '#374151' });
    cy += gnL.length * 5 + 4;
    cy = drawPathwayGap(pathwayGaps[0] || { title:'Pathway 1', factors:[] }, cy);
    cy = drawPathwayGap(pathwayGaps[1] || { title:'Pathway 2', factors:[] }, cy);
    footer(8);

    doc.addPage();
    sectionHeader('Gap Analysis', 'Adjustment and readiness indicators across social, emotional and academic functioning — identifying strengths, developing areas and support needs');
    studentBar(20);
    cy = 32;
    cy = drawPathwayGap(pathwayGaps[2] || { title:'Pathway 3', factors:[] }, cy);
    cy = drawPathwayGap(pathwayGaps[3] || { title:'Pathway 4', factors:[] }, cy);
    footer(9);

    /* ═══════════════════════════════════════════════
       PAGE 10 — INTEGRATED CAREER FIT MATRIX
    ═══════════════════════════════════════════════ */
    doc.addPage();
    sectionHeader('Integrated Career Fit Matrix', 'A combined view of career pathways across all four domains');
    studentBar(20);
    cy = 30;

    const matrixNote = 'This matrix combines your Interest, Aptitude, Personality and Wellbeing readiness to calculate an overall alignment level for each career cluster. Strong = well aligned across all domains. Emerging = developing alignment. Exploratory = worth exploring with more exposure.';
    const mnL = doc.splitTextToSize(matrixNote, W - 28);
    txt(mnL.join('\n'), 14, cy + 4, { size: 8, color: '#374151' });
    cy += mnL.length * 5 + 4;

    const lvlFromStanine  = (s)  => s >= 7 ? 'High' : s >= 4 ? 'Moderate' : 'Low';
    const lvlFromInterest = (sc) => sc >= 15 ? 'High' : sc >= 8 ? 'Moderate' : 'Low';

    // Source 1: AI career_table (preferred — real career names, fit ratings,
    // and a numeric suitability_pct).
    // Source 2: score-driven cluster matrix (fallback when no AI report).
    const aiTable10 = (ai && Array.isArray(ai.career_table) && ai.career_table.length) ? ai.career_table.slice(0, 6) : null;

    let matrixRowsLive;
    if (aiTable10) {
      // AI rows already carry career, cluster, interest_fit, aptitude_fit,
      // personality_fit, suitability_pct, rationale.
      matrixRowsLive = aiTable10.map((r) => {
        const cap = (s) => {
          const v = String(s || '').trim();
          if (!v) return 'Moderate';
          const lower = v.toLowerCase();
          if (lower === 'high' || lower === 'h') return 'High';
          if (lower === 'low'  || lower === 'l') return 'Low';
          return 'Moderate';
        };
        const interest = cap(r.interest_fit);
        const aptL     = cap(r.aptitude_fit);
        const persL    = cap(r.personality_fit);
        // SEAA fit isn't in the AI schema — use the student's OVERALL SEAA
        // readiness (average across S/E/A) so every row reflects the actual
        // wellbeing profile, not an arbitrary single dimension.
        const seaR = Math.round((seaToReadiness9('S') + seaToReadiness9('E') + seaToReadiness9('A')) / 3);
        const seaL = lvlFromStanine(seaR);
        const pct  = (typeof r.suitability_pct === 'number') ? Math.round(r.suitability_pct)
                   : (parseFloat(r.suitability_pct) || 0);
        const align = pct >= 80 ? 'Strong Fit' : pct >= 65 ? 'Emerging Fit' : 'Exploratory';
        const careerName = r.career || r.cluster || '—';
        return [careerName, interest, aptL, persL, seaL, align, pct, r.cluster || '', r.rationale || ''];
      });
    } else {
      const top6 = cpiAll.slice(0, 6);
      matrixRowsLive = top6.map((p) => {
        const m = pathwayMappings[p.label] || pathwayDefaults;
        const aptStn  = findApt(m.apt).stanine;
        const persStn = findPers(m.pers).stanine;
        // Same overall-SEAA approach for the score-driven fallback.
        const seaR    = Math.round((seaToReadiness9('S') + seaToReadiness9('E') + seaToReadiness9('A')) / 3);
        const interest = lvlFromInterest(p.score);
        const aptL     = lvlFromStanine(aptStn);
        const persL    = lvlFromStanine(persStn);
        const seaL     = lvlFromStanine(seaR);
        const sc = (interest === 'High' ? 3 : interest === 'Moderate' ? 2 : 1) +
                   (aptL     === 'High' ? 3 : aptL     === 'Moderate' ? 2 : 1) +
                   (persL    === 'High' ? 3 : persL    === 'Moderate' ? 2 : 1) +
                   (seaL     === 'High' ? 2 : seaL     === 'Moderate' ? 1 : 0);
        const align = sc >= 9 ? 'Strong Fit' : sc >= 6 ? 'Emerging Fit' : 'Exploratory';
        const pct = Math.round((sc / 11) * 100);
        return [p.label, interest, aptL, persL, seaL, align, pct, '', ''];
      });
    }

    const mHeaders = ['Career', 'Interest', 'Aptitude', 'Personality', 'SEAA', 'Suitability'];
    const mColX = [10, 58, 84, 110, 136, 156];
    const mColW = [48, 26, 26, 26, 20, 44];
    rect(10, cy, W - 20, 7, PURPLE, null, 0);
    mHeaders.forEach((h, i) => txt(h, mColX[i] + 2, cy + 5, { size: 7.5, color: WHITE, bold: true }));
    cy += 7;

    matrixRowsLive.forEach((row, ri) => {
      rect(10, cy, W - 20, 10, ri % 2 === 0 ? WHITE : LIGHT_GRAY, '#E5E7EB', 0);
      txt(row[0], mColX[0] + 2, cy + 7, { size: 7.5, color: '#1F2937', maxWidth: mColW[0] - 4 });
      const levelColors = { High: GREEN, Moderate: '#3B82F6', Low: PINK };
      [1, 2, 3, 4].forEach((ci) => pill(row[ci], mColX[ci] + 1, cy + 7, levelColors[row[ci]] || GRAY, WHITE, mColW[ci] - 4, 6));
      // Last column always shows suitability percentage
      const pct = row[6];
      const pctColor = pct >= 80 ? PURPLE : pct >= 65 ? PURPLE_LIGHT : GRAY;
      txt(pct + '%', mColX[5] + 2, cy + 7, { size: 8, color: pctColor, bold: true });
      cy += 10;
    });
    cy += 4;

    const strongFits   = matrixRowsLive.filter(r => r[5].indexOf('Strong') >= 0).map(r => r[0]);
    const emergingFits = matrixRowsLive.filter(r => r[5].indexOf('Emerging') >= 0).map(r => r[0]);
    const exploratory  = matrixRowsLive.filter(r => r[5].indexOf('Exploratory') >= 0).map(r => r[0]);
    const fitBoxes = [
      { title:'Strong Fit Pathways',    color: PURPLE,       bg:'#F5F3FF', items: strongFits   },
      { title:'Emerging Fit Pathways',  color: PURPLE_LIGHT, bg:'#EDE9FE', items: emergingFits },
      { title:'Exploratory Pathways',   color: GRAY,         bg: LIGHT_GRAY, items: exploratory },
    ];
    fitBoxes.forEach((fb, i) => {
      const px = 10 + i * 66;
      rect(px, cy, 62, 18, fb.bg, fb.color, 2);
      txt(fb.title, px + 4, cy + 7, { size: 8, color: fb.color, bold: true });
      const items = fb.items.length ? fb.items : ['—'];
      items.slice(0, 2).forEach((it, k) => txt(it, px + 4, cy + 12 + k * 4, { size: 7, color: '#374151', maxWidth: 56 }));
    });
    cy += 22;

    // Stream advice — AI's narrative recommendation for stream / exams /
    // degrees. Falls back to the score-derived 3-card subject pathway
    // recommendation when no AI report is present.
    if (aiHas('stream_advice')) {
      if (cy + 14 > H - 36) {
        doc.addPage();
        sectionHeader('Stream & Pathway Advice (AI)', '');
        studentBar(20);
        cy = 32;
      }
      txt('STREAM & PATHWAY ADVICE (AI)', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      cy = drawProse(aiText('stream_advice', ''), cy, {
        size: 7.5, color: '#374151', lineH: 4.2, paraGap: 3,
        maxW: W - 28, x: 14, bottom: H - 36, pageStart: 32,
        onNewPage: function () {
          sectionHeader('Stream & Pathway Advice (continued)', '');
          studentBar(20);
        },
      });
    } else {
      txt('RECOMMENDED SUBJECT PATHWAYS', 14, cy, { size: 9, color: '#1F2937', bold: true });
      cy += 5;
      const subjectMap = {
        'Science & Technology':         'PCM + Computer Science',
        'Health & Medical Science':     'PCB + Psychology',
        'Language & Communication':     'Languages + Media Studies',
        'Creative Design & Perf. Arts': 'Arts + Design + Performing Arts',
        'Legal & Judiciary':            'Humanities + Political Science',
        'Administration & Governance':  'Humanities + Economics + Pol. Science',
        'Education & Research':         'Humanities + Subject Specialisation',
        'Business & Entrepreneurship':  'Mathematics + Economics + Business',
        'People & Service':             'Humanities + Psychology + Sociology',
        'Sports & Physical Perf.':      'PE + Biology + Psychology',
      };
      const recPrimary = (strongFits[0] || emergingFits[0] || (top3[0] && top3[0].label) || 'Multidisciplinary');
      const recAlt     = (strongFits[1] || emergingFits[0] || (top3[1] && top3[1].label) || 'Multidisciplinary');
      const recExpl    = (exploratory[0] || (top3[2] && top3[2].label) || 'Multidisciplinary');
      const pathways = [
        { num:'01', fit:'Strong Fit',      type:'(Primary Pathway)',  subject: subjectMap[recPrimary] || 'Multidisciplinary stream', desc:'Highest alignment with your assessed strengths and top fit pathway: ' + recPrimary + '.', color: PURPLE },
        { num:'02', fit:'Alternate Fit',   type:'(Related Pathway)',  subject: subjectMap[recAlt]     || 'Multidisciplinary stream', desc:'Supports related pathways such as ' + recAlt + ' while keeping options open.',          color: PURPLE_LIGHT },
        { num:'03', fit:'Exploratory Fit', type:'(Flexible Pathway)', subject: subjectMap[recExpl]    || 'Humanities + Psychology',   desc:'Maintains broader options for exploration via ' + recExpl + '.',                       color: GRAY },
      ];
      pathways.forEach((p) => {
        rect(10, cy, W - 20, 18, '#FAFAFA', p.color, 2);
        setFill(p.color); doc.roundedRect(10, cy, 16, 18, 2, 2, 'F');
        txt(p.num, 18, cy + 10, { size: 10, color: WHITE, bold: true, align: 'center' });
        txt(p.fit, 30, cy + 7, { size: 9, color: p.color, bold: true });
        txt(p.type, 30, cy + 12, { size: 7.5, color: GRAY });
        txt(p.subject, 30, cy + 16, { size: 8, color: '#1F2937', bold: true, maxWidth: 80 });
        const dL = doc.splitTextToSize(p.desc, 90);
        txt(dL.slice(0,2).join('\n'), 118, cy + 7, { size: 7.5, color: GRAY });
        cy += 22;
      });
    }

    if (cy < H - 56) {
      cy += 2;
      txt('Tips to Strengthen Aptitude', 14, cy, { size: 8.5, color: '#1F2937', bold: true });
      cy += 4;
      const tips = [
        'Solve reasoning, analytical, and aptitude based questions regularly to strengthen core thinking skills.',
        'Practice mental math, data interpretation, and problem solving for speed and accuracy.',
        'Read widely to improve comprehension, critical thinking, and verbal reasoning.',
        'Engage in strategy based activities such as chess, coding, debates, or Olympiad style challenges.',
        'Break down complex problems into smaller steps to improve structured thinking.',
        'Use timed practice to enhance decision making under pressure.',
        'Strengthen weak aptitude areas through consistent targeted practice and feedback.',
        'Apply aptitude skills in real contexts — projects, experiments, research, and case studies.',
        'Develop curiosity by asking why, how, and exploring multiple solutions.',
        'Build a growth mindset — aptitudes can improve significantly through effort and exposure.',
      ];
      tips.forEach((tip, i) => {
        if (cy > H - 90) return;
        txt((i + 1) + '. ' + tip, 14, cy, { size: 7, color: '#374151', maxWidth: W - 28 });
        cy += 5;
      });
      cy += 3;
    }

    if (cy < H - 56) {
      txt('Fostering Healthy Personality Development & Emotional Wellbeing', 14, cy, { size: 8.5, color: '#1F2937', bold: true });
      cy += 4;
      const wellbeingTips = [
        'Build self-awareness by reflecting on strengths, behaviours, and growth areas.',
        'Develop confidence through initiative-taking and ownership of responsibilities.',
        'Strengthen discipline through routines, time management, and goal setting.',
        'Practice adaptability by staying open to feedback, change, and new experiences.',
        'Develop emotional regulation by responding thoughtfully rather than reacting impulsively.',
        'Build resilience by learning from setbacks and persisting through challenges.',
        'Strengthen communication, empathy, and collaboration in relationships and teamwork.',
        'Cultivate healthy habits for stress management, balance, and overall wellbeing.',
        'Practice ethical decision making, responsibility, and integrity in everyday choices.',
        'Seek mentorship, support, and constructive guidance when navigating challenges.',
      ];
      wellbeingTips.forEach((tip, i) => {
        if (cy > H - 52) return;
        txt((i + 1) + '. ' + tip, 14, cy, { size: 7, color: '#374151', maxWidth: W - 28 });
        cy += 5;
      });
      cy += 2;
    }

    if (cy > H - 50) cy = H - 50;
    rect(10, cy, W - 20, 16, '#F5F3FF', '#C4B5FD', 2);
    txt("Counselor's Remarks", 14, cy + 6, { size: 8, color: PURPLE, bold: true });
    const cr = 'Dear Students, Please note that final academic and career decisions should be made by considering aptitude, interests, and academic performance together. This report is intended to serve as a guidance tool and should be used alongside discussions with parents, teachers, and counselors to support well-informed decision making.';
    const crL = doc.splitTextToSize(cr, W - 28);
    txt(crL.slice(0,3).join('\n'), 14, cy + 11, { size: 7, color: '#374151' });
    cy += 20;

    if (cy < H - 24) {
      rect(10, cy, W - 20, 16, LIGHT_GRAY, null, 2);
      txt('Disclaimer', 14, cy + 6, { size: 8, color: '#1F2937', bold: true });
      const disc = 'This NuMind MAPS Report presents indicative insights derived from standardized assessments to support self-awareness, exploration, and informed decision-making. Recommendations are illustrative, not prescriptive, and should be interpreted alongside academic performance, evolving interests, and guidance from parents, teachers, or qualified counselors. Final academic and career decisions should not be made solely on the basis of this report.';
      const discL = doc.splitTextToSize(disc, W - 28);
      txt(discL.slice(0,3).join('\n'), 14, cy + 11, { size: 6.5, color: GRAY });
    }

    footer(10);

    // ── Stamp footers on every page using actual page indices ──
    // Done once at the end so AI prose overflow can't desync page numbers.
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const fy = H - 8;
      line(10, fy - 3, W - 10, fy - 3, '#E5E7EB', 0.2);
      txt('numind.co.in | Confidential — For personal guidance only', 14, fy, { size: 7, color: GRAY });
      txt('Page ' + p + ' of ' + totalPages, W - 14, fy, { size: 7, color: GRAY, align: 'right' });
    }

    // SAVE
    const fname = 'NuMind_MAPS_' + safe(studentName).replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
    doc.save(fname);

  } catch (err) {
    console.error('[downloadPDF] failed:', err);
    alert('PDF generation failed: ' + (err.message || err));
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
}


export { downloadPDF };
