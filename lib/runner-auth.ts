import {AppError,hash} from './security';
import {runtime} from './server';
import {schedulerEnabled} from './scheduler';
export async function serviceOwner(req:Request){
 const settings=runtime(),owner=settings.RUNNER_OWNER_ID??'';
 const auth=req.headers.get('authorization')??'';
 if(!owner||!schedulerEnabled(owner,settings)||req.headers.has('origin')||req.headers.get('x-firma-service')!=='queue-v1'||!auth.startsWith('Bearer ')||auth.length>8192)throw new AppError('Execução não autorizada.',403);
 const actual=await hash(auth.slice(7));const expected=settings.RUNNER_SERVICE_TOKEN_SHA256!;
 let diff=actual.length^expected.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(diff!==0)throw new AppError('Execução não autorizada.',403);
 return owner;
}
