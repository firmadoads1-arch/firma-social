export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export const id=()=>crypto.randomUUID();
export function base64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export const randomToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function hash(s:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));}
async function key(secret:string){if(!secret||secret.length<32)throw new AppError('A proteção das credenciais ainda não foi configurada.',503);return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(value:unknown,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(JSON.stringify(value)));return base64url(iv)+'.'+base64url(new Uint8Array(data));}
export async function unseal<T>(value:string,secret:string):Promise<T>{const decode=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));const [iv,data]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await key(secret),decode(data))));}
export function assertSameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new AppError('Requisição de outra origem recusada.',403);}
export function safeHttps(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw new AppError('Use uma URL HTTPS pública válida.');}
 const host=u.hostname.replace(/\.$/,'');
 const privateIPv4=/^(0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host);
 if(u.protocol!=='https:'||u.username||u.password||!host.includes('.')||host.endsWith('.localhost')||host.endsWith('.local')||privateIPv4||host.includes(':'))throw new AppError('Use uma URL HTTPS pública válida.');return u.toString();
}
