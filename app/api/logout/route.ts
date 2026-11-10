import {env} from 'cloudflare:workers';
export async function GET(req:Request){const settings=env as unknown as Record<string,string>;return Response.redirect(new URL(settings.AUTH_MODE==='cloudflare_access'?'/cdn-cgi/access/logout':'/signout-with-chatgpt?return_to=/',req.url),302);}
