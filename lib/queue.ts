import {coverForDelivery,publishCaption,defaultLocation} from './editor-defaults';
import {instagramMediaURL} from './media-delivery';
import {list,first,run,database,config,bucket,event,runtime,postRow} from './server';
import {api,accessToken,RemoteError,publicMedia,creatorInfo} from './providers';
import {AppError,id,seal,unseal} from './security';
import {localToEpoch,nextLocalDate} from './domain';
import {SHARED_REEL_INTERVAL_MS} from './prisma/shared-reel';
async function assertLease(d:any){
 if(!await first("SELECT id FROM deliveries WHERE id=? AND lease=? AND status='working' AND lease_until>?",d.id,d.lease,Date.now()))throw new RemoteError('lease_lost',true);
 if(!await first("SELECT id FROM accounts WHERE id=? AND owner=? AND state='connected'",d.account_id,d.owner))throw new AppError('A conta foi desconectada. O envio foi interrompido.');
}
async function saveContext(d:any,context:any,status='processing',remoteId:string|null=null){
 const result=await run("UPDATE deliveries SET context=?,status=?,remote_id=COALESCE(?,remote_id),error=NULL,next_run=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=? AND status='working' AND lease_until>?",await seal(context,runtime().TOKEN_ENCRYPTION_KEY),status,remoteId,Date.now()+60000,Date.now(),d.id,d.lease,Date.now());
 if(!result.meta.changes)throw new RemoteError('lease_lost',true);
}
async function checkpoint(d:any,context:any){
 const encrypted=await seal(context,runtime().TOKEN_ENCRYPTION_KEY);
 const result=await run("UPDATE deliveries SET context=? WHERE id=? AND lease=? AND status='working' AND lease_until>?",encrypted,d.id,d.lease,Date.now());
 if(!result.meta.changes)throw new RemoteError('lease_lost',true);
 if(d.platform==='instagram'&&d.deadline&&Date.now()>=d.deadline)return saveContext(d,context);
 return publishStep({...d,context:encrypted});
}
async function publishStep(d:any):Promise<void>{
 await assertLease(d);
 const row=await first('SELECT * FROM posts WHERE id=? AND owner=?',d.post_id,d.owner);if(!row||!['scheduled','publishing'].includes(row.status))throw new AppError('Agendamento não está ativo.');const p=postRow(row);if(p.options.instagramStoryLink||p.options.locationMode==='sticker')throw new AppError('Story com adesivo deve ser finalizado no Instagram. Nenhuma mídia foi enviada.');const a=await first('SELECT * FROM accounts WHERE id=? AND owner=?',d.account_id,d.owner);if(!a)throw new AppError('Conta não encontrada.');const c=await config(d.owner,d.platform);if(!c)throw new AppError('Integração não configurada.');let graphHost='https://graph.instagram.com',igId=a.provider_id;let token:string;if(d.platform==='instagram'&&p.options.locationMode==='native'){const grant=await first('SELECT encrypted FROM geo_grants WHERE owner=? AND id=?',d.owner,a.id);if(!grant)throw new AppError('Vincule novamente a Página para marcar a localização nativa.');const geo=await unseal<{access_token:string;instagramId:string}>(grant.encrypted,runtime().TOKEN_ENCRYPTION_KEY);graphHost='https://graph.facebook.com';igId=geo.instagramId;token=geo.access_token;}else token=await accessToken(a);const auth={Authorization:`Bearer ${token}`};
 const coverId=coverForDelivery(p.options,d.account_id);const all=await list('SELECT * FROM media WHERE owner=? AND id IN (SELECT value FROM json_each(?))',d.owner,JSON.stringify([...p.mediaIds,...(coverId?[coverId]:[])]));const media=p.mediaIds.map((mid:string)=>all.find(m=>m.id===mid));if(!media.length||media.some((m:any)=>!m))throw new AppError('Mídia não encontrada.');const caption=publishCaption(p.captions[d.platform as keyof typeof p.captions]??p.caption,p.options,p.format);
 const context=d.context&&d.context!=='{}'?await unseal<any>(d.context,runtime().TOKEN_ENCRYPTION_KEY):{};
 await run("UPDATE posts SET status='publishing',updated_at=? WHERE id=? AND owner=?",Date.now(),p.id,d.owner);
 if(d.platform==='instagram'){
  const base=`${graphHost}/${c.graphVersion??'v26.0'}`;const post=async(path:string,data:Record<string,string>)=>{await assertLease(d);return api(base+path,{method:'POST',headers:auth,body:new URLSearchParams(data)});};
  if(!context.container){
   let payload:Record<string,string>={caption};if(p.options.locationMode==='native'&&p.options.placeId&&p.format!=='story')payload.location_id=p.options.placeId;
   if(p.format==='carousel'){
    const children:string[]=context.children??[];
    if(children.length<media.length){const m=media[children.length];const video=m.mime.startsWith('video/');const child=await post(`/${igId}/media`,{[video?'video_url':'image_url']:await instagramMediaURL(m,d),...(video?{media_type:'VIDEO'}:{}),is_carousel_item:'true'});if(!child.id)throw new RemoteError('container_missing',true);return checkpoint(d,{...context,children:[...children,String(child.id)]});}
    if((context.readyChildren??0)<children.length){const child=children[context.readyChildren??0];const state=await api(`${base}/${child}?fields=status_code`,{headers:auth});if(['ERROR','EXPIRED'].includes(state.status_code))throw new AppError('O Instagram não conseguiu processar um item do carrossel.');if(state.status_code!=='FINISHED'){await saveContext(d,context);return;}return checkpoint(d,{...context,readyChildren:(context.readyChildren??0)+1});}
    payload={...payload,media_type:'CAROUSEL',children:children.join(',')};
   }
   else{const m=media[0];const video=m.mime.startsWith('video/');payload={...payload,[video?'video_url':'image_url']:await instagramMediaURL(m,d)};if(p.format==='story')payload.media_type='STORIES';else if(video){payload.media_type='REELS';payload.share_to_feed='true';if(coverId){const cover=all.find(m=>m.id===coverId);if(!cover||cover.mime!=='image/jpeg'||cover.size>8*1024*1024)throw new AppError('A capa do Reel está indisponível ou inválida.');payload.cover_url=await instagramMediaURL(cover,d);}}}
   const created=await post(`/${igId}/media`,payload);if(!created.id)throw new RemoteError('container_missing',true);return checkpoint(d,{...context,container:created.id});
  }
  const result=await api(`${base}/${context.container}?fields=status_code`,{headers:auth});
  if(result.status_code==='FINISHED'){if(d.deadline&&Date.now()>=d.deadline){await saveContext(d,context);return;}const published=await post(`/${igId}/media_publish`,{creation_id:context.container});if(!published.id)throw new RemoteError('publish_unknown',true);await saveContext(d,context,'published',String(published.id));return;}
  if(result.status_code==='PUBLISHED'){await saveContext(d,context,'published');return;}
  if(['ERROR','EXPIRED'].includes(result.status_code))throw new AppError('O Instagram não conseguiu processar a mídia.');
  if(d.attempts>12)throw new AppError('Processamento prolongado no Instagram. Confira a plataforma.');await saveContext(d,context);return;
 }
 if(d.platform==='youtube'){
  const m=media[0];if(context.videoId){const result=await api(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(context.videoId)}`,{headers:auth});const status=result.items?.[0]?.status;if(['failed','rejected','deleted'].includes(status?.uploadStatus))throw new AppError('O YouTube recusou o vídeo.');if(status?.uploadStatus==='processed'){await saveContext(d,context,'published',context.videoId);return;}if(d.attempts>24)throw new RemoteError('youtube_processing_timeout',true);await saveContext(d,context);return;}
  if(!context.uploadURL){await assertLease(d);const start=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(25000),headers:{...auth,'Content-Type':'application/json','X-Upload-Content-Type':m.mime,'X-Upload-Content-Length':String(m.size)},body:JSON.stringify({snippet:{title:p.title,description:caption,categoryId:'22'},status:{privacyStatus:p.options.youtubePrivacy??'private',selfDeclaredMadeForKids:!!p.options.madeForKids,containsSyntheticMedia:!!p.options.containsSyntheticMedia}})});if(!start.ok)throw new RemoteError('youtube_init_'+start.status,start.status>=500||start.status===408);const location=start.headers.get('location');if(!location)throw new RemoteError('upload_location_missing');const target=new URL(location);if(target.protocol!=='https:'||!target.hostname.endsWith('.googleapis.com'))throw new AppError('Destino de upload inesperado.');return checkpoint(d,{uploadURL:location});}
  const object=await bucket().get(m.storage_key);if(!object)throw new AppError('Arquivo não encontrado.');await assertLease(d);const uploaded=await api(context.uploadURL,{method:'PUT',headers:{'Content-Type':m.mime,'Content-Length':String(m.size)},body:object.body as any});if(!uploaded.id)throw new RemoteError('youtube_upload_unknown',true);return checkpoint(d,{videoId:uploaded.id});
 }
 if(!context.publishId){
  const url=publicMedia(media[0],c,'tiktok');const direct=p.options.tiktokMode==='direct';let path='inbox/video/init/';let payload:any={source_info:{source:'PULL_FROM_URL',video_url:url}};
  if(direct){if(!c.reviewed)throw new AppError('Publicação direta TikTok exige aplicativo revisado. Use a caixa de entrada.');if(!p.options.tiktokConsent)throw new AppError('Falta confirmar o envio ao TikTok.');const creator=await creatorInfo(d.owner,a.id);if(!creator.privacy_level_options?.includes(p.options.tiktokPrivacy))throw new AppError('Confira novamente as opções de privacidade no TikTok.');if(media[0].duration&&media[0].duration>creator.max_video_post_duration_sec)throw new AppError('O vídeo excede a duração permitida pelo TikTok.');path='video/init/';payload.post_info={title:caption,privacy_level:p.options.tiktokPrivacy,disable_comment:creator.comment_disabled||p.options.disableComment,disable_duet:creator.duet_disabled||p.options.disableDuet,disable_stitch:creator.stitch_disabled||p.options.disableStitch,brand_content_toggle:!!p.options.brandContent,brand_organic_toggle:!!p.options.brandOrganic,is_aigc:!!p.options.containsSyntheticMedia};}
  await assertLease(d);const result=await api('https://open.tiktokapis.com/v2/post/publish/'+path,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!result.data?.publish_id)throw new RemoteError('publish_id_missing',true);return checkpoint(d,{publishId:result.data.publish_id,mode:direct?'direct':'inbox'});
 }
 const result=await api('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({publish_id:context.publishId})},true);const s=result.data?.status;
 if(s==='PUBLISH_COMPLETE'){await saveContext(d,context,'published',String(result.data.publicaly_available_post_id?.[0]??context.publishId));return;}
 if(s==='SEND_TO_USER_INBOX'){await saveContext(d,context,'inbox',context.publishId);return;}
 if(s==='FAILED')throw new AppError('O TikTok recusou o processamento. Confira formato e permissões.');if(d.attempts>24)throw new RemoteError('tiktok_processing_timeout',true);await saveContext(d,context);
}
async function summarize(postId:string,owner:string){const rows=await list('SELECT status FROM deliveries WHERE post_id=? AND owner=?',postId,owner);if(!rows.length)return;const s=rows.map(x=>x.status);let status='publishing';if(s.every(x=>x==='published'))status='published';else if(s.every(x=>['published','inbox'].includes(x)))status=s.includes('inbox')?'inbox':'published';else if(s.every(x=>['published','inbox','failed','uncertain','cancelled'].includes(x)))status=s.some(x=>['published','inbox'].includes(x))?'partial':s.includes('uncertain')?'uncertain':'failed';await run('UPDATE posts SET status=?,updated_at=? WHERE id=? AND owner=?',status,Date.now(),postId,owner);}
async function generateDrafts(owner?:string){const rules=await list('SELECT * FROM rules WHERE active=1'+(owner?' AND owner=?':''),...(owner?[owner]:[]));let generated=0;
 for(const r of rules){const ws=await first('SELECT timezone FROM workspaces WHERE owner=?',r.owner);if(!ws)continue;const date=nextLocalDate(Date.now(),ws.timezone);if(r.last_date?.slice(0,10)===date)continue;let time:number|null=null;try{time=localToEpoch(date+'T'+r.time,ws.timezone);}catch{/* Keep the draft unscheduled when the local time does not exist. */}const weekday=new Date(date+'T12:00:00Z').getUTCDay();if(!JSON.parse(r.weekdays).includes(weekday))continue;
  const aids=JSON.parse(r.account_ids);const accts=await list('SELECT id,platform FROM accounts WHERE owner=?',r.owner);const networks=[...new Set(accts.filter(a=>aids.includes(a.id)).map(a=>a.platform))];const mids=JSON.parse(r.media_ids);const available=await list('SELECT id,mime FROM media WHERE owner=?',r.owner);const choices=available.filter(m=>mids.includes(m.id));const selected=choices.length?choices[Math.floor(Date.parse(date+'T12:00:00Z')/86400000)%choices.length]:null;const pid=id();const n=Date.now();
  // Claim date and insert in a single D1 transaction. The stable claim marker is the post ID.
  const claim=date+':'+pid;await database().batch([database().prepare('UPDATE rules SET last_date=? WHERE id=? AND active=1 AND (last_date IS NULL OR substr(last_date,1,10)<>?)').bind(claim,r.id,date),database().prepare("INSERT INTO posts (id,owner,title,caption,captions,platforms,account_ids,media_ids,format,status,scheduled_at,options,version,created_at,updated_at,group_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rules WHERE id=? AND last_date=?)").bind(pid,r.owner,r.name,r.caption,'{}',JSON.stringify(networks.length?networks:['instagram']),JSON.stringify(aids),JSON.stringify(selected?[selected.id]:[]),selected?.mime.startsWith('image/')?'photo':'video','draft',time,JSON.stringify({location:defaultLocation,locationMode:'caption',coverMode:'account'}),1,n,n,r.group_id??null,r.id,claim)]);const created=await first('SELECT id FROM posts WHERE id=?',pid);if(created){generated++;await event(r.owner,'Rascunho criado pela rotina',r.name+(time===null?' · Escolha outro horário: o horário sugerido não existe neste fuso.':''),pid);}
 }return generated;
}
export const earlierBatchPending=(b:string)=>`EXISTS (
 SELECT 1 FROM posts prev JOIN deliveries x ON x.owner=prev.owner AND x.post_id=prev.id
 WHERE prev.owner=${b}.owner AND prev.batch_id=${b}.batch_id AND prev.batch_position<${b}.batch_position
 AND x.status NOT IN ('published','cancelled','failed'))`;
export const batchCooldownUntil=(d:string,b:string)=>`COALESCE((
 SELECT MAX(x.updated_at+CASE WHEN prev.batch_id=${b}.batch_id AND json_extract(${b}.options,'$.prismaSharedReel')=1 THEN ${SHARED_REEL_INTERVAL_MS} ELSE 60000 END) FROM deliveries x JOIN posts prev ON prev.id=x.post_id AND prev.owner=x.owner
 WHERE x.owner=${d}.owner AND x.status='published' AND prev.batch_id IS NOT NULL
 AND (x.account_id=${d}.account_id OR prev.batch_id=${b}.batch_id)),0)`;
// Recheck at claim time, including the previous delivery's confirmed publish time.
export const batchReady=(d:string)=>`NOT EXISTS (
 SELECT 1 FROM posts b WHERE b.id=${d}.post_id AND b.owner=${d}.owner AND b.batch_id IS NOT NULL
 AND (${earlierBatchPending('b')} OR ${batchCooldownUntil(d,'b')}>?))`;

const interruptedDelivery = 'A execução foi interrompida. Confira a rede antes de criar outro envio.';

export async function resumeInstagramPost(owner:string,postId:string){
 const post=await first("SELECT status FROM posts WHERE owner=? AND id=?",owner,postId);
 if(!post||!['publishing','uncertain','partial'].includes(post.status))throw new AppError('Este conteúdo não tem um envio interrompido para retomar.',409);
 const now=Date.now();
 // Instagram publication always follows a durable container checkpoint. Reuse
 // that container and read its status before deciding whether to publish.
 const recoverable="platform='instagram' AND (status='working' AND lease_until<=? OR status='uncertain' AND error=?)";
 await database().batch([
  database().prepare("UPDATE posts SET status='publishing',updated_at=? WHERE owner=? AND id=? AND status IN ('publishing','uncertain','partial') AND EXISTS (SELECT 1 FROM deliveries WHERE owner=? AND post_id=? AND "+recoverable+")").bind(now,owner,postId,owner,postId,now,interruptedDelivery),
  database().prepare("UPDATE deliveries SET status='processing',error=NULL,next_run=?,lease=NULL,lease_until=NULL WHERE owner=? AND post_id=? AND "+recoverable+" AND EXISTS (SELECT 1 FROM posts WHERE owner=? AND id=? AND status='publishing')").bind(now,owner,postId,now,interruptedDelivery,owner,postId),
 ]);
 return processQueue(owner,'manual',postId,'instagram');
}

export async function processQueue(owner:string,source:'manual'|'service'='manual',postId?:string,platform?:'instagram'){
 if(!owner)throw new AppError('Workspace da fila não configurado.',403);
 const startedAt=Date.now();const drafted=postId?0:await generateDrafts(owner);
 const scope=' AND owner=?'+(postId?' AND post_id=?':'')+(platform?' AND platform=?':'');
 const params=[owner,...(postId?[postId]:[]),...(platform?[platform]:[])];
 const stale=await list("SELECT * FROM deliveries WHERE status='working' AND lease_until<=?"+scope,startedAt,...params);
 for(const d of stale){
  const expired=await run("UPDATE deliveries SET status='uncertain',error=?,lease=NULL,lease_until=NULL WHERE id=? AND status='working' AND lease IS ? AND lease_until<=?",interruptedDelivery,d.id,d.lease,startedAt);
  if(expired.meta.changes)await summarize(d.post_id,d.owner);
 }
 const due=await list("SELECT d.* FROM deliveries d JOIN posts p ON p.id=d.post_id AND p.owner=d.owner WHERE d.status IN ('pending','processing') AND d.next_run<=? AND p.status IN ('scheduled','publishing') AND d.owner=?"+(postId?' AND d.post_id=?':'')+(platform?' AND d.platform=?':'')+' AND '+batchReady('d')+' ORDER BY d.next_run,d.created_at LIMIT 3',Date.now(),...params,Date.now());let processed=0;
 for(const item of due){if(processed&&Date.now()-startedAt>20000)break;const lease=id();const claim=await database().batch([database().prepare("UPDATE deliveries SET status='working',lease=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','processing') AND EXISTS (SELECT 1 FROM posts WHERE id=deliveries.post_id AND status IN ('scheduled','publishing')) AND NOT EXISTS (SELECT 1 FROM deliveries other WHERE other.account_id=deliveries.account_id AND other.status='working' AND other.lease_until>unixepoch()*1000) AND next_run<=? AND "+batchReady('deliveries')).bind(lease,Date.now()+600000,item.id,Date.now(),Date.now()),database().prepare("UPDATE posts SET status='publishing',updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM deliveries WHERE id=? AND lease=?)").bind(Date.now(),item.post_id,item.id,lease)]);if(!claim[0].meta.changes)continue;const d={...item,lease,attempts:item.attempts+1,deadline:startedAt+20000};
  try{await publishStep(d);}catch(e){
   const retry=e instanceof RemoteError&&e.retryable&&d.attempts<24;
   const uncertain=e instanceof RemoteError?(e.uncertain||e.retryable):!(e instanceof AppError);
   const msg=e instanceof AppError?e.message:'Resultado não confirmado. Confira a plataforma antes de reenviar.';
   // Read-only failures resume from the persisted checkpoint. Ambiguous writes are never replayed.
   await run('UPDATE deliveries SET status=?,error=?,next_run=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=?',retry?'processing':uncertain?'uncertain':'failed',msg,Date.now()+Math.min(60,2**Math.min(d.attempts,6))*60000,Date.now(),d.id,lease);
   if(!retry)await event(d.owner,'Publicação requer atenção',msg,d.post_id);
  }
  await summarize(d.post_id,d.owner);processed++;
 }const checkedAt=new Date().toISOString();await run('INSERT INTO runner_status (owner,checked_at,processed,drafted) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET checked_at=excluded.checked_at,processed=excluded.processed,drafted=excluded.drafted',source==='service'?'service:'+owner:owner,checkedAt,processed,drafted);return {processed,drafted,checkedAt};
}
