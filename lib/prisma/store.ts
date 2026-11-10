import {z} from 'zod';
import {currentUser,protectedUser,database,bucket,first,list,run,responseError} from '../server';
import {AppError,assertSameOrigin,id} from '../security';
import {groupScope} from '../group-scope';
import {editingAction} from '../editing';
import {MAX_FILE,validMedia} from './security';
import {templatesApi} from './template-api';
import {SHARED_REEL_TOOL,sharedReelOutputId} from './shared-reel';

const uid=z.string().uuid();
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=(v:unknown,n:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').slice(0,n):'';
async function body(r:Request){if(Number(r.headers.get('content-length'))>16000)throw new AppError('Solicitação muito grande.',413);const reader=r.body?.getReader();if(!reader)throw new AppError('Envie os dados da solicitação.');const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw new AppError('Solicitação muito grande.',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('JSON inválido.');}}
async function project(owner:string,url:URL,group:string|null){const pid=uid.parse(url.searchParams.get('project'));const row=await first('SELECT * FROM prisma_projects WHERE owner=? AND id=?',owner,pid);if(!row||group&&row.group_id!==group)throw new AppError('Projeto não encontrado nesta área.',404);return row;}
const item=(m:any)=>({id:m.id,name:m.name,mime:m.mime,size:m.size,tool:m.tool??'biblioteca',kind:m.kind??'original',settings:m.settings??'{}',created:m.created_at,projectId:m.project_id??null,folder:m.folder,width:m.width,height:m.height,duration:m.duration});
const mediaSelect='SELECT m.*,p.project_id,p.tool,p.kind,p.settings,p.metadata FROM media m LEFT JOIN prisma_files p ON p.id=m.id AND p.owner=m.owner';

async function streamMedia(r:Request,m:any){
 const object=await bucket().get(m.storage_key,{range:r.headers});if(!object)throw new AppError('Arquivo não encontrado.',404);
 const headers=new Headers({'Content-Type':m.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes','Content-Disposition':`${new URL(r.url).searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(m.name)}`});
 const range=object.range;if(range&&'offset'in range){const start=range.offset??0,len=range.length??object.size;headers.set('Content-Range',`bytes ${start}-${start+len-1}/${object.size}`);headers.set('Content-Length',String(len));return new Response(r.method==='HEAD'?null:object.body,{status:206,headers});}
 headers.set('Content-Length',String(object.size));return new Response(r.method==='HEAD'?null:object.body,{headers});
}
async function upload(r:Request,owner:string,p:any,url:URL){
 const size=Number(r.headers.get('content-length')),mime=(r.headers.get('content-type')??'').split(';')[0];
 if(!Number.isSafeInteger(size)||size<16||size>MAX_FILE||!r.body)throw new AppError('Envie uma mídia entre 16 bytes e 80 MB.',413);
 if(!/^(video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|ogg|flac|aac)|image\/(jpeg|png|webp|gif))$/.test(mime))throw new AppError('Formato não permitido.',415);
 const mid=uid.parse(url.searchParams.get('uploadId')),name=clean(url.searchParams.get('name'),160)||'midia',tool=clean(url.searchParams.get('tool'),40)||'original',kind=url.searchParams.get('kind')==='export'?'export':'original';
 const raw=url.searchParams.get('metadata')??'{}',settings=url.searchParams.get('settings')??'{}';
 if(raw.length>10000||settings.length>6000)throw new AppError('Configuração muito grande.');let meta:any;try{z.record(z.unknown()).parse(JSON.parse(settings));meta=z.record(z.unknown()).parse(JSON.parse(raw));}catch{throw new AppError('Configuração inválida.');}if(meta.outputId&&meta.outputId!==mid)throw new AppError('Identificador da exportação inválido.');
 if(p.folder.startsWith('prisma posts / ')||tool===SHARED_REEL_TOOL){
  await protectedUser();
  if(!p.folder.startsWith('prisma posts / ')||tool!==SHARED_REEL_TOOL||mime!=='video/mp4'||kind!=='export')throw new AppError('Formato de exportação indisponível para este projeto.');
  const accountId=uid.parse(meta.accountId),sourceId=uid.parse(meta.sourceId);
  const [account,source]=await Promise.all([
   first("SELECT id FROM accounts WHERE id=? AND owner=? AND platform='instagram'",accountId,owner),
   first("SELECT id FROM media WHERE id=? AND owner=? AND mime IN ('video/mp4','video/quicktime')",sourceId,owner),
  ]);
  if(!account||!source||meta.outputId!==mid||mid!==await sharedReelOutputId(p.id,accountId))throw new AppError('A exportação não corresponde a este perfil do lote.');
 }
 if(meta.outputId&&(meta.file?.name!==name||meta.file?.mime!==mime||meta.file?.bytes!==size))throw new AppError('Os dados da exportação não correspondem ao arquivo.');
 const previous=async()=>{const row=await first(mediaSelect+' WHERE m.id=? AND m.owner=?',mid,owner);if(!row)return null;if(row.project_id!==p.id||row.name!==name||row.mime!==mime||row.size!==size||row.tool!==tool||row.kind!==kind||row.settings!==settings||JSON.stringify(JSON.parse(row.metadata))!==JSON.stringify(meta))throw new AppError('Identificador já usado com outros dados.',409);return item(row);};
 const saved=await previous();if(saved)return json(saved);
 const total=await first('SELECT COALESCE(SUM(m.size),0) AS n FROM media m JOIN prisma_files p ON p.id=m.id AND p.owner=m.owner WHERE m.owner=?',owner);
 if(total.n+size>2*1024**3)throw new AppError('Os arquivos do Prisma atingiram 2 GB. Libere espaço para continuar.',413);
 const [peek,content]=r.body.tee(),reader=peek.getReader();let prefix=new Uint8Array(0);
 while(prefix.length<16){const part=await reader.read();if(part.done)break;const joined=new Uint8Array(prefix.length+part.value.length);joined.set(prefix);joined.set(part.value,prefix.length);prefix=joined;}void reader.cancel();
 if(!validMedia(prefix)){void content.cancel();throw new AppError('O arquivo não contém uma mídia reconhecida.',415);}
 const key=`media/${owner}/prisma/${mid}/${id()}`,now=Date.now();const stream=new FixedLengthStream(size),pumping=content.pipeTo(stream.writable);
 const dimension=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
 try{
  await Promise.all([bucket().put(key,stream.readable,{httpMetadata:{contentType:mime}}),pumping]);
  // One atomic receipt and one shared-library item. A concurrent retry cannot duplicate either.
  await database().batch([
   database().prepare('INSERT INTO media(id,owner,group_id,name,mime,size,storage_key,width,height,duration,folder,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM media WHERE id=?)').bind(mid,owner,p.group_id,name,mime,size,key,dimension(meta.video?.width),dimension(meta.video?.height),dimension(meta.video?.duration),p.folder,now,mid),
   database().prepare('INSERT INTO prisma_files(id,owner,project_id,tool,kind,settings,metadata,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM media WHERE id=? AND owner=? AND storage_key=?)').bind(mid,owner,p.id,tool,kind,settings,JSON.stringify(meta),now,mid,owner,key),
  ]);
  const row=await first('SELECT storage_key FROM media WHERE id=? AND owner=?',mid,owner);if(row?.storage_key!==key)await bucket().delete(key);
  const result=await previous();if(!result)throw new AppError('Identificador indisponível. Reabra a biblioteca para conferir o arquivo.',409);
  return json(result,201);
 }catch(e){const committed=await first('SELECT storage_key FROM media WHERE id=? AND owner=?',mid,owner).catch(()=>null);if(committed?.storage_key!==key)await bucket().delete(key);throw e;}
}

export async function handle(r:Request){try{
 const url=new URL(r.url),parts=url.pathname.slice('/api/prisma/'.length).split('/'),method=r.method;
 if(!['GET','HEAD'].includes(method))assertSameOrigin(r);
 // Reuse Firma's verified session / explicitly configured public workspace policy.
 // A caller-supplied identity header is never accepted as authentication.
 const u=await currentUser(),owner=u.userId,group=await groupScope(owner,url.searchParams.get('group'));if(method==='DELETE')await protectedUser();
 if(parts[0]==='templates')return await templatesApi(r,owner);
 if(parts[0]==='projects'){
  if(parts.length!==1)throw new AppError('Rota não encontrada.',404);
  if(method==='GET')return json(await list('SELECT id,name,folder,group_id AS groupId,created_at AS createdAt FROM prisma_projects WHERE owner=?'+(group?' AND group_id=?':'')+' ORDER BY created_at DESC',owner,...(group?[group]:[])));
  if(method==='POST'){
   const v=z.object({name:z.string().trim().min(1).max(45).regex(/^[^/\\\u0000-\u001f]+$/)}).parse(await body(r)),pid=id(),now=Date.now();
   if(await first('SELECT id FROM prisma_projects WHERE owner=? AND name=?',owner,v.name))throw new AppError('Já existe um projeto com esse nome.',409);
   await run('INSERT INTO prisma_projects(id,owner,group_id,name,folder,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',pid,owner,group,v.name,'Prisma / '+v.name,now,now);
   return json({id:pid,name:v.name,groupId:group,folder:'Prisma / '+v.name,createdAt:now},201);
  }
 }
 if(parts[0]==='files'&&parts.length===2){
  const mid=uid.parse(parts[1]),m=await first(mediaSelect+' WHERE m.id=? AND m.owner=?'+(group?' AND m.group_id=?':''),mid,owner,...(group?[group]:[]));if(!m)throw new AppError('Arquivo não encontrado.',404);
  if(['GET','HEAD'].includes(method))return await streamMedia(r,m);
  if(method==='DELETE'){
   const p=await project(owner,url,group);if(m.project_id!==p.id)throw new AppError('Exclua arquivos de outros projetos pela biblioteca geral.',409);
   await editingAction('media.delete',{id:mid},owner,group);await run('DELETE FROM prisma_files WHERE id=? AND owner=?',mid,owner);return json({ok:true});
  }
 }
 const p=await project(owner,url,group);
 if(parts[0]==='files'&&parts.length===1){
  if(method==='GET'&&url.searchParams.has('uploadId')){const m=await first(mediaSelect+' WHERE m.id=? AND m.owner=? AND p.project_id=?',uid.parse(url.searchParams.get('uploadId')),owner,p.id);return json(m?item(m):null);}
  if(method==='GET')return json((await list(mediaSelect+' WHERE m.owner=?'+(url.searchParams.get('all')==='1'?(group?' AND m.group_id=?':''):' AND p.project_id=?')+' ORDER BY m.created_at DESC LIMIT 300',owner,...(url.searchParams.get('all')==='1'?(group?[group]:[]):[p.id]))).map(item));
  if(method==='POST')return await upload(r,owner,p,url);
 }
 if(parts[0]==='outputs'&&method==='POST'){
  const v=z.object({savedFileId:uid,outputId:uid,metadata:z.record(z.unknown())}).parse(await body(r));
  if(v.outputId!==v.savedFileId||v.metadata.outputId!==v.outputId)throw new AppError('Exportação inválida.');
  const m=await first('SELECT m.size,m.mime,p.project_id,p.metadata FROM media m JOIN prisma_files p ON p.id=m.id AND p.owner=m.owner WHERE m.id=? AND m.owner=?',v.savedFileId,owner);
  if(!m||m.project_id!==p.id)throw new AppError('Arquivo não encontrado no projeto.',404);
  const metadata=JSON.parse(m.metadata);if(metadata.outputId!==v.outputId||JSON.stringify(metadata)!==JSON.stringify(v.metadata))throw new AppError('Os dados da exportação não correspondem ao arquivo.',409);
  return json({id:v.savedFileId,outputId:v.outputId,ready:true});
 }
 if(parts[0]==='experiments'){
  if(parts.length===1&&method==='GET')return json(await list('SELECT id,name,original_views,variant_views,notes,created FROM prisma_experiments WHERE owner=? AND project_id=? ORDER BY created DESC LIMIT 200',owner,p.id));
  if(parts.length===1&&method==='POST'){const b=await body(r),n=(v:unknown)=>Math.max(0,Math.min(1e10,Math.floor(Number(v)||0))),eid=id();await run('INSERT INTO prisma_experiments(id,owner,project_id,name,original_views,variant_views,notes,created) VALUES(?,?,?,?,?,?,?,?)',eid,owner,p.id,clean(b.name,100)||'Experimento',n(b.originalViews),n(b.variantViews),clean(b.notes,1500),Date.now());return json({id:eid},201);}
  if(parts.length===2&&method==='DELETE'){await run('DELETE FROM prisma_experiments WHERE id=? AND owner=? AND project_id=?',uid.parse(parts[1]),owner,p.id);return json({ok:true});}
 }
 throw new AppError('Rota não encontrada.',404);
 }catch(e){const response=responseError(e);response.headers.set('Cache-Control','no-store');return response;}}
