import {database,runtime} from './server';
import {AppError,id,seal} from './security';
import type {Grant} from './migration';

// Incremental import never updates an existing connection or any publishing data.
export async function importAccounts(g:Grant,backup:any){
 if(g.mode!=='import')throw new AppError('Autorização somente de exportação.',403);
 const rows=backup?.data?.accounts;
 if(backup?.format!=='firma-portable-v1'||!Array.isArray(rows)||rows.length>1000)throw new AppError('Backup de contas inválido.');
 const seen=new Set<string>();
 for(const row of rows){
  if(!row||row.platform!=='instagram'||typeof row.provider_id!=='string'||!/^\d{1,40}$/.test(row.provider_id)||seen.has(row.provider_id))throw new AppError('Identidade de conta inválida ou duplicada.');
  seen.add(row.provider_id);
  for(const key of ['username','display_name','scopes','state'])if(typeof row[key]!=='string'||row[key].length>10000)throw new AppError('Dados de conta inválidos.');
  if(!['connected','disconnected','expired','error'].includes(row.state)||!Number.isSafeInteger(row.created_at)||(row.expires_at!==null&&!Number.isSafeInteger(row.expires_at)))throw new AppError('Estado de conta inválido.');
  if(row.tokens!==''&&(!row.tokens||typeof row.tokens!=='object'||Array.isArray(row.tokens)||typeof row.tokens.access_token!=='string'||!row.tokens.access_token))throw new AppError('Credenciais de conta inválidas.');
  if(row.state==='connected'&&!row.tokens)throw new AppError('Conta conectada sem credenciais.');
 }
 if(!rows.length)return {ok:true,imported:0,skipped:0};
 const statements=[];
 for(const row of rows){
  const tokens=row.tokens?await seal(row.tokens,runtime().TOKEN_ENCRYPTION_KEY):'';
  statements.push(database().prepare(`INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at,group_id,cover_media_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,NULL) ON CONFLICT(owner,platform,provider_id) DO NOTHING`).bind(id(),g.owner,row.platform,row.provider_id,row.username,row.display_name,tokens,row.expires_at,row.scopes,row.state,row.created_at));
 }
 const result=await database().batch(statements);
 const imported=result.reduce((n,r)=>n+Number(r.meta.changes??0),0);
 return {ok:true,imported,skipped:rows.length-imported};
}
