// Same representation for a database row and the dashboard's parsed rule.
// This is an optimistic edit precondition, never an authorization credential.
export function ruleEditToken(r:any):string {
 const array=(v:any)=>typeof v==='string'?JSON.parse(v):v;
 return JSON.stringify([r.name,r.mode??'draft',r.time,array(r.weekdays),array(r.account_ids??r.accountIds),r.mode==='folder_reel'?null:array(r.media_ids??r.mediaIds),r.caption,!!r.active,r.starts_on??null,r.approved_at??null,r.group_id??null]);
}
export const ruleEditNotice='Envios já iniciados mantêm a configuração anterior. Agendamentos ainda não iniciados serão substituídos. A rotina mantém seu estado ativo ou pausado.';
