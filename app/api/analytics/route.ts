import {groupScope,requireItems} from '@/lib/group-scope';
import {getWorkspaceUser} from '@/lib/workspace-access';
import {serviceOwner} from '@/lib/runner-auth';
import {responseError} from '@/lib/server';
import {assertSameOrigin} from '@/lib/security';
import {analyticsReport,analyticsStatus,syncAnalytics} from '@/lib/analytics';
import {z} from 'zod';
const headers={'Cache-Control':'no-store'};
async function owner(req:Request){const user=req.headers.get('x-firma-service')==='queue-v1'?null:await getWorkspaceUser();if(user){if(req.method==='POST')assertSameOrigin(req);return user.userId;}return serviceOwner(req);}
export async function GET(req:Request){try{const id=await owner(req),p=new URL(req.url).searchParams;return Response.json(p.get('status')==='1'?await analyticsStatus(id,await groupScope(id,p.get('group'))):await analyticsReport(id,p),{headers});}catch(e){const r=responseError(e);r.headers.set('Cache-Control','no-store');return r;}}
export async function POST(req:Request){try{const id=await owner(req),body=z.object({accountId:z.string().uuid().optional()}).strict().parse(await req.json());const group=await groupScope(id,new URL(req.url).searchParams.get('group'));if(group){if(!body.accountId)throw Error('Selecione o perfil do grupo.');await requireItems(id,group,'accounts',[body.accountId]);}return Response.json(await syncAnalytics(id,body.accountId),{headers});}catch(e){const r=responseError(e);r.headers.set('Cache-Control','no-store');return r;}}
