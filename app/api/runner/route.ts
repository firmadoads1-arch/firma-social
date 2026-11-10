import {getWorkspaceUser} from '@/lib/workspace-access';
import {responseError,first} from '@/lib/server';
import {assertSameOrigin} from '@/lib/security';
import {serviceOwner} from '@/lib/runner-auth';
import {batchCooldownUntil,earlierBatchPending,processQueue} from '@/lib/queue';
import {instagramPublishingLimits} from '@/lib/publishing-limits';
export async function POST(req:Request){try{const user=req.headers.get('x-firma-service')==='queue-v1'?null:await getWorkspaceUser();if(user){assertSameOrigin(req);return Response.json(await processQueue(user.userId),{headers:{'Cache-Control':'no-store'}});}
 const owner=await serviceOwner(req);return Response.json(await processQueue(owner,'service'),{headers:{'Cache-Control':'no-store'}});}catch(e){return responseError(e);}}

export async function GET(req:Request){try{const user=req.headers.get('x-firma-service')==='queue-v1'?null:await getWorkspaceUser();const owner=user?.userId??await serviceOwner(req);const key=user?owner:'service:'+owner;
 const params=new URL(req.url).searchParams;if(params.get('limits')==='instagram')return Response.json(await instagramPublishingLimits(owner,params.get('accountId')),{headers:{'Cache-Control':'no-store'}});
 const lastRun=await first('SELECT checked_at as checkedAt,processed,drafted FROM runner_status WHERE owner=?',key);
 const queue=await first(`WITH work AS (
 SELECT d.status,p.batch_id,MAX(d.next_run,CASE WHEN p.batch_id IS NULL THEN 0 ELSE ${batchCooldownUntil('d','p')} END) AS eligible,
 CASE WHEN p.batch_id IS NOT NULL THEN ${earlierBatchPending('p')} ELSE 0 END AS blocked
 FROM deliveries d JOIN posts p ON p.id=d.post_id AND p.owner=d.owner WHERE d.owner=? AND d.status IN ('pending','processing') AND p.status IN ('scheduled','publishing'))
 SELECT SUM(status='pending') pending,SUM(status='processing') processing,MIN(CASE WHEN NOT blocked THEN eligible END) nextCheckAt,SUM(CASE WHEN batch_id IS NOT NULL AND NOT blocked AND eligible<=? THEN 1 ELSE 0 END) batchSoon FROM work`,owner,Date.now()+61000);
 return Response.json({lastRun,queue},{headers:{'Cache-Control':'no-store'}});}catch(e){return responseError(e);}}
