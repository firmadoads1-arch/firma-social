import {currentUser,first,bucket,responseError} from '@/lib/server';
import {AppError} from '@/lib/security';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const u=await currentUser();const {id}=await params;const m=await first('SELECT * FROM media WHERE id=? AND owner=?',id,u.userId);if(!m)throw new AppError('Arquivo não encontrado.',404);
 const object=await bucket().get(m.storage_key,{range:req.headers});if(!object)throw new AppError('Arquivo não encontrado.',404);
 const headers=new Headers({'Content-Type':m.mime,'Cache-Control':'private, max-age=60','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});headers.set('ETag',object.httpEtag);
 if(new URL(req.url).searchParams.has('download'))headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(m.name)}`);
 const range=object.range;if(range&&'offset'in range){const start=range.offset??0;const end=start+(range.length??object.size)-1;headers.set('Content-Range',`bytes ${start}-${end}/${object.size}`);headers.set('Content-Length',String(end-start+1));return new Response(object.body,{status:206,headers});}
 headers.set('Content-Length',String(object.size));return new Response(object.body,{headers});
 }catch(e){return responseError(e);}}
