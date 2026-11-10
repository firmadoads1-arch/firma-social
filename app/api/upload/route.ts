import {groupScope} from '@/lib/group-scope';
import {currentUser,bucket,run,responseError,event} from '@/lib/server';
import {id,assertSameOrigin,AppError} from '@/lib/security';
export async function POST(req:Request){try{
 assertSameOrigin(req);const u=await currentUser();const len=Number(req.headers.get('content-length')??0);if(len>51*1024*1024)throw new AppError('Limite de 50 MB por arquivo.',413);
 const form=await req.formData();const group=await groupScope(u.userId,form.get('group'));const f=form.get('file');if(!(f instanceof File))throw new AppError('Escolha um arquivo.');if(f.size>50*1024*1024||f.size===0)throw new AppError('Envie um arquivo entre 1 byte e 50 MB.');
 if(!['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp'].includes(f.type))throw new AppError('Use MP4, MOV, WebM, JPG, PNG ou WebP.');
 const mid=id();const key=`media/${u.userId}/${mid}`;const name=f.name.slice(0,160);const number=(k:string)=>{const n=Number(form.get(k));return Number.isFinite(n)&&n>0?n:null;};
 await bucket().put(key,f.stream(),{httpMetadata:{contentType:f.type}});
 try{await run('INSERT INTO media (id,owner,name,mime,size,storage_key,width,height,duration,folder,created_at,group_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',mid,u.userId,name,f.type,f.size,key,number('width'),number('height'),number('duration'),'Geral',Date.now(),group);}catch(e){await bucket().delete(key);throw e;}
 await event(u.userId,'Arquivo adicionado',name);return Response.json({id:mid});
 }catch(e){return responseError(e);}}
