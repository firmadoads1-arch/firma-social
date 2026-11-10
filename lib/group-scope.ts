import {z} from 'zod';
import {first} from './server';
import {AppError} from './security';
export async function groupScope(owner:string,value:unknown):Promise<string|null>{
 if(value==null||value==='')return null;
 const g=z.string().uuid().parse(value);
 if(!await first('SELECT id FROM workspace_groups WHERE owner=? AND id=?',owner,g))throw new AppError('Grupo não encontrado.',404);
 return g;
}
// Historical content follows its accounts only when all destinations belong to the same group.
export function membersGroup(alias:string){return `CASE WHEN json_array_length(${alias}.account_ids)=0 THEN ${alias}.group_id ELSE (SELECT CASE WHEN count(a.group_id)=json_array_length(${alias}.account_ids) AND count(DISTINCT a.group_id)=1 THEN min(a.group_id) END FROM json_each(${alias}.account_ids) x JOIN accounts a ON a.id=x.value AND a.owner=${alias}.owner) END`;}
export async function requireItems(owner:string,group:string|null,table:'accounts'|'media'|'posts'|'rules'|'templates'|'reference_models'|'reference_profiles',ids:string[]){
 if(!group||!ids.length)return;
 const expression=table==='posts'||table==='rules'?membersGroup('t'):'t.group_id';
 const row=await first(`SELECT count(*) n FROM ${table} t WHERE t.owner=? AND ${expression}=? AND t.id IN (SELECT value FROM json_each(?))`,owner,group,JSON.stringify(ids));if(row?.n!==new Set(ids).size)throw new AppError('Um dos itens não pertence a este grupo.',409);
}
