import {first,bucket} from './server';
import {AppError,hash} from './security';
import {profilePhotoUrl} from './profile-photo';
const limit=1024*1024;
// Private stable copy: signed Instagram CDN links expire and may be blocked by
// the browser. Never forward account/service credentials to an image host.
export async function accountProfileImage(owner:string,id:string){
 const a=await first('SELECT id,profile_picture_url FROM accounts WHERE owner=? AND id=?',owner,id);
 if(!a)throw new AppError('Perfil não encontrado.',404);
 const store=bucket(),key='account-photos/'+owner+'/'+id;
 const saved=await store.get(key),url=profilePhotoUrl(a.profile_picture_url);
 const source=url?await hash(url):null;
 const cached=()=>new Response(saved!.body,{headers:{'Content-Type':saved!.httpMetadata?.contentType??'image/jpeg','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
 if(saved&&saved.customMetadata?.source===source&&Date.now()-Number(saved.customMetadata?.checkedAt)<6*3600000)return cached();
 if(url)try{
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  const mime=response.headers.get('content-type')?.split(';')[0].trim();
  if(!response.ok||!['image/jpeg','image/png','image/webp','image/gif'].includes(mime??'')||Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('Invalid image');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing image');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Image too large');}chunks.push(value);}
  if(!size)throw new Error('Empty image');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  await store.put(key,bytes,{httpMetadata:{contentType:mime!},customMetadata:{source:source!,checkedAt:String(Date.now())}}).catch(()=>{});
  await saved?.body.cancel();
  return new Response(bytes,{headers:{'Content-Type':mime!,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
 }catch{/* Keep the last usable photo when the CDN or authorization is unavailable. */}
 if(saved)return cached();
 throw new AppError('Foto indisponível. Atualize a foto deste perfil.',404);
}
