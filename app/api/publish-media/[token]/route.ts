import {deliverMedia} from '@/lib/media-delivery';
import {responseError} from '@/lib/server';
async function serve(req:Request,{params}:{params:Promise<{token:string}>}){try{return await deliverMedia(req,(await params).token);}catch(e){const response=responseError(e);response.headers.set('Cache-Control','no-store');return response;}}
export const GET=serve;
export const HEAD=serve;
