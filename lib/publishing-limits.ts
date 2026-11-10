import {z} from 'zod';
import {first,list,config,runtime} from './server';
import {AppError,unseal} from './security';
import {api} from './providers';

function nonnegative(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;}
// Read the provider's current account quota. Never infer a fixed allowance,
// refresh credentials, publish content, or change the account connection here.
export async function instagramPublishingLimits(owner:string,accountId:string|null){
 if(!accountId)return {accounts:await list("SELECT id,username FROM accounts WHERE owner=? AND platform='instagram' AND state='connected' ORDER BY username",owner)};
 z.string().uuid().parse(accountId);
 const a=await first("SELECT id,username,provider_id,tokens,expires_at FROM accounts WHERE id=? AND owner=? AND platform='instagram' AND state='connected'",accountId,owner);
 if(!a)throw new AppError('Conta não encontrada.',404);
 if(a.expires_at&&a.expires_at<=Date.now())throw new AppError('A autorização expirou. Reconecte a conta para consultar o limite.',409);
 const c=await config(owner,'instagram');if(!c)throw new AppError('Integração não configurada.',409);
 const tokens=await unseal<{access_token:string}>(a.tokens,runtime().TOKEN_ENCRYPTION_KEY);
 if(typeof tokens.access_token!=='string'||!tokens.access_token)throw new AppError('Autorização indisponível.',409);
 const result=await api(`https://graph.instagram.com/${c.graphVersion??'v26.0'}/${encodeURIComponent(a.provider_id)}/content_publishing_limit?fields=quota_usage,config`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
 const entry=Array.isArray(result.data)?result.data[0]:null;
 const quotaUsage=nonnegative(entry?.quota_usage),quotaTotal=nonnegative(entry?.config?.quota_total),quotaDurationSeconds=nonnegative(entry?.config?.quota_duration);
 return {accountId:a.id,username:a.username,quotaUsage,quotaTotal,quotaDurationSeconds,remaining:quotaUsage!==null&&quotaTotal!==null?Math.max(0,quotaTotal-quotaUsage):null,checkedAt:new Date().toISOString()};
}
