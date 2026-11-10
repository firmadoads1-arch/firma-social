import {normalizeHandle,validHandle,normalizeProfileCrop} from './profile-types';
import {database as getDatabase,bucket as getBucket} from '../server';
import {AppError} from '../security';
type Row={id:string;handle:string;avatar_key:string;mime:string;size:number;created:number;updated:number;crop:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const publicRow=({avatar_key:_,crop,...rest}:Row & {owner?:string})=>{const {owner:__,...item}=rest;let value:unknown=null;try{value=JSON.parse(crop);}catch{}return{...item,crop:normalizeProfileCrop(value)};};
const MAX_AVATAR=5*1024*1024;
async function photo(request:Request){
 const mime=(request.headers.get('content-type')||'').split(';')[0];
 if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Use uma foto JPEG, PNG ou WebP.');
 if(Number(request.headers.get('content-length'))>MAX_AVATAR)throw Error('A foto deve ter até 5 MB.');
 const reader=request.body?.getReader();if(!reader)throw Error('Selecione uma foto.');
 const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_AVATAR){await reader.cancel();throw Error('A foto deve ter até 5 MB.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const ascii=new TextDecoder().decode(bytes.slice(0,12));
 const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.slice(0,8).every((b,i)=>b===[137,80,78,71,13,10,26,10][i])&&length>=24:ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP';
 if(length<24||!valid)throw Error('A foto não contém uma imagem válida.');
 return{bytes,mime,size:length};
}
export async function templatesApi(request:Request,owner:string):Promise<Response>{
 const db=getDatabase(),bucket=getBucket(),url=new URL(request.url),parts=url.pathname.slice('/api/prisma/'.length).split('/'),id=parts[1],method=request.method;
 if(id==='import'&&method==='POST')return importTemplates(owner);
 if(parts.length===1&&method==='GET')return json((await db.prepare('SELECT * FROM prisma_templates WHERE owner=? ORDER BY handle COLLATE NOCASE').bind(owner).all<Row>()).results.map(publicRow));
 if(id&&!/^[0-9a-f-]{36}$/.test(id))return json({error:'Template não encontrado.'},404);
 const existing=id?await db.prepare('SELECT * FROM prisma_templates WHERE id=? AND owner=?').bind(id,owner).first<Row>():null;
 if(id&&!existing)return json({error:'Template não encontrado.'},404);
 if(existing&&method==='POST'&&url.searchParams.has('expected_updated')&&Number(url.searchParams.get('expected_updated'))!==existing.updated)return json({error:'O template foi atualizado. Reabra para ajustar o enquadramento.'},409);
 if(existing&&parts[2]==='photo'&&parts.length===3&&['GET','HEAD'].includes(method)){
  const object=await bucket.get(existing.avatar_key);if(!object)return json({error:'Foto não encontrada.'},404);
  return new Response(method==='HEAD'?null:object.body,{headers:{'Content-Type':existing.mime,'Content-Length':String(object.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(existing&&parts.length===2&&method==='DELETE'){
  await db.prepare('DELETE FROM prisma_templates WHERE id=? AND owner=?').bind(id,owner).run();
  if(!await db.prepare('SELECT id FROM media WHERE owner=? AND storage_key=?').bind(owner,existing.avatar_key).first())await bucket.delete(existing.avatar_key).catch(()=>console.error('Template photo cleanup failed'));
  return json({ok:true});
 }
 if(parts.length<=2&&method==='POST'){
  const handle=normalizeHandle(url.searchParams.get('handle')||'');
  if(!validHandle(handle))return json({error:'Informe um arroba de até 30 caracteres: letras, números, ponto ou sublinhado.'},400);
  let crop=existing?.crop||'{}';
  if(url.searchParams.has('crop')){let value:unknown;try{const raw=url.searchParams.get('crop')!;if(raw.length>200)throw Error();value=JSON.parse(raw);}catch{return json({error:'Enquadramento inválido.'},400);}const normalized=normalizeProfileCrop(value);if(!normalized)return json({error:'Enquadramento inválido.'},400);crop=JSON.stringify(normalized);}
  if(await db.prepare('SELECT id FROM prisma_templates WHERE owner=? AND handle=? AND id<>?').bind(owner,handle,id||'').first())return json({error:'Já existe um template com esse arroba.'},409);
  if(!existing){const count=await db.prepare('SELECT COUNT(*) AS n FROM prisma_templates WHERE owner=?').bind(owner).first<{n:number}>();if((count?.n||0)>=100)return json({error:'Você pode cadastrar até 100 templates.'},400);}
  let upload:Awaited<ReturnType<typeof photo>>|null=null;
  const keepPhoto=existing&&(request.headers.get('content-type')||'').startsWith('application/json');
  if(!keepPhoto){try{upload=await photo(request);}catch(error){return json({error:(error as Error).message},400);}}
  const now=Date.now(),templateId=id||crypto.randomUUID(),key=upload?'prisma/templates/'+owner+'/'+templateId+'/'+crypto.randomUUID():existing!.avatar_key;
  if(upload)await bucket.put(key,upload.bytes,{httpMetadata:{contentType:upload.mime}});
  if(upload&&!url.searchParams.has('crop'))crop='{}';
  const item:Row={id:templateId,handle,avatar_key:key,mime:upload?.mime||existing!.mime,size:upload?.size||existing!.size,created:existing?.created||now,updated:Math.max(now,(existing?.updated||0)+1),crop};
  try{
   if(existing)await db.prepare('UPDATE prisma_templates SET handle=?,avatar_key=?,mime=?,size=?,updated=?,crop=? WHERE id=? AND owner=? AND updated=?').bind(item.handle,key,item.mime,item.size,item.updated,crop,templateId,owner,existing.updated).run().then(result=>{if(!result.meta.changes)throw new AppError('O template mudou durante a edição. Reabra e tente novamente.',409);});
   else await db.prepare('INSERT INTO prisma_templates(id,handle,avatar_key,mime,size,created,updated,crop,owner) VALUES(?,?,?,?,?,?,?,?,?)').bind(templateId,handle,key,item.mime,item.size,item.created,item.updated,crop,owner).run();
  }catch(error){if(upload)await bucket.delete(key);if(String(error).includes('UNIQUE'))return json({error:'Já existe um template com esse arroba.'},409);throw error;}
  if(upload&&existing&&!await db.prepare('SELECT id FROM media WHERE owner=? AND storage_key=?').bind(owner,existing.avatar_key).first())await bucket.delete(existing.avatar_key).catch(()=>console.error('Template photo cleanup failed'));
  return json(publicRow(item),existing?200:201);
 }
 return json({error:'Rota não encontrada.'},404);
}

async function importTemplates(owner:string){
 const {seedTemplates}=await import('./seed-templates');const db=getDatabase(),bucket=getBucket();let imported=0;
 for(const t of seedTemplates){
  if(await db.prepare('SELECT id FROM prisma_templates WHERE owner=? AND (id=? OR handle=?)').bind(owner,t.id,t.handle).first())continue;
  const bytes=Uint8Array.from(atob(t.data),c=>c.charCodeAt(0));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==t.sha256||bytes.length!==t.size)throw Error('Foto do pacote inválida.');
  const key='prisma/templates/'+owner+'/'+t.id+'/'+crypto.randomUUID();await bucket.put(key,bytes,{httpMetadata:{contentType:t.mime}});
  try{const result=await db.prepare('INSERT OR IGNORE INTO prisma_templates(id,owner,handle,avatar_key,mime,size,created,updated,crop) VALUES(?,?,?,?,?,?,?,?,?)').bind(t.id,owner,t.handle,key,t.mime,t.size,t.created,t.updated,t.crop).run();if(result.meta.changes)imported++;else await bucket.delete(key);}catch(e){await bucket.delete(key);throw e;}
 }
 return json({imported});
}
