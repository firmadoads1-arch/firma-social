import {groupScope,membersGroup} from './group-scope';
import {accountCover} from './editor-defaults';
import {schedulerEnabled,schedulerHealth,type SchedulerConfig} from './scheduler';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getWorkspaceUser} from './workspace-access';
import {AppError,id,unseal} from './security';
import {platforms,Platform,AppState} from './domain';
export const runtime=()=>env as Cloudflare.Env & SchedulerConfig & {TOKEN_ENCRYPTION_KEY:string;SCHEDULER_ENABLED?:string;APP_ORIGIN:string};
export function database(){if(!env.DB)throw new AppError('Banco de dados indisponível.',503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError('Biblioteca indisponível.',503);return env.BUCKET;}
export async function currentUser(){const u=await getWorkspaceUser();if(!u)throw new AppError('Entre para acessar seu workspace.',401);return u;}
export async function protectedUser(){const u=await getChatGPTUser();const settings=runtime() as unknown as Record<string,string>;if(!u)throw new AppError('Esta operação protege conexões e credenciais e exige o proprietário autenticado.',401);if(settings.PUBLIC_WORKSPACE_ENABLED==='true'&&settings.RUNNER_OWNER_ID!==u.userId)throw new AppError('Somente o proprietário pode alterar conexões e credenciais.',403);return u;}
export async function list<T=any>(sql:string,...args:any[]):Promise<T[]>{return (await database().prepare(sql).bind(...args).all()).results as T[];}
export async function first<T=any>(sql:string,...args:any[]):Promise<T|null>{return database().prepare(sql).bind(...args).first<T>();}
export async function run(sql:string,...args:any[]){return database().prepare(sql).bind(...args).run();}
export async function event(owner:string,title:string,detail='',postId:string|null=null){await run('INSERT INTO events (id,owner,title,detail,post_id,created_at) VALUES (?,?,?,?,?,?)',id(),owner,title,detail.slice(0,500),postId,Date.now());}
export async function workspace(owner:string){await run('INSERT OR IGNORE INTO workspaces (owner,name,timezone,created_at) VALUES (?,?,?,?)',owner,'Firma Social','America/Sao_Paulo',Date.now());return first('SELECT name,timezone FROM workspaces WHERE owner=?',owner);}
export type ProviderConfig={clientId:string;clientSecret:string;publicMediaBase?:string;reviewed?:boolean;graphVersion?:string};
export async function config(owner:string,platform:Platform):Promise<ProviderConfig|null>{const row=await first('SELECT encrypted FROM provider_configs WHERE owner=? AND platform=?',owner,platform);return row?unseal<ProviderConfig>(row.encrypted,runtime().TOKEN_ENCRYPTION_KEY):null;}
export function postRow(row:any){return {id:row.id,title:row.title,caption:row.caption,format:row.format,status:row.status,version:row.version,groupId:row.group_id,batchId:row.batch_id,batchPosition:row.batch_position,accountIds:JSON.parse(row.account_ids),mediaIds:JSON.parse(row.media_ids),platforms:JSON.parse(row.platforms),captions:JSON.parse(row.captions),options:JSON.parse(row.options),scheduledAt:row.scheduled_at,createdAt:row.created_at,updatedAt:row.updated_at};}
export async function state(owner:string,userName:string,requested:string|null=null):Promise<AppState>{
 const groupId=await groupScope(owner,requested),args=groupId?[owner,groupId]:[owner],where=(x:string)=>groupId?' AND '+x+'=?':'';
 const ws=await workspace(owner);const [m,p,a,d,t,r,e,rp,rm,groups]=await Promise.all([
 list('SELECT id,name,group_id AS groupId,mime,size,width,height,duration,folder,public_url as publicUrl,created_at as createdAt FROM media WHERE owner=?'+where('group_id')+' ORDER BY created_at DESC',...args),
 list('SELECT p.* FROM posts p WHERE p.owner=?'+where(membersGroup('p'))+' ORDER BY p.updated_at DESC LIMIT 1000',...args),
 list('SELECT a.id,a.group_id AS groupId,a.cover_media_id AS coverMediaId,EXISTS(SELECT 1 FROM geo_grants g WHERE g.id=a.id AND g.owner=a.owner) AS nativeLocation,a.platform,a.username,a.display_name as displayName,a.state,a.expires_at as expiresAt FROM accounts a WHERE a.owner=?'+where('a.group_id')+' ORDER BY a.created_at DESC',...args),
 list('SELECT d.id,d.post_id as postId,d.account_id as accountId,d.platform,d.status,d.remote_id as remoteId,d.error,d.updated_at as updatedAt FROM deliveries d JOIN accounts a ON a.id=d.account_id AND a.owner=d.owner WHERE d.owner=?'+where('a.group_id')+' ORDER BY d.created_at DESC LIMIT 2000',...args),
 list('SELECT id,name,caption FROM templates WHERE owner=?'+where('group_id')+' ORDER BY created_at DESC',...args),
 list('SELECT r.* FROM rules r WHERE r.owner=?'+where(membersGroup('r'))+' ORDER BY r.created_at DESC',...args),
 list('SELECT e.id,e.title,e.detail,e.created_at as createdAt FROM events e '+(groupId?'JOIN posts p ON p.id=e.post_id AND p.owner=e.owner ':'')+'WHERE e.owner=?'+where(membersGroup('p'))+' ORDER BY e.created_at DESC LIMIT 40',...args),
 list('SELECT id,platform,handle,display_name as displayName,kind,niche,notes,favorite,version,created_at as createdAt,updated_at as updatedAt FROM reference_profiles WHERE owner=?'+where('group_id')+' ORDER BY favorite DESC,updated_at DESC',...args),
 list('SELECT id,reference_id as referenceId,platform,title,niche,source_url as sourceUrl,format,hook,outline,caption,favorite,version,created_at as createdAt,updated_at as updatedAt FROM reference_models WHERE owner=?'+where('group_id')+' ORDER BY favorite DESC,updated_at DESC',...args),
 list('SELECT id,name FROM workspace_groups WHERE owner=? ORDER BY name COLLATE NOCASE',owner)]);
 const covers=groupId?await list("SELECT id,name,mime,size,group_id AS groupId,created_at AS createdAt FROM media WHERE owner=? AND mime='image/jpeg' AND (group_id IS NULL OR group_id=? OR id IN (SELECT cover_media_id FROM accounts WHERE owner=? AND group_id=?))",owner,groupId,owner,groupId):m.filter(x=>x.mime==='image/jpeg');
 for(const acct of a){const cover=accountCover(acct,covers);acct.resolvedCoverId=cover?.id??null;acct.resolvedCoverName=cover?.name??null;acct.nativeLocation=!!acct.nativeLocation;}
 // Media already attached to a scoped item remains available to that item, without appearing in the group's library picker.
 const referenceMedia:any[]=[];if(groupId){const have=new Set(m.map(x=>x.id));const ids=new Set<string>();for(const row of [...p,...r]){for(const key of JSON.parse(row.media_ids))if(!have.has(key))ids.add(key);const o=JSON.parse(row.options??'{}');for(const key of [o.instagramCoverMediaId,...Object.values(o.instagramAccountCovers??{})])if(typeof key==='string'&&!have.has(key))ids.add(key);}if(ids.size)referenceMedia.push(...await list('SELECT id,name,group_id AS groupId,mime,size,width,height,duration,folder,public_url AS publicUrl,created_at AS createdAt FROM media WHERE owner=? AND id IN (SELECT value FROM json_each(?))',owner,JSON.stringify([...ids])));}
 const providers={} as AppState['providers'];for(const platform of platforms){const c=await config(owner,platform);providers[platform]={configured:!!(c?.clientId&&c?.clientSecret),clientId:c?.clientId??'',publicMediaBase:c?.publicMediaBase??'',reviewed:c?.reviewed??false,callback:`${runtime().APP_ORIGIN}/api/oauth/${platform}/callback`};}
 const automaticRun=await first('SELECT checked_at FROM runner_status WHERE owner=?','service:'+owner);const enabled=schedulerEnabled(owner,runtime());const delayed=p.filter(x=>['scheduled','publishing'].includes(x.status)&&x.scheduled_at&&x.scheduled_at<Date.now()-(enabled?75:0)*60000).length;
 return {groupId,groups,referenceMedia,referenceProfiles:rp.map(x=>({...x,favorite:!!x.favorite})),referenceModels:rm.map(x=>({...x,favorite:!!x.favorite})),workspace:ws,media:m,posts:p.map(postRow),accounts:a,deliveries:d,templates:t,rules:r.map(x=>({...x,weekdays:JSON.parse(x.weekdays),accountIds:JSON.parse(x.account_ids),mediaIds:JSON.parse(x.media_ids),active:!!x.active})),events:e,providers,scheduler:schedulerHealth(enabled,automaticRun?.checked_at??null,delayed),userName,publicWorkspace:(runtime() as unknown as Record<string,string>).PUBLIC_WORKSPACE_ENABLED==='true'};
}
export function responseError(error:unknown){if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});if(error&&typeof error==='object'&&'issues'in error)return Response.json({error:(error as any).issues[0]?.message??'Dados inválidos.'},{status:400});console.error('Application operation failed:',error instanceof Error?error.name:'Unknown');return Response.json({error:'Não foi possível concluir. Tente novamente.'},{status:500});}
