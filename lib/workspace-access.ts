import {env} from 'cloudflare:workers';
import {getChatGPTUser,type ChatGPTUser} from '@/app/chatgpt-auth';

// Opt-in public management of the single configured workspace. Never a login
// identity: account secrets, OAuth setup and backups still require real sign-in.
export async function getWorkspaceUser():Promise<ChatGPTUser|null>{
 const settings=env as unknown as Record<string,string>;
 if(settings.PUBLIC_WORKSPACE_ENABLED==='true'&&settings.RUNNER_OWNER_ID){
  return {userId:settings.RUNNER_OWNER_ID,displayName:'Workspace público',email:'',fullName:null};
 }
 return getChatGPTUser();
}
