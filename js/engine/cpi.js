/* ════════════════════════════════════════════════════════════════════
   engine/cpi.js
   Career Preference Inventory — areas, questions, scorer.
════════════════════════════════════════════════════════════════════ */

const CPI_AREAS = [
  { id:'st',  label:'Science & Technology',         abbr:'S&T',  color:'#0f766e', light:'#ccfbf1' },
  { id:'hms', label:'Health & Medical Science',     abbr:'HMS',  color:'#0891b2', light:'#e0f2fe' },
  { id:'lc',  label:'Language & Communication',     abbr:'L&C',  color:'#b45309', light:'#fef3c7' },
  { id:'cd',  label:'Creative Design & Perf. Arts', abbr:'CrD',  color:'#7c3aed', light:'#ede9fe' },
  { id:'lj',  label:'Legal & Judiciary',            abbr:'L&J',  color:'#4f46e5', light:'#eef2ff' },
  { id:'ag',  label:'Administration & Governance',  abbr:'Adm',  color:'#15803d', light:'#dcfce7' },
  { id:'er',  label:'Education & Research',         abbr:'E&R',  color:'#1d4ed8', light:'#dbeafe' },
  { id:'be',  label:'Business & Entrepreneurship',  abbr:'B&E',  color:'#c2410c', light:'#ffedd5' },
  { id:'ps',  label:'People & Service',             abbr:'P&S',  color:'#be185d', light:'#fce7f3' },
  { id:'sp',  label:'Sports & Physical Perf.',      abbr:'Spt',  color:'#64748b', light:'#f1f5f9' }
];
const CPI_QS = [
  {q:'Which activity would you enjoy the most?',opts:['Doing experiments or building gadgets','Learning about diseases and treatments','Writing stories or speaking publicly','Drawing, dancing, or designing','Debating on justice and laws','Leading a group activity','Teaching or explaining concepts','Running a small business idea','Helping someone solve a problem','Playing sports or fitness training']},
  {q:'In your free time, you prefer to:',opts:['Watch science or tech videos','Read about health and wellness','Read books or blogs','Create art / music / content','Watch legal / crime shows','Plan events or organize things','Study new topics deeply','Learn about money / business','Volunteer / help people','Play outdoor games']},
  {q:'Your favourite school task is:',opts:['Science experiments','Biology lessons','Language assignments','Art or music class','Debates or discussions','Group leadership roles','Projects / research work','Business case studies','Helping classmates','Sports period']},
  {q:'You feel proud when you:',opts:['Solve a technical problem','Help someone feel better','Speak confidently','Create something beautiful','Win an argument logically','Lead a team successfully','Teach someone something new','Earn / save money','Support someone emotionally','Win a match']},
  {q:'You would choose a project on:',opts:['Robotics or innovation','Human anatomy','Creative writing','Fashion / design','Legal awareness','School management system','Research topic','Startup idea','Social issue','Fitness plan']},
  {q:'Your ideal career would involve:',opts:['Technology and innovation','Healthcare and medicine','Communication and media','Arts and creativity','Law and justice','Administration','Teaching / research','Business ventures','Social service','Sports']},
  {q:'You enjoy solving problems related to:',opts:['Machines or systems','Health issues','Communication gaps','Creative expression','Legal fairness','Organizational challenges','Academic questions','Financial / business issues','Personal / social issues','Physical performance']},
  {q:'You are most inspired by:',opts:['Scientists / engineers','Doctors','Writers / speakers','Artists / performers','Lawyers / judges','Leaders / IAS officers','Professors / researchers','Entrepreneurs','Social workers','Athletes']},
  {q:'In a group, your role is usually:',opts:['Problem solver','Caregiver','Communicator','Creative thinker','Debater','Leader','Knowledge provider','Planner (money / resources)','Supporter','Active participant']},
  {q:'You prefer learning through:',opts:['Experiments','Case studies (health)','Reading / writing','Creating','Debates','Managing tasks','Research','Business simulations','Interaction','Practice']},
  {q:'You enjoy discussions about:',opts:['Technology','Health','Ideas / stories','Creativity','Laws','Governance','Knowledge','Business','Society','Sports']},
  {q:'You would like to improve:',opts:['Technical skills','Medical knowledge','Communication','Artistic skills','Argument skills','Leadership','Teaching ability','Financial skills','Empathy','Fitness']},
  {q:'You enjoy competitions in:',opts:['Science fairs','Health quizzes','Debates / writing','Art / music','Moot court','Leadership events','Olympiads','Business pitch','Social campaigns','Sports']},
  {q:'You feel excited when:',opts:['Building something new','Learning about health','Expressing ideas','Creating art','Winning arguments','Managing people','Discovering knowledge','Making profit','Helping others','Competing physically']},
  {q:'Your dream workplace:',opts:['Lab / tech company','Hospital','Media house','Studio / stage','Courtroom','Government office','University','Office / business setup','NGO / community','Stadium']},
  {q:'You admire people who:',opts:['Innovate','Heal','Communicate','Create','Fight for justice','Lead','Educate','Build businesses','Help society','Achieve physically']},
  {q:'You prefer tasks that are:',opts:['Analytical','Caring','Expressive','Creative','Logical','Strategic','Academic','Financial','Supportive','Physical']},
  {q:'You enjoy learning about:',opts:['Machines','Human body','Language','Art','Law','Governance','Research','Business','Society','Sports']},
  {q:'You feel most confident when:',opts:['Solving technical issues','Giving health advice','Speaking / writing','Creating art','Arguing logically','Leading','Teaching','Managing money','Helping','Playing sports']},
  {q:'You would choose a future where you:',opts:['Innovate technology','Treat patients','Communicate ideas','Create art','Practice law','Lead organizations','Teach / research','Run a business','Serve people','Play sports']}
];

export { CPI_AREAS, CPI_QS };
