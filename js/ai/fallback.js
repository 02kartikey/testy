/* ════════════════════════════════════════════════════════════════════
   ai/fallback.js
   Deterministic fallback report when AI is unavailable.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';

function _buildFallbackReport(stNorm, cpi, sea, nmap, daabPayload) {
  const firstName = stNorm.firstName;

  /* ── Helpers ── */
  function stanineLabel(s) { return s >= 7 ? 'Strength' : s >= 4 ? 'Developing' : 'Needs Attention'; }
  function stanineEmoji(s) { return s >= 7 ? '🟢' : s >= 4 ? '🟡' : '🔴'; }
  function catLabel(c)     { return {A:'Excellent',B:'Good',C:'Moderate',D:'Unsatisfactory',E:'High Concern'}[c] || c; }

  const DAAB_NAMES = {
    va:'Verbal', pa:'Perceptual', na:'Numerical',
    lsa:'Legal Aptitude', hma:'Health & Medical',
    ar:'Abstract Reasoning', ma:'Mechanical', sa:'Spatial'
  };

  /* ── NMAP summary ── */
  const nmapTop   = nmap ? nmap.sorted.slice(0, 3) : [];
  const nmapLow   = nmap ? nmap.dims.filter(function(d){ return d.stanine <= 3; }) : [];
  const nmapAvg   = nmap ? (nmap.dims.reduce(function(s,d){ return s+d.stanine; }, 0) / nmap.dims.length).toFixed(1) : null;

  /* ── DAAB summary ── */
  const daabEntries  = Object.entries(daabPayload || {});
  const daabStrong   = daabEntries.filter(function(e){ return e[1].stanine >= 7; });
  const daabWeak     = daabEntries.filter(function(e){ return e[1].stanine <= 3; });
  const daabAvg      = daabEntries.length
    ? (daabEntries.reduce(function(s,e){ return s+e[1].stanine; }, 0) / daabEntries.length).toFixed(1)
    : null;

  /* ── CPI summary ── */
  const top3        = cpi ? cpi.top3 : [];
  const top3Labels  = top3.map(function(a){ return a.label; });

  /* ── SEL summary ── */
  const seaDoms     = sea ? ['E','S','A'] : [];
  const selConcerns = seaDoms.filter(function(d){ return sea.cls[d].cat >= 'C'; });
  const selGood     = seaDoms.filter(function(d){ return sea.cls[d].cat <= 'B'; });
  const domName     = {E:'Emotional',S:'Social',A:'Academic'};

  /* ── Build sections ── */

  const holistic_summary =
    firstName + ' has completed all four NuMind MAPS assessment modules, giving us a rich picture of who they are as a learner and a person.\n\n' +
    (nmapTop.length
      ? 'Personality-wise, ' + firstName + "'s strongest dimensions are " + nmapTop.map(function(d){ return d.label + ' (Stanine ' + d.stanine + ')'; }).join(', ') + '. ' +
        'An average personality stanine of ' + nmapAvg + '/9 indicates ' + (nmapAvg >= 7 ? 'strong overall character traits.' : nmapAvg >= 4 ? 'a well-rounded personality with clear growth areas.' : 'several important personality dimensions to develop.') + '\n\n'
      : '') +
    (top3.length
      ? 'Career interest analysis shows ' + firstName + ' is drawn most to ' + top3Labels.join(', ') + '. ' +
        'These interests, combined with aptitude data, form the foundation of the career recommendations below.\n\n'
      : '') +
    (sea
      ? (selConcerns.length === 0
          ? firstName + "'s social-emotional wellbeing is in good shape across all three domains — a strong foundation for academic and career success."
          : 'There are some wellbeing areas worth attention: ' + selConcerns.map(function(d){ return domName[d] + ' (' + catLabel(sea.cls[d].cat) + ')'; }).join(', ') + '. Addressing these will help ' + firstName + ' perform at their best.')
      : '');

  const aptitude_profile =
    (daabEntries.length
      ? (daabStrong.length
          ? firstName + "'s strongest aptitude areas are " + daabStrong.map(function(e){ return DAAB_NAMES[e[0]] + ' (Stanine ' + e[1].stanine + ', ' + stanineEmoji(e[1].stanine) + ' ' + stanineLabel(e[1].stanine) + ')'; }).join(', ') + '. ' +
            'These represent natural cognitive strengths that align well with careers requiring those abilities.\n\n'
          : firstName + ' shows developing aptitude across all tested areas, with the most improvement seen in ' + (daabEntries.sort(function(a,b){ return b[1].stanine-a[1].stanine; })[0] ? DAAB_NAMES[daabEntries.sort(function(a,b){ return b[1].stanine-a[1].stanine; })[0][0]] : 'general areas') + '.\n\n') +
        (daabWeak.length
          ? 'Areas to build up include ' + daabWeak.map(function(e){ return DAAB_NAMES[e[0]]; }).join(', ') + '. With focused practice and the right resources, ' + firstName + ' can make significant gains here.'
          : firstName + ' shows a consistent aptitude profile with no major weak areas — a great position to be in.')
      : 'Aptitude data is not yet complete. Completing all DAAB sub-tests will unlock a full aptitude breakdown here.');

  const interest_profile =
    (top3.length
      ? 'Based on the Career Preference Inventory, ' + firstName + "'s top three interest clusters are " + top3Labels.join(', ') + '. ' +
        'These reflect where ' + firstName + "'s curiosity and motivation are naturally strongest — a powerful starting point for career exploration.\n\n" +
        'Students with this interest profile often thrive in careers that blend ' + top3Labels.slice(0, 2).join(' and ') + '. ' +
        'The recommended career paths below draw directly from these interests combined with aptitude and personality data.'
      : firstName + "'s interest profile will appear here once the CPI assessment is complete.");

  const internal_motivators =
    (nmapTop.length || top3.length
      ? firstName + ' is internally motivated by a combination of ' +
        (nmapTop.length ? 'personality strengths like ' + nmapTop.slice(0, 2).map(function(d){ return d.label; }).join(' and ') : '') +
        (nmapTop.length && top3.length ? ', and ' : '') +
        (top3.length ? 'genuine interest in ' + top3Labels[0] + (top3Labels[1] ? ' and ' + top3Labels[1] : '') : '') + '.\n\n' +
        'These internal drives are the most reliable predictors of long-term career satisfaction. Environments that engage these motivators will bring out the best in ' + firstName + '.'
      : 'Internal motivator analysis will be available after completing all assessment modules.');

  const personality_profile =
    (nmap
      ? 'Among all personality dimensions assessed, ' + firstName + "'s clearest strengths are " +
        nmapTop.slice(0, 2).map(function(d){ return d.label + ' (Stanine ' + d.stanine + ')'; }).join(' and ') + '. ' +
        'These traits shape how ' + firstName + ' approaches problems, works with others, and handles challenges.\n\n' +
        (nmapLow.length
          ? 'One growth habit to develop: spend 10 minutes each day on ' + nmapLow[0].label.toLowerCase() + ' — small consistent effort here will compound quickly over a school year.'
          : firstName + ' shows a well-developed personality profile across all dimensions.')
      : 'Personality profile will appear after completing the NMAP assessment.');

  const wellbeing_guidance =
    (sea
      ? (selGood.length === 3
          ? firstName + "'s social-emotional scores are healthy across Emotional, Social, and Academic domains — all falling in the " +
            [sea.cls.E.cat, sea.cls.S.cat, sea.cls.A.cat].map(catLabel).join(', ') + ' categories respectively. This is a real asset.\n\n' +
            'Continue the habits that support this wellbeing: regular sleep, staying connected with supportive friends, and asking for help early when academic pressure builds.'
          : 'In terms of SEL readiness, ' + firstName + "'s strongest area is " +
            (selGood.length ? selGood.map(function(d){ return domName[d]; }).join(', ') : 'yet to be determined') + '.\n\n' +
            (selConcerns.length
              ? 'Some care and attention would help in the ' + selConcerns.map(function(d){ return domName[d]; }).join(' and ') + ' area' + (selConcerns.length > 1 ? 's' : '') + '. ' +
                'Specific steps: talk to a trusted teacher or counsellor, try a short mindfulness routine before school, and remember that reaching out is a sign of strength — not weakness.'
              : ''))
      : 'Wellbeing analysis will appear after completing the NSEAAS assessment.');

  /* ── Career table — derived from CPI top interests + DAAB ── */
  function fitLevel(isCpiTop, stanine) {
    if (isCpiTop && stanine >= 6) return 'High';
    if (isCpiTop || stanine >= 6) return 'Medium';
    return 'Low';
  }

  // Map CPI areas to typical career + stream pairs
  const CAREER_MAP = {
    'Science & Technology':         [{ career:'Software Engineer',      stream:'Science (PCM)' }, { career:'Data Analyst',             stream:'Science (PCM)' }],
    'Health & Medical Science':     [{ career:'Doctor / Physician',     stream:'Science (PCB)' }, { career:'Healthcare Administrator',  stream:'Science (PCB)' }],
    'Language & Communication':     [{ career:'Journalist / Writer',    stream:'Humanities'    }, { career:'PR & Communications Lead', stream:'Humanities'    }],
    'Creative Design & Perf. Arts': [{ career:'UI/UX Designer',         stream:'Any + Design'  }, { career:'Media Producer',           stream:'Humanities'    }],
    'Legal & Judiciary':            [{ career:'Lawyer / Advocate',      stream:'Humanities'    }, { career:'Legal Analyst',            stream:'Humanities'    }],
    'Administration & Governance':  [{ career:'IAS / Civil Servant',    stream:'Humanities'    }, { career:'Policy Analyst',           stream:'Humanities'    }],
    'Education & Research':         [{ career:'Professor / Researcher', stream:'Any stream'    }, { career:'Curriculum Developer',     stream:'Any stream'    }],
    'Business & Entrepreneurship':  [{ career:'Entrepreneur',           stream:'Commerce'      }, { career:'Product Manager',          stream:'Commerce'      }],
    'People & Service':             [{ career:'Social Worker / NGO',    stream:'Humanities'    }, { career:'HR Manager',               stream:'Commerce'      }],
    'Sports & Physical Perf.':      [{ career:'Sports Coach / Athlete', stream:'Physical Ed.'  }, { career:'Physiotherapist',          stream:'Science (PCB)' }],
  };

  const careerRows = [];
  let rank = 1;
  (cpi ? cpi.top3 : []).forEach(function(area) {
    const pairs = CAREER_MAP[area.label] || [];
    pairs.forEach(function(pair) {
      if (rank > 6) return;
      const iFit  = 'High';
      const aFit  = daabAvg ? fitLevel(true, parseFloat(daabAvg)) : 'Medium';
      const pFit  = nmapAvg ? fitLevel(true, parseFloat(nmapAvg)) : 'Medium';
      const pct   = Math.round(
        (iFit==='High'?35:iFit==='Medium'?22:10) +
        (aFit==='High'?35:aFit==='Medium'?22:10) +
        (pFit==='High'?30:pFit==='Medium'?18:5)
      );
      careerRows.push({
        rank: rank++,
        career: pair.career,
        cluster: area.label,
        interest_fit:    iFit,
        aptitude_fit:    aFit,
        personality_fit: pFit,
        suitability_pct: Math.min(pct, 97),
        stream: pair.stream,
        rationale: firstName + "'s strong interest in " + area.label + ' combined with overall aptitude data supports this path. Regular engagement with this field will accelerate readiness.',
      });
    });
  });
  // Fill to 4 rows minimum if needed
  if (careerRows.length < 4 && (!cpi || !cpi.top3.length)) {
    careerRows.push({ rank:1, career:'General Career Counselling Recommended', cluster:'—', interest_fit:'Medium', aptitude_fit:'Medium', personality_fit:'Medium', suitability_pct:70, stream:'Any stream', rationale:'Complete all assessment modules to receive personalised career recommendations.' });
  }

  const stream_advice =
    (top3.length
      ? 'Based on the combined assessment data, ' + firstName + "'s most aligned stream is likely " +
        (careerRows.length && careerRows[0].stream !== '—' ? careerRows[0].stream : 'to be determined after full module completion') + '. ' +
        'Choosing a stream that overlaps with genuine interests dramatically improves motivation and performance in Class 11–12.\n\n' +
        'Recommended next steps: speak with a school counsellor to discuss stream options in detail, research entrance exams relevant to the top careers above, and explore one or two online courses or internships in the top interest area before making a final decision.'
      : 'Stream and pathway advice will be available once all assessment modules are completed. ' +
        "The combination of interest, aptitude, and personality data gives the most accurate stream recommendation — so it's worth completing all four modules.");

  return {
    holistic_summary,
    aptitude_profile,
    interest_profile,
    internal_motivators,
    personality_profile,
    wellbeing_guidance,
    career_table:   careerRows,
    stream_advice,
    _fallback: true,  // flag so the UI can show the "Instant Report" badge
  };
}


export { _buildFallbackReport };
