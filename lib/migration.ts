import {database,bucket,list,first,runtime} from './server';
import {AppError,seal,unseal} from './security';
export const tables=['workspaces','accounts','provider_configs','media','posts','deliveries','templates','rules','events','reference_profiles','reference_models','analytics_media','analytics_sync','workspace_groups','publish_batches','geo_grants','prisma_projects','prisma_files','prisma_templates','prisma_experiments'] as const;
export type Grant={kind:'firma-migration-v1';owner:string;mode:'export'|'import';expires:number;nonce:string};
export async function grant(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token||token.length>4096||request.headers.has('origin'))throw new AppError('Use a ferramenta de migração com a autorização temporária.',403);
 let g:Grant;try{g=await unseal<Grant>(token,runtime().TOKEN_ENCRYPTION_KEY);}catch{throw new AppError('Autorização inválida.',403);}
 if(!g||g.kind!=='firma-migration-v1'||!['export','import'].includes(g.mode)||typeof g.owner!=='string'||!g.owner||typeof g.nonce!=='string'||!/^[0-9a-f-]{36}$/.test(g.nonce)||!Number.isFinite(g.expires)||g.expires<=Date.now())throw new AppError('Autorização vencida.',403);
 return g;
}
export async function exportData(owner:string){
 const result=await database().batch(tables.map(t=>database().prepare(`SELECT * FROM ${t} WHERE owner=? LIMIT 5001`).bind(owner)));
 const data:Record<string,any[]>={};tables.forEach((t,i)=>data[t]=result[i].results as any[]);
 data.prisma_files=data.prisma_files.filter(p=>data.media.some(m=>m.id===p.id));
 // Include private template photos in the same encrypted portable media transfer.
 for(const t of data.prisma_templates)if(!data.media.some(m=>m.storage_key===t.avatar_key)){if(data.media.some(m=>m.id===t.id))throw new AppError('Identificador de foto duplicado no backup.');data.media.push({id:t.id,owner,group_id:null,name:'Modelo Prisma '+t.handle+'.jpg',mime:t.mime,size:t.size,storage_key:t.avatar_key,width:null,height:null,duration:null,folder:'Prisma / Modelos',public_url:null,created_at:t.created});}
 if(Object.values(data).reduce((n,rows)=>n+rows.length,0)>5000)throw new AppError('Este backup excede o limite de 5.000 registros.');
 if(data.deliveries.some(d=>['working','processing'].includes(d.status)))throw new AppError('Aguarde os envios em processamento antes de exportar.',409);
 for(const a of data.accounts)if(a.tokens)a.tokens=await unseal(a.tokens,runtime().TOKEN_ENCRYPTION_KEY);
 for(const c of [...data.provider_configs,...data.geo_grants])c.encrypted=await unseal(c.encrypted,runtime().TOKEN_ENCRYPTION_KEY);
 for(const d of data.deliveries)d.context=d.context==='{}'?{}:await unseal(d.context,runtime().TOKEN_ENCRYPTION_KEY);
 const resultData={format:'firma-portable-v1',exportedAt:new Date().toISOString(),origin:runtime().APP_ORIGIN,data};if(new TextEncoder().encode(JSON.stringify(resultData)).length>10000000)throw new AppError('Os dados do backup excedem 10 MB.');return resultData;
}
export async function restoreData(g:Grant,backup:any){
 if(backup?.format!=='firma-portable-v1'||!backup.data)throw new AppError('Formato de backup inválido.');
 const data=backup.data;let count=0;
 // Backups made before Insights remain valid; new backups retain the latest
 // measurement of every captured post/Story, including expired Stories.
 for(const t of ['analytics_media','analytics_sync','workspace_groups','publish_batches','geo_grants','prisma_projects','prisma_files','prisma_templates','prisma_experiments'])if(data[t]===undefined)data[t]=[];
 for(const t of tables){if(!Array.isArray(data[t]))throw new AppError('Backup incompleto: '+t);count+=data[t].length;}
 if(count>5000||data.workspaces.length!==1)throw new AppError('Backup excede 5.000 registros ou contém workspace inválido.');
 const columns:Record<string,string[]>={};const schema:Record<string,any[]>={};
 for(const t of tables){schema[t]=await list(`PRAGMA table_info(${t})`);columns[t]=schema[t].map(c=>c.name);}
 for(const t of tables)for(const row of data[t]){
  if(row&&typeof row==='object')for(const key of ['group_id','cover_media_id','batch_id','batch_position'])if(columns[t].includes(key)&&!(key in row))row[key]=null;
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==columns[t].length||Object.keys(row).some(k=>!columns[t].includes(k)))throw new AppError('Schema incompatível: '+t);
  if(t!=='workspaces'&&(typeof row.id!=='string'||!/^[0-9a-f-]{36}$/.test(row.id)))throw new AppError('Identificador inválido.');
  for(const col of schema[t]){const value=row[col.name];const protectedObject=(t==='accounts'&&col.name==='tokens'&&value!=='')||((t==='provider_configs'||t==='geo_grants')&&col.name==='encrypted')||(t==='deliveries'&&col.name==='context');if(protectedObject){if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Credenciais ou histórico inválidos.');}else if(value===null){if(col.notnull)throw new AppError('Campo obrigatório ausente.');}else if(col.type.toUpperCase()==='TEXT'?typeof value!=='string':typeof value!=='number'||!Number.isFinite(value))throw new AppError('Tipo inválido no backup.');}
  row.owner=g.owner;
 }
 const ids=(t:string)=>new Set(data[t].map((r:any)=>r.id));
 const accounts=ids('accounts'),media=ids('media'),posts=ids('posts'),refs=ids('reference_profiles');
 const groups=ids('workspace_groups'),batches=ids('publish_batches');for(const t of tables)for(const row of data[t]){if(row.group_id&&!groups.has(row.group_id)||row.cover_media_id&&!media.has(row.cover_media_id)||row.batch_id&&!batches.has(row.batch_id))throw new AppError('Grupo, capa ou lote ausente no backup.');}
 for(const b of data.publish_batches)if(!accounts.has(b.account_id))throw new AppError('Perfil do lote ausente no backup.');for(const g of data.geo_grants)if(!accounts.has(g.id))throw new AppError('Perfil da Página ausente no backup.');
 const checkList=(raw:string,allowed:Set<unknown>)=>{let values;try{values=JSON.parse(raw);}catch{throw new AppError('Referência inválida.');}if(!Array.isArray(values)||values.some(v=>!allowed.has(v)))throw new AppError('Referência fora do backup.');};
 for(const p of [...data.posts,...data.rules]){checkList(p.account_ids,accounts);checkList(p.media_ids,media);}for(const p of data.posts){let options;try{options=JSON.parse(p.options);}catch{throw new AppError('Opções inválidas.');}for(const [aid,mid] of Object.entries(options.instagramAccountCovers??{}))if(!accounts.has(aid)||!media.has(mid))throw new AppError('Capa de perfil ausente no backup.');if(options.instagramCoverMediaId&&!media.has(options.instagramCoverMediaId))throw new AppError('Capa do Reel ausente no backup.');}
 for(const d of data.deliveries)if(!accounts.has(d.account_id)||!posts.has(d.post_id))throw new AppError('Entrega sem destino no backup.');
 for(const m of data.reference_models)if(m.reference_id&&!refs.has(m.reference_id))throw new AppError('Modelo sem referência no backup.');
 for(const m of data.analytics_media)if(!accounts.has(m.account_id))throw new AppError('Métrica sem conta no backup.');
 for(const s of data.analytics_sync){if(!accounts.has(s.id))throw new AppError('Coleta sem conta no backup.');s.lease=null;s.lease_until=null;s.next_sync_at=0;s.status='waiting';s.feed_cursor=null;s.story_cursor=null;s.cycle_started_at=null;}
 for(const a of data.accounts)if(a.tokens)a.tokens=await seal(a.tokens,runtime().TOKEN_ENCRYPTION_KEY);
 for(const c of [...data.provider_configs,...data.geo_grants])c.encrypted=await seal(c.encrypted,runtime().TOKEN_ENCRYPTION_KEY);
 for(const d of data.deliveries)d.context=Object.keys(d.context).length?await seal(d.context,runtime().TOKEN_ENCRYPTION_KEY):'{}';
 const projectIds=ids('prisma_projects');for(const p of [...data.prisma_files,...data.prisma_experiments])if(!projectIds.has(p.project_id))throw new AppError('Projeto Prisma ausente no backup.');for(const p of data.prisma_files)if(!media.has(p.id))throw new AppError('Arquivo Prisma ausente no backup.');
 const originalKeys=new Map(data.media.map((m:any)=>[m.storage_key,m.id]));for(const t of data.prisma_templates){const mid=originalKeys.get(t.avatar_key);if(!mid)throw new AppError('Foto do modelo Prisma ausente no backup.');t.avatar_key=`migration/${g.nonce}/${mid}`;}
 for(const m of data.media){m.storage_key=`migration/${g.nonce}/${m.id}`;const object=await bucket().head(m.storage_key);if(!object||object.size!==m.size)throw new AppError('Transfira todas as mídias antes de restaurar os dados.');}
 for(const p of data.posts)if(['scheduled','publishing'].includes(p.status)){p.status='pending_approval';p.write_token='';p.version++;}
 for(const d of data.deliveries)if(['pending','working','processing'].includes(d.status)){d.status='cancelled';d.lease=null;d.lease_until=null;d.error='Importado: revise o conteúdo antes de reagendar.';}
 for(const r of data.rules)r.active=0;
 const empty=tables.filter(t=>t!=='workspaces').map(t=>`NOT EXISTS(SELECT 1 FROM ${t} WHERE owner=?)`).join(' AND ');
 const statements=[database().prepare(`INSERT INTO migration_receipts(owner,id,created_at) SELECT ?,?,? WHERE ${empty}`).bind(g.owner,g.nonce,Date.now(),...tables.filter(t=>t!=='workspaces').map(()=>g.owner))];
 const guard='EXISTS(SELECT 1 FROM migration_receipts WHERE owner=? AND id=?)';
 statements.push(database().prepare(`DELETE FROM workspaces WHERE owner=? AND ${guard}`).bind(g.owner,g.owner,g.nonce));
 for(const t of tables)for(let i=0;i<data[t].length;i+=25){
  const cols=columns[t];const rows=data[t].slice(i,i+25);
  statements.push(database().prepare(`INSERT INTO ${t} (${cols.join(',')}) SELECT ${cols.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE ${guard}`).bind(JSON.stringify(rows),g.owner,g.nonce));
 }
 const result=await database().batch(statements);
 if(!result[0].meta.changes)throw new AppError('Restaure em um workspace vazio. Nenhum dado foi substituído.',409);
 return {ok:true,accounts:data.accounts.length,media:data.media.length,records:count};
}
