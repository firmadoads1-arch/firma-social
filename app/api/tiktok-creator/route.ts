import {protectedUser,responseError} from '@/lib/server';
import {creatorInfo} from '@/lib/providers';
export async function GET(req:Request){try{const u=await protectedUser();return Response.json(await creatorInfo(u.userId,new URL(req.url).searchParams.get('account')??''),{headers:{'Cache-Control':'no-store'}});}catch(e){return responseError(e);}}
