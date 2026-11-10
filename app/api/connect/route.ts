import {first,responseError} from '@/lib/server';
import {z} from 'zod';
import {AppError,assertSameOrigin,hash} from '@/lib/security';
import {activeLink,beginOAuth,configuredProvider,linkCookie,privateHeaders,readLinkToken} from '@/lib/connection-links';

export async function POST(req:Request) {
  try {
    assertSameOrigin(req);
    const body=z.object({action:z.enum(['inspect','start']),token:z.string().max(200).optional(),expectedLinkId:z.string().max(100).optional(),insights:z.boolean().optional()}).strict().parse(await req.json());
    // This capability only starts an explicit provider authorization. It never
    // grants a Sites identity, workspace access, or permission to publish.
    const token=readLinkToken(req,body.token),link=await activeLink(await hash(token));
    if(!link)throw new AppError('Este link venceu ou foi revogado. Gere outro link no painel do Firma Social.',410);
    if(body.action==='inspect') {
      const ws=await first<{name:string}>('SELECT name FROM workspaces WHERE owner=?',link.owner);
      return Response.json({id:link.id,platform:link.platform,workspaceName:ws?.name??'Firma Social',expiresAt:link.expires_at},{headers:{...privateHeaders,'Set-Cookie':linkCookie(token,link.expires_at)}});
    }
    if(body.expectedLinkId!==link.id)throw new AppError('O link aberto mudou. Reabra o link completo para confirmar o workspace.',409);
    const c=await configuredProvider(link.owner,link.platform),now=Date.now();
    const allowed=await first('UPDATE connection_links SET last_started_at=? WHERE id=? AND expires_at>? AND last_started_at<=? RETURNING id',now,link.id,now,now-1000);
    if(!allowed)throw new AppError('Aguarde um instante e tente novamente.',429);
    const started=await beginOAuth(link.owner,link.platform,c,link.id,link.platform==='instagram'&&body.insights===true);
    return Response.json({url:started.url},{headers:{...privateHeaders,'Set-Cookie':started.cookie}});
  }catch(e){const response=responseError(e);response.headers.set('Cache-Control','no-store');return response;}
}
