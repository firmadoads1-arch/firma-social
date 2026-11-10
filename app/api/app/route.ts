import {groupScope,requireItems} from '@/lib/group-scope';
import {editingAction,assetRows,accountRows,prepareOptions} from '@/lib/editing';
import {processQueue,resumeInstagramPost} from '@/lib/queue';
import {manualStory} from '@/lib/story-links';
import {schedulerEnabled} from '@/lib/scheduler';
import {z} from 'zod';
import {referenceAction} from '@/lib/reference-store';
import {currentUser,protectedUser,state,list,first,run,event,database,bucket,config,runtime} from '@/lib/server';
import {AppError,assertSameOrigin,id,seal,safeHttps} from '@/lib/security';
import {postInput,validatePublishing,validateReelCover,platformSchema} from '@/lib/domain';
import {publicMedia} from '@/lib/providers';
import {responseError} from '@/lib/server';
export async function GET(req?:Request){try{const user=await currentUser();const receipt=req?new URL(req.url).searchParams.get('batch'):null;if(receipt){await protectedUser();const b=await first('SELECT id,count,starts_at AS startsAt FROM publish_batches WHERE id=? AND owner=?',z.string().uuid().parse(receipt),user.userId);return Response.json({batch:b},{headers:{'Cache-Control':'no-store'}});}return Response.json(await state(user.userId,user.displayName,req?new URL(req.url).searchParams.get('group'):null),{headers:{'Cache-Control':'no-store'}});}catch(e){return responseError(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await currentUser();const owner=user.userId;
 const body=await request.json() as any;const action=z.string().parse(body.action);const data=body.data??{};const now=Date.now();
 if(['provider.save','account.disconnect','workspace.save'].includes(action))await protectedUser();
 const group=await groupScope(owner,body.groupId);
 if(['account.geo','account.preferences','group.create','group.assign','post.batch','post.sharedReelBatch','post.prepareSharedReelBatch','media.move','media.remove'].includes(action))await protectedUser();
 if(group){const tab:Record<string,any>={'post':'posts','rule':'rules','media':'media','template':'templates','account':'accounts'};const t=action.startsWith('reference.')?(action.includes('.model.')?'reference_models':'reference_profiles'):tab[action.split('.')[0]];if(t&&data.id&&!(action==='post.publishNow'&&data.version===undefined))await requireItems(owner,group,t,[data.id]);if(data.referenceId)await requireItems(owner,group,'reference_profiles',[data.referenceId]);}
 if(['group.create','group.assign','account.preferences','account.geo','media.move','media.remove','media.delete','post.batch','post.sharedReelBatch','post.prepareSharedReelBatch'].includes(action))return Response.json(await editingAction(action,data,owner,group));
 if(action.startsWith('reference.'))return Response.json(await referenceAction(action,data,owner,group));
 if(action==='post.resumeInstagram'){await protectedUser();return Response.json(await resumeInstagramPost(owner,z.string().uuid().parse(data.id)));}
 if(action==='post.save'||action==='post.publishNow'){
  const immediate=action==='post.publishNow',newImmediate=immediate&&data.version===undefined;
  const p=postInput.parse(immediate?{...data,status:'scheduled',scheduledAt:now}:data);
  if(immediate&&manualStory(p))throw new AppError('Este Story precisa ser finalizado no Instagram. Use o planejamento manual.');
  if(newImmediate){
   if(!p.id)throw new AppError('Identificador de envio obrigatório.');
   const exists=await first('SELECT owner,status FROM posts WHERE id=?',p.id);
   if(exists){if(exists.owner!==owner)throw new AppError('Conteúdo não encontrado.',404);await requireItems(owner,group,'posts',[p.id]);return Response.json({id:p.id,status:exists.status,immediate:true});}
  }
  const manual=manualStory(p);const savedStatus=p.status==='scheduled'&&manual?'manual_pending':p.status;let old:any=null;
  if(p.id&&!newImmediate){old=await first('SELECT * FROM posts WHERE id=? AND owner=?',p.id,owner);if(!old)throw new AppError('Conteúdo não encontrado.',404);if(old.batch_id&&JSON.parse(old.options).sharedReelBatch)throw new AppError('Cancele este envio do lote antes de preparar outra versão.',409);if(!['draft','pending_approval','scheduled','cancelled','manual_pending'].includes(old.status))throw new AppError('Duplique este conteúdo para criar uma nova versão.',409);if(old.version!==p.version)throw new AppError('Este conteúdo mudou. Atualize a página antes de salvar.',409);}
  if(old&&await first("SELECT id FROM deliveries WHERE post_id=? AND owner=? AND status='manual_published'",p.id,owner))throw new AppError('Este Story tem publicações manuais registradas. Duplique para preparar outro conteúdo.',409);
  const [assets,accounts]=await Promise.all([assetRows(owner),accountRows(owner)]);await requireItems(owner,group,'accounts',p.accountIds);const oldMids:string[]=old?JSON.parse(old.media_ids):[];await requireItems(owner,group,'media',p.mediaIds.filter(x=>!oldMids.includes(x)));if(p.options.instagramCoverMediaId&&p.options.instagramCoverMediaId!==JSON.parse(old?.options??'{}').instagramCoverMediaId)await requireItems(owner,group,'media',[p.options.instagramCoverMediaId]);prepareOptions(p,accounts,assets,old);const selected=assets.filter(a=>p.mediaIds.includes(a.id));if(selected.length!==p.mediaIds.length)throw new AppError('Mídia não encontrada no seu workspace.');
  const coverIssue=validateReelCover(p,assets);if(coverIssue)throw new AppError(coverIssue);
  if(p.accountIds.some(id=>!accounts.find(a=>a.id===id)))throw new AppError('Conta não encontrada.');
  if(p.status==='scheduled'){
   if(!manual&&!schedulerEnabled(owner,runtime()))throw new AppError('A execução automática está desativada ou sem autorização. Salve como rascunho e ative a fila antes de agendar.',409);
   const issues=validatePublishing(p,selected,accounts,now,immediate);if(issues.length)throw new AppError(issues.join(' '));
   for(const platform of manual?[]:p.platforms){const c=await config(owner,platform);if(!c)throw new AppError('Configure a integração antes de agendar.');if(platform==='tiktok'){for(const m of selected)publicMedia({...m,public_url:m.publicUrl},c,platform);if(p.options.tiktokMode==='direct'&&!c.reviewed)throw new AppError('Direct Post exige aplicativo revisado pelo TikTok.');}}
  }
  const pid=p.id??id();const marker=id();const statements=[];
  if(old){
   statements.push(database().prepare("UPDATE posts SET title=?,caption=?,captions=?,platforms=?,account_ids=?,media_ids=?,format=?,status=?,scheduled_at=?,options=?,version=version+1,write_token=?,updated_at=? WHERE id=? AND owner=? AND version=? AND status IN ('draft','pending_approval','scheduled','cancelled','manual_pending') AND NOT EXISTS (SELECT 1 FROM deliveries completed WHERE completed.post_id=posts.id AND completed.owner=posts.owner AND completed.status='manual_published')").bind(p.title,p.caption,JSON.stringify(p.captions),JSON.stringify([...new Set(p.platforms)]),JSON.stringify([...new Set(p.accountIds)]),JSON.stringify(p.mediaIds),p.format,savedStatus,p.scheduledAt,JSON.stringify(p.options),marker,now,pid,owner,p.version!));
   statements.push(database().prepare('DELETE FROM deliveries WHERE post_id=? AND owner=? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND write_token=?)').bind(pid,owner,pid,marker));
  } else statements.push(database().prepare((newImmediate?'INSERT OR IGNORE':'INSERT')+' INTO posts (id,owner,title,caption,captions,platforms,account_ids,media_ids,format,status,scheduled_at,options,version,write_token,created_at,updated_at,group_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)').bind(pid,owner,p.title,p.caption,JSON.stringify(p.captions),JSON.stringify([...new Set(p.platforms)]),JSON.stringify([...new Set(p.accountIds)]),JSON.stringify(p.mediaIds),p.format,savedStatus,p.scheduledAt,JSON.stringify(p.options),marker,now,now,group));
  if(p.status==='scheduled')for(const aid of new Set(p.accountIds)){const a=accounts.find(x=>x.id===aid);statements.push(database().prepare('INSERT INTO deliveries (id,post_id,owner,account_id,platform,status,context,attempts,next_run,created_at,updated_at) SELECT ?,?,?,?,?,?,?,0,?,?,? WHERE EXISTS (SELECT 1 FROM posts WHERE id=? AND write_token=?)').bind(id(),pid,owner,aid,a.platform,manual?'manual_pending':'pending','{}',p.scheduledAt??now,now,now,pid,marker));}
  const result=await database().batch(statements);if(!result[0].meta.changes&&newImmediate){const existing=await first('SELECT status FROM posts WHERE id=? AND owner=?',pid,owner);if(existing)return Response.json({id:pid,status:existing.status,immediate:true});}
  if(!result[0].meta.changes)throw new AppError('Este conteúdo mudou ou começou a ser publicado. Atualize antes de continuar.',409);
  await event(owner,immediate?'Envio imediato solicitado':p.status==='scheduled'?(manual?'Story preparado para finalizar no Instagram':'Publicação agendada'):p.status==='pending_approval'?'Conteúdo enviado para revisão':'Rascunho salvo',p.title,pid);
  if(immediate){
   let pending=false;try{await processQueue(owner,'manual',pid);}catch{pending=true;}
   const saved=await first('SELECT status FROM posts WHERE id=? AND owner=?',pid,owner);
   return Response.json({id:pid,status:saved?.status??savedStatus,immediate:true,pending});
  }
  return Response.json({id:pid,status:savedStatus});
 }
 if(action==='post.manualStory'){
  const v=z.object({id:z.string().uuid(),accountId:z.string().uuid(),version:z.number().int().positive(),published:z.boolean()}).parse(data);
  const p=await first('SELECT * FROM posts WHERE id=? AND owner=?',v.id,owner);
  if(!p||!['manual_pending','manual_published'].includes(p.status)||!manualStory({format:p.format,options:JSON.parse(p.options)}))throw new AppError('Story manual não encontrado.',404);
  const d=await first("SELECT * FROM deliveries WHERE post_id=? AND owner=? AND account_id=? AND platform='instagram' AND status IN ('manual_pending','manual_published')",v.id,owner,v.accountId);
  if(!d)throw new AppError('Perfil não encontrado neste Story.',404);
  const target=v.published?'manual_published':'manual_pending';
  if(d.status===target)return Response.json({ok:true,status:p.status});
  if(p.version!==v.version)throw new AppError('Este Story mudou. Atualize a página antes de registrar.',409);
  const marker=id();
  const result=await database().batch([
   database().prepare("UPDATE posts SET write_token=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND status IN ('manual_pending','manual_published')").bind(marker,now,v.id,owner,v.version),
   database().prepare('UPDATE deliveries SET status=?,updated_at=? WHERE id=? AND owner=? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND owner=? AND write_token=?)').bind(target,now,d.id,owner,v.id,owner,marker),
   database().prepare("UPDATE posts SET status=CASE WHEN EXISTS (SELECT 1 FROM deliveries WHERE post_id=posts.id AND owner=posts.owner AND status<>'manual_published') THEN 'manual_pending' ELSE 'manual_published' END WHERE id=? AND owner=? AND write_token=?").bind(v.id,owner,marker),
  ]);
  if(!result[0].meta.changes)throw new AppError('Este Story mudou. Atualize a página antes de registrar.',409);
  const a=await first('SELECT username FROM accounts WHERE id=? AND owner=?',v.accountId,owner);
  await event(owner,v.published?'Publicação manual informada':'Registro de publicação manual desfeito',(a?.username?'@'+a.username+' · ':'')+'Registro do usuário; sem confirmação automática do Instagram.',v.id);
  return Response.json({ok:true});
 }
 if(action==='post.cancel'||action==='post.delete'){
  const pid=z.string().uuid().parse(data.id);const marker=id();
  const statements=[database().prepare("UPDATE posts SET status='cancelled',write_token=?,updated_at=?,version=version+1 WHERE id=? AND owner=? AND status IN ('draft','pending_approval','scheduled','cancelled','manual_pending') AND NOT EXISTS (SELECT 1 FROM deliveries completed WHERE completed.post_id=posts.id AND completed.owner=posts.owner AND completed.status='manual_published')").bind(marker,now,pid,owner),database().prepare("UPDATE deliveries SET status='cancelled',updated_at=? WHERE post_id=? AND owner=? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND write_token=?)").bind(now,pid,owner,pid,marker)];
  if(action==='post.delete'){statements.push(database().prepare('DELETE FROM deliveries WHERE post_id=? AND owner=? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND write_token=?)').bind(pid,owner,pid,marker));statements.push(database().prepare('DELETE FROM posts WHERE id=? AND owner=? AND write_token=?').bind(pid,owner,marker));}
  const result=await database().batch(statements);if(!result[0].meta.changes)throw new AppError('Conteúdo indisponível ou envio já iniciado. Confira a situação na rede.',409);
  await event(owner,action==='post.delete'?'Conteúdo removido':'Agendamento cancelado','',pid);return Response.json({ok:true});
 }

 if(action==='media.update'){
  const v=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(160),folder:z.string().trim().min(1).max(60),publicUrl:z.string().max(2048).default('')}).parse(data);
  if(!await first('SELECT id FROM media WHERE id=? AND owner=?',v.id,owner))throw new AppError('Arquivo não encontrado.',404);
  await run('UPDATE media SET name=?,folder=?,public_url=? WHERE id=? AND owner=?',v.name,v.folder,v.publicUrl?safeHttps(v.publicUrl):null,v.id,owner);return Response.json({ok:true});
 }
 if(action==='account.disconnect'){
  const aid=z.string().uuid().parse(data.id);await run("UPDATE accounts SET state='disconnected',tokens='' WHERE id=? AND owner=?",aid,owner);await run('DELETE FROM geo_grants WHERE owner=? AND id=?',owner,aid);await event(owner,'Conta desconectada','Credenciais locais removidas. Revogue também a permissão nas configurações da rede.');return Response.json({ok:true});
 }
 if(action==='provider.save'){
  const v=z.object({platform:platformSchema,clientId:z.string().trim().min(1).max(250),clientSecret:z.string().max(1000).default(''),publicMediaBase:z.string().max(2048).default(''),reviewed:z.boolean().default(false)}).parse(data);const prior=await config(owner,v.platform);
  if(!v.clientSecret&&(!prior||prior.clientId!==v.clientId))throw new AppError('Informe o segredo do aplicativo.');
  const c={clientId:v.clientId,clientSecret:v.clientSecret||prior!.clientSecret,publicMediaBase:v.publicMediaBase?safeHttps(v.publicMediaBase):'',reviewed:v.reviewed,graphVersion:'v26.0'};
  await run('INSERT INTO provider_configs (id,owner,platform,encrypted,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner,platform) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at',id(),owner,v.platform,await seal(c,runtime().TOKEN_ENCRYPTION_KEY),now);await event(owner,'Integração configurada',v.platform);return Response.json({ok:true});
 }
 if(action==='workspace.save'){
  const v=z.object({name:z.string().trim().min(1).max(60),timezone:z.string().max(80)}).parse(data);try{new Intl.DateTimeFormat('pt-BR',{timeZone:v.timezone}).format();}catch{throw new AppError('Fuso horário inválido.');}
  await run('UPDATE workspaces SET name=?,timezone=? WHERE owner=?',v.name,v.timezone,owner);return Response.json({ok:true});
 }
 if(action==='template.save'){
  const v=z.object({name:z.string().trim().min(1).max(80),caption:z.string().trim().min(1).max(5000)}).parse(data);await run('INSERT INTO templates (id,owner,name,caption,created_at,group_id) VALUES (?,?,?,?,?,?)',id(),owner,v.name,v.caption,now,group);return Response.json({ok:true});
 }
 if(action==='template.delete'){await run('DELETE FROM templates WHERE id=? AND owner=?',z.string().uuid().parse(data.id),owner);return Response.json({ok:true});}
 if(action==='rule.save'){
  const v=z.object({name:z.string().trim().min(1).max(80),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),weekdays:z.array(z.number().int().min(0).max(6)).min(1),caption:z.string().max(5000),accountIds:z.array(z.string().uuid()).max(40).default([]),mediaIds:z.array(z.string().uuid()).max(100).default([])}).parse(data);
  await requireItems(owner,group,'media',v.mediaIds);await requireItems(owner,group,'accounts',v.accountIds);const mids=await list('SELECT id FROM media WHERE owner=?',owner);if(v.mediaIds.some(x=>!mids.find(m=>m.id===x)))throw new AppError('Mídia inválida.');const aids=await list('SELECT id FROM accounts WHERE owner=?',owner);if(v.accountIds.some(x=>!aids.find(a=>a.id===x)))throw new AppError('Conta inválida.');
  await run('INSERT INTO rules (id,owner,name,time,weekdays,account_ids,media_ids,caption,active,created_at,group_id) VALUES (?,?,?,?,?,?,?,?,1,?,?)',id(),owner,v.name,v.time,JSON.stringify(v.weekdays),JSON.stringify(v.accountIds),JSON.stringify(v.mediaIds),v.caption,now,group);await event(owner,'Rotina criada',v.name+' · gera rascunhos para revisão.');return Response.json({ok:true});
 }
 if(action==='rule.toggle'){const v=z.object({id:z.string().uuid(),active:z.boolean()}).parse(data);await run('UPDATE rules SET active=? WHERE id=? AND owner=?',v.active?1:0,v.id,owner);return Response.json({ok:true});}
 if(action==='rule.delete'){await run('DELETE FROM rules WHERE id=? AND owner=?',z.string().uuid().parse(data.id),owner);return Response.json({ok:true});}
 throw new AppError('Operação não reconhecida.');
 }catch(e){return responseError(e);}}
