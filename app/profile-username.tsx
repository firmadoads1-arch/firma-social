'use client';
import {createContext,useContext,type ReactNode} from 'react';
import type {Account} from '@/lib/domain';
import {profileIsRed,profileIsAvailable} from '@/lib/profile-availability';
import {ExternalLink} from 'lucide-react';
import type {Platform} from '@/lib/domain';

const ProfileAccounts=createContext<Account[]>([]);
export function ProfileAvailabilityProvider({accounts,children}:{accounts:Account[];children:ReactNode}){return <ProfileAccounts.Provider value={accounts}>{children}</ProfileAccounts.Provider>;}
export function ProfileLink({username,platform='instagram'}:{username?:string;platform?:Platform}){
 const handle=username?.trim().replace(/^@/,'');
 if(platform!=='instagram'||!handle)return null;
 return <a className="account-instagram-link" href={'https://www.instagram.com/'+encodeURIComponent(handle)+'/'} target="_blank" rel="noopener noreferrer" title={'Abrir @'+handle+' no Instagram'} aria-label={'Abrir @'+handle+' no Instagram (nova aba)'} onClick={e=>e.stopPropagation()}><ExternalLink size={14} aria-hidden="true"/></a>;
}
export function ProfileUsername({username,platform='instagram',label,accountId}:{username?:string;platform?:Platform;label?:string;accountId?:string}){
 const handle=username?.trim().replace(/^@/,'');
 const accounts=useContext(ProfileAccounts);const account=accounts.find(a=>a.platform===platform&&(accountId?a.id===accountId:a.username.toLowerCase()===handle?.toLowerCase()));
 const red=account&&profileIsRed(account);
 return <span className="profile-username"><span>{label??(handle?'@'+handle:'Perfil indisponível')}</span>{red&&<span className="profile-unavailable-mark" role="img" aria-label={'Precisa de verificação: @'+handle} title={'O Instagram exibiu indisponibilidade na página principal e em Reels. Confirmado em '+new Date(account.availabilityCheckedAt!).toLocaleString('pt-BR')+'. Não indica suspensão ou desconexão.'}>●</span>}{account&&platform==='instagram'&&!red&&!profileIsAvailable(account)&&<span className="profile-check-pending" role="img" aria-label={'Verificação pendente de @'+handle} title="Não foi possível confirmar a página. Isso não indica indisponibilidade do perfil.">?</span>}<ProfileLink username={handle} platform={platform}/></span>;
}
