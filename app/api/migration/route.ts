import {protectedUser,runtime,responseError,first,bucket} from '@/lib/server';
import {assertSameOrigin,AppError,seal,id} from '@/lib/security';
import {grant,exportData,restoreData,type Grant} from '@/lib/migration';
async function readBackup(req:Request){
 const limit=10000000;if(Number(req.headers.get('content-length'))>limit||!req.body)throw new AppError('Backup de dados muito grande ou vazio.');const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('Backup de dados muito grande.');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('Backup de dados inválido.');}
}
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function POST(req:Request){try{
 if(req.headers.has('authorization')){const g=await grant(req);if(g.mode!=='import')throw new AppError('Autorização somente de exportação.',403);return Response.json(await restoreData(g,await readBackup(req)),{headers});}
 assertSameOrigin(req);const user=await protectedUser();const body:any=await req.json();if(!['export','import'].includes(body.mode))throw new AppError('Escolha exportar ou importar.');
 const g:Grant={kind:'firma-migration-v1',owner:user.userId,mode:body.mode,expires:Date.now()+3600000,nonce:id()};return Response.json({grant:await seal(g,runtime().TOKEN_ENCRYPTION_KEY),expiresAt:g.expires},{headers});
}catch(e){return responseError(e);}}
export async function GET(req:Request){try{const g=await grant(req);if(g.mode!=='export')throw new AppError('Autorização somente de importação.',403);const media=new URL(req.url).searchParams.get('media');
 if(media){const row=await first('SELECT storage_key,mime FROM media WHERE owner=? AND id=?',g.owner,media)??await first('SELECT avatar_key AS storage_key,mime FROM prisma_templates WHERE owner=? AND id=?',g.owner,media);if(!row)throw new AppError('Mídia não encontrada.',404);const object=await bucket().get(row.storage_key);if(!object)throw new AppError('Arquivo ausente na origem.',409);return new Response(object.body,{headers:{...headers,'Content-Type':'application/octet-stream'}});}
 return Response.json(await exportData(g.owner),{headers});
}catch(e){return responseError(e);}}
export async function PUT(req:Request){try{const g=await grant(req);if(g.mode!=='import')throw new AppError('Autorização somente de exportação.',403);if(await first('SELECT id FROM migration_receipts WHERE owner=?',g.owner))throw new AppError('Importação já concluída.',409);const media=new URL(req.url).searchParams.get('media');if(!media||!/^[0-9a-f-]{36}$/.test(media)||!req.body)throw new AppError('Mídia inválida.');const limit=80*1024*1024;if(Number(req.headers.get('content-length'))>limit)throw new AppError('Limite de 80 MB por arquivo.',413);let size=0;const bounded=req.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>limit)throw new AppError('Limite de 80 MB por arquivo.',413);controller.enqueue(chunk);}}));await bucket().put(`migration/${g.nonce}/${media}`,bounded);return Response.json({ok:true},{headers});}catch(e){return responseError(e);}}
