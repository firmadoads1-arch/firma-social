import {localToEpoch} from './domain';
import {groupScope,requireItems} from './group-scope';
import {z} from 'zod';
import {first,list,run,config,runtime} from './server';
import {AppError,id,unseal} from './security';
import {RemoteError,remoteError} from './provider-errors';
import {parseMetrics,type AnalyticsReport,type InsightAccount,type InsightMedia,type Metrics} from './analytics-model';

const HOUR=3600000,DAY=24*HOUR,RETENTION=90*DAY;
export const insightsScope='instagram_business_manage_insights';
const numericId=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const permittedLink=(value:unknown)=>{try{const u=new URL(String(value));return u.protocol==='https:'&&['www.instagram.com','instagram.com'].includes(u.hostname)&&!u.username&&!u.password?u.origin+u.pathname:null;}catch{return null;}};
function failure(error:unknown){
 if(error instanceof RemoteError){
  if(['190','102','invalid_token','access_token_expired','invalid_access_token'].includes(error.code))return 'authorization_required';
  if(error.failure==='permissions')return 'permission_required';
  if(error.retryable||error.failure==='temporary'||['4','17','32','613','80002'].includes(error.code))return 'temporary';
 }
 return 'error';
}
async function readGraph(version:string,path:string,params:Record<string,string>,token:string){
 // Neither paging.next URLs nor caller-controlled hosts can receive the token.
 const url=new URL(`https://graph.instagram.com/${/^v\d+\.\d+$/.test(version)?version:'v26.0'}/${path}`);
 for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
 let res:Response;try{res=await fetch(url.toString(),{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{throw new RemoteError('network_unknown',false,true,'temporary');}
 if(res.status>=300&&res.status<400){await res.body?.cancel();throw new RemoteError('unexpected_redirect');}
 const body:any=await res.json().catch(()=>null);
 if(!res.ok||body?.error)throw remoteError(res.status,body,true);
 if(!body||typeof body!=='object')throw new RemoteError('invalid_response');
 return body;
}
function cursor(body:any,previous:string|null){
 const value=body?.paging?.cursors?.after;
 if(!body?.paging?.next)return null;
 if(typeof value!=='string'||!value||value.length>2048||value===previous)throw new RemoteError('invalid_paging');
 return value;
}
async function recordMedia(owner:string,account:string,raw:any,story:boolean,now:number){
 const published=Date.parse(raw?.timestamp);
 if(!numericId(raw?.id)||!Number.isFinite(published)||published>now+300000||published<now-RETENTION)return;
 const product=story?'STORY':raw.media_product_type==='REELS'?'REELS':'FEED';
 await run(`INSERT INTO analytics_media (id,owner,account_id,provider_id,product,caption,permalink,published_at,discovered_at) VALUES (?,?,?,?,?,?,?,?,?)
 ON CONFLICT(owner,account_id,provider_id) DO UPDATE SET caption=excluded.caption,permalink=excluded.permalink,product=excluded.product,published_at=excluded.published_at`,
 id(),owner,account,raw.id,product,typeof raw.caption==='string'?raw.caption.slice(0,5000):'',permittedLink(raw.permalink),published,now);
}
export async function analyticsAccounts(owner:string,group:string|null=null):Promise<InsightAccount[]>{
  const rows=await list(`SELECT a.id,a.username,a.state,a.expires_at,a.scopes,s.status,s.last_attempt_at,s.last_success_at,s.next_sync_at,s.error,s.lease_until,
 EXISTS(SELECT 1 FROM analytics_media m WHERE m.owner=a.owner AND m.account_id=a.id AND m.measured_at IS NOT NULL) measuredInsights,
 (SELECT COUNT(*) FROM deliveries d WHERE d.owner=a.owner AND d.account_id=a.id AND d.status IN ('failed','uncertain')) publicationErrors,
 (SELECT COUNT(*) FROM deliveries d JOIN posts p ON p.id=d.post_id AND p.owner=d.owner WHERE d.owner=a.owner AND d.account_id=a.id AND d.status IN ('pending','processing','working') AND p.status IN ('scheduled','publishing') AND p.scheduled_at<?) delayed
 FROM accounts a LEFT JOIN analytics_sync s ON s.id=a.id AND s.owner=a.owner WHERE a.owner=? AND a.platform='instagram' AND (? IS NULL OR a.group_id=?) ORDER BY a.username`,Date.now()-75*60000,owner,group,group);
 return rows.map(a=>({id:a.id,username:a.username,state:a.state,expiresAt:a.expires_at,hasInsightsScope:!!a.measuredInsights||String(a.scopes).split(/[ ,]+/).includes(insightsScope),status:a.status??'waiting',lastAttemptAt:a.last_attempt_at,lastSuccessAt:a.last_success_at,nextSyncAt:a.next_sync_at??0,error:a.error,publicationErrors:a.publicationErrors,delayed:a.delayed,leaseUntil:a.lease_until}));
}
export async function analyticsStatus(owner:string,group:string|null=null){
 const accounts=await analyticsAccounts(owner,group),now=Date.now();
 const next=accounts.filter(a=>a.state==='connected').map(a=>Math.max(a.nextSyncAt,a.leaseUntil??0));
 return {accounts,work:{due:accounts.filter(a=>a.state==='connected'&&a.nextSyncAt<=now&&(!a.leaseUntil||a.leaseUntil<=now)).length,nextCheckAt:next.length?Math.min(...next):null},checkedAt:now};
}
export async function analyticsReport(owner:string,params:URLSearchParams):Promise<AnalyticsReport>{
 const group=await groupScope(owner,params.get('group'));const period=z.enum(['today','yesterday','7','30','90']).parse(params.get('days')??'30');const account=params.get('accountId');if(account){z.string().uuid().parse(account);await requireItems(owner,group,'accounts',[account]);}
 const now=Date.now(),ws=await first('SELECT timezone FROM workspaces WHERE owner=?',owner),timezone=ws?.timezone??'America/Sao_Paulo';const days=period==='today'||period==='yesterday'?1:Number(period);
 let since=now-days*DAY,until=now+1;if(period==='today'||period==='yesterday'){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const anchor=Date.parse(day+'T12:00:00Z');const start=period==='today'?anchor:anchor-DAY;const midnight=(d:number)=>{const date=new Date(d).toISOString().slice(0,10);for(let m=0;m<180;m++){try{return localToEpoch(date+'T'+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),timezone);}catch{}}throw new AppError('Data inválida neste fuso.');};since=midnight(start);until=midnight(start+DAY);}
 const args:any[]=[owner,since,until];let filter=' AND m.published_at<?';if(group){filter+=' AND a.group_id=?';args.push(group);}if(account){filter+=' AND m.account_id=?';args.push(account);}
 const [accounts,rows,count]=await Promise.all([
 analyticsAccounts(owner,group),
 list(`SELECT m.*,a.username FROM analytics_media m JOIN accounts a ON a.id=m.account_id AND a.owner=m.owner WHERE m.owner=? AND m.published_at>=?${filter} ORDER BY m.published_at DESC LIMIT 5001`,...args),
 first(`SELECT COUNT(*) n FROM analytics_media m JOIN accounts a ON a.id=m.account_id AND a.owner=m.owner WHERE m.owner=? AND m.published_at>=?${filter}`,...args)]);
 return {accounts,media:rows.slice(0,5000).map(r=>({id:r.id,accountId:r.account_id,username:r.username,providerId:r.provider_id,product:r.product,caption:r.caption,permalink:permittedLink(r.permalink),publishedAt:r.published_at,metrics:JSON.parse(r.metrics),measuredAt:r.measured_at,metricStatus:r.metric_status})),truncated:rows.length>5000,totalMedia:count?.n??0,generatedAt:now,timezone:ws?.timezone??'America/Sao_Paulo',days};
}

// A bounded, resumable read-only provider step. Writes only analytics tables.
// The per-account lease prevents overlap with the browser or another task.
export async function syncAnalytics(owner:string,requested?:string){
 if(requested)z.string().uuid().parse(requested);
 const now=Date.now();
 const a=requested?await first("SELECT * FROM accounts WHERE id=? AND owner=? AND platform='instagram'",requested,owner):await first(`SELECT a.* FROM accounts a LEFT JOIN analytics_sync s ON s.id=a.id AND s.owner=a.owner WHERE a.owner=? AND a.platform='instagram' AND a.state='connected' AND COALESCE(s.next_sync_at,0)<=? AND COALESCE(s.lease_until,0)<=? ORDER BY COALESCE(s.last_attempt_at,0),a.id LIMIT 1`,owner,now,now);
 if(!a){if(requested)throw new AppError('Conta não encontrada.',404);return {idle:true,checkedAt:now};}
 await run('INSERT OR IGNORE INTO analytics_sync (id,owner) VALUES (?,?)',a.id,owner);
 const lease=id();const acquired=await first('UPDATE analytics_sync SET lease=?,lease_until=?,last_attempt_at=? WHERE id=? AND owner=? AND next_sync_at<=? AND COALESCE(lease_until,0)<=? RETURNING *',lease,now+120000,now,a.id,owner,now,now);
 if(!acquired)return {accountId:a.id,skipped:true,checkedAt:now};
 let measured=0;
 const finish=async(status:string,more=false,error:string|null=null)=>{
  const at=Date.now(),delay=more?0:status==='temporary'?15*60000:['permission_required','authorization_required','error'].includes(status)?6*HOUR:HOUR;
  await run(`UPDATE analytics_sync SET status=?,last_attempt_at=?,last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,next_sync_at=?,lease=NULL,lease_until=NULL,error=? WHERE id=? AND owner=? AND lease=?`,status,at,!more&&['ok','partial'].includes(status)?1:0,at,at+delay,error,a.id,owner,lease);
  return {accountId:a.id,checkedAt:at,status,measured,more};
 };
 try{
  if(a.state!=='connected'||!a.tokens||a.expires_at&&a.expires_at<=now)return await finish('authorization_required');
  const cfg=await config(owner,'instagram');if(!cfg)return await finish('error');
  const tokens=await unseal<{access_token:string}>(a.tokens,runtime().TOKEN_ENCRYPTION_KEY);
  if(typeof tokens.access_token!=='string'||!tokens.access_token||!numericId(a.provider_id))return await finish('authorization_required');
  const get=(path:string,params:Record<string,string>)=>readGraph(cfg.graphVersion??'v26.0',path,params,tokens.access_token);
  const s={...acquired};
  if(!s.cycle_started_at||s.status!=='collecting'){
   s.cycle_started_at=now;s.feed_cursor=null;s.story_cursor=null;s.feed_done=0;s.story_done=0;s.partial=0;
   await run("UPDATE analytics_sync SET cycle_started_at=?,status='collecting',feed_cursor=NULL,story_cursor=NULL,feed_done=0,story_done=0,partial=0,error=NULL WHERE id=? AND owner=? AND lease=?",now,a.id,owner,lease);
  }
  // Always prioritize currently visible Stories; expired Stories cannot be
  // reconstructed later. Previously captured measurements stay in storage.
  for(const story of [true,false]){
   const done=story?'story_done':'feed_done',key=story?'story_cursor':'feed_cursor';if(s[done])continue;
   const params:Record<string,string>={fields:'id,caption,media_type,media_product_type,timestamp,permalink',limit:'25'};if(s[key])params.after=s[key];
   let body:any;
   try{body=await get(`${a.provider_id}/${story?'stories':'media'}`,params);}catch(e){if(story&&e instanceof RemoteError&&e.code==='100'&&e.failure!=='permissions'){s[done]=1;s.partial=1;await run('UPDATE analytics_sync SET story_done=1,partial=1 WHERE id=? AND owner=? AND lease=?',a.id,owner,lease);continue;}throw e;}
   if(!Array.isArray(body.data))throw new RemoteError('invalid_response');
   const ids=body.data.map((m:any)=>m.id).filter(numericId);
   const known=!story&&s.last_success_at&&ids.length?await first(`SELECT COUNT(*) n FROM analytics_media WHERE owner=? AND account_id=? AND provider_id IN (${ids.map(()=>'?').join(',')})`,owner,a.id,...ids):null;
   for(const item of body.data)await recordMedia(owner,a.id,item,story,now);
   let next=cursor(body,s[key]);
   if(!body.data.length||!story&&(known?.n===body.data.length||body.data.every((r:any)=>Date.parse(r.timestamp)<now-RETENTION)))next=null;
   s[key]=next;s[done]=next?0:1;
   await run(`UPDATE analytics_sync SET ${key}=?,${done}=? WHERE id=? AND owner=? AND lease=?`,next,s[done],a.id,owner,lease);
  }
  // Recently published content updates hourly; older content needs fewer
  // calls. The query remains resumable and never treats missing data as zero.
  const dueSQL="owner=? AND account_id=? AND published_at>=? AND (product!='STORY' OR published_at>?) AND COALESCE(attempted_at,0)<? AND (attempted_at IS NULL OR published_at>? OR (published_at>? AND attempted_at<?) OR (published_at>? AND attempted_at<?) OR attempted_at<?)";
  const dueArgs=[owner,a.id,now-RETENTION,now-DAY,s.cycle_started_at,now-2*DAY,now-7*DAY,now-6*HOUR,now-30*DAY,now-DAY,now-7*DAY];
  const pending=await list(`SELECT * FROM analytics_media WHERE ${dueSQL} ORDER BY CASE WHEN product='STORY' THEN 0 ELSE 1 END,COALESCE(attempted_at,0),published_at DESC LIMIT 8`,...dueArgs);
  let fatal:unknown=null;
  const measure=async(m:any)=>{
   let result:Metrics;
   try{
    const metrics=m.product==='STORY'?'views,reach,replies,shares,total_interactions':'views,reach,likes,comments,saved,shares,total_interactions';
    let body:any;
    try{body=await get(`${m.provider_id}/insights`,{metric:metrics});}catch(e){
     if(e instanceof RemoteError&&e.code==='100'&&e.failure!=='permissions')body=await get(`${m.provider_id}/insights`,{metric:'views,reach'});else throw e;
    }
    result=parseMetrics(body);
   }catch(e){
    const kind=failure(e);
    if(kind!=='error'){fatal=e;return;}
    s.partial=1;await run("UPDATE analytics_media SET attempted_at=?,metric_status='unavailable' WHERE id=? AND owner=?",Date.now(),m.id,owner);return;
   }
   const at=Date.now(),hasData=Object.values(result).some(v=>typeof v==='number'),status=result.views===null?'unavailable':'ok';
   if(status!=='ok')s.partial=1;
   if(hasData){
    await run('UPDATE analytics_media SET metrics=?,measured_at=?,attempted_at=?,metric_status=? WHERE id=? AND owner=?',JSON.stringify(result),at,at,status,m.id,owner);measured++;
   }else await run("UPDATE analytics_media SET attempted_at=?,metric_status='unavailable' WHERE id=? AND owner=?",at,m.id,owner);
  };
  // First metric establishes permission before fan-out. Max four simultaneous
  // provider reads, and stop the next wave on authorization or rate errors.
  if(pending.length)await measure(pending[0]);
  for(let i=1;i<pending.length&&!fatal;i+=4)await Promise.all(pending.slice(i,i+4).map(measure));
  if(fatal)throw fatal;
  await run('UPDATE analytics_sync SET partial=? WHERE id=? AND owner=? AND lease=?',s.partial,a.id,owner,lease);
  const remaining=await first(`SELECT COUNT(*) n FROM analytics_media WHERE ${dueSQL}`,...dueArgs);
  const more=!s.feed_done||!s.story_done||remaining.n>0;
  // Retain the 90-day reporting window, including saved, expired Stories.
  await run('DELETE FROM analytics_media WHERE owner=? AND published_at<?',owner,now-RETENTION);
  return await finish(more?'collecting':s.partial?'partial':'ok',more);
 }catch(error){return await finish(failure(error),false,failure(error));}
}
