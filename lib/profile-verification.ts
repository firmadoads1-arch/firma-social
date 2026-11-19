import {first,run} from './server';
import {AppError} from './security';
import {fetchPublicProfile} from './profile-availability';
export async function verifyPublicProfile(owner:string,accountId:string){
 const account=await first("SELECT id,username,availability_attempt_at FROM accounts WHERE owner=? AND id=? AND platform='instagram'",owner,accountId);
 if(!account)throw new AppError('Perfil não encontrado.',404);
 const now=Date.now();
 const claimed=await run('UPDATE accounts SET availability_attempt_at=? WHERE owner=? AND id=? AND username=? AND (availability_attempt_at IS NULL OR availability_attempt_at<=?)',now,owner,accountId,account.username,now-60000);
 if(!claimed.meta.changes)throw new AppError('Verificação recente ou em andamento. Aguarde um minuto antes de verificar novamente.',429);
 const result=await fetchPublicProfile(account.username);
 const definitive=result.status!=='unknown';
 const saved=await run(`UPDATE accounts SET availability_result=?,availability_reason=?,availability_status=CASE WHEN ? THEN ? WHEN availability_username=username THEN availability_status ELSE NULL END,availability_checked_at=CASE WHEN ? THEN ? WHEN availability_username=username THEN availability_checked_at ELSE NULL END,availability_username=? WHERE owner=? AND id=? AND username=? AND availability_attempt_at=?`,result.status,result.reason,definitive?1:0,result.status,definitive?1:0,now,account.username,owner,accountId,account.username,now);
 if(!saved.meta.changes)throw new AppError('O perfil mudou durante a verificação. Atualize a lista.',409);
 const fresh=await first('SELECT availability_status AS availabilityStatus,availability_result AS availabilityResult,availability_username AS availabilityUsername,availability_reason AS availabilityReason,availability_checked_at AS availabilityCheckedAt,availability_attempt_at AS availabilityAttemptAt FROM accounts WHERE owner=? AND id=?',owner,accountId);
 return {accountId,...fresh};
}

// Explicit, owner-scoped repair of classifications produced by the old rule.
// It does not label accounts available, alter tokens or affect deliveries.
export async function repairLegacyVerificationFlags(owner:string){
 const result=await run("UPDATE accounts SET availability_status=NULL,availability_result='unknown',availability_checked_at=NULL WHERE owner=? AND platform='instagram' AND availability_status IN ('needs_review','unavailable') AND COALESCE(availability_reason,'')<>'profile_unavailable_confirmed'",owner);
 return {cleared:result.meta.changes??0};
}
