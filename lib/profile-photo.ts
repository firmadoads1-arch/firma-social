// Render only HTTPS images returned from Meta's image hosts. Never token URLs.
export function profilePhotoUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>8192)return null;
 try{const u=new URL(value);const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.searchParams.has('access_token'))return null;
  if(!['cdninstagram.com','fbcdn.net'].some(d=>host===d||host.endsWith('.'+d)))return null;
  return u.href;
 }catch{return null;}
}
