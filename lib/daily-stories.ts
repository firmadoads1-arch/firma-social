import {z} from 'zod';
import {database,first,list,run,runtime,config,event} from './server';
import {AppError,id} from './security';
import {localToEpoch,validatePublishing} from './domain';
import {schedulerEnabled} from './scheduler';
import {requireItems} from './group-scope';
import {assetRows,accountRows} from './editing';

export function localDay(now:number,timezone:string){return new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function followingDay(day:string){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
// Pending occurrences require their live approval. An uncertain earlier delivery
// blocks the same routine/profile; processing checkpoints can still reconcile.
export const recurringReady=(d:string,p:string)=>`(${p}.recurrence_key IS NULL OR ${d}.status='processing' OR EXISTS(SELECT 1 FROM rules rr WHERE rr.id=json_extract(${p}.options,'$.dailyStoryRule') AND rr.owner=${p}.owner AND rr.mode='daily_story' AND rr.active=1 AND rr.approved_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deliveries old JOIN posts op ON op.id=old.post_id AND op.owner=old.owner WHERE old.owner=${d}.owner AND old.account_id=${d}.account_id AND old.status='uncertain' AND op.recurrence_key IS NOT NULL AND json_extract(op.options,'$.dailyStoryRule')=rr.id AND op.scheduled_at<${p}.scheduled_at)))`;

const input=z.object({id:z.string().uuid().optional(),mode:z.literal('daily_story'),name:z.string().trim().min(1).max(80),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),accountIds:z.array(z.string().uuid()).min(1).max(100),mediaIds:z.array(z.string().uuid()).length(1),approved:z.literal(true)});
export async function dailyStoryAction(action:string,data:any,owner:string,group:string|null){
 if(action==='rule.save'){
  const v=input.parse(data);if(v.id){const prior=await first('SELECT owner,mode FROM rules WHERE id=?',v.id);if(prior){if(prior.owner!==owner||prior.mode!=='daily_story')throw new AppError('Rotina não encontrada.',404);return {ok:true,id:v.id};}}if(!schedulerEnabled(owner,runtime()))throw new AppError('Ative a fila automática antes de criar Stories diários.',409);
  const ws=await first('SELECT timezone FROM workspaces WHERE owner=?',owner);if(!ws)throw new AppError('Workspace não encontrado.');
  let firstTime:number;try{firstTime=localToEpoch(v.startsOn+'T'+v.time,ws.timezone);}catch{throw new AppError('Data ou horário inválido para este fuso.');}
  const now=Date.now();if(firstTime<now+60000)throw new AppError('Escolha o primeiro envio pelo menos um minuto à frente.');
  const aids=[...new Set(v.accountIds)];await requireItems(owner,group,'accounts',aids);await requireItems(owner,group,'media',v.mediaIds);
  const assets=await assetRows(owner),accounts=await accountRows(owner);const selected=assets.filter(m=>v.mediaIds.includes(m.id));
  const p={accountIds:aids,mediaIds:v.mediaIds,platforms:['instagram'],format:'story',caption:'',captions:{},scheduledAt:firstTime,options:{locationMode:'none'}} as any;
  const issues=validatePublishing(p,selected,accounts,now);if(issues.length)throw new AppError(issues.join(' '));
  if(selected.length!==1||!['image/jpeg','video/mp4','video/quicktime'].includes(selected[0].mime))throw new AppError('Escolha uma imagem JPEG ou um vídeo MP4/MOV para o Story.');
  if(aids.some(aid=>!accounts.some(a=>a.id===aid&&a.platform==='instagram'&&a.state==='connected')))throw new AppError('Selecione somente contas Instagram conectadas.');
  if(!await config(owner,'instagram'))throw new AppError('Configure o aplicativo Instagram.');
  const rid=v.id??id();await run("INSERT INTO rules(id,owner,name,time,weekdays,account_ids,media_ids,caption,active,created_at,group_id,mode,starts_on,approved_at) VALUES (?,?,?,?,?,?,?,'',1,?,?,'daily_story',?,?)",rid,owner,v.name,v.time,'[0,1,2,3,4,5,6]',JSON.stringify(aids),JSON.stringify(v.mediaIds),now,group,v.startsOn,now);
  // Only prepare approved schedules here. Creating a routine never sends media.
  await generateDailyStories(owner,rid);
  await event(owner,'Stories diários aprovados',v.name+' · todos os dias às '+v.time+' · '+aids.length+' perfil(is)');return {ok:true,id:rid};
 }
 const rid=z.string().uuid().parse(data.id),rule=await first('SELECT * FROM rules WHERE id=? AND owner=?',rid,owner);
 if(!rule||rule.mode!=='daily_story')return null;
 if(action==='rule.toggle'){
  const active=z.boolean().parse(data.active);if(active&&!schedulerEnabled(owner,runtime()))throw new AppError('Ative a fila automática antes de retomar a rotina.',409);
  await run('UPDATE rules SET active=?,approved_at=CASE WHEN ? THEN ? ELSE approved_at END WHERE id=? AND owner=?',active?1:0,active?1:0,Date.now(),rid,owner);
  if(active)await generateDailyStories(owner,rid);
  return {ok:true};
 }
 if(action==='rule.delete'){
  // Preserve history and in-flight checkpoints, stop only untouched future work.
  await database().batch([
   database().prepare('DELETE FROM rules WHERE id=? AND owner=?').bind(rid,owner),
   database().prepare("UPDATE deliveries SET status='cancelled',error='Rotina diária excluída.',updated_at=? WHERE owner=? AND status='pending' AND post_id IN (SELECT id FROM posts WHERE owner=? AND recurrence_key IS NOT NULL AND json_extract(options,'$.dailyStoryRule')=?)").bind(Date.now(),owner,owner,rid),
   database().prepare("UPDATE posts SET status='cancelled',updated_at=? WHERE owner=? AND status='scheduled' AND recurrence_key IS NOT NULL AND json_extract(options,'$.dailyStoryRule')=?").bind(Date.now(),owner,rid)
  ]);return {ok:true};
 }
 return null;
}

export async function generateDailyStories(owner:string,ruleId?:string,now=Date.now()){
 if(!schedulerEnabled(owner,runtime()))return 0;
 const ws=await first('SELECT timezone FROM workspaces WHERE owner=?',owner);if(!ws)return 0;
 const rules=await list("SELECT * FROM rules WHERE owner=? AND mode='daily_story' AND active=1 AND approved_at IS NOT NULL"+(ruleId?' AND id=?':''),owner,...(ruleId?[ruleId]:[]));let generated=0;
 const today=localDay(now,ws.timezone),tomorrow=followingDay(today);
 for(const r of rules){
  // Do not flood the queue with missed days after downtime or a pause.
  const expired=await list("SELECT id FROM posts WHERE owner=? AND recurrence_key IS NOT NULL AND json_extract(options,'$.dailyStoryRule')=? AND status IN ('scheduled','publishing') AND (json_extract(options,'$.dailyStoryDate')<? OR scheduled_at<?)",owner,r.id,today,r.approved_at);
  for(const p of expired)await database().batch([database().prepare("UPDATE deliveries SET status='cancelled',error='Ocorrência diária vencida; sem reposição automática.',updated_at=? WHERE owner=? AND post_id=? AND status='pending'").bind(now,owner,p.id),database().prepare("UPDATE posts SET status='cancelled',updated_at=? WHERE owner=? AND id=? AND status='scheduled'").bind(now,owner,p.id),database().prepare("UPDATE posts SET status=CASE WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.owner=posts.owner AND d.post_id=posts.id AND d.status IN ('published','inbox')) THEN 'partial' WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.owner=posts.owner AND d.post_id=posts.id AND d.status='uncertain') THEN 'uncertain' ELSE 'cancelled' END,updated_at=? WHERE owner=? AND id=? AND status='publishing' AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.owner=posts.owner AND d.post_id=posts.id AND d.status IN ('working','processing'))").bind(now,owner,p.id)]);
  const firstDate=r.starts_on>today?r.starts_on:today;
  const dates=firstDate>tomorrow?[firstDate]:[firstDate,...(firstDate===today?[tomorrow]:[])];
  const aids:string[]=JSON.parse(r.account_ids),mids:string[]=JSON.parse(r.media_ids);
  if(mids.length!==1||!aids.length)continue;
  const media=await first('SELECT id,mime FROM media WHERE owner=? AND id=?',owner,mids[0]);if(!media)continue;
  const accounts=await list("SELECT id FROM accounts WHERE owner=? AND platform='instagram' AND state='connected' AND id IN(SELECT value FROM json_each(?))",owner,JSON.stringify(aids));
  if(!accounts.length)continue;
  for(const day of dates){
   let at:number;try{at=localToEpoch(day+'T'+r.time,ws.timezone);}catch{continue;}
   if(at<r.approved_at+60000)continue;
   const pid=id(),key=r.id+':'+day;
   const guard="EXISTS(SELECT 1 FROM rules WHERE id=? AND owner=? AND active=1 AND mode='daily_story' AND approved_at=?)";
   const statements=[database().prepare(`INSERT INTO posts(id,owner,title,caption,captions,platforms,account_ids,media_ids,format,status,scheduled_at,options,version,created_at,updated_at,group_id,recurrence_key) SELECT ?,?,?,?,'{}','["instagram"]',?,?,'story','scheduled',?,?,1,?,?,?,? WHERE ${guard} ON CONFLICT(owner,recurrence_key) DO NOTHING`).bind(pid,owner,r.name,'',JSON.stringify(accounts.map(a=>a.id)),JSON.stringify(mids),at,JSON.stringify({locationMode:'none',dailyStoryRule:r.id,dailyStoryDate:day}),now,now,r.group_id??null,key,r.id,owner,r.approved_at)];
   for(const a of accounts)statements.push(database().prepare("INSERT INTO deliveries(id,post_id,owner,account_id,platform,status,context,attempts,next_run,created_at,updated_at) SELECT ?,?,?,?,'instagram','pending','{}',0,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND owner=?)").bind(id(),pid,owner,a.id,at,now,now,pid,owner));
   const results=await database().batch(statements);if(results[0].meta.changes)generated++;
  }
 }
 return generated;
}
