import {database,event} from './server';
import {AppError} from './security';
import {ruleEditToken} from './rule-config';

// Compare and replace configuration in the same transaction that retires only
// wholly untouched occurrences. A queue claim and an edit cannot both win.
export async function updateRule(prior:any,expected:unknown,changes:{name:string;time:string;weekdays:string;account_ids:string;media_ids:string;caption:string;starts_on:string|null}) {
 if(typeof expected!=='string'||expected!==ruleEditToken(prior))throw new AppError('A rotina mudou. Feche a edição e abra novamente antes de salvar.',409);
 const db=database(),now=Date.now(),revision=Math.max(now,(prior.approved_at??0)+1),fields=['name','time','weekdays','account_ids','media_ids','caption','starts_on'] as const;
 const guard='EXISTS(SELECT 1 FROM rules r WHERE r.id=? AND r.owner=? AND r.approved_at=?)';
 const sql=db.prepare(`UPDATE rules SET ${fields.map(f=>f+'=?').join(',')},approved_at=? WHERE id=? AND owner=? AND mode=? AND name=? AND time=? AND weekdays=? AND account_ids=? AND (mode='folder_reel' OR media_ids=?) AND caption=? AND active=? AND starts_on IS ? AND approved_at IS ? AND group_id IS ?`).bind(...fields.map(f=>changes[f]),revision,prior.id,prior.owner,prior.mode,prior.name,prior.time,prior.weekdays,prior.account_ids,prior.media_ids,prior.caption,prior.active,prior.starts_on,prior.approved_at,prior.group_id);
 const statements=[sql];
 if(['folder_reel','daily_story'].includes(prior.mode)){
  const field=prior.mode==='folder_reel'?'folderReelRule':'dailyStoryRule';
  const untouched=`owner=? AND status='scheduled' AND json_extract(options,'$.${field}')=? AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.owner=posts.owner AND d.post_id=posts.id AND (d.status NOT IN ('pending','cancelled') OR d.attempts>0 OR d.context<>'{}'))`;
  // Mark the post first; claims always require a scheduled/publishing post.
  statements.push(db.prepare(`UPDATE posts SET status='cancelled',updated_at=?,recurrence_key=recurrence_key||':edited:'||? WHERE ${untouched} AND ${guard}`).bind(now,String(revision),prior.owner,prior.id,prior.id,prior.owner,revision));
  statements.push(db.prepare(`UPDATE deliveries SET status='cancelled',error='Agendamento substituído pela edição da rotina.',updated_at=? WHERE owner=? AND status='pending' AND post_id IN(SELECT id FROM posts WHERE owner=? AND status='cancelled' AND json_extract(options,'$.${field}')=? AND recurrence_key LIKE ?) AND ${guard}`).bind(now,prior.owner,prior.owner,prior.id,'%:edited:'+revision,prior.id,prior.owner,revision));
 }
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw new AppError('A rotina mudou durante a edição. Abra novamente antes de salvar.',409);
 await event(prior.owner,'Rotina atualizada',changes.name+' · alterações para os próximos envios.');
 return revision;
}
