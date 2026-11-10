import {platformSchema} from '@/lib/domain';
import {z} from 'zod';
import {protectedUser,first,run,runtime,responseError} from '@/lib/server';
import {assertSameOrigin,hash,randomToken,seal} from '@/lib/security';
import {configuredProvider,describeLink,linkLifetime,privateHeaders,type ConnectionLinkRow} from '@/lib/connection-links';

type Context={params:Promise<{platform:string}>};
async function handle(req:Request,{params}:Context) {
  try {
    if(req.method!=='GET')assertSameOrigin(req);
    const user=await protectedUser(),platform=platformSchema.parse((await params).platform);
    if(req.method==='DELETE') {
      const body=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(await req.json());
      await run('DELETE FROM connection_links WHERE id=? AND owner=? AND platform=?',body.id,user.userId,platform);
      return Response.json({ok:true},{headers:privateHeaders});
    }
    if(req.method==='POST') {
      await configuredProvider(user.userId,platform);
      const token=randomToken(),now=Date.now();
      // One live link per platform. Concurrent creation keeps the same link;
      // replacing an expired one also invalidates its outstanding attempts.
      await run(`INSERT INTO connection_links (id,owner,platform,encrypted_token,expires_at,created_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(owner,platform) DO UPDATE SET id=excluded.id,encrypted_token=excluded.encrypted_token,expires_at=excluded.expires_at,created_at=excluded.created_at,last_started_at=0,completed_count=0 WHERE connection_links.expires_at<=?`,
        await hash(token),user.userId,platform,await seal(token,runtime().TOKEN_ENCRYPTION_KEY),now+linkLifetime,now,now);
    }
    const row=await first<ConnectionLinkRow>('SELECT * FROM connection_links WHERE owner=? AND platform=? AND expires_at>?',user.userId,platform,Date.now());
    return Response.json({link:row?await describeLink(row):null},{headers:privateHeaders});
  }catch(e){const response=responseError(e);response.headers.set('Cache-Control','no-store');return response;}
}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
