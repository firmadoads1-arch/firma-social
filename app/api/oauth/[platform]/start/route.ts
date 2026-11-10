import {platformSchema} from '@/lib/domain';
import {protectedUser,responseError} from '@/lib/server';
import {AppError,assertSameOrigin} from '@/lib/security';
import {beginOAuth,configuredProvider,privateHeaders} from '@/lib/connection-links';

type Context = {params: Promise<{platform: string}>};
async function start(req: Request, {params}: Context, json: boolean) {
  try {
    if (json) assertSameOrigin(req);
    else if (req.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('Inicie a conexão pelo Firma Social.', 403);
    const user = await protectedUser();
    const platform = platformSchema.parse((await params).platform);
    const c = await configuredProvider(user.userId, platform);
    const {url,cookie} = await beginOAuth(user.userId,platform,c,undefined,platform==='instagram'&&new URL(req.url).searchParams.get('insights')==='1');
    const headers = {...privateHeaders,'Set-Cookie':cookie};
    return json ? Response.json({url}, {headers}) : new Response(null, {status: 302, headers: {...headers, Location: url}});
  } catch (e) { return responseError(e); }
}
export const GET = (req: Request, context: Context) => start(req, context, false);
export const POST = (req: Request, context: Context) => start(req, context, true);
