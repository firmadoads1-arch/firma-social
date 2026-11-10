import { requireChatGPTUser } from './chatgpt-auth';
import {getWorkspaceUser} from '@/lib/workspace-access';
import {notFound} from 'next/navigation';
import {AppError} from '@/lib/security';
import { state } from '@/lib/server';
import Dashboard from './dashboard';
export const dynamic = 'force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<{group?:string;view?:string}>}){const params=await searchParams;const scope=typeof params?.group==='string'?params.group:null; const user=await getWorkspaceUser()??await requireChatGPTUser('/'); try{return <Dashboard key={scope} initialView={params?.view} initial={await state(user.userId,user.displayName,scope)}/>;}catch(e){if(e instanceof AppError&&e.status===404)notFound();throw e;} }
