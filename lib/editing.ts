import {z} from 'zod';
import {first,list,run,database,bucket,runtime,config} from './server';
import {AppError,id,seal} from './security';
import {api} from './providers';
import {accountCover,defaultLocation,usableCover,saoPauloPage} from './editor-defaults';
import {groupScope,requireItems} from './group-scope';
import {postInput,validatePublishing} from './domain';
import {schedulerEnabled} from './scheduler';
import {SHARED_REEL_INTERVAL_MS,SHARED_REEL_TOOL,sharedReelFolder,sharedReelOutputId} from './prisma/shared-reel';
const uid=z.string().uuid();
export const assetRows=(owner:string)=>list('SELECT id,name,group_id AS groupId,mime,size,width,height,duration,public_url AS publicUrl,created_at AS createdAt FROM media WHERE owner=?',owner);
export const accountRows=(owner:string)=>list("SELECT a.id,a.group_id AS groupId,a.cover_media_id AS coverMediaId,a.username,a.platform,a.state,EXISTS(SELECT 1 FROM geo_grants g WHERE g.id=a.id AND g.owner=a.owner) AS nativeLocation FROM accounts a WHERE a.owner=?",owner);
export function prepareOptions(p:any,accounts:any[],assets:any[],old?:any){
 const o=p.options,prior=old?JSON.parse(old.options):null;
 if(!old&&!o.locationMode){o.location=defaultLocation;const native=p.format!=='story'&&p.platforms.length===1&&p.platforms[0]==='instagram'&&p.accountIds.length>0&&p.accountIds.every((k:string)=>accounts.some(a=>a.id===k&&a.nativeLocation));o.locationMode=p.format==='story'?'none':native?'native':'caption';if(native)o.placeId=saoPauloPage;}
 if(o.locationMode==='sticker'&&(p.format!=='story'||p.platforms.some((n:string)=>n!=='instagram')))throw new AppError('O adesivo de localização é exclusivo de Stories do Instagram.');
 if(o.locationMode==='native'&&(p.format==='story'||p.platforms.length!==1||p.platforms[0]!=='instagram'||!o.placeId||!p.accountIds.length||p.accountIds.some((k:string)=>!accounts.find(a=>a.id===k&&a.nativeLocation))))throw new AppError('A marcação nativa requer uma Página vinculada a cada perfil do Instagram e o ID do local. Para Stories, use o adesivo no aplicativo.');
 const mode=o.coverMode??(o.instagramCoverMediaId?'custom':old&&!prior?.coverMode?'frame':'account');
 if(p.format!=='video'||!p.platforms.includes('instagram')){delete o.instagramAccountCovers;return;}
 o.coverMode=mode;delete o.instagramAccountCovers;
 if(mode==='custom')return;
 o.instagramCoverMediaId=null;if(mode==='frame')return;
 const map:Record<string,string>={};
 for(const a of accounts.filter(a=>a.platform==='instagram'&&p.accountIds.includes(a.id))){const fixed=prior?.coverMode==='account'&&prior.instagramAccountCovers?.[a.id];const cover=fixed?assets.find(x=>x.id===fixed&&usableCover(x)):accountCover(a,assets);if(cover)map[a.id]=cover.id;}
 o.instagramAccountCovers=map;
}
const idsList=z.array(uid).min(1).max(30000).refine(v=>new Set(v).size===v.length,'Arquivos repetidos.');
export async function editingAction(action:string,d:any,owner:string,group:string|null){
 if(action==='group.create'){const name=z.string().trim().min(1).max(60).parse(d.name);const g=id();const r=await run('INSERT OR IGNORE INTO workspace_groups (id,owner,name,name_key,created_at) VALUES (?,?,?,?,?)',g,owner,name,name.normalize('NFKC').toLocaleLowerCase('pt-BR'),Date.now());if(!r.meta.changes)throw new AppError('Já existe um grupo com esse nome.',409);return {id:g};}
 if(action==='group.assign'){const v=z.object({ids:z.array(uid).min(1).max(500),groupId:uid.nullable()}).parse(d);await groupScope(owner,v.groupId);await requireItems(owner,group,'accounts',v.ids);
  const accounts=await accountRows(owner),assets=await assetRows(owner),wanted=new Set(v.ids),found=accounts.filter(a=>wanted.has(a.id));if(found.length!==wanted.size)throw new AppError('Perfil indisponível.',404);
  const moves=found.map(a=>({id:a.id,cover:(a.groupId??null)!==v.groupId?(accountCover(a,assets)?.id??null):(a.coverMediaId??null)}));
  const result=await run("UPDATE accounts SET group_id=?,cover_media_id=(SELECT j.value->>'$.cover' FROM json_each(?) j WHERE j.value->>'$.id'=accounts.id) WHERE owner=? AND id IN (SELECT value FROM json_each(?))",v.groupId,JSON.stringify(moves),owner,JSON.stringify(v.ids));return {moved:result.meta.changes};}
 if(action==='account.preferences'){const v=z.object({id:uid,groupId:uid.nullable(),coverMediaId:uid.nullable()}).parse(d);await groupScope(owner,v.groupId);await requireItems(owner,group,'accounts',[v.id]);const previous=await first('SELECT group_id,cover_media_id FROM accounts WHERE id=? AND owner=?',v.id,owner);if(v.coverMediaId){const m=await first('SELECT mime,size,group_id FROM media WHERE id=? AND owner=?',v.coverMediaId,owner);if(!m||!usableCover(m)||(m.group_id&&m.group_id!==v.groupId&&previous?.cover_media_id!==v.coverMediaId))throw new AppError('Selecione um JPG de até 8 MB do grupo de destino ou da área Geral.');}const r=await run('UPDATE accounts SET group_id=?,cover_media_id=? WHERE id=? AND owner=?',v.groupId,v.coverMediaId,v.id,owner);if(!r.meta.changes)throw new AppError('Perfil indisponível.',404);return {ok:true};}
 if(action==='account.geo'){const v=z.object({id:uid,token:z.string().trim().min(15).max(4096)}).parse(d);const a=await first("SELECT username FROM accounts WHERE id=? AND owner=? AND platform='instagram' AND state='connected'",v.id,owner);if(!a)throw new AppError('Perfil indisponível.',404);const me=await api('https://graph.facebook.com/v26.0/me?fields=id,instagram_business_account{id,username}',{headers:{Authorization:'Bearer '+v.token}});const ig=me.instagram_business_account;if(!ig||!/^\d+$/.test(String(ig.id))||String(ig.username).toLowerCase()!==a.username.replace(/^@/,'').toLowerCase())throw new AppError('A Página não está vinculada a esse perfil do Instagram.');await run('INSERT INTO geo_grants (id,owner,encrypted) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted WHERE geo_grants.owner=excluded.owner',v.id,owner,await seal({access_token:v.token,instagramId:String(ig.id)},runtime().TOKEN_ENCRYPTION_KEY));return {ok:true};}
 if(action==='media.move'||action==='media.remove'||action==='media.delete'){
  const ids=idsList.parse(action==='media.delete'?[d.id]:d.ids);await requireItems(owner,group,'media',ids);const sel=JSON.stringify(ids);
  if(action==='media.move'){const folder=z.string().trim().min(1).max(60).parse(d.folder);const dest=d.destination===undefined?undefined:await groupScope(owner,d.destination);
   const result=await run('UPDATE media SET folder=?'+(dest!==undefined?',group_id=?':'')+' WHERE owner=? AND id IN (SELECT value FROM json_each(?))',folder,...(dest!==undefined?[dest]:[]),owner,sel);return {moved:result.meta.changes};}
  const assets=await assetRows(owner),accts=await accountRows(owner);const automatic=accts.flatMap(a=>{const m=accountCover(a,assets);return m?[m.id]:[];});
  const rows=await list(`DELETE FROM media WHERE owner=? AND id IN (SELECT value FROM json_each(?))
    AND id NOT IN (SELECT value FROM json_each(?))
    AND NOT EXISTS (SELECT 1 FROM prisma_templates t WHERE t.owner=media.owner AND t.avatar_key=media.storage_key)
    AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.owner=media.owner AND a.cover_media_id=media.id)
    AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.owner=media.owner AND (EXISTS(SELECT 1 FROM json_each(p.media_ids) WHERE value=media.id) OR json_extract(p.options,'$.instagramCoverMediaId')=media.id OR EXISTS(SELECT 1 FROM json_each(p.options,'$.instagramAccountCovers') WHERE value=media.id)))
    AND NOT EXISTS (SELECT 1 FROM rules r,json_each(r.media_ids) j WHERE r.owner=media.owner AND j.value=media.id)
    RETURNING storage_key`,owner,sel,JSON.stringify(automatic));
  if(action==='media.delete'&&!rows.length)throw new AppError('Arquivo protegido por um conteúdo, rotina ou capa de perfil.');
  await run('DELETE FROM prisma_files WHERE owner=? AND NOT EXISTS(SELECT 1 FROM media m WHERE m.id=prisma_files.id AND m.owner=prisma_files.owner)',owner);
  for(let i=0;i<rows.length;i+=100)await bucket().delete(rows.slice(i,i+100).map(r=>r.storage_key));return {removed:rows.length,protected:ids.length-rows.length};
 }
 if(action==='post.batch'||action==='post.sharedReelBatch'||action==='post.prepareSharedReelBatch'){
  const shared=action!=='post.batch'?z.object({
   requestId:uid,accountIds:z.array(uid).min(2).max(100).refine(ids=>new Set(ids).size===ids.length,'Perfis repetidos.'),
   title:z.string().trim().min(1).max(100).refine(title=>!/[\/\\]/.test(title)&&![...title].some(c=>c.charCodeAt(0)<32),'Use um título sem barras.'),
   mediaId:uid,coverId:uid,startsAt:z.number().int().positive(),caption:z.string().max(2200),approved:z.literal(true)
  }).parse(d):null;
  const v=shared?{requestId:shared.requestId,accountId:shared.accountIds[0],mediaIds:[shared.mediaId],startsAt:shared.startsAt,caption:shared.caption,location:'',locationMode:'none' as const,placeId:null}:z.object({requestId:uid,accountId:uid,mediaIds:z.array(uid).min(1).max(100).refine(a=>new Set(a).size===a.length),startsAt:z.number().int().positive(),caption:z.string().max(2200).default(''),approved:z.literal(true),location:z.string().trim().max(100).default(defaultLocation),locationMode:z.enum(['none','caption','native']).default('caption'),placeId:z.string().regex(/^\d{3,25}$/).nullable().optional()}).parse(d);
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([group,shared??v]))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const receipt=async()=>{const b=await first('SELECT fingerprint,count,starts_at FROM publish_batches WHERE id=? AND owner=?',v.requestId,owner);if(!b)return null;if(b.fingerprint!==fingerprint)throw new AppError('O lote já foi criado com outros dados.',409);return {id:v.requestId,count:b.count,startsAt:b.starts_at};};
  const previous=await receipt();if(previous)return previous;
  const accountIds=shared?.accountIds??[v.accountId];
  await Promise.all([requireItems(owner,group,'media',shared?[shared.mediaId,shared.coverId]:v.mediaIds),requireItems(owner,group,'accounts',accountIds)]);
  const [accounts,assets,provider]=await Promise.all([accountRows(owner),assetRows(owner),config(owner,'instagram')]);
  const selected=accountIds.map(aid=>accounts.find(x=>x.id===aid&&x.platform==='instagram'&&x.state==='connected'));
  if(selected.some(a=>!a)||!provider||!schedulerEnabled(owner,runtime()))throw new AppError('Conecte todos os perfis do Instagram e ative a fila antes de agendar.',409);
  const cover=shared?assets.find(m=>m.id===shared.coverId&&usableCover(m)):accountCover(selected[0],assets);
  if(!cover)throw new AppError(shared?'Selecione uma capa JPG de até 8 MB da biblioteca.':'Escolha uma capa padrão em Perfis ou adicione à biblioteca um JPG com o nome do @perfil.');
  const now=Date.now(),index=new Map(assets.map(m=>[m.id,m]));
  let startsAt=v.startsAt;
  let destinations=v.mediaIds.map(mid=>({a:selected[0],mid}));
  if(shared){
   const source=index.get(shared.mediaId);
   if(!source||!['video/mp4','video/quicktime'].includes(source.mime)||source.size>80*1024*1024||source.duration>180)throw new AppError('O Prisma aceita vídeo MP4 ou MOV de até 80 MB e 3 minutos.');
   const folder=sharedReelFolder(shared.title),projectName=shared.title+' · '+fingerprint.slice(0,16);
   if(action==='post.prepareSharedReelBatch'){
    await run('INSERT OR IGNORE INTO prisma_projects(id,owner,group_id,name,folder,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',v.requestId,owner,group,projectName,folder,now,now);
   }
   const project=await first('SELECT name,folder,group_id FROM prisma_projects WHERE id=? AND owner=?',v.requestId,owner);
   if(!project||project.group_id!==group||project.folder!==folder||project.name!==projectName)throw new AppError('Prepare o projeto Prisma deste lote antes de agendar.',409);
   if(action==='post.prepareSharedReelBatch')return {projectId:v.requestId};
   const exports=await list(`SELECT p.id,p.metadata FROM prisma_files p JOIN media m ON m.id=p.id AND m.owner=p.owner
     WHERE p.project_id=? AND p.owner=? AND p.tool=? AND p.kind='export' AND m.mime='video/mp4' AND m.folder=?`,v.requestId,owner,SHARED_REEL_TOOL,folder);
   const rendered=new Map(exports.map(row=>[row.id,JSON.parse(row.metadata)]));
   destinations=await Promise.all(selected.map(async a=>{
    const mid=await sharedReelOutputId(v.requestId,a.id),metadata=rendered.get(mid);
    if(!metadata||metadata.accountId!==a.id||metadata.sourceId!==source.id||metadata.outputId!==mid||mid===source.id)throw new AppError('Ainda falta uma versão do Prisma. Conclua as exportações antes de agendar.',409);
    return {a,mid};
   }));
   startsAt=Math.max(startsAt,Math.ceil((now+60000)/60000)*60000);
  }

  const entries=destinations.map(({a,mid},pos)=>{
   const m=index.get(mid);
   if(!m||!['video/mp4','video/quicktime'].includes(m.mime))throw new AppError('Cada item do lote deve ser um vídeo MP4 ou MOV.');
   const time=startsAt+(shared?SHARED_REEL_INTERVAL_MS:60000)*pos,title=shared?.title??(m.name.replace(/\.[^.]+$/,'').slice(0,100)||'Reel');
   const options=shared?{coverMode:'custom',instagramCoverMediaId:cover.id,locationMode:'none'}:{coverMode:'account',location:v.location||defaultLocation,locationMode:v.locationMode,placeId:v.placeId??(v.location===defaultLocation?saoPauloPage:null)};
   const p=postInput.parse({title,format:'video',platforms:['instagram'],accountIds:[a.id],mediaIds:[mid],caption:v.caption,status:'scheduled',scheduledAt:time,options});
   prepareOptions(p,[a],[cover]);
   const issues=validatePublishing(p,[m],[a],now);if(issues.length)throw new AppError(issues.join(' '));
   return {id:id(),did:id(),title,mid,time,pos,aid:a.id,groupId:group??a.groupId??null,options:shared?{...p.options,sharedReelBatch:true,prismaSharedReel:true}:p.options};
  });
  const q=database().prepare.bind(database()),json=JSON.stringify(entries);
  try{await database().batch([
   q('INSERT INTO publish_batches (id,owner,account_id,fingerprint,count,starts_at,created_at) VALUES (?,?,?,?,?,?,?)').bind(v.requestId,owner,v.accountId,fingerprint,entries.length,startsAt,now),
   q(`INSERT INTO posts (id,owner,group_id,batch_id,batch_position,title,caption,captions,platforms,account_ids,media_ids,format,status,scheduled_at,options,version,created_at,updated_at) SELECT j.value->>'$.id',?,j.value->>'$.groupId',?,j.value->>'$.pos',j.value->>'$.title',?,'{}','["instagram"]',json_array(j.value->>'$.aid'),json_array(j.value->>'$.mid'),'video','scheduled',j.value->>'$.time',j.value->'$.options',1,?,? FROM json_each(?) j`).bind(owner,v.requestId,v.caption,now,now,json),
   q(`INSERT INTO deliveries (id,post_id,owner,account_id,platform,status,context,attempts,next_run,created_at,updated_at) SELECT j.value->>'$.did',j.value->>'$.id',?,j.value->>'$.aid','instagram','pending','{}',0,j.value->>'$.time',?,? FROM json_each(?) j`).bind(owner,now,now,json)
  ]);}catch(e){const b=await receipt();if(b)return b;throw e;}return {id:v.requestId,count:entries.length,startsAt};
 }
 throw new AppError('Operação indisponível.');
}
