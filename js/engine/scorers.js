/* ════════════════════════════════════════════════════════════════════
   engine/scorers.js
   Central scoring engine — scoreCPI, scoreNSEAAS, scoreNMAP wrapped in ENGINE.
════════════════════════════════════════════════════════════════════ */

import { CPI_AREAS } from './cpi.js';
import { SEA_DOMAINS, Q_DOMAIN, SEA_TYPES, DOMAIN_NAME } from './sea.js';
import { NMAP_DIMS, NMAP_QS } from './nmap.js';

const ENGINE = {
  scoreCPI(answers) {
    const raw=new Array(10).fill(0), log=[];
    answers.forEach((ans,qi)=>{
      const selected = Array.isArray(ans) ? ans : (ans !== null ? [ans] : []);
      selected.forEach(optIdx => {
        raw[optIdx]++;
        log.push({q:qi+1,opt:optIdx+1,areaId:CPI_AREAS[optIdx].id,areaLabel:CPI_AREAS[optIdx].label});
      });
    });
    const totalSelections = log.length || 1;
    const areas=CPI_AREAS.map((a,i)=>({...a,score:raw[i],pct:Math.round(raw[i]/totalSelections*100),level:raw[i]>=15?'Strong':raw[i]>=8?'Moderate':'Low'}));
    const ranked=[...areas].sort((a,b)=>b.score-a.score);
    return { raw, areas, ranked, top3:ranked.slice(0,3), log };
  },
  scoreNSEAAS(answers, gender) {
    const domScores={E:0,S:0,A:0}, itemLog=[];
    answers.forEach((ans,qi)=>{
      if(ans===null) return;
      const type=SEA_TYPES[qi], problemScore=type==='N'?ans:(ans===0?1:0);
      const dom=Q_DOMAIN[qi];
      if(dom) domScores[dom]+=problemScore;
      itemLog.push({q:qi+1,response:ans,responseLabel:ans===1?'YES':'NO',itemType:type,problemScore,domain:dom,domainFull:DOMAIN_NAME[dom]});
    });
    const total=domScores.E+domScores.S+domScores.A;
    const cls={ E:this._classify(domScores.E,gender,'E'), S:this._classify(domScores.S,gender,'S'), A:this._classify(domScores.A,gender,'A') };
    return { domScores, total, cls, itemLog, gender };
  },
  _classify(score, gender, domain) {
    const isFemale=gender==='Female';
    const TABLES={
      E: isFemale?[1,5,7,10]:[1,4,7,10],
      S: isFemale?[2,5,7,10]:[2,4,7,10],
      A: isFemale?[2,5,7,10]:[2,4,7,10],
    };
    const T=TABLES[domain]??TABLES.E;
    if(score<=T[0]) return {cat:'A',level:'Excellent'};
    if(score<=T[1]) return {cat:'B',level:'Good'};
    if(score<=T[2]) return {cat:'C',level:'Average'};
    if(score<=T[3]) return {cat:'D',level:'Unsatisfactory'};
    return {cat:'E',level:'Very Unsatisfactory'};
  },

  scoreNMAP(answers) {
    const dimScores = NMAP_DIMS.map(() => 0);
    answers.forEach((ans, k) => {
      if (ans !== null) dimScores[NMAP_QS[k].dim] += ans;
    });
    const stanineTable = [
      { maxPct: 10,  stanine: 1, label: 'Very Low',           cls: 'stn-below' },
      { maxPct: 20,  stanine: 2, label: 'Low',                cls: 'stn-below' },
      { maxPct: 35,  stanine: 3, label: 'Below Average',      cls: 'stn-below' },
      { maxPct: 45,  stanine: 4, label: 'Slightly Below Avg', cls: 'stn-avg'   },
      { maxPct: 55,  stanine: 5, label: 'Average',            cls: 'stn-avg'   },
      { maxPct: 65,  stanine: 6, label: 'Slightly Above Avg', cls: 'stn-above' },
      { maxPct: 80,  stanine: 7, label: 'Above Average',      cls: 'stn-above' },
      { maxPct: 90,  stanine: 8, label: 'High',               cls: 'stn-high'  },
      { maxPct: 100, stanine: 9, label: 'Very High',          cls: 'stn-vhigh' },
    ];
    const dims = NMAP_DIMS.map((d, i) => {
      const raw = dimScores[i];
      const pct = Math.round(raw / 14 * 100);
      const entry = stanineTable.find(r => pct <= r.maxPct) || stanineTable[8];
      return { ...d, raw, pct, stanine: entry.stanine, label: entry.label, cls: entry.cls };
    });
    const sorted = [...dims].sort((a, b) => b.stanine - a.stanine);
    return { dims, sorted, dimScores };
  },
};


export { ENGINE };
