// Shared, pure reporting rules. Missing measurements never become zero.
export type MetricKey='views'|'reach'|'likes'|'comments'|'saved'|'shares'|'replies'|'total_interactions';
export type Metrics=Partial<Record<MetricKey,number|null>>;
export type InsightMedia={id:string;accountId:string;username:string;providerId:string;product:string;caption:string;permalink:string|null;publishedAt:number;metrics:Metrics;measuredAt:number|null;metricStatus:string};
export type InsightAccount={id:string;username:string;state:string;expiresAt:number|null;hasInsightsScope:boolean;status:string;lastAttemptAt:number|null;lastSuccessAt:number|null;nextSyncAt:number;error:string|null;publicationErrors:number;delayed:number;leaseUntil:number|null};
export type AnalyticsReport={accounts:InsightAccount[];media:InsightMedia[];truncated:boolean;generatedAt:number;timezone:string;days:number;totalMedia:number};
export const metricKeys:MetricKey[]=['views','reach','likes','comments','saved','shares','replies','total_interactions'];
export function parseMetrics(body:any):Metrics {
 const result:Metrics={};
 for(const key of metricKeys){const item=Array.isArray(body?.data)?body.data.find((x:any)=>x.name===key):null;
  const value=item?.total_value?.value??item?.values?.[0]?.value;
  result[key]=typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
 }
 return result;
}
export function totalMetric(items:InsightMedia[],key:MetricKey):number|null {
 const values=items.map(x=>x.metrics[key]).filter((n):n is number=>typeof n==='number');
 return values.length?values.reduce((a,b)=>a+b,0):null;
}
export function median(values:number[]):number|null{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
// Comparing similarly aged media within the same profile and format avoids
// calling a large account or a months-old post viral just for its raw count.
export function ageBand(item:InsightMedia,now:number){const age=now-item.publishedAt;return age<86400000?'0–24h':age<604800000?'1–7d':'7d+';}
export function relativePerformance(item:InsightMedia,items:InsightMedia[],now:number):{ratio:number|null;sample:number;baseline:number|null}{
 const peers=items.filter(x=>x.id!==item.id&&x.accountId===item.accountId&&x.product===item.product&&ageBand(x,now)===ageBand(item,now)&&typeof x.metrics.views==='number');
 const baseline=median(peers.map(x=>x.metrics.views!));
 return {ratio:peers.length>=5&&baseline!==null&&baseline>0&&typeof item.metrics.views==='number'?item.metrics.views/baseline:null,sample:peers.length,baseline};
}
export function performanceIndex(items:InsightMedia[],now:number){
 const groups=new Map<string,InsightMedia[]>(),result=new Map<string,{ratio:number|null;sample:number;baseline:number|null}>();
 for(const item of items){const key=item.accountId+':'+item.product+':'+ageBand(item,now);const group=groups.get(key)??[];group.push(item);groups.set(key,group);}
 for(const group of groups.values()){
  const measured=group.filter(m=>typeof m.metrics.views==='number').sort((a,b)=>a.metrics.views!-b.metrics.views!);
  const positions=new Map(measured.map((m,i)=>[m.id,i]));
  for(const item of group){const index=positions.get(item.id),sample=measured.length-(index===undefined?0:1),middle=Math.floor(sample/2);
   const value=(position:number)=>measured[position+(index!==undefined&&position>=index?1:0)]?.metrics.views??0;
   const baseline=sample?(sample%2?value(middle):(value(middle-1)+value(middle))/2):null;
   result.set(item.id,{sample,baseline,ratio:sample>=5&&baseline!==null&&baseline>0&&typeof item.metrics.views==='number'?item.metrics.views/baseline:null});
  }
 }
 return result;
}
export function accountAlerts(a:InsightAccount,now:number){
 const alerts:{kind:'danger'|'warning'|'info';text:string;action?:'authorize'}[]=[];
 if(a.state!=='connected'||a.expiresAt!==null&&a.expiresAt<=now)alerts.push({kind:'danger',text:'Conexão vencida ou desconectada',action:'authorize'});
 else if(a.expiresAt!==null&&a.expiresAt-now<7*86400000)alerts.push({kind:'warning',text:'Autorização vence em menos de 7 dias',action:'authorize'});
 if(a.status==='permission_required'||!a.hasInsightsScope)alerts.push({kind:'warning',text:'Autorize a leitura de métricas',action:'authorize'});
 if(a.status==='authorization_required')alerts.push({kind:'danger',text:'A Meta recusou a autorização da conta',action:'authorize'});
 if(a.status==='temporary')alerts.push({kind:'warning',text:'Coleta temporariamente indisponível; haverá nova tentativa'});
 if(a.status==='error')alerts.push({kind:'warning',text:'A Meta não confirmou a coleta. Confira o acesso ao aplicativo'});
 if(a.status==='partial')alerts.push({kind:'info',text:'Algumas métricas não foram disponibilizadas pela Meta'});
 if(a.publicationErrors)alerts.push({kind:'danger',text:`${a.publicationErrors} envio(s) com falha ou confirmação pendente`});
 if(a.delayed)alerts.push({kind:'warning',text:`${a.delayed} publicação(ões) atrasada(s)`});
 if(a.lastSuccessAt&&now-a.lastSuccessAt>86400000)alerts.push({kind:'warning',text:'Métricas sem atualização há mais de 24 horas'});
 return alerts;
}
export type Pattern={label:string;sample:number;medianRatio:number;kind:string};
export function discoverPatterns(items:InsightMedia[],timezone:string,now:number):Pattern[]{
 const groups=new Map<string,{label:string;kind:string;values:number[]}>();
 const comparisons=performanceIndex(items,now);
 for(const item of items){const p=comparisons.get(item.id)!;if(p.ratio===null)continue;
  const hour=Number(new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,hour:'numeric',hourCycle:'h23'}).format(item.publishedAt));
  const weekday=new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,weekday:'long'}).format(item.publishedAt);
  const time=hour<6?'00h–05h':hour<12?'06h–11h':hour<18?'12h–17h':'18h–23h';
  const tags=[...new Set((item.caption.toLowerCase().match(/#[\p{L}\p{N}_]+/gu)??[]).slice(0,10))];
  for(const [kind,label] of [['Horário',time],['Dia da semana',weekday],['Legenda',item.caption.length<=80?'Até 80 caracteres':item.caption.length<=220?'81–220 caracteres':'Mais de 220 caracteres'],...tags.map(t=>['Hashtag',t])]){
   const key=kind+':'+label,g=groups.get(key)??{label,kind,values:[]};g.values.push(p.ratio);groups.set(key,g);
  }
 }
 return [...groups.values()].filter(g=>g.values.length>=3).map(g=>({label:g.label,kind:g.kind,sample:g.values.length,medianRatio:median(g.values)!})).filter(g=>g.medianRatio>=1.2).sort((a,b)=>b.medianRatio-a.medianRatio).slice(0,6);
}
