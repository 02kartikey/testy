/* ════════════════════════════════════════════════════════════════════
   ai/prompt.js
   Token-efficient prompt builder for the AI report.
════════════════════════════════════════════════════════════════════ */

import { S } from '../state.js';

function buildReportPrompt(st, cpi, sea, nmap, daabPayload) {
  const DAAB_NAMES = {
    va:'Verbal', pa:'Perceptual', na:'Numerical',
    lsa:'Legal Aptitude', hma:'Health & Medical',
    ar:'Abstract Reasoning', ma:'Mechanical', sa:'Spatial'
  };

  const top5cpi = cpi.ranked.slice(0, 5)
    .map(function(a) { return a.label + ': ' + a.score + '/20 (' + a.level + ')'; }).join('; ');
  const top3names = cpi.top3.map(function(a) { return a.label; }).join(', ');

  const sea_line =
    'E ' + sea.domScores.E + '/20 Cat' + sea.cls.E.cat + '(' + sea.cls.E.level + '), ' +
    'S ' + sea.domScores.S + '/20 Cat' + sea.cls.S.cat + '(' + sea.cls.S.level + '), ' +
    'A ' + sea.domScores.A + '/20 Cat' + sea.cls.A.cat + '(' + sea.cls.A.level + ')';

  const nmap_line = nmap.dims
    .map(function(d) { return d.abbr + ' stn' + d.stanine; })
    .join(', ');
  const topP = nmap.sorted.slice(0, 3)
    .map(function(d) { return d.abbr + '(' + d.stanine + ')'; }).join(', ');

  const daab_entries = Object.entries(daabPayload);
  const daab_line = daab_entries.length
    ? daab_entries.map(function(e) { return (DAAB_NAMES[e[0]] || e[0]) + ': stn' + e[1].stanine; }).join(', ')
    : 'Not completed';

  const sec = st.section ? ' ' + st.section : '';

  return 'You are an expert educational psychologist writing a personalised career report for a student.\n\n' +
    'STUDENT: ' + st.fullName + ', Class ' + st.student_class + sec + ', ' + st.gender + ', Age ' + (st.age || '?') + ', ' + st.school + '\n\n' +
    'SCORES (interpret meaningfully, never just list numbers):\n' +
    'CPI top interests: ' + top5cpi + '\n' +
    'Top 3: ' + top3names + '\n' +
    'SEL (lower=better, Cat A=Excellent ... E=High Concern): ' + sea_line + '\n' +
    'NMAP personality (stanine /9): ' + nmap_line + ' | Top: ' + topP + '\n' +
    'DAAB aptitude (stanine /9): ' + daab_line + '\n\n' +
    'WRITING RULES:\n' +
    '- Use ' + st.firstName + "'s name naturally throughout.\n" +
    '- Warm, mentor voice — personal story, not data dump.\n' +
    '- Connect patterns across all four modules.\n' +
    '- Frame low scores as growth opportunities, never flaws.\n' +
    '- Be specific, not generic ("has potential" is banned).\n' +
    '- Reader should finish feeling confident and motivated.\n\n' +
    'Return ONLY a JSON object with these 7 keys (no markdown fences, no preamble):\n' +
    '{\n' +
    '  "holistic_summary": "3-4 paragraphs weaving all modules into ' + st.firstName + "'s story.\",\n" +
    '  "aptitude_profile": "2 paragraphs on DAAB strengths + gentle growth areas.",\n' +
    '  "interest_profile": "2 paragraphs on top 3 CPI clusters and exciting career directions.",\n' +
    '  "internal_motivators": "2 paragraphs naming 3-4 core motivators from CPI+NMAP patterns.",\n' +
    '  "personality_profile": "2-3 paragraphs on top NMAP strengths + 1 growth habit.",\n' +
    '  "wellbeing_guidance": "2 paragraphs on SEL readiness with specific actions for any C/D/E areas.",\n' +
    '  "career_table": [{"rank":1,"career":"","cluster":"","interest_fit":"High","aptitude_fit":"High","personality_fit":"Medium","suitability_pct":88,"stream":"","rationale":"2 sentences grounded in actual scores."}],\n' +
    '  "stream_advice": "2 paragraphs recommending stream + entrance exams + degree pathways."\n' +
    '}\n' +
    'RULES: career_table = 4-6 entries ranked by suitability_pct desc. suitability_pct is a number. Return ONLY JSON.';
}


/** Inject the pill + toast DOM nodes once, lazily. */

export { buildReportPrompt };
