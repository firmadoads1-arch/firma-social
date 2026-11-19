import {z} from 'zod';
import {currentUser,responseError,list} from '@/lib/server';
import {serviceOwner} from '@/lib/runner-auth';
import {AppError,assertSameOrigin} from '@/lib/security';
import {groupScope,requireItems} from '@/lib/group-scope';
import {verifyPublicProfile,repairLegacyVerificationFlags} from '@/lib/profile-verification';
async function owner(req:Request){return req.headers.get('x-firma-service')==='queue-v1'?await serviceOwner(req):(await currentUser()).userId;}
export async function GET(req:Request){try{
 const userId=await owner(req);
 const accounts=await list("SELECT id,username,availability_result AS availabilityResult,availability_reason AS availabilityReason,availability_status AS availabilityStatus,availability_attempt_at AS availabilityAttemptAt,availability_checked_at AS availabilityCheckedAt FROM accounts WHERE owner=? AND platform='instagram' ORDER BY created_at",userId);
 return Response.json({accounts},{headers:{'Cache-Control':'no-store'}});
}catch(e){return responseError(e);}}
export async function POST(req:Request){try{
 if(req.headers.get('x-firma-service')!=='queue-v1')assertSameOrigin(req);const userId=await owner(req);
 const body=z.union([z.object({accountId:z.string().uuid(),groupId:z.string().uuid().nullable().optional()}).strict(),z.object({action:z.literal('repairLegacyFlags')}).strict()]).parse(await req.json());
 if('action' in body){if(req.headers.get('x-firma-service')!=='queue-v1')throw new AppError('Esta correção exige acesso de serviço.',403);return Response.json(await repairLegacyVerificationFlags(userId),{headers:{'Cache-Control':'no-store'}});}
 const group=await groupScope(userId,body.groupId);if(group)await requireItems(userId,group,'accounts',[body.accountId]);
 return Response.json(await verifyPublicProfile(userId,body.accountId),{headers:{'Cache-Control':'no-store'}});
}catch(e){return responseError(e);}}
