// Standalone Cloudflare deployments: trust only a signed Access application JWT.
export async function accessIdentity(token:string|null,issuer:string,audience:string){
 if(!token||token.length>16000||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience)return null;
 try{const parts=token.split('.');if(parts.length!==3)return null;const bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));const decode=(s:string)=>JSON.parse(new TextDecoder().decode(bytes(s)));
 const header=decode(parts[0]),p=decode(parts[1]);if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
 const now=Date.now()/1000;if(p.iss!==issuer||!Array.isArray(p.aud)||!p.aud.includes(audience)||typeof p.exp!=='number'||p.exp<=now||typeof p.iat!=='number'||p.iat>now+30||(p.nbf&&p.nbf>now+30)||p.type!=='app'||typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email)return null;
 const response=await fetch(issuer+'/cdn-cgi/access/certs',{redirect:'manual',signal:AbortSignal.timeout(10000)});if(!response.ok)return null;const jwks:any=await response.json();const jwk=jwks.keys?.find((k:any)=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
 return {userId:'access:'+p.sub,email:p.email,displayName:p.email,fullName:null};
 }catch{return null;}
}
