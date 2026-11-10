import type {Platform} from './domain';
import {config,first,run,runtime,type ProviderConfig} from './server';
import {AppError,hash,randomToken,seal,unseal} from './security';
import {authorizationURL} from './providers';
import {oauthCookie,type OAuthTransaction} from './oauth';

export const linkLifetime = 24 * 60 * 60 * 1000;
const cookieName = '__Host-firma-connect';
export const privateHeaders = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export type ConnectionLinkRow = {id:string;owner:string;platform:Platform;encrypted_token:string;expires_at:number;created_at:number;last_started_at:number;completed_count:number};

export function linkCookie(token:string,expiresAt:number) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((expiresAt-Date.now())/1000))}`;
}
export function readLinkToken(req:Request,provided?:unknown) {
  const value=provided===undefined?(req.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1):provided;
  if(typeof value!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value))throw new AppError('Abra o link completo gerado em Contas conectadas → Conectar em outro dispositivo.',400);
  return value;
}
export async function activeLink(id:string,owner?:string,platform?:Platform) {
  const row=await first<ConnectionLinkRow>('SELECT * FROM connection_links WHERE id=? AND expires_at>?',id,Date.now());
  return row&&(!owner||row.owner===owner)&&(!platform||row.platform===platform)?row:null;
}
export async function describeLink(row:ConnectionLinkRow) {
  const token=await unseal<string>(row.encrypted_token,runtime().TOKEN_ENCRYPTION_KEY);
  return {id:row.id,url:`${runtime().APP_ORIGIN}/connect#${token}`,platform:row.platform,expiresAt:row.expires_at,completedCount:row.completed_count};
}
export async function beginOAuth(owner:string,platform:Platform,c:ProviderConfig,connectionLinkId?:string,insights=false) {
  const state=randomToken(),verifier=randomToken(),browser=randomToken(),stateHash=await hash(state);
  const transaction:OAuthTransaction={verifier,browserHash:await hash(browser),...(connectionLinkId?{connectionLinkId}:{})};
  const redirect=`${runtime().APP_ORIGIN}/api/oauth/${platform}/callback`;
  await run('DELETE FROM oauth_states WHERE expires_at<?',Date.now());
  await run('INSERT INTO oauth_states (id,owner,platform,verifier,redirect_uri,expires_at) VALUES (?,?,?,?,?,?)',stateHash,owner,platform,await seal(transaction,runtime().TOKEN_ENCRYPTION_KEY),redirect,Date.now()+600000);
  return {url:authorizationURL(platform,c,redirect,state,await hash(verifier),insights),cookie:oauthCookie(stateHash,browser)};
}
export async function configuredProvider(owner:string,platform:Platform) {
  const c=await config(owner,platform);
  if(!c?.clientId||!c.clientSecret)throw new AppError('Configure o aplicativo no Firma Social antes de conectar.',400);
  return c;
}
