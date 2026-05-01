/* ════════════════════════════════════════════════════════════════════
   engine/sea.js
   Social-Emotional & Academic Adjustment domains, questions, lookups.
════════════════════════════════════════════════════════════════════ */

const SEA_DOMAINS = {
  E: [0,2,3,4,5,6,9,12,15,18,20,24,27,30,33,36,39,45,51,59],
  S: [1,13,16,19,21,22,28,31,37,40,42,46,48,49,54,55,56,57,58,25],
  A: [7,8,10,11,14,17,23,26,29,32,34,35,38,41,43,44,47,50,52,53]
};
const Q_DOMAIN = new Array(60);
Object.entries(SEA_DOMAINS).forEach(([d,idxs])=>idxs.forEach(i=>Q_DOMAIN[i]=d));

const SEA_TYPES = [
  'N','N','N','N','N','N','N','N','N','N',
  'N','P','N','N','N','N','P','P','N','N',
  'N','P','P','P','N','P','N','N','N','P',
  'N','P','P','N','N','N','N','P','N','N',
  'P','N','N','P','N','N','N','P','N','P',
  'P','N','P','P','N','N','P','N','P','P'
];

const SEA_QS = [
  'Do you always feel afraid of something in school?','Do you avoid meeting your classmates?','Do you forget what you have studied quickly?','If a classmate says something unpleasant unintentionally, do you get upset immediately?','Are you shy by nature?','Do you feel afraid of examinations?','Do you remain worried if a teacher scolds you for a mistake?','Do you hesitate to ask questions in class when you do not understand something?','Do you find it difficult to understand classroom teaching?','Do you feel jealous of classmates whom teachers like more?','Do you get scolded by teachers frequently?','Do you prepare proper notes of what is taught in class?','When you see many classmates better than you, do you feel inferior?','Do you sometimes feel that you have no friends in school?','Do you feel sleepy during class?','When students talk among themselves, do you feel they are criticizing you?','Do you make friends easily?','Are you satisfied with the teaching in your school?','When you are not allowed to take part in school activities, do you express anger on others?','When some students talk loudly, do you also join them?','Do you feel that your teachers do not pay attention to your difficulties?','Do you remain cheerful and happy in school?','Do you like working together with your classmates?','Are you satisfied with your academic progress?','Do you feel that teachers neglect you?','Do you try to attract the teacher\'s attention in class?','Does studying feel like a burden to you?','When someone complains about you, do you get angry and try to harm them?','Do you prefer to remain alone?','Do your teachers always try to help you?','Do you often feel dissatisfied with your school?','Do you maintain good relations with students in your school?','Do your teachers appreciate you?','Do you become stubborn even when you are wrong?','Do you dislike sitting on the front benches in class?','Do you usually get low marks in examinations?','When a teacher asks you a question, do you develop negative feelings toward them?','Do you get along well with your classmates?','Do you wish there were more holidays in school?','Do you get angry even when classmates joke with you?','Do you take part freely in school activities?','Do you sometimes leave school before time?','Do you often quarrel with your classmates?','Do you take part in sports activities in school?','Do some teachers frequently scold you for studies?','Do you generally feel suspicious about others?','Do you feel shy while talking to senior students?','Do you respect your teachers?','If a classmate you dislike says something good, do you ignore it?','Do you have close friends in school?','Does your attention remain focused in class?','When you get low marks, do you develop negative feelings toward teachers?','Are you always ready to help your classmates?','Do you read books from the school library?','Do you feel afraid to meet senior students?','Do you complain about younger students to get them punished?','Do you take part in debates or arguments?','Do you feel hesitant mixing with junior students?','Do you share your books / notes when classmates ask?','Do you remain interested in educational matters?'
];

const DOMAIN_NAME = { E:'Emotional', S:'Social', A:'Academic' };
const PAGE_THEMES = [
  { label:'Round 1', qs:'Q1–10',  range:[0,10]  },
  { label:'Round 2', qs:'Q11–20', range:[10,20] },
  { label:'Round 3', qs:'Q21–30', range:[20,30] },
  { label:'Round 4', qs:'Q31–40', range:[30,40] },
  { label:'Round 5', qs:'Q41–50', range:[40,50] },
  { label:'Round 6', qs:'Q51–60', range:[50,60] },
];

// Encouraging phrases per page
const SEA_ENCOURAGE = [
  'Great start! Keep going 💪',
  'You\'re doing brilliantly! 🌟',
  'Halfway there — amazing work! 🎯',
  'More than halfway done! 🚀',
  'Almost finished — you\'ve got this! ✨',
  'Last round! Finish strong 🏁'
];


export { SEA_DOMAINS, Q_DOMAIN, SEA_TYPES, SEA_QS, DOMAIN_NAME, PAGE_THEMES, SEA_ENCOURAGE };
