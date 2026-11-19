import type {Account} from './domain';
export type AvailabilityResult={status:'available'|'unavailable'|'unknown';reason:string};
export function profileIsRed(account:Pick<Account,'platform'|'username'|'availabilityStatus'|'availabilityUsername'|'availabilityReason'>){
 return account.platform==='instagram'&&account.availabilityStatus==='unavailable'&&account.availabilityReason==='profile_unavailable_confirmed'&&account.availabilityUsername?.toLowerCase()===account.username.replace(/^@/,'').toLowerCase();
}
export function profileIsAvailable(account:Account){return account.platform!=='instagram'||account.availabilityStatus==='available'&&account.availabilityResult==='available'&&['reels_accessible','profile_accessible'].includes(account.availabilityReason??'')&&account.availabilityUsername?.toLowerCase()===account.username.replace(/^@/,'').toLowerCase();}
export function withoutRedProfiles<T extends Account>(accounts:T[]){return accounts.filter(profileIsAvailable);}
const normalize=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[’‘`]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const phrases=["this page isn't available","this page is not available",'esta pagina nao esta disponivel','esta pagina no esta disponible',"cette page n'est pas disponible",'diese seite ist nicht verfugbar','questa pagina non e disponibile','deze pagina is niet beschikbaar','esta pagina no esta disponivel','эта страница недоступна','эта страница сейчас недоступна','このページはご利用いただけません','此页面无法显示','此页面暂时无法显示','이 페이지를 사용할 수 없습니다','هذه الصفحة غير متاحة','bu sayfa kullanılamıyor','halaman ini tidak tersedia','trang nay khong kha dung'];
function decode(s:string){return s.replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(?:amp|apos|quot|nbsp);/g,x=>({'&amp;':'&', '&apos;':"'",'&quot;':'"','&nbsp;':' '}[x]!));}
// A generic HTTP error, OAuth failure, login wall or missing metadata is not
// evidence of the public "page unavailable" screen.
export function classifyPublicProfile(html:string,httpStatus:number,username:string):AvailabilityResult{
 const unknown=(reason:string):AvailabilityResult=>({status:'unknown',reason});
 if(httpStatus===429)return unknown('rate_limited');
 if(httpStatus>=300&&httpStatus<400)return unknown('redirect');
 if(httpStatus===401||httpStatus===403||httpStatus>=500)return unknown('blocked_or_temporary');
 if(httpStatus!==200&&httpStatus!==404&&httpStatus!==410)return unknown('unexpected_response');
 let unavailableRoute=false,restrictedRoute=false;
 const visit=(node:any,depth=0)=>{
  if(!node||typeof node!=='object'||depth>45)return;
  if(node.resource?.__dr==='PolarisErrorRoot.react'&&node.props?.page_type==='PROFILE'){
   const p=node.props;
   if(p.failure_reason||p.restricted_age)restrictedRoute=true;
   else if(p.show_lox_redesigned_404_page===true&&p.page_logging?.name==='httpErrorPage')unavailableRoute=true;
  }
  for(const value of Object.values(node))visit(value,depth+1);
 };
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{visit(JSON.parse(script[1]));}catch{}
 }
 if(restrictedRoute)return unknown('restricted');
 if(unavailableRoute)return {status:'unavailable',reason:'public_unavailable_screen'};
 const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>{
  const attrs:Record<string,string>={};for(const a of m[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[a[1].toLowerCase()]=decode(a[3]);return attrs;
 });
 const ogUrl=meta.find(a=>a.property==='og:url')?.content;
 const ogTitle=meta.find(a=>a.property==='og:title')?.content??'';
 let canonical=false;try{const u=new URL(ogUrl??'');canonical=['www.instagram.com','instagram.com'].includes(u.hostname)&&[username.toLowerCase(),username.toLowerCase()+'/reels'].includes(u.pathname.replace(/^\/|\/$/g,'').toLowerCase());}catch{}
 if(httpStatus===200&&canonical&&ogTitle.toLowerCase().includes('@'+username.toLowerCase()))return {status:'available',reason:'public_profile'};
 const visible=normalize(decode(html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[^]*?-->/g,' ').replace(/<[^>]*>/g,' ')));
 if(phrases.some(p=>visible.includes(normalize(p))))return {status:'unavailable',reason:'public_unavailable_message'};
 return unknown('inconclusive');
}
async function probePublicPage(username:string,reels:boolean):Promise<AvailabilityResult>{
 if(!/^[a-zA-Z0-9_][a-zA-Z0-9_.]{0,29}$/.test(username))return {status:'unknown',reason:'invalid_username'};
 try{
  // Public page only: no account tokens, cookies, proxy or login requests.
  const signal=AbortSignal.timeout(15000);let url='https://www.instagram.com/'+encodeURIComponent(username)+(reels?'/reels/':'/')+'?hl=en';let response:Response|null=null;
  for(let hop=0;hop<4;hop++){
   response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 FirmaSocialProfileCheck/1.0',Accept:'text/html','Accept-Language':'en-US,en;q=0.9'},signal});
   if(response.status<300||response.status>=400)break;
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)return {status:'unknown',reason:'redirect_without_location'};
   let next:URL;try{next=new URL(location,url);}catch{return {status:'unknown',reason:'unexpected_redirect'};}
   if(next.protocol!=='https:'||next.username||next.password||!['www.instagram.com','instagram.com'].includes(next.hostname))return {status:'unknown',reason:'unexpected_redirect:'+next.protocol+':'+next.hostname.slice(0,120)};
   if(/^\/(accounts\/login|challenge|checkpoint|consent)(\/|$)/i.test(next.pathname))return {status:'unknown',reason:'instagram_access_redirect'};
   if(next.pathname.replace(/^\/|\/$/g,'').toLowerCase()!==username.toLowerCase()+(reels?'/reels':''))return {status:'unknown',reason:'redirect_not_reels'};
   url=next.href;if(hop===3)return {status:'unknown',reason:'redirect_loop'};
  }
  if(!response)return {status:'unknown',reason:'inconclusive'};
  if(!response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();return {status:'unknown',reason:'unexpected_response'};}
  const reader=response.body?.getReader();if(!reader)return {status:'unknown',reason:'inconclusive'};
  let size=0,html='';const decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000){await reader.cancel();return {status:'unknown',reason:'response_too_large'};}html+=decoder.decode(part.value,{stream:true});}html+=decoder.decode();}finally{reader.releaseLock();}
  return classifyPublicProfile(html,response.status,username);
 }catch{return {status:'unknown',reason:'network_or_timeout'};}
}
// A transport failure never classifies an account as unavailable. Reels can
// fail on a live profile, so corroborate a negative against the main page.
export async function fetchPublicProfile(username:string):Promise<AvailabilityResult>{
 const reels=await probePublicPage(username,true);
 if(reels.status==='available')return {status:'available',reason:'reels_accessible'};
 if(reels.reason==='rate_limited'||reels.reason==='invalid_username')return {status:'unknown',reason:reels.reason};
 const profile=await probePublicPage(username,false);
 if(profile.status==='available')return {status:'available',reason:'profile_accessible'};
 if(reels.status==='unavailable'&&profile.status==='unavailable')return {status:'unavailable',reason:'profile_unavailable_confirmed'};
 return {status:'unknown',reason:profile.status==='unknown'?profile.reason:reels.reason};
}
export const availabilityMessages:Record<string,string>={available:'Reels acessível. Perfil no ar.',needs_review:'Verificação anterior invalidada. Não confirma indisponibilidade.',unavailable:'Indisponibilidade confirmada nas páginas pública e de Reels.',unknown:'Falha ao ler a página pública. Perfil não confirmado como disponível.'};
