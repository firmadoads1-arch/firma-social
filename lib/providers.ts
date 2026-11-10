import {Platform} from './domain';
import {AppError,seal,unseal,safeHttps} from './security';
import {config,first,list,run,runtime,ProviderConfig} from './server';
import {accountCover} from './editor-defaults';
import {RemoteError,remoteError,type RemoteDiagnostic} from './provider-errors';
export {RemoteError} from './provider-errors';
type Tokens={access_token:string;refresh_token?:string;expires_in?:number;scope?:string};
export async function api(url:string,init:RequestInit={},readOnly=['GET','HEAD'].includes((init.method??'GET').toUpperCase())){
 // Workers supports only follow/manual. Reject redirects explicitly so tokens
 // stay on the intended provider without throwing before the request is sent.
 let response:Response;try{response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(25000)});}catch{throw new RemoteError('network_unknown',!readOnly,readOnly,'temporary');}
 if(response.status>=300&&response.status<400){await response.body?.cancel();throw new RemoteError('unexpected_redirect',!readOnly,false,'provider',{httpStatus:response.status,providerCode:'unexpected_redirect'});}
 const j:any=await response.json().catch(()=>null);
 if(!response.ok||j?.error_type||j?.error&&(typeof j.error!=='object'||j.error.code!=='ok'))throw remoteError(response.status,j,readOnly);
 if(!j||typeof j!=='object')throw new RemoteError('invalid_response',!readOnly,readOnly);
 return j;
}
const form=(obj:Record<string,string>)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(obj)});
// A username is mutable metadata. Never replace the stable account ID, tokens,
// group or cover, and never disconnect a profile because this read failed.
export async function refreshInstagramIdentity(owner:string,accountId:string){
 const a=await first("SELECT * FROM accounts WHERE owner=? AND id=? AND platform='instagram'",owner,accountId);
 if(!a)throw new AppError('Perfil não encontrado.',404);
 if(a.state!=='connected'||!a.tokens||a.expires_at&&a.expires_at<=Date.now())return {accountId,status:'authorization_required',updated:false};
 const c=await config(owner,'instagram');if(!c)throw new AppError('Configure o aplicativo Instagram.');
 const tokens=await unseal<Tokens>(a.tokens,runtime().TOKEN_ENCRYPTION_KEY);
 const raw=await api(`https://graph.instagram.com/${c.graphVersion??'v26.0'}/me?fields=user_id,username`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
 const p=raw.data?.[0]??raw;
 if(String(p.user_id??p.id)!==String(a.provider_id))throw new AppError('A identidade retornada não corresponde ao perfil salvo.',409);
 if(typeof p.username!=='string'||!/^\w[\w.]{0,29}$/.test(p.username))throw new AppError('O Instagram não devolveu um username válido.',502);
 const changed=p.username!==a.username;
 const cover=changed&&!a.cover_media_id?accountCover({username:a.username,coverMediaId:null,groupId:a.group_id},await list("SELECT id,name,mime,size,group_id AS groupId,created_at AS createdAt FROM media WHERE owner=? AND mime='image/jpeg'",owner)):null;
 const result=await run("UPDATE accounts SET username=?,display_name=CASE WHEN display_name=username THEN ? ELSE display_name END,cover_media_id=COALESCE(cover_media_id,?) WHERE owner=? AND id=? AND provider_id=? AND tokens=? AND state='connected'",p.username,p.username,cover?.id??null,owner,a.id,a.provider_id,a.tokens);
 return {accountId:a.id,status:result.meta.changes?'ok':'changed_concurrently',updated:!!result.meta.changes&&changed};
}
export function authorizationURL(platform:Platform,c:ProviderConfig,redirect:string,state:string,challenge:string,insights=false){
 const params:Record<string,string>={redirect_uri:redirect,response_type:'code',state};let base='';
 if(platform==='instagram'){base='https://www.instagram.com/oauth/authorize';Object.assign(params,{client_id:c.clientId,scope:'instagram_business_basic,instagram_business_content_publish'+(insights?',instagram_business_manage_insights':''),enable_fb_login:'0',force_authentication:'1'});}
 if(platform==='youtube'){base='https://accounts.google.com/o/oauth2/v2/auth';Object.assign(params,{client_id:c.clientId,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',access_type:'offline',prompt:'consent',code_challenge:challenge,code_challenge_method:'S256'});}
 if(platform==='tiktok'){base='https://www.tiktok.com/v2/auth/authorize/';Object.assign(params,{client_key:c.clientId,scope:'user.info.basic,video.upload'+(c.reviewed?',video.publish':'')});}
 return base+'?'+new URLSearchParams(params);
}
type OAuthStage = 'token_exchange' | 'token_extension' | 'profile_lookup';
export class OAuthExchangeError extends AppError {
 public reason: string;
 public diagnostic?: RemoteDiagnostic;
 constructor(public stage: OAuthStage, error: unknown) {
  super('Não foi possível concluir a autorização da conta.', 422);
  this.reason = error instanceof RemoteError && error.failure !== 'provider' ? error.failure : stage;
  this.diagnostic = error instanceof RemoteError ? error.diagnostic : undefined;
 }
}
async function oauthStep<T>(stage: OAuthStage, work: () => Promise<T>): Promise<T> {
 try { return await work(); } catch (error) { throw new OAuthExchangeError(stage, error); }
}
export async function exchange(platform:Platform,c:ProviderConfig,code:string,redirect:string,verifier:string){
 let tokens:Tokens;let providerId:string;let username:string;let displayName:string;
 if(platform==='instagram'){
  const short=await oauthStep('token_exchange',async()=>{
   const f=new FormData();Object.entries({client_id:c.clientId,client_secret:c.clientSecret,grant_type:'authorization_code',redirect_uri:redirect,code}).forEach(([k,v])=>f.set(k,v));
   const raw=await api('https://api.instagram.com/oauth/access_token',{method:'POST',body:f});const result=raw.data?.[0]??raw;
   if(typeof result.access_token!=='string'||!result.access_token)throw new AppError('Resposta de autorização inválida.');
   return result;
  });
  tokens=await oauthStep('token_extension',async()=>{
   const result=await api('https://graph.instagram.com/access_token?'+new URLSearchParams({grant_type:'ig_exchange_token',client_secret:c.clientSecret,access_token:short.access_token}));
   if(typeof result.access_token!=='string'||!result.access_token)throw new AppError('Resposta de autorização inválida.');
   return result as Tokens;
  });
  const me=await oauthStep('profile_lookup',async()=>{
   const profile=await api(`https://graph.instagram.com/${c.graphVersion??'v26.0'}/me?fields=user_id,username`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});const result=profile.data?.[0]??profile;
   const profileId=String(result.user_id??result.id??short.user_id);
   if(!profileId||['undefined','null'].includes(profileId)||typeof result.username!=='string'||!result.username)throw new AppError('O Instagram não devolveu uma identidade válida.');
   return {...result,profileId};
  });
  providerId=me.profileId;username=me.username;displayName=me.username;tokens.scope=Array.isArray(short.permissions)?short.permissions.join(','):short.permissions??'instagram_business_basic,instagram_business_content_publish';
 }else if(platform==='youtube'){
  tokens=await api('https://oauth2.googleapis.com/token',form({client_id:c.clientId,client_secret:c.clientSecret,code,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier}));
  const me=await api('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:{Authorization:`Bearer ${tokens.access_token}`}});const ch=me.items?.[0];if(!ch)throw new AppError('Esta conta Google não possui um canal do YouTube.');providerId=ch.id;username=ch.snippet.customUrl??ch.snippet.title;displayName=ch.snippet.title;
 }else{
  tokens=await api('https://open.tiktokapis.com/v2/oauth/token/',form({client_key:c.clientId,client_secret:c.clientSecret,code,redirect_uri:redirect,grant_type:'authorization_code'}));
  const me=await api('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:{Authorization:`Bearer ${tokens.access_token}`}});providerId=me.data.user.open_id;username=me.data.user.display_name;displayName=username;
 }
 if(typeof tokens.access_token!=='string'||!tokens.access_token||typeof providerId!=='string'||!providerId||['undefined','null'].includes(providerId)||typeof username!=='string'||!username)throw new AppError('A plataforma não devolveu uma identidade válida.');return {tokens,providerId,username,displayName};
}
export async function accessToken(account:any):Promise<string>{
 if(account.state!=='connected'||!account.tokens)throw new AppError('Reconecte a conta para publicar.');
 const tokens=await unseal<Tokens>(account.tokens,runtime().TOKEN_ENCRYPTION_KEY);
 if(typeof tokens.access_token!=='string'||!tokens.access_token)throw new AppError('Reconecte a conta para publicar.');
 if(!account.expires_at||account.expires_at>Date.now()+(account.platform==='instagram'?86400000:300000))return tokens.access_token;
 const c=await config(account.owner,account.platform);if(!c)throw new AppError('Configure o aplicativo da plataforma.');
 let refreshed:Tokens;
 try{
  if(account.platform==='instagram'){refreshed=await api('https://graph.instagram.com/refresh_access_token?'+new URLSearchParams({grant_type:'ig_refresh_token',access_token:tokens.access_token}));}
  else if(account.platform==='youtube'){if(!tokens.refresh_token)throw new RemoteError('missing_refresh_token');refreshed=await api('https://oauth2.googleapis.com/token',form({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}));}
  else{if(!tokens.refresh_token)throw new RemoteError('missing_refresh_token');refreshed=await api('https://open.tiktokapis.com/v2/oauth/token/',form({client_key:c.clientId,client_secret:c.clientSecret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}));}
 }catch(error){
  if(error instanceof RemoteError){
   if(error.retryable||error.uncertain||error.code==='429')throw new RemoteError('authorization_temporarily_unavailable',false,true);
   if(['invalid_grant','invalid_token','invalid_access_token','access_token_invalid','access_token_expired','190','102','missing_refresh_token'].includes(error.code)){
    await run("UPDATE accounts SET state='expired' WHERE id=? AND owner=? AND tokens=? AND state='connected'",account.id,account.owner,account.tokens);
    throw new AppError('A autorização venceu ou foi revogada. Reconecte a conta.');
   }
  }
  throw error;
 }
 if(typeof refreshed.access_token!=='string'||!refreshed.access_token||!Number.isFinite(Number(refreshed.expires_in))||Number(refreshed.expires_in)<=0)throw new RemoteError('invalid_refresh_response',false,true);
 const next={...tokens,...refreshed};
 const result=await run("UPDATE accounts SET tokens=?,expires_at=? WHERE id=? AND owner=? AND tokens=? AND state='connected'",await seal(next,runtime().TOKEN_ENCRYPTION_KEY),Date.now()+Number(refreshed.expires_in)*1000,account.id,account.owner,account.tokens);
 if(!result.meta.changes){const current=await first('SELECT * FROM accounts WHERE id=? AND owner=?',account.id,account.owner);if(!current||current.state!=='connected'||!current.tokens)throw new AppError('A conta foi desconectada.');return (await unseal<Tokens>(current.tokens,runtime().TOKEN_ENCRYPTION_KEY)).access_token;}
 return next.access_token;
}
export async function creatorInfo(owner:string,accountId:string){const a=await first("SELECT * FROM accounts WHERE id=? AND owner=? AND platform='tiktok'",accountId,owner);if(!a)throw new AppError('Conta TikTok não encontrada.');const token=await accessToken(a);return (await api('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'},true)).data;}
export function publicMedia(media:any,c:ProviderConfig,platform:Platform){if(!media.public_url)throw new AppError('Adicione uma URL pública à mídia na biblioteca.');const url=safeHttps(media.public_url);if(platform==='tiktok'){if(!c.publicMediaBase)throw new AppError('Configure o prefixo de mídia verificado no TikTok.');const u=new URL(url),b=new URL(c.publicMediaBase);if(u.origin!==b.origin||!u.pathname.startsWith(b.pathname.endsWith('/')?b.pathname:b.pathname+'/'))throw new AppError('A URL não pertence ao prefixo verificado no TikTok.');}return url;}
