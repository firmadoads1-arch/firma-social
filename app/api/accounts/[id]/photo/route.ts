import {currentUser,responseError} from '@/lib/server';
import {accountProfileImage} from '@/lib/profile-image';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await currentUser();const {id}=await params;
 return await accountProfileImage(user.userId,id);
}catch(e){const response=responseError(e);response.headers.set('Cache-Control','no-store');return response;}}
