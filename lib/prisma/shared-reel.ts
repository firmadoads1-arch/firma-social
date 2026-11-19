import {defaults, type Settings} from './catalog';

export const SHARED_REEL_INTERVAL_MS = 180_000;
export const SHARED_REEL_TOOL = 'shared-reel';

export function sharedReelFolder(title: string) {
 return 'prisma posts / '+title;
}

export async function sharedReelOutputId(batchId: string, accountId: string, sourceId?: string) {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('prisma-shared-reel:'+batchId+':'+accountId+(sourceId?':'+sourceId:'')));
 const bytes = new Uint8Array(digest).slice(0,16);
 bytes[6] = (bytes[6]&15)|64;
 bytes[8] = (bytes[8]&63)|128;
 const hex = Array.from(bytes, byte=>byte.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

// Every new per-profile export keeps the source tracks unchanged.
export function sharedReelSettings(_position: number): Settings {
 return {...defaults,metaMode:'strip'};
}
