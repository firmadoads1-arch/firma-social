'use client';
import {useState} from 'react';
import type {Account} from '@/lib/domain';
export default function AccountAvatar({account,onUnavailable}:{account:Account;onUnavailable?:()=>void}){
 const [failed,setFailed]=useState<string|null>(null);
 const src=account.platform==='instagram'?'/api/accounts/'+encodeURIComponent(account.id)+'/photo?v='+(account.profileAttemptAt??account.profileCheckedAt??0):null;const attempt=src??'';
 return <span className="avatar account-profile-photo">{src&&failed!==attempt?<img key={attempt} src={src} alt={'Foto de perfil de @'+account.username} loading="lazy" referrerPolicy="no-referrer" onError={()=>{setFailed(attempt);onUnavailable?.();}}/>:<span aria-hidden="true">{(account.displayName||account.username).slice(0,1).toUpperCase()}</span>}</span>;
}
