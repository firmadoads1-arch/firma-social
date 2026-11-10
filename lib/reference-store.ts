import {z} from 'zod';
import {first,run,database} from './server';
import {AppError,id} from './security';
import {normalizeHandle,referenceSource,referenceProfileInput,referenceModelInput} from './references';

const changed=()=>new AppError('Esta referência mudou ou foi removida. Atualize a página antes de continuar.',409);
export async function referenceAction(action:string,data:unknown,owner:string,group:string|null=null){
 const now=Date.now();
 if(action==='reference.profile.save'){
  const v=referenceProfileInput.parse(data),handle=normalizeHandle(v.handle,v.platform),pid=v.id??id();
  const duplicate=await first('SELECT id FROM reference_profiles WHERE owner=? AND platform=? AND handle=? AND id<>?',owner,v.platform,handle,pid);
  if(duplicate)throw new AppError('Esse perfil já está salvo nas suas referências.',409);
  const values=[v.platform,handle,v.displayName||handle,v.kind,v.niche,v.notes,v.favorite?1:0,now];
  const result=v.id
   ?await run('UPDATE reference_profiles SET platform=?,handle=?,display_name=?,kind=?,niche=?,notes=?,favorite=?,updated_at=?,version=version+1 WHERE id=? AND owner=? AND version=? AND NOT EXISTS (SELECT 1 FROM reference_models WHERE reference_id=? AND platform<>?)',...values,pid,owner,v.version??0,pid,v.platform)
   :await run('INSERT OR IGNORE INTO reference_profiles (platform,handle,display_name,kind,niche,notes,favorite,updated_at,id,owner,created_at,version,group_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)',...values,pid,owner,now,group);
  if(!result.meta.changes){
   if(v.id&&await first('SELECT id FROM reference_models WHERE reference_id=? AND owner=? AND platform<>?',pid,owner,v.platform))throw new AppError('Remova a associação dos modelos antes de mudar a rede deste perfil.');
   throw changed();
  }
  return {id:pid};
 }
 if(action==='reference.model.save'){
  const v=referenceModelInput.parse(data),source=referenceSource(v.sourceUrl,v.platform),mid=v.id??id();
  if(v.referenceId&&!await first('SELECT id FROM reference_profiles WHERE id=? AND owner=? AND platform=?',v.referenceId,owner,v.platform))throw new AppError('Escolha um perfil seu da mesma rede.');
  if(v.platform!=='instagram'&&v.format!=='video')throw new AppError('Escolha vídeo para modelos de TikTok e YouTube.');
  const values=[v.referenceId,v.platform,v.title,v.niche,source,v.format,v.hook,v.outline,v.caption,v.favorite?1:0,now];
  // Check the relationship again in the write, so deleting a profile cannot leave a dangling link.
  const valid='(? IS NULL OR EXISTS (SELECT 1 FROM reference_profiles WHERE id=? AND owner=? AND platform=?))';
  const guard=[v.referenceId,v.referenceId,owner,v.platform];
  const result=v.id
   ?await run(`UPDATE reference_models SET reference_id=?,platform=?,title=?,niche=?,source_url=?,format=?,hook=?,outline=?,caption=?,favorite=?,updated_at=?,version=version+1 WHERE id=? AND owner=? AND version=? AND ${valid}`,...values,mid,owner,v.version??0,...guard)
   :await run(`INSERT INTO reference_models (reference_id,platform,title,niche,source_url,format,hook,outline,caption,favorite,updated_at,id,owner,created_at,version,group_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,? WHERE ${valid}`,...values,mid,owner,now,group,...guard);
  if(!result.meta.changes)throw changed();return {id:mid};
 }
 if(action==='reference.profile.delete'||action==='reference.model.delete'){
  const v=z.object({id:z.string().uuid(),version:z.number().int().positive()}).parse(data);
  if(action==='reference.profile.delete'){
   const result=await database().batch([
    database().prepare('UPDATE reference_models SET reference_id=NULL,updated_at=?,version=version+1 WHERE reference_id=? AND owner=? AND EXISTS (SELECT 1 FROM reference_profiles WHERE id=? AND owner=? AND version=?)').bind(now,v.id,owner,v.id,owner,v.version),
    database().prepare('DELETE FROM reference_profiles WHERE id=? AND owner=? AND version=?').bind(v.id,owner,v.version)
   ]);if(!result[1].meta.changes)throw changed();
  }else if(!(await run('DELETE FROM reference_models WHERE id=? AND owner=? AND version=?',v.id,owner,v.version)).meta.changes)throw changed();
  return {ok:true};
 }
 throw new AppError('Operação de referência não reconhecida.');
}
