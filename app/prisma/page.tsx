import {requireChatGPTUser} from '../chatgpt-auth';
import {getWorkspaceUser} from '@/lib/workspace-access';
import {groupScope} from '@/lib/group-scope';
import {runtime} from '@/lib/server';
import PrismaWorkspace from './workspace';
export const dynamic='force-dynamic';
export default async function PrismaPage({searchParams}:{searchParams:Promise<{group?:string}>}){const params=await searchParams,u=await getWorkspaceUser()??await requireChatGPTUser('/prisma');const group=await groupScope(u.userId,params?.group);return <PrismaWorkspace group={group} userName={u.displayName} publicWorkspace={(runtime() as any).PUBLIC_WORKSPACE_ENABLED==='true'}/>;}
