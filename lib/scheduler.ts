export type SchedulerConfig={SCHEDULER_ENABLED?:string;RUNNER_OWNER_ID?:string;RUNNER_SERVICE_TOKEN_SHA256?:string};
export function schedulerEnabled(owner:string,settings:SchedulerConfig){return settings.SCHEDULER_ENABLED==='true'&&settings.RUNNER_OWNER_ID===owner&&/^[A-Za-z0-9_-]{43}$/.test(settings.RUNNER_SERVICE_TOKEN_SHA256??'');}
export function schedulerHealth(enabled:boolean,checkedAt:string|null,delayed:number,now=Date.now()){
 const timestamp=checkedAt?Date.parse(checkedAt):NaN;
 return {enabled,intervalMinutes:60,lastCheckedAt:checkedAt,healthy:enabled&&Number.isFinite(timestamp)&&now-timestamp<90*60000,delayedCount:delayed};
}
