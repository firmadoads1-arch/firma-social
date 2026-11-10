import {z} from 'zod';
import {protectedUser,responseError} from '@/lib/server';
import {assertSameOrigin} from '@/lib/security';
import {serviceOwner} from '@/lib/runner-auth';
import {groupScope,requireItems} from '@/lib/group-scope';
import {refreshInstagramIdentity} from '@/lib/providers';
export async function POST(req:Request){try{
 const owner=req.headers.get('x-firma-service')==='queue-v1'?await serviceOwner(req):await (async()=>{assertSameOrigin(req);return (await protectedUser()).userId;})();
 const body=z.object({accountId:z.string().uuid(),groupId:z.string().uuid().nullable().optional()}).strict().parse(await req.json());
 const group=await groupScope(owner,body.groupId);if(group)await requireItems(owner,group,'accounts',[body.accountId]);
 return Response.json(await refreshInstagramIdentity(owner,body.accountId),{headers:{'Cache-Control':'no-store'}});
}catch(e){return responseError(e);}}
