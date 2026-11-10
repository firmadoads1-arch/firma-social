import {ffmpegWorkerSource,pthreadWorkerSource} from '@/lib/prisma/generated/media-workers';

export const dynamic='force-dynamic';
const headers={
 'Content-Type':'text/javascript; charset=utf-8',
 'Cross-Origin-Embedder-Policy':'require-corp',
 'Cross-Origin-Opener-Policy':'same-origin',
 'Cross-Origin-Resource-Policy':'same-origin',
 'X-Content-Type-Options':'nosniff',
 'Cache-Control':'public, max-age=86400',
};
// These are application scripts, not user data. The existing Site access
// boundary remains in effect; API data routes retain their own authorization.
export function GET(request:Request){
 const kind=new URL(request.url).pathname.split('/').pop();
 const source=kind==='ffmpeg'?ffmpegWorkerSource:kind==='pthread'?pthreadWorkerSource:null;
 if(source===null)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 return new Response(source,{headers});
}
export function HEAD(request:Request){const response=GET(request);return new Response(null,{status:response.status,headers:response.headers});}
