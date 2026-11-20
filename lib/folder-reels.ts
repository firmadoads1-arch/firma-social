import {reelContentInput,reelCaptions} from './reel-content';
import {usableCover} from './editor-defaults';
import {updateRule} from './rule-update';
import {z} from 'zod';
import {database,first,list,run,runtime,config} from './server';
import {AppError,id} from './security';
import {schedulerEnabled} from './scheduler';
import {requireItems} from './group-scope';
import {prepareOptions,accountRows,assetRows} from './editing';
import {validatePublishing} from './domain';
import {reelSlots,reelIndex,type ReelSchedule} from './reel-schedule';
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),folder:z.string().min(1).max(60),accountIds:z.array(z.string().uuid()).min(1).max(100),mode:z.enum(['interval','cycle','times']),minutes:z.number().int().min(1).max(43200),times:z.array(clock).max(48),days:z.array(z.number().int().min(0).max(6)).min(1),from:clock,until:clock,startsAt:z.number().int().positive(),order:z.enum(['sequence','shuffle']),caption:z.string().max(2200),approved:z.literal(true)});
export async function folderReelAction(action:string,data:any,owner:string,group:string|null){
 if(['rule.save','rule.update'].includes(action)&&data.mode!=='folder_reel')return null;
 if(action==='rule.save'||action==='rule.update'){
  const v=schema.parse({...data,mode:data.scheduleMode});const editing=action==='rule.update',prior=await first('SELECT * FROM rules WHERE id=? AND owner=?',v.id,owner);if(editing){if(!prior||prior.mode!=='folder_reel')throw new AppError('Rotina não encontrada.',404);await requireItems(owner,group,'rules',[v.id]);}else if(prior){if(prior.mode!=='folder_reel')throw new AppError('Identificador em uso.',409);return {ok:true,id:v.id};}
  const previous=prior?JSON.parse(prior.time):null,content=reelContentInput.parse({...previous,...data});
  if(!schedulerEnabled(owner,runtime()))throw new AppError('Ative a fila automática antes de criar a rotina.',409);
  if(v.startsAt<Date.now()+60000)throw new AppError('Escolha um início pelo menos um minuto à frente.');
  if(v.mode==='times'&&!v.times.length)throw new AppError('Informe pelo menos um horário.');
  await requireItems(owner,group,'accounts',v.accountIds);
  const accts=await accountRows(owner);if(v.accountIds.some(a=>!accts.some(x=>x.id===a&&x.platform==='instagram'&&x.state==='connected')))throw new AppError('Selecione apenas perfis Instagram conectados.');
  const media=await folderMedia(owner,editing?prior.group_id:group,v.folder);if(!media.length||media.length>100)throw new AppError('Escolha uma pasta com 1 a 100 vídeos MP4/MOV.');
  const c:ReelSchedule={...v,...content,rotation:editing?(previous.folder===v.folder&&previous.order===v.order?previous.rotation:id()):undefined};const ws=await first('SELECT timezone FROM workspaces WHERE owner=?',owner);
  if(content.coverMode==='custom'){const cover=await first('SELECT id,mime,size,group_id FROM media WHERE owner=? AND id=?',owner,content.coverId!);const scope=editing?prior.group_id:group;if(!cover||!usableCover(cover)||cover.group_id&&cover.group_id!==scope&&previous?.coverId!==cover.id)throw new AppError('Selecione uma capa JPG de até 8 MB da área da rotina ou da área Geral.');}
  if(Object.keys(content.videoCaptions).some(mid=>!media.some(m=>m.id===mid)))throw new AppError('Uma das legendas não pertence aos vídeos desta pasta. Atualize a seleção.');
  if(content.captionMode==='unique')try{c.videoCaptions=reelCaptions(media,content.captionGenerator,content.videoCaptions);}catch(e:any){throw new AppError(e.message??'Revise as legendas dos vídeos.');}
  const mediaReferences=[...media.map(m=>m.id),...(content.coverMode==='custom'?[content.coverId!]:[])];
  if(!reelSlots(c,media.length,ws.timezone,v.startsAt,1).length)throw new AppError('Nenhum horário válido nos próximos 35 dias. Aumente o período do ciclo ou ajuste os horários.');
  if(v.mode==='cycle'&&v.minutes<media.length)throw new AppError('O ciclo exige pelo menos um minuto por vídeo.');
  const issues=validatePublishing({accountIds:v.accountIds,mediaIds:[media[0].id],platforms:['instagram'],format:'video',caption:v.caption,captions:{},scheduledAt:v.startsAt,options:{locationMode:'none'}} as any,[media[0]],accts,Date.now());if(issues.length)throw new AppError(issues.join(' '));
  if(!await config(owner,'instagram'))throw new AppError('Configure o aplicativo Instagram.');
  if(editing)await updateRule(prior,data.expected,{name:v.name,time:JSON.stringify(c),weekdays:JSON.stringify(v.days),account_ids:JSON.stringify([...new Set(v.accountIds)]),media_ids:JSON.stringify(mediaReferences),caption:v.caption,starts_on:String(v.startsAt)});
  else await run("INSERT INTO rules(id,owner,name,time,weekdays,account_ids,media_ids,caption,active,created_at,group_id,mode,starts_on,approved_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,'folder_reel',?,?)",v.id,owner,v.name,JSON.stringify(c),JSON.stringify(v.days),JSON.stringify([...new Set(v.accountIds)]),JSON.stringify(mediaReferences),v.caption,Date.now(),group,String(v.startsAt),Date.now());
  await generateFolderReels(owner,v.id);return {ok:true,id:v.id};
 }
 if(!['rule.toggle','rule.delete'].includes(action))return null;
 const rid=z.string().uuid().parse(data.id),r=await first('SELECT * FROM rules WHERE id=? AND owner=?',rid,owner);if(r?.mode!=='folder_reel')return null;await requireItems(owner,group,'rules',[rid]);
 if(action==='rule.toggle'){
  const active=z.boolean().parse(data.active);if(active&&!schedulerEnabled(owner,runtime()))throw new AppError('Ative a fila automática.',409);
  await run('UPDATE rules SET active=? WHERE id=? AND owner=?',active?1:0,rid,owner);if(active)await generateFolderReels(owner,rid);return {ok:true};
 }
 await database().batch([database().prepare("UPDATE deliveries SET status='cancelled',updated_at=? WHERE owner=? AND status='pending' AND post_id IN(SELECT id FROM posts WHERE owner=? AND json_extract(options,'$.folderReelRule')=?)").bind(Date.now(),owner,owner,rid),database().prepare("UPDATE posts SET status='cancelled',updated_at=? WHERE owner=? AND status='scheduled' AND json_extract(options,'$.folderReelRule')=?").bind(Date.now(),owner,rid),database().prepare('DELETE FROM rules WHERE id=? AND owner=?').bind(rid,owner)]);return {ok:true};
}
async function folderMedia(owner:string,group:string|null,folder:string){return list("SELECT * FROM media WHERE owner=? AND group_id IS ? AND folder=? AND mime IN ('video/mp4','video/quicktime') ORDER BY created_at,id",owner,group,folder);}
export async function generateFolderReels(owner:string,ruleId?:string){
 if(!schedulerEnabled(owner,runtime()))return;
 const ws=await first('SELECT timezone FROM workspaces WHERE owner=?',owner);if(!ws)return;
 const rules=await list("SELECT * FROM rules WHERE owner=? AND mode='folder_reel' AND active=1 AND approved_at IS NOT NULL"+(ruleId?' AND id=?':''),owner,...(ruleId?[ruleId]:[]));
 for(const r of rules){
  // Keep a single occurrence in flight. Unknown outcomes block only that profile.
  if(await first("SELECT id FROM posts WHERE owner=? AND json_extract(options,'$.folderReelRule')=? AND status IN ('scheduled','publishing') LIMIT 1",owner,r.id))continue;
  const c=JSON.parse(r.time) as ReelSchedule,media=await folderMedia(owner,r.group_id,c.folder);if(!media.length||media.length>100)continue;
  const parsed=reelContentInput.safeParse(c);if(!parsed.success)continue;const content=parsed.data;
  const assets=await assetRows(owner);if(content.coverMode==='custom'&&!assets.some(m=>m.id===content.coverId&&usableCover(m)))continue;
  let captions:Record<string,string>={};try{if(content.captionMode==='unique')captions=reelCaptions(media,content.captionGenerator,content.videoCaptions);}catch{continue;}
  const history=await first("SELECT count(*) n,MAX(scheduled_at) last FROM posts WHERE owner=? AND status<>'cancelled' AND json_extract(options,'$.folderReelRule')=? AND COALESCE(json_extract(options,'$.folderReelRotation'),'legacy')=?",owner,r.id,c.rotation??'legacy');
  const at=reelSlots(c,media.length,ws.timezone,Math.max(Date.now()+60000,(history?.last??0)+60000),1)[0];if(!at)continue;
  const accts=await accountRows(owner),selected=accts.filter(a=>a.platform==='instagram'&&a.state==='connected'&&JSON.parse(r.account_ids).includes(a.id));if(!selected.length)continue;
  const m=media[reelIndex(history?.n??0,media.length,c.order,r.id)],caption=content.captionMode==='unique'?captions[m.id]:c.caption,now=Date.now(),pid=id();
  const mediaReferences=[...media.map(m=>m.id),...(content.coverMode==='custom'?[content.coverId!]:[])];
  const p={accountIds:selected.map(a=>a.id),mediaIds:[m.id],platforms:['instagram'],format:'video',caption,captions:{},scheduledAt:at,options:{locationMode:'none',coverMode:content.coverMode,instagramCoverMediaId:content.coverMode==='custom'?content.coverId:null,folderReelRule:r.id,folderReelRotation:c.rotation??'legacy'}} as any;
  if(validatePublishing(p,[m],accts,now).length)continue;prepareOptions(p,accts,assets);
  const key=r.id+':reel:'+at;
  const statements=[database().prepare(`INSERT INTO posts(id,owner,title,caption,captions,platforms,account_ids,media_ids,format,status,scheduled_at,options,version,created_at,updated_at,group_id,recurrence_key) SELECT ?,?,?,?,'{}','["instagram"]',?,?,'video','scheduled',?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM rules WHERE id=? AND owner=? AND active=1 AND approved_at=?) ON CONFLICT(owner,recurrence_key) DO NOTHING`).bind(pid,owner,r.name,caption,JSON.stringify(p.accountIds),JSON.stringify(p.mediaIds),at,JSON.stringify(p.options),now,now,r.group_id,key,r.id,owner,r.approved_at)];
  for(const a of selected)statements.push(database().prepare("INSERT INTO deliveries(id,post_id,owner,account_id,platform,status,context,attempts,next_run,created_at,updated_at) SELECT ?,?,?,?,'instagram','pending','{}',0,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND owner=?)").bind(id(),pid,owner,a.id,at,now,now,pid,owner));
  await database().batch(statements);await run('UPDATE rules SET media_ids=? WHERE id=? AND owner=? AND approved_at=?',JSON.stringify(mediaReferences),r.id,owner,r.approved_at);
 }
}
export const folderReelReady=(d:string,p:string)=>`EXISTS(SELECT 1 FROM rules fr WHERE fr.id=json_extract(${p}.options,'$.folderReelRule') AND fr.owner=${p}.owner AND fr.mode='folder_reel' AND fr.active=1 AND fr.approved_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deliveries old JOIN posts op ON op.id=old.post_id AND op.owner=old.owner WHERE old.owner=${d}.owner AND old.account_id=${d}.account_id AND old.status='uncertain' AND json_extract(op.options,'$.folderReelRule')=fr.id AND op.scheduled_at<${p}.scheduled_at))`;

// Read-only wakeup for existing routines left without an occurrence. GET must
// not create posts; only the verified POST prepares the next approved item.
export async function folderReelPlanning(owner:string){
 if(!schedulerEnabled(owner,runtime()))return 0;
 const result=await first(`SELECT count(*) n FROM rules r WHERE r.owner=? AND r.mode='folder_reel' AND r.active=1 AND r.approved_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM posts p WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id AND p.status IN ('scheduled','publishing'))
 AND EXISTS(SELECT 1 FROM media m WHERE m.owner=r.owner AND m.group_id IS r.group_id AND m.folder=json_extract(r.time,'$.folder') AND m.mime IN ('video/mp4','video/quicktime'))
 AND EXISTS(SELECT 1 FROM accounts a WHERE a.owner=r.owner AND a.platform='instagram' AND a.state='connected' AND a.id IN(SELECT value FROM json_each(r.account_ids)))`,owner);
 return result?.n??0;
}
export async function folderReelStatus(owner:string){return list(`SELECT r.id,r.name,r.active,json_extract(r.time,'$.folder') folder,
 (SELECT count(*) FROM posts p WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id) occurrences,
 (SELECT count(*) FROM posts p WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id AND p.status='published') publishedOccurrences,
 (SELECT min(p.scheduled_at) FROM posts p WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id AND p.status IN ('scheduled','publishing')) nextScheduledAt,
 (SELECT count(*) FROM deliveries d JOIN posts p ON p.owner=d.owner AND p.id=d.post_id WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id AND d.status='uncertain') uncertainDeliveries,
 (SELECT count(*) FROM deliveries d JOIN posts p ON p.owner=d.owner AND p.id=d.post_id WHERE p.owner=r.owner AND json_extract(p.options,'$.folderReelRule')=r.id AND d.status IN ('pending','processing','working')) openDeliveries
 FROM rules r WHERE r.owner=? AND r.mode='folder_reel'`,owner);}
