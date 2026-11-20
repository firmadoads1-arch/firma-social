export type ReelSchedule={rotation?:string;mode:'interval'|'cycle'|'times';minutes:number;times:string[];days:number[];from:string;until:string;startsAt:number;order:'sequence'|'shuffle';folder:string;caption:string};
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
export function reelSlots(c:ReelSchedule,count:number,timezone:string,after:number,limit=8){
 const step=c.mode==='cycle'?c.minutes/Math.max(1,count):c.minutes;
 const out:number[]=[];if(!count||step<1)return out;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 // Bounded scan of UTC minutes naturally skips nonexistent local times.
 const start=Math.ceil(Math.max(after,c.startsAt)/60000)*60000;
 for(let t=start;t<start+35*86400000&&out.length<limit;t+=60000){
  const parts=Object.fromEntries(fmt.formatToParts(t).map(p=>[p.type,p.value]));const m=Number(parts.hour)*60+Number(parts.minute);
  if(!c.days.includes(weekdays.indexOf(parts.weekday)))continue;
  const a=minute(c.from),b=minute(c.until);if(a<=b?m<a||m>b:m<a&&m>b)continue;
  if(c.mode==='times'){if(!c.times.includes(parts.hour+':'+parts.minute))continue;}
  else {const elapsed=(t-Math.ceil(c.startsAt/60000)*60000)/60000;const n=Math.round(elapsed/step);if(n<0||elapsed!==Math.ceil(n*step))continue;}
  out.push(t);
 }
 return out;
}
export function reelIndex(index:number,count:number,order:string,seed:string){
 if(order!=='shuffle')return index%count;
 const cycle=Math.floor(index/count),items=Array.from({length:count},(_,i)=>i);let s=2166136261;
 for(const ch of seed+':'+cycle)s=Math.imul(s^ch.charCodeAt(0),16777619)>>>0;
 for(let i=count-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[items[i],items[j]]=[items[j],items[i]];}
 return items[index%count];
}
