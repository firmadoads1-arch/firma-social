import {coverForDelivery} from './editor-defaults';
import {AppError,seal,unseal,safeHttps} from './security';
import {runtime,first,bucket} from './server';

type MediaGrant={kind:'firma-media-v1';owner:string;mediaId:string;deliveryId:string;expires:number};
// Created when sending, not when scheduling: the provider gets a fresh URL.
export async function instagramMediaURL(media:any,delivery:any){
 const grant:MediaGrant={kind:'firma-media-v1',owner:delivery.owner,mediaId:media.id,deliveryId:delivery.id,expires:Date.now()+86400000};
 const origin=new URL(safeHttps(runtime().APP_ORIGIN)).origin;
 return origin+'/api/publish-media/'+await seal(grant,runtime().TOKEN_ENCRYPTION_KEY);
}
export async function deliverMedia(req:Request,token:string){
 let g:MediaGrant;
 try{if(token.length>2000||token.split('.').length!==2)throw Error();g=await unseal<MediaGrant>(token,runtime().TOKEN_ENCRYPTION_KEY);}catch{throw new AppError('Link de mídia inválido ou vencido.',404);}
 if(g.kind!=='firma-media-v1'||!Number.isFinite(g.expires)||g.expires<=Date.now())throw new AppError('Link de mídia inválido ou vencido.',404);
 const delivery=await first(`SELECT d.account_id,p.media_ids,p.options,p.format FROM deliveries d JOIN posts p ON p.id=d.post_id AND p.owner=d.owner JOIN accounts a ON a.id=d.account_id AND a.owner=d.owner
 WHERE d.id=? AND d.owner=? AND d.platform='instagram' AND a.state='connected' AND d.status IN ('working','processing','published','uncertain') AND p.status NOT IN ('draft','pending_approval','cancelled','failed')`,g.deliveryId,g.owner);
 if(!delivery)throw new AppError('Link de mídia indisponível.',404);
 const ids=JSON.parse(delivery.media_ids),options=JSON.parse(delivery.options);
 if(!ids.includes(g.mediaId)&&!(delivery.format==='video'&&coverForDelivery(options,delivery.account_id)===g.mediaId))throw new AppError('Link de mídia indisponível.',404);
 const media=await first('SELECT * FROM media WHERE id=? AND owner=?',g.mediaId,g.owner);
 if(!media)throw new AppError('Arquivo não encontrado.',404);
 const meta=await bucket().head(media.storage_key);if(!meta)throw new AppError('Arquivo não encontrado.',404);
 const headers=new Headers({'Content-Type':media.mime,'Content-Length':String(meta.size),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'});
 let range:{offset:number;length:number}|undefined;
 const raw=req.headers.get('range');
 if(raw&&req.method!=='HEAD'){
  const m=/^bytes=(\d*)-(\d*)$/.exec(raw);let start=0,end=meta.size-1;
  if(m&&(m[1]||m[2])){if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}else start=Math.max(0,meta.size-Number(m[2]));}
  if(!m||(!m[1]&&!m[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=meta.size){headers.set('Content-Range',`bytes */${meta.size}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  range={offset:start,length:end-start+1};headers.set('Content-Range',`bytes ${start}-${end}/${meta.size}`);headers.set('Content-Length',String(range.length));
 }
 if(req.method==='HEAD')return new Response(null,{headers});
 const object=await bucket().get(media.storage_key,range?{range}:undefined);if(!object)throw new AppError('Arquivo não encontrado.',404);
 return new Response(object.body,{status:range?206:200,headers});
}
