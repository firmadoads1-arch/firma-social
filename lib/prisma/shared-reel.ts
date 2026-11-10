import {defaults, type Settings} from './catalog';

export const SHARED_REEL_INTERVAL_MS = 180_000;
export const SHARED_REEL_TOOL = 'shared-reel';

export function sharedReelFolder(title: string) {
 return 'prisma posts / '+title;
}

export async function sharedReelOutputId(batchId: string, accountId: string) {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('prisma-shared-reel:'+batchId+':'+accountId));
 const bytes = new Uint8Array(digest).slice(0,16);
 bytes[6] = (bytes[6]&15)|64;
 bytes[8] = (bytes[8]&63)|128;
 const hex = Array.from(bytes, byte=>byte.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export function sharedReelSettings(position: number): Settings {
 return {
  ...defaults,
  maxSide:1920,
  contrast:Number((1.012+position*.0004).toFixed(4)),
  brightness:((position%7)-3)*.002,
  volume:Number((.94+position*.0012).toFixed(4)),
  bass:Number((.25+position*.01).toFixed(2)),
 };
}
