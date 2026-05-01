/* ════════════════════════════════════════════════════════════════════
   engine/nmap.js
   NMAP personality dims, raw statements, page layout.
════════════════════════════════════════════════════════════════════ */

const NMAP_DIMS = [
  { id:'ld', label:'Leadership & Motivation',       abbr:'Leadership',   emoji:'👑', desc:'Taking charge, inspiring others and staying self-driven.' },
  { id:'as', label:'Assertiveness',                 abbr:'Assertiveness', emoji:'🗣️', desc:'Speaking up confidently and standing your ground.' },
  { id:'ca', label:'Cautiousness',                  abbr:'Cautiousness',  emoji:'🛡️', desc:'Thinking carefully before acting to avoid mistakes.' },
  { id:'ad', label:'Adaptability & Flexibility',    abbr:'Adaptability',  emoji:'🔄', desc:'Adjusting smoothly to change and new situations.' },
  { id:'et', label:'Ethical Awareness',             abbr:'Ethics',        emoji:'⚖️', desc:'Doing what is right and being honest with yourself and others.' },
  { id:'cr', label:'Creativity & Innovation',       abbr:'Creativity',    emoji:'💡', desc:'Generating new ideas and finding original ways to solve problems.' },
  { id:'cu', label:'Curiosity & Learning',          abbr:'Curiosity',     emoji:'🔍', desc:'Exploring topics deeply and staying hungry for knowledge.' },
  { id:'ds', label:'Discipline & Sincerity',        abbr:'Discipline',    emoji:'📅', desc:'Being consistent, organised and responsible with tasks.' },
  { id:'pr', label:'Patience & Resilience',         abbr:'Resilience',    emoji:'💪', desc:'Staying calm under pressure and bouncing back from setbacks.' },
];

const NMAP_RAW_STMTS = [
  // D1 Leadership
  'I take the lead in group projects.',
  'I stay motivated without supervision.',
  'I lead when others are confused.',
  'I start tasks without reminders.',
  'I encourage others when they feel low.',
  'I take responsibility for outcomes.',
  'I prefer guiding rather than following.',
  // D2 Assertiveness
  'I express my views even if others disagree.',
  'I push myself to perform better in competition.',
  'I speak up when treated unfairly.',
  'I say "no" when something feels wrong.',
  'I question ideas that don\'t make sense.',
  'I share my opinions confidently.',
  'I stand my ground instead of giving in.',
  // D3 Cautiousness
  'I think through outcomes before deciding.',
  'I evaluate risks before trying new things.',
  'I avoid actions that may cause problems.',
  'I check my work before submitting.',
  'I think before acting in important situations.',
  'I prefer being careful over taking risks.',
  'I consider consequences before choosing.',
  // D4 Adaptability
  'I adjust easily to sudden changes.',
  'I try new approaches if the first fails.',
  'I adapt my behaviour to situations.',
  'I stay calm when things don\'t go as expected.',
  'I am open to new ways of doing things.',
  'I adjust quickly to new environments.',
  'I change my approach when things don\'t work.',
  // D5 Ethics
  'I feel uneasy when I do something wrong.',
  'I do the right thing even when no one is watching.',
  'I take responsibility for my mistakes.',
  'I avoid dishonest actions.',
  'I consider how my actions affect others.',
  'I apologise when I make a mistake.',
  'I value principles over short-term gain.',
  // D6 Creativity
  'I enjoy thinking of new ideas in studies, projects, or daily life.',
  'I find different ways to solve problems.',
  'I like experimenting with new methods instead of routine ones.',
  'I like to include creativity in my work.',
  'I imagine new possibilities.',
  'I enjoy tasks requiring innovative thinking.',
  'I improve ideas rather than just follow them.',
  // D7 Curiosity
  'I try to find answers when I don\'t understand something.',
  'I explore topics beyond what is taught in class.',
  'I ask questions to understand things deeply.',
  'I feel excited when learning something new.',
  'I try to understand how and why things work.',
  'I continue learning even when the topic feels challenging.',
  'I seek knowledge even without being told to do so.',
  // D8 Discipline
  'I complete my work on time without last-minute pressure.',
  'I stay focused even when distractions are around me.',
  'I follow a routine to manage my studies or responsibilities.',
  'I put consistent effort into tasks, even when I don\'t feel like it.',
  'I avoid distractions when I need to concentrate.',
  'I take my responsibilities seriously in school or at home.',
  'I make sure to finish what I start.',
  // D9 Resilience
  'When things go wrong, I stay calm instead of reacting immediately.',
  'I keep trying even after facing failure or setbacks.',
  'I am able to control my anger or frustration in difficult situations.',
  'I stay patient while waiting for results or outcomes.',
  'I recover quickly after a bad experience.',
  'I handle pressure without losing control of my actions.',
  'I don\'t give up easily when something becomes difficult.',
];

const NMAP_QS = [];
for (let k = 0; k < 63; k++) {
  const dim = k % 9;
  const stmtIdx = Math.floor(k / 9);
  const rawIdx = stmtIdx * 9 + dim; // within the dim's block: dim*7 + stmtIdx
  const rawStmt = NMAP_RAW_STMTS[dim * 7 + stmtIdx];
  NMAP_QS.push({ text: rawStmt, dim });
}
const NMAP_PAGES = NMAP_DIMS.map((d, di) => ({
  dimIdx: di,
  label: d.label,
  range: [di * 7, di * 7 + 7],  // indices in the interleaved array that belong to this dim
}));

const NMAP_PAGE_QS = NMAP_DIMS.map((d, di) => {
  const qs = [];
  for (let k = 0; k < 63; k++) {
    if (NMAP_QS[k].dim === di) qs.push(k);
  }
  return qs; // 7 question indices per dimension page
});

const NMAP_ENCOURAGE = [
  'Off to a great start! 💪',
  'You\'re doing brilliantly! 🌟',
  'Excellent — keep going! 🎯',
  'Halfway there — amazing! 🚀',
  'You\'re on a roll! ✨',
  'Almost done! Keep it up 🏆',
  'Great focus! 💡',
  'Two more to go! 🎊',
  'Last one — finish strong! 🏁',
];


export { NMAP_DIMS, NMAP_RAW_STMTS, NMAP_QS, NMAP_PAGES, NMAP_PAGE_QS, NMAP_ENCOURAGE };
