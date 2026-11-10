// Runs the actual route/domain/queue modules with SQLite and fake platform HTTP.
// No social network is contacted and no production data is used.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=process.cwd(),out=fs.mkdtempSync(path.join(tmpdir(),'firma-check-'));
fs.symlinkSync(path.join(root,'node_modules'),path.join(out,'node_modules'),'dir');
const files=['lib/prisma/catalog.ts','lib/prisma/shared-reel.ts','lib/prisma/store.ts','lib/prisma/security.ts','lib/prisma/template-api.ts','lib/prisma/profile-types.ts','app/api/accounts/refresh/route.ts','lib/editor-defaults.ts','lib/group-scope.ts','lib/editing.ts','lib/workspace-access.ts','lib/story-links.ts','lib/analytics.ts','lib/analytics-model.ts','app/api/analytics/route.ts','lib/publishing-limits.ts','lib/scheduler.ts','lib/runner-auth.ts','lib/media-delivery.ts','app/api/publish-media/[token]/route.ts','lib/migration.ts','lib/access-identity.ts','app/api/migration/route.ts','lib/connection-links.ts','app/api/connection-links/[platform]/route.ts','app/api/connect/route.ts','app/connect/route.ts','lib/domain.ts','lib/oauth.ts','lib/connections.ts','app/api/oauth/result/route.ts','lib/references.ts','lib/reference-store.ts','lib/security.ts','lib/providers.ts','lib/provider-errors.ts','lib/server.ts','lib/queue.ts','app/api/app/route.ts','app/api/runner/route.ts','app/api/upload/route.ts','app/api/media/[id]/route.ts','app/api/oauth/[platform]/callback/route.ts','app/api/oauth/[platform]/start/route.ts'];
for(const file of files){const dest=path.join(out,file.replace(/\.ts$/,'.mjs'));fs.mkdirSync(path.dirname(dest),{recursive:true});let source=fs.readFileSync(path.join(root,file),'utf8');source=source.replace(/from ['"]([^'"]+)['"]/g,(all,spec)=>{if(spec==='cloudflare:workers')return `from '${pathToFileURL(path.join(out,'env.mjs'))}'`;if(spec==='@/app/chatgpt-auth')return `from '${pathToFileURL(path.join(out,'auth.mjs'))}'`;if(spec.startsWith('@/'))return `from '${pathToFileURL(path.join(out,spec.slice(2)+'.mjs'))}'`;if(spec.startsWith('.'))return `from '${spec}.mjs'`;return all;});fs.writeFileSync(dest,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
fs.writeFileSync(path.join(out,'env.mjs'),'export const env=globalThis.testEnv;');fs.writeFileSync(path.join(out,'auth.mjs'),'export async function getChatGPTUser(){return globalThis.testUser;}');
let db=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return db.prepare(this.sql).get(...this.args)??null;}async all(){return {results:db.prepare(this.sql).all(...this.args)};}async run(){return this.syncRun();}syncRun(){if(/^SELECT/i.test(this.sql))return {results:db.prepare(this.sql).all(...this.args),meta:{changes:0}};const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}}
let beforeBatch=null;const DB={prepare:s=>new Statement(s),batch:async ss=>{if(beforeBatch){const f=beforeBatch;beforeBatch=null;f();}db.exec('BEGIN');try{const results=ss.map(s=>s.syncRun());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};const objects=new Map();
globalThis.testEnv={DB,BUCKET:{head:async k=>objects.has(k)?{size:objects.get(k).byteLength}:null,put:async(k,stream)=>objects.set(k,await new Response(stream).arrayBuffer()),get:async (k,opts)=>objects.has(k)?{body:new Blob([opts?.range?.offset!==undefined?objects.get(k).slice(opts.range.offset,opts.range.offset+opts.range.length):objects.get(k)]).stream(),size:objects.get(k).byteLength,httpEtag:'"fake"'}:null,delete:async k=>{for(const key of Array.isArray(k)?k:[k])objects.delete(key);}},APP_ORIGIN:'https://firma.test',TOKEN_ENCRYPTION_KEY:'test-only-key-not-a-real-production-secret',SCHEDULER_ENABLED:'false'};
const userA={userId:'owner-a',displayName:'Workspace A',email:'a@example.invalid'},userB={userId:'owner-b',displayName:'Workspace B',email:'b@example.invalid'};globalThis.testUser=userA;
testEnv.SCHEDULER_ENABLED='true';testEnv.RUNNER_OWNER_ID=userA.userId;testEnv.RUNNER_SERVICE_TOKEN_SHA256='A'.repeat(43);
const mod=async f=>import(pathToFileURL(path.join(out,f+'.mjs')));
const domain=await mod('lib/domain'),security=await mod('lib/security'),server=await mod('lib/server'),route=await mod('app/api/app/route'),queue=await mod('lib/queue'),runner=await mod('app/api/runner/route'),mediaRoute=await mod('app/api/media/[id]/route'),providers=await mod('lib/providers');
const run=(sql,...args)=>db.prepare(sql).run(...args);const row=(sql,...args)=>db.prepare(sql).get(...args);const rows=(sql,...args)=>db.prepare(sql).all(...args);
const request=(action,data={},origin='https://firma.test')=>new Request('https://firma.test/api/app',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({action,data})});const action=(a,d,origin)=>route.POST(request(a,d,origin));
let total=0;async function check(name,fn){await fn();total++;console.log('✓ '+name);}
await server.workspace(userA.userId);await server.workspace(userB.userId);
await check('Missing identity and cross-origin writes are denied',async()=>{globalThis.testUser=null;assert.equal((await route.GET()).status,401);globalThis.testUser=userA;assert.equal((await action('post.save',{},'https://attacker.invalid')).status,403);assert.equal(row('SELECT count(*) n FROM posts').n,0);});
await check('Workspace calendar handles São Paulo, leap days and DST gaps',async()=>{assert.equal(domain.localToEpoch('2026-10-18T12:00','America/Sao_Paulo'),Date.parse('2026-10-18T15:00:00Z'));assert.equal(domain.localToEpoch('2028-02-29T10:00','UTC'),Date.parse('2028-02-29T10:00:00Z'));assert.throws(()=>domain.localToEpoch('2026-02-30T12:00','UTC'));assert.throws(()=>domain.localToEpoch('2026-03-08T02:30','America/New_York'));});
await check('Encrypted credentials are authenticated and unreadable with another key',async()=>{const ciphertext=await security.seal({token:'private-test-value'},testEnv.TOKEN_ENCRYPTION_KEY);assert(!ciphertext.includes('private-test-value'));assert.deepEqual(await security.unseal(ciphertext,testEnv.TOKEN_ENCRYPTION_KEY),{token:'private-test-value'});await assert.rejects(()=>security.unseal(ciphertext,'another-test-only-secret-with-32-characters'));});
const mid=security.id(),aid=security.id();const now=Date.now();run('INSERT INTO media (id,owner,name,mime,size,storage_key,duration,folder,public_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',mid,userA.userId,'owned.mp4','video/mp4',40,'owned-media',10,'Geral','https://media.example.invalid/videos/a.mp4',now);objects.set('owned-media',new Uint8Array([1,2,3]).buffer);
run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',aid,userA.userId,'instagram','remote-a','brand','Brand',await security.seal({access_token:'FAKE-ONLY'},testEnv.TOKEN_ENCRYPTION_KEY),now+1e9,'basic','connected',now);
await action('provider.save',{platform:'instagram',clientId:'fake-id',clientSecret:'fake-secret'});
const payload={title:'Original content',caption:'Caption',platforms:['instagram'],accountIds:[aid],mediaIds:[mid],format:'video',status:'scheduled',scheduledAt:Date.now()+300000,options:{}};
await check('Owned data stays private and cross-owner references are rejected',async()=>{globalThis.testUser=userB;const state=await(await route.GET()).json();assert.equal(state.media.length,0);assert.equal(state.accounts.length,0);assert.equal((await action('post.save',payload)).status,400);assert.equal((await mediaRoute.GET(new Request('https://firma.test/api/media/'+mid),{params:Promise.resolve({id:mid})})).status,404);globalThis.testUser=userA;const ownerState=JSON.stringify(await(await route.GET()).json());assert(!ownerState.includes('FAKE-ONLY'));assert(!ownerState.includes('fake-secret'));});
let pid;
await check('Scheduling creates one delivery per account and requires a date',async()=>{assert.equal((await action('post.save',{...payload,scheduledAt:null})).status,400);const result=await action('post.save',{...payload,accountIds:[aid,aid]});assert.equal(result.status,200);pid=(await result.json()).id;assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',pid).n,1);});
await check('Stale edits cannot delete or replace a newer queue',async()=>{const current=row('SELECT * FROM posts WHERE id=?',pid),delivery=row('SELECT id FROM deliveries WHERE post_id=?',pid);beforeBatch=()=>run('UPDATE posts SET version=version+1,title=? WHERE id=?','Concurrent edit',pid);const result=await action('post.save',{...payload,id:pid,version:current.version,title:'Stale overwrite'});assert.equal(result.status,409);assert.equal(row('SELECT title FROM posts WHERE id=?',pid).title,'Concurrent edit');assert.equal(row('SELECT id FROM deliveries WHERE post_id=?',pid).id,delivery.id);});
await check('Cancellation before work starts removes the post from due work',async()=>{assert.equal((await action('post.cancel',{id:pid})).status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',pid).status,'cancelled');assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',pid).status,'cancelled');});
async function scheduled(){const response=await action('post.save',payload);assert.equal(response.status,200);const {id}=await response.json();run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);run('UPDATE posts SET scheduled_at=0 WHERE id=?',id);return id;}
let requests=[];globalThis.fetch=async(url,init={})=>{requests.push({url:String(url),method:init.method??'GET'});if(String(url).includes('media_publish'))return Response.json({id:'published-a'});if(String(url).endsWith('/media'))return Response.json({id:'container-a'});return Response.json({status_code:'FINISHED'});};
await check('Mixed carousel checkpoints children and waits for video readiness without duplicate creation',async()=>{
 const photo=security.id(),original=row('SELECT * FROM media WHERE id=?',mid),cols=Object.keys(original);run(`INSERT INTO media (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,...cols.map(k=>k==='id'?photo:k==='mime'?'image/jpeg':original[k]));
 const previous=globalThis.fetch,calls=[];let ready=false,n=0;
 globalThis.fetch=async(url,init={})=>{const body=init.body instanceof URLSearchParams?Object.fromEntries(init.body):{};calls.push({url:String(url),body});if(String(url).endsWith('/media'))return Response.json({id:'carousel-'+(++n)});if(String(url).includes('media_publish'))return Response.json({id:'published-carousel'});return Response.json({status_code:ready?'FINISHED':'IN_PROGRESS'});};
 try{const result=await(await action('post.publishNow',{...payload,id:security.id(),format:'carousel',mediaIds:[photo,mid]})).json();assert.equal(result.status,'publishing');assert.equal(n,2);assert.equal(calls[0].body.is_carousel_item,'true');assert(calls[0].body.image_url);assert.equal(calls[1].body.media_type,'VIDEO');assert(calls[1].body.video_url);assert(!calls.some(c=>c.url.includes('media_publish')));
 ready=true;run('UPDATE deliveries SET next_run=0 WHERE post_id=?',result.id);await queue.processQueue(userA.userId,'manual',result.id);assert.equal(n,3);assert.equal(row('SELECT status FROM posts WHERE id=?',result.id).status,'published');assert.equal(calls.filter(c=>c.url.includes('media_publish')).length,1);assert.equal(calls.find(c=>c.body.media_type==='CAROUSEL').body.children,'carousel-1,carousel-2');
 }finally{globalThis.fetch=previous;requests=[];}
});
await check('Publish now starts only the selected post, ignores future dates and safely replays its request ID',async()=>{
 const other=await scheduled(), immediateId=security.id(), before=Date.now();
 const response=await action('post.publishNow',{...payload,id:immediateId,scheduledAt:Date.now()+86400000});const result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert(result.immediate);assert.equal(result.status,'published');
 assert(row('SELECT scheduled_at FROM posts WHERE id=?',immediateId).scheduled_at>=before);
 assert(row('SELECT scheduled_at FROM posts WHERE id=?',immediateId).scheduled_at<=Date.now());
 assert.equal(row('SELECT status FROM posts WHERE id=?',other).status,'scheduled','Immediate action must not send other due posts');
 const count=requests.length;assert.equal((await action('post.publishNow',{...payload,id:immediateId})).status,200);assert.equal(requests.length,count);
 globalThis.testUser=userB;assert.equal((await action('post.publishNow',{...payload,id:immediateId})).status,404);globalThis.testUser=userA;
 const invalid=security.id();assert.equal((await action('post.publishNow',{...payload,id:invalid,accountIds:[]})).status,400);assert(!row('SELECT id FROM posts WHERE id=?',invalid));
 const manual=security.id();assert.equal((await action('post.publishNow',{...payload,id:manual,format:'story',options:{instagramStoryLink:{url:'https://example.com',label:'Abrir'}}})).status,400);assert.equal(requests.length,count);
 await action('post.cancel',{id:other});requests=[];
});
await check('Publish now can send an existing draft while stale retries cannot publish it twice',async()=>{
 const draft=await(await action('post.save',{...payload,status:'draft',scheduledAt:null})).json();
 const response=await action('post.publishNow',{...payload,id:draft.id,version:1});assert.equal(response.status,200);assert.equal((await response.json()).status,'published');
 const count=requests.length;assert.equal((await action('post.publishNow',{...payload,id:draft.id,version:1})).status,409);assert.equal(requests.length,count);requests=[];
});
await check('Publish now reports processing honestly and an unknown-response retry cannot create a second container',async()=>{
 const fake=globalThis.fetch,id=security.id();let calls=0;
 globalThis.fetch=async(url,init={})=>{calls++;return Response.json(String(url).endsWith('/media')?{id:'container-now-pending'}:{status_code:'IN_PROGRESS'});};
 try{
  const result=await(await action('post.publishNow',{...payload,id})).json();assert.equal(result.status,'publishing');
  const before=calls;const replay=await(await action('post.publishNow',{...payload,id})).json();assert.equal(replay.status,'publishing');assert.equal(calls,before);assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',id).n,1);
  run("UPDATE posts SET status='cancelled' WHERE id=?",id);run("UPDATE deliveries SET status='cancelled' WHERE post_id=?",id);
 }finally{globalThis.fetch=fake;requests=[];}
});
await check('Concurrent workers publish exactly once and block cancellation after claim',async()=>{const id=await scheduled();let cancellation;const fake=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/media'))cancellation=await action('post.cancel',{id});return fake(url,init);};await Promise.all([queue.processQueue(userA.userId),queue.processQueue(userA.userId)]);assert.equal(cancellation.status,409);assert.equal(requests.filter(r=>r.url.includes('media_publish')).length,1);assert.equal(requests.filter(r=>r.url.endsWith('/media')).length,1);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'published');assert.equal((await action('post.save',{...payload,id,version:1})).status,409);globalThis.fetch=fake;});
await check('Slow Instagram steps persist the container and yield before another network write',async()=>{
 const realNow=Date.now,priorFetch=globalThis.fetch;
 try{for(const slow of ['create','status']){const id=await scheduled();let clock=realNow(),creates=0,publishes=0,delayed=false;Date.now=()=>clock;
 globalThis.fetch=async(url)=>{const u=String(url);if(u.endsWith('/media')){creates++;if(slow==='create'&&!delayed){clock+=21000;delayed=true;}return Response.json({id:'budget-container'});}if(u.includes('/media_publish')){publishes++;return Response.json({id:'budget-published'});}if(slow==='status'&&!delayed){clock+=21000;delayed=true;}return Response.json({status_code:'FINISHED'});};
 await queue.processQueue(userA.userId,'manual',id);assert.equal(creates,1);assert.equal(publishes,0);assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'processing');
 run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);await queue.processQueue(userA.userId,'manual',id);assert.equal(creates,1);assert.equal(publishes,1);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'published');Date.now=realNow;
 }}finally{Date.now=realNow;globalThis.fetch=priorFetch;}
});
await check('Ambiguous publish response is never automatically resent',async()=>{requests=[];const id=await scheduled();globalThis.fetch=async(url,init={})=>{requests.push({url:String(url)});if(String(url).includes('media_publish'))return Response.json({error:{code:'upstream'}},{status:503});return Response.json(String(url).endsWith('/media')?{id:'container-b'}:{status_code:'FINISHED'});};await queue.processQueue(userA.userId);await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'uncertain');assert.equal(requests.filter(r=>r.url.includes('media_publish')).length,1);});
await check('Expired delivery leases require human review without another send',async()=>{requests=[];const id=await scheduled();run("UPDATE deliveries SET status='working',lease='interrupted',lease_until=0 WHERE post_id=?",id);run("UPDATE posts SET status='publishing' WHERE id=?",id);await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'uncertain');assert.equal(requests.length,0);});
await check('Targeted Instagram recovery reconciles the original container and leaves other posts untouched',async()=>{
 const target=await scheduled(), other=await scheduled();
 const context=await security.seal({container:'interrupted-container'},testEnv.TOKEN_ENCRYPTION_KEY);
 run("UPDATE deliveries SET status='working',lease='old-worker',lease_until=0,context=? WHERE post_id=?",context,target);
 run("UPDATE posts SET status='publishing' WHERE id=?",target);
 const originalFetch=globalThis.fetch;
 const calls=[];
 try{
  globalThis.fetch=async(url,init={})=>{calls.push([String(url),init.method??'GET']);return Response.json({status_code:'PUBLISHED'});};
  const resumed=await action('post.resumeInstagram',{id:target});
  assert.equal(resumed.status,200);
  assert.equal(row('SELECT status FROM posts WHERE id=?',target).status,'published');
  assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',other).status,'pending');
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/interrupted-container\?fields=status_code$/);
  assert.equal(calls[0][1],'GET');
 }finally{
  globalThis.fetch=originalFetch;
  run("UPDATE deliveries SET status='cancelled' WHERE post_id=?",other);
  run("UPDATE posts SET status='cancelled' WHERE id=?",other);
 }
});
await check('Concurrent recurring runs create just one draft per rule/day',async()=>{const day=new Date(Date.now()+86400000).getUTCDay();const response=await action('rule.save',{name:'Series',time:'12:00',weekdays:[0,1,2,3,4,5,6],caption:'Draft only',accountIds:[aid],mediaIds:[mid]});assert.equal(response.status,200);await Promise.all([queue.processQueue(userA.userId),queue.processQueue(userA.userId)]);assert.equal(row("SELECT count(*) n FROM posts WHERE title='Series'").n,1);assert.equal(row("SELECT status FROM posts WHERE title='Series'").status,'draft');});
await check('TikTok enforces verified media ownership and explicit direct consent',async()=>{assert.throws(()=>providers.publicMedia({public_url:'https://other.example.invalid/video.mp4'},{publicMediaBase:'https://media.example.invalid/videos/'},'tiktok'));assert.equal(providers.publicMedia({public_url:'https://media.example.invalid/videos/a.mp4'},{publicMediaBase:'https://media.example.invalid/videos/'},'tiktok'),'https://media.example.invalid/videos/a.mp4');const p=domain.postInput.parse({...payload,platforms:['tiktok'],options:{tiktokMode:'direct'}});const issues=domain.validatePublishing(p,[{id:mid,mime:'video/mp4'}],[{id:aid,platform:'tiktok',state:'connected'}]);assert(issues.some(s=>s.includes('autorize')));});
await check('YouTube resumable upload uses selected privacy and reaches confirmed completion',async()=>{const youtubeId=security.id();run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',youtubeId,userA.userId,'youtube','yt-remote','channel','Channel',await security.seal({access_token:'FAKE-YT'},testEnv.TOKEN_ENCRYPTION_KEY),now+1e9,'upload','connected',now);await action('provider.save',{platform:'youtube',clientId:'fake-yt',clientSecret:'fake-secret'});const response=await action('post.save',{...payload,platforms:['youtube'],accountIds:[youtubeId],options:{youtubePrivacy:'private'}});assert.equal(response.status,200);const id=(await response.json()).id;run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);let uploads=0;globalThis.fetch=async(url,init={})=>{if(String(url).includes('uploadType=resumable')){assert.equal(JSON.parse(init.body).status.privacyStatus,'private');return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/session-test'}});}if(init.method==='PUT'){uploads++;return Response.json({id:'yt-video'});}return Response.json({items:[{status:{uploadStatus:'processed'}}]});};await queue.processQueue(userA.userId);await queue.processQueue(userA.userId);assert.equal(uploads,1);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'published');});
await check('TikTok inbox is reported as inbox, not a published post',async()=>{const ttId=security.id();run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',ttId,userA.userId,'tiktok','tt-remote','creator','Creator',await security.seal({access_token:'FAKE-TT'},testEnv.TOKEN_ENCRYPTION_KEY),now+1e9,'upload','connected',now);await action('provider.save',{platform:'tiktok',clientId:'fake-tt',clientSecret:'fake-secret',publicMediaBase:'https://media.example.invalid/videos/'});const response=await action('post.save',{...payload,platforms:['tiktok'],accountIds:[ttId],options:{tiktokMode:'inbox'}});assert.equal(response.status,200);const id=(await response.json()).id;run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);globalThis.fetch=async(url,init={})=>{if(String(url).includes('/inbox/video/init/')){assert.equal(JSON.parse(init.body).source_info.source,'PULL_FROM_URL');return Response.json({data:{publish_id:'tt-publish'},error:{code:'ok'}});}return Response.json({data:{status:'SEND_TO_USER_INBOX'},error:{code:'ok'}});};await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'inbox');});

await check('Instagram OAuth uses official endpoints and least-required publishing scopes',async()=>{
 const start=await mod('app/api/oauth/[platform]/start/route');
 const result=await start.GET(new Request('https://firma.test/api/oauth/instagram/start'),{params:Promise.resolve({platform:'instagram'})});
 assert.equal(result.status,302);const target=new URL(result.headers.get('location'));
 assert.equal(target.origin,'https://www.instagram.com');assert.equal(target.pathname,'/oauth/authorize');
 assert.equal(target.searchParams.get('scope'),'instagram_business_basic,instagram_business_content_publish');
 assert.equal(target.searchParams.get('redirect_uri'),'https://firma.test/api/oauth/instagram/callback');
 assert(!target.searchParams.has('client_secret'));assert(target.searchParams.get('state'));
 const hashed=await security.hash(target.searchParams.get('state'));assert.equal(row('SELECT owner FROM oauth_states WHERE id=?',hashed).owner,userA.userId);
});
await check('OAuth state belongs to one owner, expires, and can be redeemed only once',async()=>{
 const callback=await mod('app/api/oauth/[platform]/callback/route');const params={params:Promise.resolve({platform:'instagram'})};const state='fake-single-use-state';
 const stateHash=await security.hash(state);run('INSERT INTO oauth_states (id,owner,platform,verifier,redirect_uri,expires_at) VALUES (?,?,?,?,?,?)',stateHash,userA.userId,'instagram',await security.seal('fake-verifier',testEnv.TOKEN_ENCRYPTION_KEY),'https://firma.test/api/oauth/instagram/callback',Date.now()+60000);
 let calls=0;globalThis.fetch=async(url,init={})=>{calls++;assert(['https://api.instagram.com','https://graph.instagram.com'].includes(new URL(url).origin));
  if(String(url).includes('/oauth/access_token'))return Response.json({access_token:'FAKE-SHORT',user_id:'official-test-user',permissions:['instagram_business_basic','instagram_business_content_publish']});
  if(String(url).includes('/access_token?'))return Response.json({access_token:'FAKE-LONG',expires_in:5184000});
  return Response.json({user_id:'official-test-user',username:'test_profile'});
 };
 const req=()=>new Request('https://firma.test/api/oauth/instagram/callback?code=fake-code&state='+state);
 globalThis.testUser=userB;assert((await callback.GET(req(),params)).headers.get('location').includes('oauth_error'));assert.equal(calls,0);assert(row('SELECT id FROM oauth_states WHERE id=?',stateHash));
 globalThis.testUser=userA;assert((await callback.GET(req(),params)).headers.get('location').includes('connected=instagram'));assert.equal(calls,3);
 assert((await callback.GET(req(),params)).headers.get('location').includes('oauth_error'));assert.equal(calls,3);
 run('INSERT INTO oauth_states (id,owner,platform,verifier,redirect_uri,expires_at) VALUES (?,?,?,?,?,?)',stateHash,userA.userId,'instagram','not-read','https://firma.test/api/oauth/instagram/callback',0);
 assert((await callback.GET(req(),params)).headers.get('location').includes('oauth_error'));assert.equal(calls,3);
});
await check('Public OAuth callback saves to its initiating workspace without Sites identity',async()=>{
 const start=await mod('app/api/oauth/[platform]/start/route'),callback=await mod('app/api/oauth/[platform]/callback/route');
 const params={params:Promise.resolve({platform:'instagram'})};
 const begin=async()=>{globalThis.testUser=userA;const res=await start.POST(new Request('https://firma.test/api/oauth/instagram/start',{method:'POST',headers:{origin:'https://firma.test'}}),params);assert.equal(res.status,200);assert(res.headers.get('set-cookie').includes('HttpOnly'));assert(res.headers.get('set-cookie').includes('SameSite=Lax'));assert.equal(res.headers.get('cache-control'),'no-store');return {url:new URL((await res.json()).url),cookie:res.headers.get('set-cookie').split(';')[0]};};
 let calls=0,identity='managed-one';
 globalThis.fetch=async(url,init={})=>{calls++;const target=String(url);if(target.includes('/oauth/access_token'))return Response.json({data:[{access_token:'FAKE-ONLY-SHORT',user_id:identity,permissions:['instagram_business_basic','instagram_business_content_publish']}]});if(target.includes('/access_token?'))return Response.json({access_token:'FAKE-ONLY-LONG',expires_in:5184000});return Response.json({user_id:identity,username:identity});};
 const attempt=await begin();const state=attempt.url.searchParams.get('state');
 const callbackRequest=(cookie,platform='instagram')=>new Request('https://firma.test/api/oauth/'+platform+'/callback?code=FAKE-CODE&state='+state,{headers:cookie?{cookie}:{}});
 globalThis.testUser=null;
 const missing=await callback.GET(callbackRequest(),params);assert(new URL(missing.headers.get('location')).searchParams.get('oauth_error')==='browser');assert.equal(calls,0);
 const tampered=await callback.GET(callbackRequest(attempt.cookie+'changed'),params);assert(new URL(tampered.headers.get('location')).searchParams.has('oauth_error'));assert.equal(calls,0);
 globalThis.testUser=userB;assert(new URL((await callback.GET(callbackRequest(attempt.cookie),params)).headers.get('location')).searchParams.get('oauth_error')==='workspace');assert.equal(calls,0);
 globalThis.testUser=null;
 assert(new URL((await callback.GET(callbackRequest(attempt.cookie,'youtube'),{params:Promise.resolve({platform:'youtube'})})).headers.get('location')).searchParams.has('oauth_error'));assert.equal(calls,0);
 const result=await callback.GET(callbackRequest(attempt.cookie),params);assert.equal(result.status,302);assert(result.headers.get('set-cookie').includes('Max-Age=0'));
 const location=new URL(result.headers.get('location'));assert.equal(location.pathname,'/api/oauth/result');assert.equal(location.searchParams.get('connected'),'instagram');assert.equal(calls,3);
 const firstAccount=row('SELECT * FROM accounts WHERE owner=? AND provider_id=?',userA.userId,identity);assert(firstAccount);assert.equal(firstAccount.id,location.searchParams.get('account'));assert(!firstAccount.tokens.includes('FAKE-ONLY-LONG'));assert.equal(row('SELECT count(*) n FROM accounts WHERE owner=? AND provider_id=?',userB.userId,identity).n,0);
 const replay=await callback.GET(callbackRequest(attempt.cookie),params);assert(new URL(replay.headers.get('location')).searchParams.has('oauth_error'));assert.equal(calls,3);
 const page=await mod('app/api/oauth/result/route');const confirmation=page.GET(new Request(location));assert.equal(confirmation.status,200);assert.equal(confirmation.headers.get('cache-control'),'no-store');const html=await confirmation.text();assert(html.includes('Conta conectada ao Firma Social'));assert(!html.includes('FAKE-ONLY-LONG'));assert(!html.includes('FAKE-CODE'));
 async function connectNext(){const next=await begin();globalThis.testUser=null;const response=await callback.GET(new Request('https://firma.test/api/oauth/instagram/callback?code=FAKE-CODE&state='+next.url.searchParams.get('state'),{headers:{cookie:next.cookie}}),params);return new URL(response.headers.get('location')).searchParams.get('account');}
 identity='managed-two';const secondId=await connectNext();assert(secondId);assert.notEqual(secondId,firstAccount.id);
 identity='managed-one';assert.equal(await connectNext(),firstAccount.id);assert.equal(row("SELECT count(*) n FROM accounts WHERE owner=? AND provider_id IN ('managed-one','managed-two')",userA.userId).n,2);
 globalThis.testUser=userA;const dashboard=await(await route.GET()).json();assert(dashboard.accounts.some(a=>a.id===firstAccount.id));assert(dashboard.accounts.some(a=>a.id===secondId));
 const draft=await action('post.save',{...payload,title:'Multiple Instagram destinations',accountIds:[firstAccount.id,secondId],status:'draft'});assert.equal(draft.status,200);const draftId=(await draft.json()).id;assert.deepEqual(JSON.parse(row('SELECT account_ids FROM posts WHERE id=?',draftId).account_ids),[firstAccount.id,secondId]);assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',draftId).n,0);
 const schedule=await action('post.save',{...payload,title:'Two specific destinations',accountIds:[firstAccount.id,secondId]});assert.equal(schedule.status,200);const scheduledId=(await schedule.json()).id;assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',scheduledId).n,2);await action('post.cancel',{id:scheduledId});
});
await check('OAuth initiation requires the manager identity and rejects cross-origin POSTs',async()=>{
 const start=await mod('app/api/oauth/[platform]/start/route'),params={params:Promise.resolve({platform:'instagram'})};
 const req=origin=>new Request('https://firma.test/api/oauth/instagram/start',{method:'POST',headers:{origin}});
 const before=row('SELECT count(*) n FROM oauth_states').n;
 globalThis.testUser=null;assert.equal((await start.POST(req('https://firma.test'),params)).status,401);
 globalThis.testUser=userA;assert.equal((await start.POST(req('https://other.invalid'),params)).status,403);assert.equal(row('SELECT count(*) n FROM oauth_states').n,before);
});
// The link is a separate capability; OAuth state stays bound to the device
// that actually opens the official authorization, never to its IP address.
const linksRoute=await mod('app/api/connection-links/[platform]/route'),deviceRoute=await mod('app/api/connect/route');
const linkParams={params:Promise.resolve({platform:'instagram'})};
const linkReq=(method='GET',body={},origin='https://firma.test')=>new Request('https://firma.test/api/connection-links/instagram',{method,headers:{origin,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const deviceReq=(action,token,cookie,extra={})=>new Request('https://firma.test/api/connect',{method:'POST',headers:{origin:'https://firma.test','Content-Type':'application/json',...(cookie?{cookie}:{}),'x-forwarded-for':'203.0.113.45'},body:JSON.stringify({action,...(token?{token}:{}),...extra})});
async function makeLink(){globalThis.testUser=userA;const response=await linksRoute.POST(linkReq('POST'),linkParams);assert.equal(response.status,200);return (await response.json()).link;}
async function startDevice(link){const token=new URL(link.url).hash.slice(1);globalThis.testUser=null;const inspected=await deviceRoute.POST(deviceReq('inspect',token));assert.equal(inspected.status,200);const info=await inspected.json();const cookie=inspected.headers.get('set-cookie').split(';')[0];run('UPDATE connection_links SET last_started_at=0 WHERE id=?',link.id);const started=await deviceRoute.POST(deviceReq('start',undefined,cookie,{expectedLinkId:info.id}));assert.equal(started.status,200);return {info,linkCookie:cookie,url:new URL((await started.json()).url),cookie:started.headers.get('set-cookie').split(';')[0]};}
function providerOK(identity,onProfile=()=>{}){globalThis.fetch=async(url)=>{const target=String(url);if(target.includes('/oauth/access_token'))return Response.json({access_token:'PRIVATE-DEVICE-SHORT',user_id:identity});if(target.includes('/access_token?'))return Response.json({access_token:'PRIVATE-DEVICE-LONG',expires_in:5184000});onProfile();return Response.json({user_id:identity,username:identity});};}
await check('Only the manager can create, retrieve and revoke their reusable encrypted connection link',async()=>{
 const before=row('SELECT count(*) n FROM connection_links').n;
 globalThis.testUser=null;assert.equal((await linksRoute.POST(linkReq('POST'),linkParams)).status,401);assert.equal((await linksRoute.GET(linkReq(),linkParams)).status,401);
 globalThis.testUser=userA;assert.equal((await linksRoute.POST(linkReq('POST',{},'https://other.invalid'),linkParams)).status,403);assert.equal(row('SELECT count(*) n FROM connection_links').n,before);
 const link=await makeLink(),token=new URL(link.url).hash.slice(1);assert.equal(new URL(link.url).pathname,'/connect');assert.equal(new URL(link.url).search,'');assert.equal(token.length,43);assert.equal(link.id,await security.hash(token));assert(link.expiresAt>Date.now()+23*3600000);
 assert(!JSON.stringify(row('SELECT * FROM connection_links WHERE id=?',link.id)).includes(token));assert.equal((await makeLink()).url,link.url);
 const response=await linksRoute.GET(linkReq(),linkParams);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).link.url,link.url);
 globalThis.testUser=userB;assert.equal((await(await linksRoute.GET(linkReq(),linkParams)).json()).link,null);await linksRoute.DELETE(linkReq('DELETE',{id:link.id}),linkParams);assert(row('SELECT id FROM connection_links WHERE id=?',link.id));
 globalThis.testUser=userA;
});
await check('Opening a link only previews its destination; it never signs in or starts OAuth automatically',async()=>{
 const link=await makeLink(),token=new URL(link.url).hash.slice(1),before=row('SELECT count(*) n FROM oauth_states').n;
 globalThis.testUser=null;
 const landing=await mod('app/connect/route'),page=landing.GET(),html=await page.text();assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert(!html.includes(token));assert(html.includes("history.replaceState(null,'','/connect')"));
 const res=await deviceRoute.POST(deviceReq('inspect',token));assert.equal(res.status,200);const info=await res.json();assert.equal(info.workspaceName,'Firma Social');assert.equal(info.platform,'instagram');assert(!('owner' in info));assert(!('accounts' in info));assert(!JSON.stringify(info).includes(token));assert(!JSON.stringify(info).includes('fake-secret'));assert(res.headers.get('set-cookie').includes('HttpOnly'));assert(res.headers.get('set-cookie').includes('Secure'));assert.equal(row('SELECT count(*) n FROM oauth_states').n,before);
 assert.equal((await route.GET()).status,401);
 const cross=deviceReq('start',token,undefined,{expectedLinkId:link.id});cross.headers.set('origin','https://other.invalid');assert.equal((await deviceRoute.POST(cross)).status,403);
 assert.equal((await deviceRoute.POST(deviceReq('inspect','bad'))).status,400);
 assert.equal((await deviceRoute.POST(deviceReq('inspect',security.randomToken()))).status,410);
 assert.equal((await deviceRoute.POST(deviceReq('start',token,undefined,{expectedLinkId:'wrong-workspace-link'}))).status,409);assert.equal(row('SELECT count(*) n FROM oauth_states').n,before);
 globalThis.testUser=userA;
});
await check('Different devices and Sites sessions save multiple Instagram profiles only to the link owner',async()=>{
 const link=await makeLink(),callback=await mod('app/api/oauth/[platform]/callback/route');
 const a=await startDevice(link),b=await startDevice(link);assert.notEqual(a.cookie,b.cookie);assert.notEqual(a.url.searchParams.get('state'),b.url.searchParams.get('state'));
 const callbackReq=(device,cookie)=>new Request('https://firma.test/api/oauth/instagram/callback?code=FAKE-DEVICE-CODE&state='+device.url.searchParams.get('state'),{headers:{cookie,'x-forwarded-for':'198.51.100.90'}});
 providerOK('different-device-one');
 // A transferred OAuth URL alone cannot skip the receiving-device proof,
 // even with the manager logged in; another device's proof cannot be reused.
 globalThis.testUser=userA;const missing=await callback.GET(callbackReq(a,''),linkParams);assert.equal(new URL(missing.headers.get('location')).searchParams.get('oauth_error'),'browser');
 assert.equal(new URL((await callback.GET(callbackReq(a,b.cookie),linkParams)).headers.get('location')).searchParams.get('oauth_error'),'browser');
 globalThis.testUser=userB;const done=await callback.GET(callbackReq(a,a.cookie),linkParams),location=new URL(done.headers.get('location'));assert.equal(location.searchParams.get('connected'),'instagram');assert.equal(location.searchParams.get('device'),'remote');
 const account=row('SELECT * FROM accounts WHERE owner=? AND provider_id=?',userA.userId,'different-device-one');assert(account);assert.equal(row('SELECT count(*) n FROM accounts WHERE owner=? AND provider_id=?',userB.userId,'different-device-one').n,0);assert(!account.tokens.includes('PRIVATE-DEVICE'));
 const resultPage=await mod('app/api/oauth/result/route'),html=await resultPage.GET(new Request(location)).text();assert(html.includes('painel original'));assert(html.includes('Conectar outra conta neste dispositivo'));assert(!html.includes('Abrir contas conectadas'));assert(!html.includes('PRIVATE-DEVICE'));
 assert(new URL((await callback.GET(callbackReq(a,a.cookie),linkParams)).headers.get('location')).searchParams.has('oauth_error'));
 providerOK('different-device-two');globalThis.testUser=null;assert.equal(new URL((await callback.GET(callbackReq(b,b.cookie),linkParams)).headers.get('location')).searchParams.get('connected'),'instagram');
 const c=await startDevice(link);providerOK('different-device-one');const again=await callback.GET(callbackReq(c,c.cookie),linkParams);assert.equal(new URL(again.headers.get('location')).searchParams.get('account'),account.id);
 assert.equal(row('SELECT completed_count FROM connection_links WHERE id=?',link.id).completed_count,3);assert.equal(row("SELECT count(*) n FROM accounts WHERE owner=? AND provider_id LIKE 'different-device-%'",userA.userId).n,2);
 globalThis.testUser=userA;const state=await(await route.GET()).json();assert(state.accounts.some(a=>a.id===account.id));assert(!JSON.stringify(state).includes('PRIVATE-DEVICE'));
});
await check('Revocation blocks new starts and outstanding callbacks, including a revocation during provider exchange',async()=>{
 const callback=await mod('app/api/oauth/[platform]/callback/route');
 for(const duringExchange of [false,true]){
  const link=await makeLink(),device=await startDevice(link),before=row('SELECT count(*) n FROM accounts').n;let calls=0;
  const revoke=()=>run('DELETE FROM connection_links WHERE id=?',link.id);
  if(!duringExchange)revoke();
  providerOK('revoked-device',()=>{if(duringExchange)revoke();});const realFetch=globalThis.fetch;globalThis.fetch=(...args)=>{calls++;return realFetch(...args);};
  globalThis.testUser=null;const response=await callback.GET(new Request('https://firma.test/api/oauth/instagram/callback?code=FAKE&state='+device.url.searchParams.get('state'),{headers:{cookie:device.cookie}}),linkParams);
  assert.equal(new URL(response.headers.get('location')).searchParams.get('oauth_error'),'link_expired');assert.equal(calls,duringExchange?3:0);assert.equal(row('SELECT count(*) n FROM accounts').n,before);
  assert.equal((await deviceRoute.POST(deviceReq('start',new URL(link.url).hash.slice(1),undefined,{expectedLinkId:link.id}))).status,410);
 }
 const link=await makeLink();await linksRoute.DELETE(linkReq('DELETE',{id:link.id}),linkParams);assert(!row('SELECT id FROM connection_links WHERE id=?',link.id));
 globalThis.testUser=userA;
});
await check('Expired links cannot authorize and regeneration never reuses an expired secret',async()=>{
 const link=await makeLink(),device=await startDevice(link),callback=await mod('app/api/oauth/[platform]/callback/route');
 run('UPDATE connection_links SET expires_at=0 WHERE id=?',link.id);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not contact provider');};
 assert.equal((await deviceRoute.POST(deviceReq('inspect',new URL(link.url).hash.slice(1)))).status,410);
 const result=await callback.GET(new Request('https://firma.test/api/oauth/instagram/callback?code=FAKE&state='+device.url.searchParams.get('state'),{headers:{cookie:device.cookie}}),linkParams);assert.equal(new URL(result.headers.get('location')).searchParams.get('oauth_error'),'link_expired');assert.equal(calls,0);
 const next=await makeLink();assert.notEqual(next.url,link.url);assert.notEqual(next.id,link.id);
 const nextDevice=await startDevice(next);const blocked=await deviceRoute.POST(deviceReq('start',new URL(next.url).hash.slice(1),undefined,{expectedLinkId:next.id}));assert.equal(blocked.status,429);assert(nextDevice.cookie);
 globalThis.testUser=userA;
});
await check('Incomplete provider identity cannot create an Instagram connection',async()=>{
 globalThis.fetch=async url=>Response.json(String(url).includes('/oauth/access_token')?{access_token:'FAKE-SHORT'}:String(url).includes('/access_token?')?{access_token:'FAKE-LONG',expires_in:5184000}:{username:'without-an-id'});
 await assert.rejects(()=>providers.exchange('instagram',{clientId:'fake',clientSecret:'fake'},'code','https://firma.test/callback',''),e=>e instanceof providers.OAuthExchangeError && e.stage==='profile_lookup' && e.reason==='profile_lookup');
});
await check('Instagram flat OAuth errors and nested Graph errors retain only safe diagnostics',async()=>{
 const samples=[
  [400,{error_type:'OAuthException',code:400,error_message:'Invalid app_secret: PRIVATE-SECRET'},'app_secret','400'],
  [400,{error_type:'OAuthException',code:400,error_message:'Error validating verification code. Please make sure your redirect_uri is identical. PRIVATE-URL'},'redirect_uri','400'],
  [400,{error_type:'OAuthException',code:400,error_message:'Matching code was not found or was already used: PRIVATE-CODE'},'authorization_code','400'],
  [400,{error_type:'OAuthException',code:400,error_message:'Invalid client_id: PRIVATE-ID'},'app_credentials','400'],
  [400,{error:{code:200,error_subcode:123,message:'Permissions error PRIVATE-TOKEN'}},'permissions','200'],
  [503,{error:{code:2,message:'PRIVATE-DETAIL'}},'temporary','2'],
  [400,{error:{code:'PRIVATE-CODE',message:'PRIVATE-DETAIL'}},'provider','400'],
  [200,{error_type:'OAuthException',code:400,error_message:'Invalid app_secret PRIVATE-SECRET'},'app_secret','400']
 ];
 for(const [status,body,failure,code] of samples){
  globalThis.fetch=async()=>Response.json(body,{status});
  await assert.rejects(()=>providers.api('https://api.instagram.com/oauth/access_token',{method:'POST'}),error=>{
   assert(error instanceof providers.RemoteError);assert.equal(error.failure,failure);assert.equal(error.code,code);assert.equal(error.diagnostic.httpStatus,status);
   assert(!JSON.stringify(error).includes('PRIVATE-'));assert(!error.message.includes('PRIVATE-'));return true;
  });
 }
 globalThis.fetch=async()=>Response.json({data:{ok:true},error:{code:'ok',message:''}});assert((await providers.api('https://open.tiktokapis.com/test')).data.ok);
});
await check('OAuth failures identify the exact exchange step without saving accounts or leaking secrets',async()=>{
 const start=await mod('app/api/oauth/[platform]/start/route'),callback=await mod('app/api/oauth/[platform]/callback/route'),resultPage=await mod('app/api/oauth/result/route');
 const params={params:Promise.resolve({platform:'instagram'})},before=row('SELECT count(*) n FROM accounts').n;
 const originalWarn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try{
  for(const [failedStep,response,reason] of [
   ['token_exchange',()=>Response.json({error_type:'OAuthException',code:400,error_message:'Invalid app_secret PRIVATE-SECRET'},{status:400}),'app_secret'],
   ['token_exchange',()=>Response.json({error:{code:400,message:'Unspecified PRIVATE-SECRET'}},{status:400}),'token_exchange'],
   ['token_extension',()=>Response.json({error:{code:2,message:'PRIVATE-SECRET'}},{status:503}),'temporary'],
   ['profile_lookup',()=>Response.json({error:{code:200,error_subcode:123,message:'Permissions error PRIVATE-TOKEN'}},{status:400}),'permissions']
  ]){
   globalThis.testUser=userA;
   const res=await start.POST(new Request('https://firma.test/api/oauth/instagram/start',{method:'POST',headers:{origin:'https://firma.test'}}),params);
   const target=new URL((await res.json()).url),cookie=res.headers.get('set-cookie').split(';')[0];
   const state=target.searchParams.get('state');globalThis.testUser=null;let calls=0;
   globalThis.fetch=async(url,init={})=>{
    calls++;const u=new URL(url),step=u.pathname==='/oauth/access_token'?'token_exchange':u.pathname==='/access_token'?'token_extension':'profile_lookup';
    if(step==='token_exchange'){
     assert(init.body instanceof FormData);assert.equal(init.body.get('client_id'),'fake-id');assert.equal(init.body.get('client_secret'),'fake-secret');assert.equal(init.body.get('redirect_uri'),target.searchParams.get('redirect_uri'));assert.equal(init.body.get('code'),'PRIVATE-CODE');
    }
    if(step===failedStep)return response();
    return Response.json(step==='token_exchange'?{access_token:'PRIVATE-SHORT',user_id:'never-saved'}:{access_token:'PRIVATE-LONG',expires_in:5184000});
   };
   const result=await callback.GET(new Request('https://firma.test/api/oauth/instagram/callback?state='+state+'&code=PRIVATE-CODE',{headers:{cookie}}),params);
   const location=new URL(result.headers.get('location'));assert.equal(location.searchParams.get('oauth_error'),reason);
   assert.equal(calls,{token_exchange:1,token_extension:2,profile_lookup:3}[failedStep]);assert.equal(row('SELECT count(*) n FROM accounts').n,before);
   assert(!row('SELECT id FROM oauth_states WHERE id=?',await security.hash(state)));assert(result.headers.get('set-cookie').includes('Max-Age=0'));
   const html=await resultPage.GET(new Request(location)).text();assert(!html.includes('PRIVATE-'));assert(!location.href.includes('PRIVATE-'));assert(html.includes('A conexão não foi concluída'));
   const diagnostic=logs.at(-1)[1];assert.equal(diagnostic.stage,failedStep);assert.equal(diagnostic.reason,reason);assert(Number.isInteger(diagnostic.httpStatus));
  }
  assert(!JSON.stringify(logs).includes('PRIVATE-'));assert(!JSON.stringify(rows("SELECT detail FROM events WHERE title='Conexão não concluída'")).includes('PRIVATE-'));
 }finally{console.warn=originalWarn;globalThis.testUser=userA;}
});
await check('Transient token refresh failure preserves the connection; revoked authorization expires it',async()=>{
 run('UPDATE accounts SET expires_at=? WHERE id=?',Date.now()-1,aid);let account=row('SELECT * FROM accounts WHERE id=?',aid);
 globalThis.fetch=async()=>Response.json({error:{code:2}},{status:503});await assert.rejects(()=>providers.accessToken(account),e=>e.retryable);
 assert.equal(row('SELECT state FROM accounts WHERE id=?',aid).state,'connected');assert.equal(row('SELECT tokens FROM accounts WHERE id=?',aid).tokens,account.tokens);
 globalThis.fetch=async()=>Response.json({error:{code:190}},{status:400});await assert.rejects(()=>providers.accessToken(account),/Reconecte/);assert.equal(row('SELECT state FROM accounts WHERE id=?',aid).state,'expired');
 run("UPDATE accounts SET state='connected',expires_at=? WHERE id=?",Date.now()+1e9,aid);
});
await check('Disconnecting during refresh never restores removed credentials',async()=>{
 run('UPDATE accounts SET expires_at=1 WHERE id=?',aid);const account=row('SELECT * FROM accounts WHERE id=?',aid);
 globalThis.fetch=async()=>{run("UPDATE accounts SET state='disconnected',tokens='' WHERE id=?",aid);return Response.json({access_token:'NEW-FAKE',expires_in:5184000});};
 await assert.rejects(()=>providers.accessToken(account),/desconectada/);assert.equal(row('SELECT tokens FROM accounts WHERE id=?',aid).tokens,'');
 run("UPDATE accounts SET state='connected',tokens=?,expires_at=? WHERE id=?",account.tokens,Date.now()+1e9,aid);
});
await check('A failed Instagram status query resumes its checkpoint without recreating media',async()=>{
 const id=await scheduled();let creates=0,publishes=0,polls=0;
 globalThis.fetch=async(url,init={})=>{if(String(url).endsWith('/media')){creates++;return Response.json({id:'stable-container'});}if(String(url).includes('/media_publish')){publishes++;return Response.json({id:'confirmed-media'});}if(++polls===1)throw new TypeError('temporary connection loss');return Response.json({status_code:'FINISHED'});};
 await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'processing');assert.equal(creates,1);assert.equal(publishes,0);
 run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);await queue.processQueue(userA.userId);
 assert.equal(creates,1);assert.equal(publishes,1);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'published');assert.equal(row('SELECT error FROM deliveries WHERE post_id=?',id).error,null);
});
await check('TikTok status POST is retried as a query, without resending the video',async()=>{
 const tt=row("SELECT id FROM accounts WHERE owner=? AND platform='tiktok'",userA.userId);const response=await action('post.save',{...payload,platforms:['tiktok'],accountIds:[tt.id],options:{tiktokMode:'inbox'}});assert.equal(response.status,200);const id=(await response.json()).id;run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);
 let sends=0,polls=0;globalThis.fetch=async url=>{if(String(url).includes('/inbox/video/init/')){sends++;return Response.json({data:{publish_id:'persistent-tt-id'},error:{code:'ok'}});}if(++polls===1)return Response.json({error:{code:'temporary_error'}},{status:503});return Response.json({data:{status:'SEND_TO_USER_INBOX'},error:{code:'ok'}});};
 await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'processing');run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);await queue.processQueue(userA.userId);assert.equal(sends,1);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'inbox');
});
await check('A worker that loses its lease stops before the final publish call',async()=>{
 const id=await scheduled();let publishes=0;globalThis.fetch=async url=>{if(String(url).endsWith('/media'))return Response.json({id:'lease-container'});if(String(url).includes('/media_publish')){publishes++;return Response.json({id:'must-not-publish'});}run("UPDATE deliveries SET status='uncertain',lease=NULL,lease_until=NULL WHERE post_id=?",id);return Response.json({status_code:'FINISHED'});};
 await queue.processQueue(userA.userId);assert.equal(publishes,0);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'uncertain');
});
await check('Disconnecting an account during processing blocks the final publish call',async()=>{
 const id=await scheduled();let publishes=0;globalThis.fetch=async url=>{if(String(url).endsWith('/media'))return Response.json({id:'disconnected-container'});if(String(url).includes('/media_publish')){publishes++;return Response.json({id:'must-not-publish'});}run("UPDATE accounts SET state='disconnected' WHERE id=?",aid);return Response.json({status_code:'FINISHED'});};
 await queue.processQueue(userA.userId);assert.equal(publishes,0);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'failed');run("UPDATE accounts SET state='connected' WHERE id=?",aid);
});
await check('Routines advance the local date across DST and keep nonexistent times as unscheduled drafts',async()=>{
 assert.equal(domain.nextLocalDate(Date.parse('2026-11-01T04:30:00Z'),'America/New_York'),'2026-11-02');
 assert.equal(domain.nextLocalDate(Date.parse('2026-03-08T04:30:00Z'),'America/New_York'),'2026-03-08');
 globalThis.testUser=userB;await action('workspace.save',{name:'DST workspace',timezone:'America/New_York'});
 await action('rule.save',{name:'DST gap draft',time:'02:30',weekdays:[0,1,2,3,4,5,6],caption:'Draft only',accountIds:[],mediaIds:[]});
 const realNow=Date.now;try{Date.now=()=>Date.parse('2026-03-07T17:00:00Z');await queue.processQueue(userB.userId);}finally{Date.now=realNow;globalThis.testUser=userA;}
 const draft=row("SELECT status,scheduled_at FROM posts WHERE owner=? AND title='DST gap draft'",userB.userId);assert.equal(draft.status,'draft');assert.equal(draft.scheduled_at,null);
});
let referenceId,modelId;
await check('Reference handles are normalized, unique per owner, and limited to the selected official host',async()=>{
 const result=await action('reference.profile.save',{platform:'instagram',handle:' https://www.instagram.com/Example.Page/?utm_source=test ',niche:'Moda',kind:'model',notes:'Enquadramento e luz',favorite:true});assert.equal(result.status,200);referenceId=(await result.json()).id;
 assert.equal(row('SELECT handle FROM reference_profiles WHERE id=?',referenceId).handle,'example.page');
 assert.equal((await action('reference.profile.save',{platform:'instagram',handle:'@EXAMPLE.PAGE'})).status,409);
 for(const handle of ['https://instagram.com.attacker.invalid/example','https://instagram.com/p/post-id','@has spaces','https://attacker.invalid/@profile'])assert.equal((await action('reference.profile.save',{platform:'instagram',handle})).status,400);
 const mine=await(await route.GET()).json();assert.equal(mine.referenceProfiles[0].favorite,true);assert.equal(mine.referenceProfiles[0].kind,'model');
 globalThis.testUser=userB;assert.equal((await(await route.GET()).json()).referenceProfiles.length,0);
 assert.equal((await action('reference.profile.save',{id:referenceId,version:1,platform:'instagram',handle:'@changed'})).status,409);
 assert.equal((await action('reference.profile.save',{platform:'instagram',handle:'@EXAMPLE.PAGE'})).status,200);globalThis.testUser=userA;
});
await check('Models preserve private notes and validate source links and owned profile associations',async()=>{
 const model={platform:'instagram',referenceId,title:'Três passos',niche:'Moda',sourceUrl:'https://www.instagram.com/reel/example/',format:'video',hook:'Como melhorar?',outline:'Observações pessoais',caption:'Minha própria legenda'};
 globalThis.testUser=userB;assert.equal((await action('reference.model.save',model)).status,400);globalThis.testUser=userA;
 assert.equal((await action('reference.model.save',{...model,sourceUrl:'javascript:alert(1)'})).status,400);
 assert.equal((await action('reference.model.save',{...model,sourceUrl:'https://instagram.com.attacker.invalid/reel/a'})).status,400);
 const result=await action('reference.model.save',model);assert.equal(result.status,200);modelId=(await result.json()).id;
 const mine=await(await route.GET()).json();const saved=mine.referenceModels.find(m=>m.id===modelId);assert.equal(saved.outline,'Observações pessoais');assert.equal(saved.caption,'Minha própria legenda');
 const draft=await action('post.save',{title:saved.title,caption:saved.caption,platforms:[saved.platform],format:saved.format,status:'draft'});assert.equal(draft.status,200);assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',(await draft.json()).id).n,0);
});
await check('Stale edits cannot overwrite references; deleting a profile keeps its models and drafts',async()=>{
 const original=row('SELECT * FROM reference_profiles WHERE id=?',referenceId);
 assert.equal((await action('reference.profile.save',{id:referenceId,version:original.version,platform:'instagram',handle:original.handle,displayName:'My reference',kind:'model',niche:'Moda',favorite:true})).status,200);
 assert.equal((await action('reference.profile.save',{id:referenceId,version:original.version,platform:'instagram',handle:'stale'})).status,409);
 assert.equal((await action('reference.profile.delete',{id:referenceId,version:original.version})).status,409);assert.equal(row('SELECT reference_id FROM reference_models WHERE id=?',modelId).reference_id,referenceId);
 assert.equal((await action('reference.profile.save',{id:referenceId,version:original.version+1,platform:'tiktok',handle:'different-network'})).status,400);
 const before=row('SELECT count(*) n FROM posts').n;assert.equal((await action('reference.profile.delete',{id:referenceId,version:original.version+1})).status,200);
 assert.equal(row('SELECT reference_id FROM reference_models WHERE id=?',modelId).reference_id,null);assert.equal(row('SELECT version FROM reference_models WHERE id=?',modelId).version,2);assert.equal(row('SELECT count(*) n FROM posts').n,before);
 globalThis.testUser=userB;assert.equal((await action('reference.model.delete',{id:modelId,version:2})).status,409);globalThis.testUser=userA;
 assert.equal((await action('reference.model.delete',{id:modelId,version:2})).status,200);assert.equal(row('SELECT count(*) n FROM posts').n,before);
});
await check('Invalid and private media URLs return a helpful validation error',async()=>{
 for(const value of ['not a URL','http://example.com/a.jpg','https://127.0.0.1/a','https://0.0.0.0/a','https://192.168.1.1/a','https://user:password@example.com/a']){
  const response=await action('media.update',{id:mid,name:'Owned media',folder:'Geral',publicUrl:value});assert.equal(response.status,400);assert((await response.json()).error.includes('HTTPS'));
 }
});

await check('Public service runner requires a secret, scopes work to its owner and separates automatic heartbeats',async()=>{
 globalThis.testUser=null;const token='test-only-site-service-access-token';testEnv.RUNNER_SERVICE_TOKEN_SHA256=await security.hash(token);testEnv.RUNNER_OWNER_ID=userA.userId;
 const make=(extra={},method='POST')=>new Request('https://firma.test/api/runner',{method,headers:{'x-firma-service':'queue-v1',...extra}});
 assert.equal((await runner.POST(make())).status,403);assert.equal((await runner.GET(make({},'GET'))).status,403);
 assert.equal((await runner.POST(make({Authorization:'Bearer wrong-token'}))).status,403);
 assert.equal((await runner.POST(make({Authorization:'Bearer '+token,Origin:'https://firma.test'}))).status,403);
 testEnv.SCHEDULER_ENABLED='false';assert.equal((await runner.POST(make({Authorization:'Bearer '+token}))).status,403);testEnv.SCHEDULER_ENABLED='true';
 const before=JSON.stringify(rows('SELECT * FROM posts WHERE owner=?',userB.userId));const write=await runner.POST(make({Authorization:'Bearer '+token}));assert.equal(write.status,200);const result=await write.json();
 const read=await runner.GET(make({Authorization:'Bearer '+token},'GET'));const persisted=await read.json();assert.equal(persisted.lastRun.checkedAt,result.checkedAt);assert.equal(row('SELECT checked_at FROM runner_status WHERE owner=?','service:'+userA.userId).checked_at,result.checkedAt);assert.equal(JSON.stringify(rows('SELECT * FROM posts WHERE owner=?',userB.userId)),before);
 globalThis.testUser=userA;const snapshot=await(await route.GET()).json();assert.equal(snapshot.scheduler.enabled,true);assert.equal(snapshot.scheduler.healthy,true);assert.equal(snapshot.scheduler.lastCheckedAt,result.checkedAt);
 globalThis.testUser=userB;assert.equal((await(await route.GET()).json()).scheduler.enabled,false);globalThis.testUser=userA;
});
await check('Inactive scheduling is rejected instead of silently accepting an unattended publication',async()=>{
 testEnv.SCHEDULER_ENABLED='false';const before=row('SELECT count(*) n FROM posts').n;const result=await action('post.save',payload);assert.equal(result.status,409);assert.equal(row('SELECT count(*) n FROM posts').n,before);testEnv.SCHEDULER_ENABLED='true';
 const scheduler=await mod('lib/scheduler');assert.equal(scheduler.schedulerHealth(true,new Date(Date.now()-91*60000).toISOString(),1).healthy,false);
});

await check('Instagram downloads owned video and Reel cover without an external media URL',async()=>{
 globalThis.testUser=userA;const coverId=security.id(),foreignId=security.id();
 run('INSERT INTO media(id,owner,name,mime,size,storage_key,folder,created_at) VALUES(?,?,?,?,?,?,?,?)',coverId,userA.userId,'cover.jpg','image/jpeg',4,'cover-object','Geral',Date.now());objects.set('cover-object',new Uint8Array([255,216,255,217]).buffer);
 run('INSERT INTO media(id,owner,name,mime,size,storage_key,folder,created_at) VALUES(?,?,?,?,?,?,?,?)',foreignId,userB.userId,'private.jpg','image/jpeg',4,'foreign-object','Geral',Date.now());objects.set('foreign-object',new Uint8Array([1,2,3,4]).buffer);
 run('UPDATE media SET public_url=NULL WHERE id=?',mid);
 const result=await action('post.save',{...payload,options:{instagramCoverMediaId:coverId}});assert.equal(result.status,200);const id=(await result.json()).id;run('UPDATE deliveries SET next_run=0 WHERE post_id=?',id);
 assert.equal((await action('media.delete',{id:coverId})).status,400);
 assert.equal((await action('post.save',{...payload,status:'draft',options:{instagramCoverMediaId:foreignId}})).status,400);
 assert.equal((await action('post.save',{...payload,format:'story',options:{instagramCoverMediaId:coverId}})).status,400);
 const mediaDelivery=await mod('lib/media-delivery'),publicRoute=await mod('app/api/publish-media/[token]/route');let urls;
 globalThis.fetch=async(url,init={})=>{if(String(url).endsWith('/media')){const form=new URLSearchParams(init.body);assert.equal(form.get('media_type'),'REELS');urls={video:form.get('video_url'),cover:form.get('cover_url')};assert(urls.video.startsWith('https://firma.test/api/publish-media/'));assert(urls.cover.startsWith('https://firma.test/api/publish-media/'));return Response.json({id:'media-with-cover'});}if(String(url).includes('/media_publish'))return Response.json({id:'published-cover'});return Response.json({status_code:'FINISHED'});};
 await queue.processQueue(userA.userId);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'published');
 const read=(url,headers={},method='GET')=>publicRoute[method](new Request(url,{headers,method}),{params:Promise.resolve({token:new URL(url).pathname.split('/').pop()})});
 globalThis.testUser=null;let file=await read(urls.video);assert.equal(file.status,200);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([1,2,3]));assert.equal(file.headers.get('content-type'),'video/mp4');
 file=await read(urls.video,{Range:'bytes=1-2'});assert.equal(file.status,206);assert.equal(file.headers.get('content-range'),'bytes 1-2/3');assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([2,3]));
 assert.equal((await read(urls.video,{Range:'bytes=9-'})).status,416);assert.equal((await read(urls.cover,{},'HEAD')).headers.get('content-type'),'image/jpeg');assert.equal((await read(urls.cover,{},'HEAD')).body,null);
 const originalToken=new URL(urls.video).pathname.split('/').pop(),grant=await security.unseal(originalToken,testEnv.TOKEN_ENCRYPTION_KEY);
 const expired=await security.seal({...grant,expires:Date.now()-1},testEnv.TOKEN_ENCRYPTION_KEY);assert.equal((await read('https://firma.test/api/publish-media/'+expired)).status,404);
 assert.equal((await read(urls.video.slice(0,-3)+'xyz')).status,404);
 const wrong=await mediaDelivery.instagramMediaURL({id:foreignId},{id:grant.deliveryId,owner:grant.owner});assert.equal((await read(wrong)).status,404);
 run("UPDATE deliveries SET status='cancelled' WHERE post_id=?",id);assert.equal((await read(urls.video)).status,404);globalThis.testUser=userA;
});

await check('Portable restore preserves credentials across owners and encryption keys without overwriting data',async()=>{
 const migration=await mod('lib/migration');globalThis.testUser=userA;
 run("UPDATE deliveries SET status='cancelled' WHERE status IN ('working','processing')");
 const backup=await migration.exportData(userA.userId);assert.equal(backup.format,'firma-portable-v1');assert(backup.data.accounts.length);assert.equal(typeof backup.data.accounts.find(a=>a.tokens).tokens,'object');
 const small=structuredClone(backup);for(const t of migration.tables)if(!['workspaces','accounts','provider_configs','media'].includes(t))small.data[t]=[];
 small.data.accounts=small.data.accounts.slice(0,1);const oldId=small.data.accounts[0].id;small.data.accounts[0].id=security.id();const tokens=structuredClone(small.data.accounts[0].tokens);
 for(const c of small.data.provider_configs)c.id=security.id();const g={kind:'firma-migration-v1',mode:'import',owner:'new-migration-owner',nonce:security.id(),expires:Date.now()+60000};
 for(const m of small.data.media){const content=objects.get(m.storage_key);assert(content);m.id=security.id();m.size=content.byteLength;objects.set('migration/'+g.nonce+'/'+m.id,content);}
 const before=row('SELECT count(*) n FROM accounts').n,oldKey=testEnv.TOKEN_ENCRYPTION_KEY;testEnv.TOKEN_ENCRYPTION_KEY='different-destination-key-long-enough-123';
 try{const result=await migration.restoreData(g,structuredClone(small));assert.equal(result.accounts,1);const stored=row('SELECT * FROM accounts WHERE owner=?',g.owner);assert.deepEqual(await security.unseal(stored.tokens,testEnv.TOKEN_ENCRYPTION_KEY),tokens);await assert.rejects(()=>security.unseal(stored.tokens,oldKey));assert.equal(row('SELECT owner FROM accounts WHERE id=?',oldId).owner,userA.userId);assert.equal(row('SELECT count(*) n FROM accounts').n,before+1);
 await assert.rejects(()=>migration.restoreData({...g,nonce:security.id()},structuredClone(small)));assert.equal(row('SELECT count(*) n FROM accounts').n,before+1);
 const occupied={...g,owner:userB.userId,nonce:security.id()};const noMedia=structuredClone(small);noMedia.data.media=[];await assert.rejects(()=>migration.restoreData(occupied,noMedia));assert.equal(row('SELECT count(*) n FROM migration_receipts WHERE owner=?',userB.userId).n,0);
 }finally{testEnv.TOKEN_ENCRYPTION_KEY=oldKey;}
 const token=await security.seal({...g,mode:'export'},oldKey);const req=new Request('https://firma.test/api/migration',{headers:{Authorization:'Bearer '+token}});assert.equal((await migration.grant(req)).owner,g.owner);await assert.rejects(()=>migration.grant(new Request(req,{headers:{Authorization:'Bearer '+token,Origin:'https://firma.test'}})));
});
await check('A complete backup restores cover references, history and paused schedules into a fresh database',async()=>{
 const migration=await mod('lib/migration');const source=db,oldKey=testEnv.TOKEN_ENCRYPTION_KEY;
 run("UPDATE deliveries SET status='cancelled' WHERE status IN ('working','processing')");
 const pending=row("SELECT id FROM posts WHERE owner=? LIMIT 1",userA.userId);run("UPDATE posts SET status='scheduled' WHERE id=?",pending.id);
 const snapshot=await migration.exportData(userA.userId),g={kind:'firma-migration-v1',mode:'import',owner:'portable-owner',nonce:security.id(),expires:Date.now()+60000};
 for(const m of snapshot.data.media){const bytes=objects.get(m.storage_key);assert(bytes);m.size=bytes.byteLength;objects.set('migration/'+g.nonce+'/'+m.id,bytes);}
 const withContext=snapshot.data.deliveries.find(d=>Object.keys(d.context).length),context=withContext&&structuredClone(withContext.context);
 try{db=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));testEnv.TOKEN_ENCRYPTION_KEY='another-host-key-with-over-32-characters';
 const result=await migration.restoreData(g,structuredClone(snapshot));assert.equal(result.accounts,snapshot.data.accounts.length);assert.equal(row('SELECT status FROM posts WHERE id=?',pending.id).status,'pending_approval');assert.equal(row('SELECT count(*) n FROM rules WHERE active<>0').n,0);assert.equal(row('SELECT count(*) n FROM accounts WHERE owner<>?',g.owner).n,0);
 if(withContext)assert.deepEqual(await security.unseal(row('SELECT context FROM deliveries WHERE id=?',withContext.id).context,testEnv.TOKEN_ENCRYPTION_KEY),context);
 const covered=snapshot.data.posts.find(p=>JSON.parse(p.options).instagramCoverMediaId);assert(covered);assert.equal(JSON.parse(row('SELECT options FROM posts WHERE id=?',covered.id).options).instagramCoverMediaId,JSON.parse(covered.options).instagramCoverMediaId);
 }finally{db.close();db=source;testEnv.TOKEN_ENCRYPTION_KEY=oldKey;}
});

await check('Encrypted backup detects wrong passwords and tampering and handles streamed media',async()=>{
 const {encrypt,decrypt}=await import(pathToFileURL(path.join(root,'scripts/migrate.mjs')));const {Readable,Writable}=await import('node:stream');const file=path.join(out,'test.firma'),plain=Buffer.alloc(1024*1024,71),password='test-long-migration-password';await encrypt(Readable.from([plain]),file,password);const read=async p=>{const chunks=[];await decrypt(file,p,new Writable({write(c,e,cb){chunks.push(c);cb();}}));return Buffer.concat(chunks);};assert.deepEqual(await read(password),plain);await assert.rejects(()=>read('wrong-password'));const data=fs.readFileSync(file);data[100]^=1;fs.writeFileSync(file,data);await assert.rejects(()=>read(password));
});
await check('Standalone identity validates signature, audience and expiration rather than trusting headers',async()=>{
 const {accessIdentity}=await mod('lib/access-identity');const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';globalThis.fetch=async()=>Response.json({keys:[jwk]});const issuer='https://test.cloudflareaccess.com';
 const make=async changes=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const text=enc({alg:'RS256',kid:'test'})+'.'+enc({iss:issuer,aud:['expected'],sub:'subject',email:'test@example.invalid',type:'app',iat:Date.now()/1000-10,exp:Date.now()/1000+60,...changes});return text+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(text))).toString('base64url');};
 const token=await make({});assert.equal((await accessIdentity(token,issuer,'expected')).userId,'access:subject');assert.equal(await accessIdentity(token,issuer,'wrong'),null);assert.equal(await accessIdentity(await make({exp:1}),issuer,'expected'),null);assert.equal(await accessIdentity(token.slice(0,-10)+'AAAAAAAAAA',issuer,'expected'),null);assert.equal(await accessIdentity(null,issuer,'expected'),null);
});

await check('Publishing quotas use live account values, stay owner-scoped and never refresh or expose credentials',async()=>{
 const limits=await mod('lib/publishing-limits');const quotaId=security.id();const encrypted=await security.seal({access_token:'FAKE-QUOTA-ONLY'},testEnv.TOKEN_ENCRYPTION_KEY);const expires=Date.now()+600000;
 run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',quotaId,userA.userId,'instagram','quota-test-only','quota_profile','Quota',encrypted,expires,'basic','connected',Date.now());
 let calls=0,missing=false;const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://graph.instagram.com');assert(u.pathname.endsWith('/quota-test-only/content_publishing_limit'));assert.equal(u.searchParams.get('fields'),'quota_usage,config');assert.equal(init.headers.Authorization,'Bearer FAKE-QUOTA-ONLY');assert.equal(init.body,undefined);return Response.json({data:[missing?{quota_usage:6}:{quota_usage:6,config:{quota_total:100,quota_duration:86400}}]});};
 try{
  const quota=await limits.instagramPublishingLimits(userA.userId,quotaId);assert.equal(quota.quotaTotal,100);assert.equal(quota.remaining,94);assert.equal(quota.quotaDurationSeconds,86400);assert(!JSON.stringify(quota).includes('FAKE-QUOTA'));
  await assert.rejects(()=>limits.instagramPublishingLimits(userB.userId,quotaId));assert.equal(calls,1);
  const owned=await limits.instagramPublishingLimits(userB.userId,null);assert(!owned.accounts.some(a=>a.id===quotaId));assert.equal(calls,1);
  missing=true;const unknown=await limits.instagramPublishingLimits(userA.userId,quotaId);assert.equal(unknown.quotaTotal,null);assert.equal(unknown.remaining,null);
  assert.deepEqual({...row('SELECT tokens,expires_at,state FROM accounts WHERE id=?',quotaId)},{tokens:encrypted,expires_at:expires,state:'connected'});
  globalThis.testUser=userA;const response=await runner.GET(new Request('https://firma.test/api/runner?limits=instagram&accountId='+quotaId));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  globalThis.testUser=null;const denied=await runner.GET(new Request('https://firma.test/api/runner?limits=instagram&accountId='+quotaId));assert.equal(denied.status,403);assert.equal(calls,3);
  run('UPDATE accounts SET expires_at=1 WHERE id=?',quotaId);await assert.rejects(()=>limits.instagramPublishingLimits(userA.userId,quotaId));assert.equal(calls,3);assert.equal(row('SELECT state FROM accounts WHERE id=?',quotaId).state,'connected');
 }finally{globalThis.fetch=originalFetch;globalThis.testUser=userA;}
});

// Analytics assertions are loaded into this same real SQLite route harness.
const analytics=await mod('lib/analytics'),analyticsModel=await mod('lib/analytics-model'),analyticsRoute=await mod('app/api/analytics/route');
const analyticsId=security.id(),analyticsToken=await security.seal({access_token:'TEST-INSIGHTS-PRIVATE'},testEnv.TOKEN_ENCRYPTION_KEY);
run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',analyticsId,userA.userId,'instagram','insights-owner','insights_profile','Insights',analyticsToken,Date.now()+30*86400000,'instagram_business_basic,instagram_business_manage_insights','connected',Date.now());
const metricResponse=(views=123)=>({data:[{name:'views',values:[{value:views}]},{name:'reach',values:[{value:100}]},{name:'shares',values:[{value:4}]},{name:'total_interactions',values:[{value:12}]}]});
const insightCalls=[];const fixtureNow=Date.now();
function insightsFetch(url,init={}){
 const u=new URL(url);insightCalls.push(u.pathname+u.search);assert.equal(u.origin,'https://graph.instagram.com');assert.equal(init.headers.Authorization,'Bearer TEST-INSIGHTS-PRIVATE');assert(!u.searchParams.has('access_token'));assert.equal(init.method,undefined);assert.equal(init.redirect,'manual');
 if(u.pathname.endsWith('/stories'))return Promise.resolve(Response.json({data:[{id:'story-1',timestamp:new Date(fixtureNow-3600000).toISOString(),media_type:'IMAGE',permalink:'https://www.instagram.com/stories/test/1/'}]}));
 if(u.pathname.endsWith('/media'))return Promise.resolve(Response.json({data:[{id:'reel-1',timestamp:new Date(fixtureNow-100000).toISOString(),media_type:'VIDEO',media_product_type:'REELS',caption:'Meu Reel #teste',permalink:'https://www.instagram.com/reel/owned/'}]}));
 if(u.pathname.endsWith('/insights'))return Promise.resolve(Response.json(metricResponse(u.pathname.includes('story-1')?0:123)));
 throw Error('Unexpected insights request');
}
await check('Insights reads official media and Stories, preserves zero vs unavailable and verifies owner-only persisted data',async()=>{
 globalThis.fetch=insightsFetch;const before=row('SELECT tokens,expires_at,state,scopes FROM accounts WHERE id=?',analyticsId);const posts=rows('SELECT id,status FROM posts');
 const result=await analytics.syncAnalytics(userA.userId,analyticsId);assert.equal(result.status,'ok');assert.equal(result.measured,2);assert.equal(result.more,false);
 const status=await analytics.analyticsStatus(userA.userId);assert.equal(status.accounts.find(a=>a.id===analyticsId).lastAttemptAt,result.checkedAt);
 const report=await analytics.analyticsReport(userA.userId,new URLSearchParams({days:'30',accountId:analyticsId}));assert.equal(report.media.length,2);
 const story=report.media.find(m=>m.product==='STORY'),reel=report.media.find(m=>m.product==='REELS');assert.equal(story.metrics.views,0);assert.equal(reel.metrics.views,123);assert.equal(reel.metrics.likes,null);assert.equal(analyticsModel.totalMetric([story],'views'),0);assert.equal(analyticsModel.totalMetric([story],'likes'),null);
 assert(!JSON.stringify(report).includes('TEST-INSIGHTS'));assert(!JSON.stringify(report).includes(analyticsToken));assert.deepEqual(row('SELECT tokens,expires_at,state,scopes FROM accounts WHERE id=?',analyticsId),before);assert.deepEqual(rows('SELECT id,status FROM posts'),posts);
 assert.equal((await analytics.analyticsReport(userB.userId,new URLSearchParams({accountId:analyticsId}))).media.length,0);await assert.rejects(()=>analytics.syncAnalytics(userB.userId,analyticsId));
 const calls=insightCalls.length;assert.equal((await analytics.syncAnalytics(userA.userId,analyticsId)).skipped,true);assert.equal(insightCalls.length,calls);
});
await check('Insights routes reject anonymous, cross-origin and cross-owner writes; service readback uses the existing scoped credential',async()=>{
 const req=(body={},origin='https://firma.test')=>new Request('https://firma.test/api/analytics',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 globalThis.testUser=null;assert.equal((await analyticsRoute.GET(new Request('https://firma.test/api/analytics'))).status,403);assert.equal((await analyticsRoute.POST(req())).status,403);
 globalThis.testUser=userB;assert.equal((await analyticsRoute.POST(req({accountId:analyticsId}))).status,404);
 globalThis.testUser=userA;assert.equal((await analyticsRoute.POST(req({},'https://attacker.invalid'))).status,403);assert.equal((await analyticsRoute.POST(req({owner:userB.userId}))).status,400);
 const token='TEST-ANALYTICS-SERVICE';const old=testEnv.RUNNER_SERVICE_TOKEN_SHA256;testEnv.RUNNER_SERVICE_TOKEN_SHA256=await security.hash(token);globalThis.testUser=null;
 const result=await analyticsRoute.GET(new Request('https://firma.test/api/analytics?status=1',{headers:{Authorization:'Bearer '+token,'x-firma-service':'queue-v1'}}));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert((await result.json()).accounts.some(a=>a.id===analyticsId));
 testEnv.RUNNER_SERVICE_TOKEN_SHA256=old;globalThis.testUser=userA;
});
await check('Permission failures keep publishing credentials and previous measurements intact, with a retry backoff',async()=>{
 run("UPDATE analytics_sync SET next_sync_at=0,status='waiting' WHERE id=?",analyticsId);
 const before=row('SELECT tokens,expires_at,state FROM accounts WHERE id=?',analyticsId),old=row("SELECT metrics,measured_at FROM analytics_media WHERE account_id=? AND provider_id='reel-1'",analyticsId);
 let permissionCalls=0;globalThis.fetch=async(url,init)=>{if(String(url).includes('/insights?')){permissionCalls++;return Response.json({error:{code:10,message:'Missing instagram_business_manage_insights. TEST-INSIGHTS-PRIVATE'}},{status:403});}return insightsFetch(url,init);};
 const result=await analytics.syncAnalytics(userA.userId,analyticsId);assert.equal(result.status,'permission_required');assert.equal(permissionCalls,1);assert.deepEqual(row('SELECT tokens,expires_at,state FROM accounts WHERE id=?',analyticsId),before);assert.deepEqual(row("SELECT metrics,measured_at FROM analytics_media WHERE account_id=? AND provider_id='reel-1'",analyticsId),old);
 const status=row('SELECT * FROM analytics_sync WHERE id=?',analyticsId);assert(status.next_sync_at>Date.now()+5*3600000);assert(!JSON.stringify(status).includes('TEST-INSIGHTS'));assert(analyticsModel.accountAlerts((await analytics.analyticsAccounts(userA.userId)).find(a=>a.id===analyticsId),Date.now()).some(a=>a.action==='authorize'));
});
await check('Concurrent Insights steps share one lease, pagination never forwards secrets to paging.next, and continuation is durable',async()=>{
 run("UPDATE analytics_sync SET next_sync_at=0,status='waiting' WHERE id=?",analyticsId);let release,started;const gate=new Promise(r=>release=r),seen=new Promise(r=>started=r);let first=true;
 globalThis.fetch=async(url,init)=>{const u=new URL(url);if(first){first=false;started();await gate;}if(u.pathname.endsWith('/media')&&!u.searchParams.has('after'))return Response.json({data:[{id:'reel-new',media_product_type:'REELS',timestamp:new Date().toISOString()}],paging:{cursors:{after:'SAFE-CURSOR'},next:'https://attacker.invalid/?access_token=DO-NOT-FOLLOW'}});if(u.pathname.endsWith('/media')){assert.equal(u.searchParams.get('after'),'SAFE-CURSOR');return Response.json({data:[]});}return insightsFetch(url,init);};
 const one=analytics.syncAnalytics(userA.userId,analyticsId);await seen;const two=await analytics.syncAnalytics(userA.userId,analyticsId);assert.equal(two.skipped,true);release();const result=await one;assert.equal(result.more,true);assert.equal(row('SELECT feed_cursor FROM analytics_sync WHERE id=?',analyticsId).feed_cursor,'SAFE-CURSOR');
 const next=await analytics.syncAnalytics(userA.userId,analyticsId);assert.equal(next.more,false);assert(['ok','partial'].includes(next.status));
});
await check('Unsupported extended metrics fall back to views/reach and expired Stories retain their last capture',async()=>{
 run("UPDATE analytics_sync SET next_sync_at=0,status='waiting' WHERE id=?",analyticsId);run("UPDATE analytics_media SET published_at=? WHERE account_id=? AND product='STORY'",Date.now()-2*86400000,analyticsId);
 const before=row("SELECT metrics,measured_at FROM analytics_media WHERE account_id=? AND product='STORY'",analyticsId);let fallback=0;
 globalThis.fetch=async(url,init)=>{const u=new URL(url);if(u.pathname.endsWith('/stories'))return Response.json({data:[]});if(u.pathname.endsWith('/insights')){assert(!u.pathname.includes('story-1'));if(u.searchParams.get('metric')!=='views,reach')return Response.json({error:{code:100,message:'Unsupported metric'}},{status:400});fallback++;return Response.json(metricResponse(321));}return insightsFetch(url,init);};
 await analytics.syncAnalytics(userA.userId,analyticsId);assert(fallback>=1);assert.deepEqual(row("SELECT metrics,measured_at FROM analytics_media WHERE account_id=? AND product='STORY'",analyticsId),before);
 const report=await analytics.analyticsReport(userA.userId,new URLSearchParams({days:'7',accountId:analyticsId}));assert(report.media.some(m=>m.product==='STORY'&&m.metrics.views===0));
});
await check('Transient Insights errors back off, redirects are not followed, and empty metrics never overwrite known values with zero',async()=>{
 const stored=row("SELECT metrics FROM analytics_media WHERE account_id=? AND provider_id='reel-1'",analyticsId);
 for(const mode of ['rate','redirect','empty']){
  run("UPDATE analytics_sync SET next_sync_at=0,status='waiting' WHERE id=?",analyticsId);
  globalThis.fetch=async(url,init)=>{const u=new URL(url);assert.equal(init.redirect,'manual');if(mode==='rate')return Response.json({error:{code:4,message:'rate limit'}},{status:429});if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}});if(u.pathname.endsWith('/insights'))return Response.json({data:[]});if(u.pathname.endsWith('/stories'))return Response.json({data:[]});return insightsFetch(url,init);};
  const result=await analytics.syncAnalytics(userA.userId,analyticsId);assert.equal(result.status,mode==='rate'?'temporary':mode==='redirect'?'error':'partial');assert.deepEqual(row("SELECT metrics FROM analytics_media WHERE account_id=? AND provider_id='reel-1'",analyticsId),stored);
 }
});
await check('Insights permission is requested only by the explicit manager or device-link action',async()=>{
 const normal=new URL(providers.authorizationURL('instagram',{clientId:'test'},'https://firma.test/callback','s','c'));
 const enabled=new URL(providers.authorizationURL('instagram',{clientId:'test'},'https://firma.test/callback','s','c',true));assert(!normal.searchParams.get('scope').includes('manage_insights'));assert(enabled.searchParams.get('scope').includes('instagram_business_manage_insights'));
 globalThis.testUser=userA;const start=await mod('app/api/oauth/[platform]/start/route');const res=await start.POST(new Request('https://firma.test/api/oauth/instagram/start?insights=1',{method:'POST',headers:{Origin:'https://firma.test'}}),{params:Promise.resolve({platform:'instagram'})});assert(new URL((await res.json()).url).searchParams.get('scope').includes('instagram_business_manage_insights'));
 const link=await makeLink();run('UPDATE connection_links SET last_started_at=0 WHERE id=?',link.id);globalThis.testUser=null;const token=new URL(link.url).hash.slice(1);const remote=await deviceRoute.POST(deviceReq('start',token,undefined,{expectedLinkId:link.id,insights:true}));assert.equal(remote.status,200);assert(new URL((await remote.json()).url).searchParams.get('scope').includes('instagram_business_manage_insights'));
 const page=await mod('app/connect/route');assert((await page.GET(new Request('https://firma.test/connect?insights=1')).text()).includes('const insights=true'));globalThis.testUser=userA;
});
await check('Relative ranking uses same profile, format and age, with enough nonzero baseline evidence',async()=>{
 const now=Date.now(),make=(id,views,extra={})=>({id,accountId:'a',username:'a',providerId:id,product:'REELS',caption:'#teste',permalink:null,publishedAt:now-3600000,metrics:{views},measuredAt:now,metricStatus:'ok',...extra});
 const items=[make('target',1000),...Array.from({length:5},(_,i)=>make('p'+i,100)),make('other-account',1e9,{accountId:'b'}),make('other-format',1e9,{product:'STORY'}),make('old',1e9,{publishedAt:now-10*86400000})];
 assert.equal(analyticsModel.relativePerformance(items[0],items,now).ratio,10);assert.equal(analyticsModel.performanceIndex(items,now).get('target').ratio,10);assert.equal(analyticsModel.relativePerformance(items[0],items.slice(0,5),now).ratio,null);
 const zeros=[make('target',1000),...Array.from({length:5},(_,i)=>make('z'+i,0))];assert.equal(analyticsModel.performanceIndex(zeros,now).get('target').ratio,null);
 const mixed=[...items,make('unknown',null)];for(const m of mixed)assert.deepEqual(analyticsModel.performanceIndex(mixed,now).get(m.id),analyticsModel.relativePerformance(m,mixed,now));
 assert.equal(analyticsModel.discoverPatterns(items.slice(0,2),'America/Sao_Paulo',now).length,0);assert.equal(analyticsModel.parseMetrics({data:[]}).views,null);
});
await check('Portable backups retain captured Story measurements and reset collection leases, while accepting older backups',async()=>{
 const migration=await mod('lib/migration');run("UPDATE deliveries SET status='cancelled' WHERE status IN ('working','processing')");const snapshot=await migration.exportData(userA.userId);assert(snapshot.data.analytics_media.some(m=>m.product==='STORY'));
 const source=db,oldKey=testEnv.TOKEN_ENCRYPTION_KEY;
 try{
  for(const legacy of [false,true]){
   db=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
   const copy=structuredClone(snapshot),g={kind:'firma-migration-v1',mode:'import',owner:'analytics-destination',nonce:security.id(),expires:Date.now()+60000};
   for(const m of copy.data.media){const bytes=objects.get(m.storage_key);m.size=bytes.byteLength;objects.set('migration/'+g.nonce+'/'+m.id,bytes);}
   if(legacy){delete copy.data.analytics_media;delete copy.data.analytics_sync;}
   await migration.restoreData(g,copy);
   assert.equal(row('SELECT count(*) n FROM analytics_media').n,legacy?0:snapshot.data.analytics_media.length);assert.equal(row('SELECT count(*) n FROM analytics_sync WHERE lease IS NOT NULL OR next_sync_at<>0').n,0);db.close();
  }
 }finally{db=source;testEnv.TOKEN_ENCRYPTION_KEY=oldKey;globalThis.testUser=userA;}
});


// Link Stories remain manual; none of these actions may touch a social API.
const storyOptions={instagramStoryLink:{url:'https://example.com/oferta?utm_source=instagram',label:'Ver oferta'}};
const storyPayload={...payload,format:'story',scheduledAt:Date.now()+300000,options:storyOptions};
let linkPost,linkAccount;
await check('Story links validate URLs and survive save/readback without creating automatic jobs',async()=>{
 globalThis.testUser=userA;
 for(const url of ['', 'javascript:alert(1)', 'data:text/html,test', 'http://example.com/', 'https://name:password@example.com/', 'https://127.0.0.1/test'])assert.equal((await action('post.save',{...storyPayload,status:'draft',options:{instagramStoryLink:{url}}})).status,400);
 for(const extra of [{format:'video'},{platforms:['instagram','tiktok']}])assert.equal((await action('post.save',{...storyPayload,...extra})).status,400);
 const draft=await action('post.save',{...storyPayload,status:'draft'});assert.equal(draft.status,200);const did=(await draft.json()).id;
 assert.deepEqual(JSON.parse(row('SELECT options FROM posts WHERE id=?',did).options).instagramStoryLink,storyOptions.instagramStoryLink);assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',did).n,0);
 linkAccount=security.id();run('INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',linkAccount,userA.userId,'instagram','manual-story-profile','manual_profile','Manual Profile','',now+1e9,'basic','connected',now);
 const old=testEnv.SCHEDULER_ENABLED;testEnv.SCHEDULER_ENABLED='false';
 const saved=await action('post.save',{...storyPayload,accountIds:[aid,linkAccount]});testEnv.SCHEDULER_ENABLED=old;
 assert.equal(saved.status,200);const result=await saved.json();linkPost=result.id;assert.equal(result.status,'manual_pending');
 assert.deepEqual(rows('SELECT status FROM deliveries WHERE post_id=?',linkPost).map(d=>d.status),['manual_pending','manual_pending']);
 const state=await (await route.GET()).json();assert.deepEqual(state.posts.find(p=>p.id===linkPost).options.instagramStoryLink,storyOptions.instagramStoryLink);
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Manual Story must never call a provider');};
 try{run('UPDATE posts SET scheduled_at=1 WHERE id=?',linkPost);run('UPDATE deliveries SET next_run=0 WHERE post_id=?',linkPost);await queue.processQueue(userA.userId);assert.equal(calls,0);assert.equal(row('SELECT status FROM posts WHERE id=?',linkPost).status,'manual_pending');}finally{globalThis.fetch=fetch;}
});
await check('Manual completion is per profile, owner-scoped, explicitly recorded and safely undoable',async()=>{
 const data={id:linkPost,accountId:aid,version:row('SELECT version FROM posts WHERE id=?',linkPost).version,published:true};
 globalThis.testUser=userB;assert.equal((await action('post.manualStory',data)).status,404);globalThis.testUser=userA;
 assert.equal((await action('post.manualStory',data,'https://attacker.invalid')).status,403);
 assert.equal((await action('post.manualStory',{...data,accountId:security.id()})).status,404);
 const before=row('SELECT * FROM accounts WHERE id=?',aid);assert.equal((await action('post.manualStory',data)).status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',linkPost).status,'manual_pending');
 assert.equal(row('SELECT status FROM deliveries WHERE post_id=? AND account_id=?',linkPost,aid).status,'manual_published');assert.equal(row('SELECT remote_id FROM deliveries WHERE post_id=? AND account_id=?',linkPost,aid).remote_id,null);
 const version=row('SELECT version FROM posts WHERE id=?',linkPost).version;assert.equal((await action('post.manualStory',data)).status,200);assert.equal(row('SELECT version FROM posts WHERE id=?',linkPost).version,version);
 assert.equal((await action('post.save',{...storyPayload,id:linkPost,version})).status,409);assert.equal((await action('post.cancel',{id:linkPost})).status,409);
 assert.equal((await action('post.manualStory',{...data,accountId:linkAccount,version:data.version})).status,409);
 assert.equal((await action('post.manualStory',{...data,accountId:linkAccount,version})).status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',linkPost).status,'manual_published');
 assert.equal((await action('post.manualStory',{...data,version:version+1,published:false})).status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',linkPost).status,'manual_pending');assert.deepEqual(row('SELECT * FROM accounts WHERE id=?',aid),before);
 assert.equal((await action('post.manualStory',{...data,accountId:linkAccount,version:version+2,published:false})).status,200);
});
await check('Concurrent manual confirmations and edits cannot erase one another',async()=>{
 const p=row('SELECT * FROM posts WHERE id=?',linkPost),oldDelivery=row('SELECT id FROM deliveries WHERE post_id=?',linkPost);
 beforeBatch=()=>{run("UPDATE deliveries SET status='manual_published' WHERE post_id=? AND account_id=?",linkPost,aid);run('UPDATE posts SET version=version+1 WHERE id=?',linkPost);};
 assert.equal((await action('post.save',{...storyPayload,id:linkPost,version:p.version,accountIds:[aid]})).status,409);assert(row('SELECT id FROM deliveries WHERE id=?',oldDelivery.id));
 assert.equal(row('SELECT status FROM deliveries WHERE post_id=? AND account_id=?',linkPost,aid).status,'manual_published');
 const version=row('SELECT version FROM posts WHERE id=?',linkPost).version;
 assert.equal((await action('post.manualStory',{id:linkPost,accountId:aid,version,published:false})).status,200);
 const current=row('SELECT version FROM posts WHERE id=?',linkPost).version;
 assert.equal((await action('post.save',{...storyPayload,id:linkPost,version:current,accountIds:[aid]})).status,200);assert.equal(row('SELECT count(*) n FROM deliveries WHERE post_id=?',linkPost).n,1);
 assert.equal((await action('post.cancel',{id:linkPost})).status,200);assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',linkPost).status,'cancelled');
});
await check('Converting an automatic Story to a linked Story replaces pending work; removing its link can schedule normally',async()=>{
 const response=await action('post.save',{...storyPayload,options:{}});assert.equal(response.status,200);const id=(await response.json()).id;
 const save=await action('post.save',{...storyPayload,id,version:1});assert.equal(save.status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'manual_pending');assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'manual_pending');
 const remove=await action('post.save',{...storyPayload,id,version:2,options:{instagramStoryLink:null}});assert.equal(remove.status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'scheduled');assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'pending');
 await action('post.cancel',{id});
});
await check('The worker refuses a linked Story even if an imported or old job incorrectly enters the automatic queue',async()=>{
 const saved=await action('post.save',storyPayload);assert.equal(saved.status,200);const id=(await saved.json()).id;
 run("UPDATE posts SET status='scheduled',scheduled_at=0 WHERE id=?",id);run("UPDATE deliveries SET status='pending',next_run=0 WHERE post_id=?",id);
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network call');};
 try{await queue.processQueue(userA.userId);assert.equal(calls,0);const d=row('SELECT * FROM deliveries WHERE post_id=?',id);assert.equal(d.status,'failed');assert(d.error.includes('finalizado no Instagram'));}finally{globalThis.fetch=fetch;}
});
await check('Portable backup preserves Story links and manual completion independently from automatic publishing',async()=>{
 const saved=await action('post.save',storyPayload);assert.equal(saved.status,200);const id=(await saved.json()).id;
 await action('post.manualStory',{id,accountId:aid,version:1,published:true});
 const migration=await mod('lib/migration'),snapshot=await migration.exportData(userA.userId),source=db;
 try{
  db=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
  const copy=structuredClone(snapshot),g={kind:'firma-migration-v1',mode:'import',owner:'story-link-destination',nonce:security.id(),expires:Date.now()+60000};
  for(const m of copy.data.media){const bytes=objects.get(m.storage_key);m.size=bytes.byteLength;objects.set('migration/'+g.nonce+'/'+m.id,bytes);}
  await migration.restoreData(g,copy);assert.deepEqual(JSON.parse(row('SELECT options FROM posts WHERE id=?',id).options).instagramStoryLink,storyOptions.instagramStoryLink);assert.equal(row('SELECT status FROM posts WHERE id=?',id).status,'manual_published');assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',id).status,'manual_published');
 }finally{db.close();db=source;}
});

await check('Public workspace is opt-in, mapped to its owner and protects account secrets',async()=>{
 const originalUser=globalThis.testUser;
 globalThis.testUser=null;testEnv.PUBLIC_WORKSPACE_ENABLED='false';assert.equal((await route.GET()).status,401);
 testEnv.PUBLIC_WORKSPACE_ENABLED='true';testEnv.RUNNER_OWNER_ID=userA.userId;
 const response=await route.GET();assert.equal(response.status,200);const publicState=await response.json();assert(publicState.publicWorkspace);assert(publicState.accounts.some(a=>a.id===aid));assert(!JSON.stringify(publicState).includes('FAKE-ONLY'));
 for(const a of ['provider.save','account.disconnect','workspace.save'])assert.equal((await action(a,{})).status,401);
 const migration=await mod('app/api/migration/route');assert.equal((await migration.POST(new Request('https://firma.test/api/migration',{method:'POST',headers:{Origin:'https://firma.test','Content-Type':'application/json'},body:JSON.stringify({mode:'export'})}))).status,401);
 assert.equal((await action('post.save',{...payload,status:'draft',title:'Public workspace draft'})).status,200);
 assert.equal((await action('post.save',{...payload,status:'draft'},'https://attacker.invalid')).status,403);
 globalThis.testUser=userB;assert.equal((await action('provider.save',{})).status,403);
 delete testEnv.PUBLIC_WORKSPACE_ENABLED;globalThis.testUser=originalUser;
});


// New features run in an independent workspace with fake media, fake accounts and mocked Graph calls.
{
 const own={userId:'quality-fixture-workspace',displayName:'Teste local',email:'qa@example.invalid'};
 globalThis.testUser=own;testEnv.RUNNER_OWNER_ID=own.userId;testEnv.SCHEDULER_ENABLED='true';testEnv.RUNNER_SERVICE_TOKEN_SHA256='A'.repeat(43);
 await server.workspace(own.userId);await action('provider.save',{platform:'instagram',clientId:'fixture',clientSecret:'fixture-only'});
 const scoped=(groupId,ac,data)=>route.POST(new Request('https://firma.test/api/app',{method:'POST',headers:{Origin:'https://firma.test','Content-Type':'application/json'},body:JSON.stringify({groupId,action:ac,data})}));
 const create=async name=>(await(await action('group.create',{name})).json()).id;
 const g=await create('Modelo Um'),h=await create('Modelo Dois'),a=security.id(),b=security.id(),time=Date.now(),owner=own.userId;
 for(const [uid,grp,name] of [[a,g,'ana.vch'],[b,h,'bia.lqk']])run('INSERT INTO accounts (id,owner,group_id,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',uid,owner,grp,'instagram','ig-'+uid,name,name,await security.seal({access_token:'fixture-instagram'},testEnv.TOKEN_ENCRYPTION_KEY),time+1e9,'basic','connected',time);
 const put=(name,grp,mime='video/mp4')=>{const uid=security.id();run('INSERT INTO media(id,owner,group_id,name,mime,size,storage_key,folder,created_at) VALUES(?,?,?,?,?,?,?,?,?)',uid,owner,grp,name,mime,4,'fake/'+uid,'Geral',time);objects.set('fake/'+uid,new Uint8Array(4));return uid;};
 const videos=Array.from({length:20},(_,i)=>put('Reel '+(i+1)+'.mp4',g)),cover=put('@ANA.VCH.JPG',g,'image/jpeg'),coverB=put('bia.lqk.jpg',null,'image/jpeg'),wrong=put('ana.vch-extra.jpg',g,'image/jpeg'),unused=put('Unused.mp4',g),other=put('Foreign.mp4',h);
 const post={title:'Reel de teste',caption:'Olá',format:'video',platforms:['instagram'],accountIds:[a],mediaIds:[videos[0]],status:'scheduled',scheduledAt:time+600000};
 let normal,batch,shared;const B={accountId:a,mediaIds:videos,startsAt:time+900000,approved:true,requestId:security.id()};
 await check('Group data is scoped at the server; empty groups, group changes, shared posts, rules and references do not leak',async()=>{
  assert(g&&h);const historic=(await(await action('post.save',post)).json()).id;normal=historic;shared=(await(await action('post.save',{...post,title:'Mixed',accountIds:[a,b]})).json()).id;
  const r=await scoped(g,'rule.save',{name:'Grupo rotina',time:'12:00',weekdays:[1],caption:'',accountIds:[a],mediaIds:[videos[0]]});assert.equal(r.status,200);
  assert.equal((await scoped(g,'template.save',{name:'Grupo modelo',caption:'Oi'})).status,200);
  const status=await server.state(owner,'QA',g);assert.equal(status.accounts.length,1);assert.equal(status.accounts[0].resolvedCoverId,cover);assert(!status.media.some(m=>m.id===other));assert.deepEqual(status.posts.map(p=>p.id),[historic]);assert.equal(status.rules.length,1);assert.equal(status.templates.length,1);
  assert(!(await server.state(owner,'QA',h)).posts.some(p=>p.id===shared));assert((await server.state(owner,'QA')).posts.some(p=>p.id===shared));const empty=await create('Grupo vazio');assert.equal((await server.state(owner,'QA',empty)).media.length,0);
  assert.equal((await scoped(g,'post.save',{...post,accountIds:[b]})).status,409);assert.equal((await scoped(g,'post.save',{...post,mediaIds:[other]})).status,409);
  assert.equal((await action('account.preferences',{id:a,groupId:h,coverMediaId:null})).status,200);assert((await server.state(owner,'QA',h)).posts.some(p=>p.id===historic));await action('account.preferences',{id:a,groupId:g,coverMediaId:null});
 });
 await check('Automatic covers match exact @username per destination and preserve scheduled snapshots and legacy captions',async()=>{
  const p=JSON.parse(row('SELECT options FROM posts WHERE id=?',shared).options);assert.deepEqual(p.instagramAccountCovers,{[a]:cover,[b]:coverB});assert.equal(p.location,'São Paulo, SP');assert.equal(p.locationMode,'caption');
  const defaults=await mod('lib/editor-defaults');assert.equal(defaults.publishCaption('Antes',{},'video'),'Antes');assert.equal(defaults.publishCaption('Olá',p,'video'),'Olá\n\n📍 São Paulo, SP');assert.equal(defaults.publishCaption('X',{...p,locationMode:'none'},'video'),'X');
  assert.equal((await action('account.preferences',{id:a,groupId:g,coverMediaId:wrong})).status,200);assert.equal(JSON.parse(row('SELECT options FROM posts WHERE id=?',normal).options).instagramAccountCovers[a],cover);
  const custom=(await(await action('post.save',{...post,options:{coverMode:'custom',instagramCoverMediaId:wrong,locationMode:'none'}})).json()).id;const customOpts=JSON.parse(row('SELECT options FROM posts WHERE id=?',custom).options);assert.equal(defaults.coverForDelivery(customOpts,a),wrong);assert.equal(customOpts.locationMode,'none');
  await action('account.preferences',{id:a,groupId:g,coverMediaId:null});
 });
 await check('Batch review persists twenty ordered videos and deliveries atomically and replaying the same request creates none',async()=>{
  assert.equal((await scoped(g,'post.batch',{...B,approved:false})).status,400);assert.equal((await scoped(g,'post.batch',{...B,mediaIds:[...videos,other]})).status,409);
  const made=await scoped(g,'post.batch',B);const reply=await made.json();assert.equal(made.status,200,JSON.stringify(reply));batch=reply.id;assert.equal(reply.count,20);
  assert.equal((await scoped(g,'post.batch',B)).status,200);assert.equal((await scoped(g,'post.batch',{...B,caption:'Outra'})).status,409);const data=rows('SELECT * FROM posts WHERE batch_id=? ORDER BY batch_position',batch);
  assert.equal(data.length,20);data.forEach((p,i)=>{assert.equal(p.scheduled_at,B.startsAt+i*60000);assert.equal(p.batch_position,i);assert.deepEqual(JSON.parse(p.media_ids),[videos[i]]);assert.equal(JSON.parse(p.options).instagramAccountCovers[a],cover);assert.equal(row('SELECT next_run FROM deliveries WHERE post_id=?',p.id).next_run,p.scheduled_at);});
  const receipt=await(await route.GET(new Request('https://firma.test/api/app?batch='+batch))).json();assert.equal(receipt.batch.count,20);
 });
 await check('Late batch workers preserve order, refuse a second publish inside 60 seconds and stop behind an uncertain result',async()=>{
  const posts=rows('SELECT id FROM posts WHERE batch_id=? ORDER BY batch_position',batch);run('UPDATE deliveries SET next_run=0 WHERE post_id IN (SELECT id FROM posts WHERE batch_id=?)',batch);
  const writes=[];globalThis.fetch=async(url,init={})=>{if(String(url).endsWith('/media')){const p=new URLSearchParams(init.body);writes.push(p.get('caption'));assert(p.get('cover_url'));return Response.json({id:'container'});}return Response.json(String(url).endsWith('/media_publish')?{id:'published'}:{status_code:'FINISHED'});};
  const [u,v]=await Promise.all([queue.processQueue(owner),queue.processQueue(owner)]);assert.equal(u.processed+v.processed,1);assert.equal(writes.length,1);assert.equal(row('SELECT status FROM posts WHERE id=?',posts[0].id).status,'published');
  assert.equal((await queue.processQueue(owner)).processed,0);const q=await(await runner.GET(new Request('https://firma.test/api/runner'))).json();assert(q.queue.nextCheckAt>Date.now()+55000&&q.queue.batchSoon===1);
  run('UPDATE deliveries SET updated_at=? WHERE post_id=?',Date.now()-61000,posts[0].id);globalThis.fetch=async(url)=>String(url).endsWith('/media_publish')?new Response('{}',{status:503}):Response.json(String(url).endsWith('/media')?{id:'container2'}:{status_code:'FINISHED'});
  assert.equal((await queue.processQueue(owner)).processed,1);assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',posts[1].id).status,'uncertain');assert.equal((await queue.processQueue(owner)).processed,0);
 });
 await check('Prisma batch requires each saved version and waits three minutes across accounts',async()=>{
  const payload={requestId:security.id(),accountIds:[b,a],title:'Lançamento Prisma',mediaId:videos[0],coverId:cover,caption:'Mesma descrição',startsAt:Date.now()-300000,approved:true};
  assert.equal((await scoped(g,'post.sharedReelBatch',payload)).status,409);
  assert.equal((await scoped(null,'post.sharedReelBatch',{...payload,accountIds:[a,a]})).status,400);
  assert.equal((await scoped(null,'post.sharedReelBatch',{...payload,coverId:videos[1]})).status,400);
  assert.equal((await scoped(null,'post.sharedReelBatch',{...payload,approved:false})).status,400);
  assert.equal((await scoped(null,'post.sharedReelBatch',payload)).status,409);
  const prepared=await scoped(null,'post.prepareSharedReelBatch',payload);
  assert.equal(prepared.status,200);assert.equal((await prepared.json()).projectId,payload.requestId);
  assert.equal((await scoped(null,'post.prepareSharedReelBatch',{...payload,title:'Outro'})).status,409);
  const folder='prisma posts / '+payload.title;
  assert.equal(row('SELECT folder FROM prisma_projects WHERE id=?',payload.requestId).folder,folder);
  assert.equal((await scoped(null,'post.sharedReelBatch',payload)).status,409);
  const {sharedReelOutputId}=await mod('lib/prisma/shared-reel'),prisma=await mod('lib/prisma/store');
  globalThis.FixedLengthStream=class extends TransformStream{constructor(){super();}};
  const rendered=[];
  for(const accountId of payload.accountIds){
   const id=await sharedReelOutputId(payload.requestId,accountId),file={name:id+'.mp4',mime:'video/mp4',bytes:32};
   const bytes=new Uint8Array(32);bytes.set(new TextEncoder().encode('ftyp'),4);
   const metadata=JSON.stringify({outputId:id,accountId,sourceId:payload.mediaId,file});
   const params=new URLSearchParams({project:payload.requestId,uploadId:id,name:file.name,tool:'shared-reel',kind:'export',metadata});
   const upload=()=>prisma.handle(new Request('https://firma.test/api/prisma/files?'+params,{method:'POST',headers:{origin:'https://firma.test','content-type':file.mime,'content-length':'32'},body:bytes}));
   assert.equal((await upload()).status,201);
   assert.equal((await upload()).status,200);
   assert.equal(row('SELECT folder FROM media WHERE id=?',id).folder,folder);
   rendered.push(id);
  }
  const response=await scoped(null,'post.sharedReelBatch',payload);
  const receipt=await response.json();assert.equal(response.status,200,JSON.stringify(receipt));assert.equal(receipt.count,2);
  assert.equal((await scoped(null,'post.sharedReelBatch',payload)).status,200);
  assert.equal((await scoped(null,'post.sharedReelBatch',{...payload,accountIds:[a,b]})).status,409);
  const posts=rows('SELECT * FROM posts WHERE batch_id=? ORDER BY batch_position',receipt.id);
  assert.equal(posts.length,2);
  for(const [i,p] of posts.entries()){
   assert.deepEqual(JSON.parse(p.account_ids),[payload.accountIds[i]]);
   assert.deepEqual(JSON.parse(p.media_ids),[rendered[i]]);assert.notEqual(rendered[i],payload.mediaId);
   assert.equal(p.caption,payload.caption);
   const opts=JSON.parse(p.options);assert.equal(opts.instagramCoverMediaId,payload.coverId);assert.equal(opts.locationMode,'none');
   assert.equal(p.title,payload.title);assert.equal(p.scheduled_at,receipt.startsAt+180000*i);
  }
  assert.equal((await scoped(null,'post.save',{...post,id:posts[0].id,version:1})).status,409);
  const realNow=Date.now,realFetch=globalThis.fetch,sent=[];
  assert(receipt.startsAt>=Date.now()+59000);
  let clock=receipt.startsAt+300000;
  try{
   Date.now=()=>clock;
   globalThis.fetch=async(url,init={})=>{
    if(String(url).endsWith('/media')){
     const p=new URLSearchParams(init.body);
     assert.equal(p.get('caption'),payload.caption);assert(p.get('cover_url'));assert(p.get('video_url'));
     return Response.json({id:'shared-container'});
    }
    if(String(url).endsWith('/media_publish')){sent.push({url:String(url),at:clock});return Response.json({id:'shared-'+sent.length});}
    return Response.json({status_code:'FINISHED'});
   };
   assert.equal((await queue.processQueue(owner,'manual',posts[1].id)).processed,0);
   const started=await Promise.all([queue.processQueue(owner,'manual',posts[0].id),queue.processQueue(owner,'manual',posts[0].id)]);
   assert.equal(started.reduce((n,r)=>n+r.processed,0),1);
   clock+=179999;assert.equal((await queue.processQueue(owner,'manual',posts[1].id)).processed,0);
   clock+=1;assert.equal((await queue.processQueue(owner,'manual',posts[1].id)).processed,1);
   assert.deepEqual(sent.map(x=>x.url.match(/\/ig-([^/]+)\/media_publish$/)?.[1]),[b,a]);
   assert.equal(sent[1].at-sent[0].at,180000);
  }finally{Date.now=realNow;globalThis.fetch=realFetch;}
 });
 await check('Bulk moves keep references; deleting a selection keeps routine, batch and profile assets and removes only unused objects',async()=>{
  assert.equal((await scoped(g,'media.move',{ids:[unused,other],folder:'Reels'})).status,409);const moved=await(await scoped(g,'media.move',{ids:[unused,videos[3]],folder:'Reels'})).json();assert.equal(moved.moved,2);
  const gone=await(await scoped(g,'media.remove',{ids:[unused,cover,videos[3]]})).json();assert.equal(gone.removed,1);assert.equal(gone.protected,2);assert(!objects.has('fake/'+unused));assert(objects.has('fake/'+cover));assert(row('SELECT id FROM media WHERE id=?',videos[3]));assert(row('SELECT id FROM media WHERE id=?',other));
 });
 await check('Today/yesterday respect local midnight and selected group, with no cross-group insights or metrics',async()=>{
  const sp='America/Sao_Paulo';const d=new Intl.DateTimeFormat('sv-SE',{timeZone:sp,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());const midnight=domain.localToEpoch(d+'T00:00',sp);
  for(const [acct,at] of [[a,midnight-1],[a,midnight],[b,midnight+1]]){const uid=security.id();run("INSERT INTO analytics_media (id,owner,account_id,provider_id,product,caption,published_at,discovered_at) VALUES(?,?,?,?,'REELS','',?,?)",uid,owner,acct,uid,at,at);}
  const service=await mod('lib/analytics');for(const [days,stamp] of [['today',midnight],['yesterday',midnight-1]]){const report=await service.analyticsReport(owner,new URLSearchParams({days,group:g}));assert.equal(report.accounts.length,1);assert.deepEqual(report.media.map(m=>m.publishedAt),[stamp]);}
  assert.equal((await service.analyticsStatus(owner,g)).accounts.length,1);
 });
 await check('Native location is explicitly gated and uses only the verified Facebook Page grant for the selected profile',async()=>{
  const opt={locationMode:'native',location:'São Paulo, SP',placeId:'112047398814697'};assert.equal((await scoped(g,'post.save',{...post,options:opt})).status,400);
  globalThis.fetch=async()=>Response.json({id:'123',instagram_business_account:{id:'123456',username:'outro'}});assert.equal((await scoped(g,'account.geo',{id:a,token:'fixture-page-secret'})).status,400);
  globalThis.fetch=async()=>Response.json({id:'123',instagram_business_account:{id:'123456',username:'ana.vch'}});assert.equal((await scoped(g,'account.geo',{id:a,token:'fixture-page-secret'})).status,200);
  const n=await(await scoped(g,'post.save',{...post,options:opt})).json();assert(n.id);run('UPDATE deliveries SET next_run=0 WHERE post_id=?',n.id);const sent=[];globalThis.fetch=async(url,init={})=>{assert.equal(new URL(url).host,'graph.facebook.com');assert.equal(init.headers.Authorization,'Bearer fixture-page-secret');if(String(url).endsWith('/media')){const data=new URLSearchParams(init.body);sent.push(data.get('location_id'));assert.equal(data.get('caption'),'Olá');return Response.json({id:'cgeo'});}return Response.json(String(url).endsWith('/media_publish')?{id:'published-geo'}:{status_code:'FINISHED'});};
  await queue.processQueue(owner);assert.deepEqual(sent,['112047398814697']);const state=await server.state(owner,'QA');assert(!JSON.stringify(state).includes('fixture-page-secret'));assert(!row('SELECT encrypted FROM geo_grants WHERE id=?',a).encrypted.includes('fixture-page-secret'));
 });
 await check('Anonymous public visitors cannot schedule a batch, link a Page or bulk-delete the library',async()=>{
  testEnv.PUBLIC_WORKSPACE_ENABLED='true';globalThis.testUser=null;for(const [k,d] of [['post.batch',B],['media.remove',{ids:[cover]}],['account.geo',{id:a,token:'fixture'}]])assert.equal((await scoped(g,k,d)).status,401);globalThis.testUser=own;delete testEnv.PUBLIC_WORKSPACE_ENABLED;
 });
 await check('Stories with a location sticker are planned for manual completion and never enter automatic publication',async()=>{
  const p=await(await scoped(g,'post.save',{...post,format:'story',options:{locationMode:'sticker',location:'São Paulo, SP'}})).json();assert.equal(p.status,'manual_pending');assert.equal(row('SELECT status FROM deliveries WHERE post_id=?',p.id).status,'manual_pending');
  assert.equal((await scoped(g,'post.manualStory',{id:p.id,accountId:a,version:1,published:true})).status,200);assert.equal(row('SELECT status FROM posts WHERE id=?',p.id).status,'manual_published');
 });
 await check('Group reassignment preserves profile covers, grouped edits retain referenced media, portable restores include groups, grants and batches',async()=>{
  const editing=await mod('lib/migration');const moved=await(await action('group.assign',{ids:[a,b],groupId:h})).json();assert.equal(moved.moved,2);
  const view=await server.state(owner,'QA',h);assert(view.posts.some(p=>p.id===normal));assert(view.referenceMedia.some(m=>m.id===videos[0]));assert(!view.media.some(m=>m.id===videos[0]));assert.equal(view.accounts.find(ac=>ac.id===a).resolvedCoverId,cover);
  const backup=await editing.exportData(owner);assert(backup.data.geo_grants.length&&backup.data.publish_batches.length&&backup.data.workspace_groups.length);
  const nonce=security.id(),dest='roundtrip-groups-qa';for(const m of backup.data.media)objects.set('migration/'+nonce+'/'+m.id,new Uint8Array(m.size));const original=db;db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',f),'utf8'));try{const restored=await editing.restoreData({kind:'firma-migration-v1',mode:'import',owner:dest,expires:Date.now()+60000,nonce},structuredClone(backup));assert(restored.ok);const restoredState=await server.state(dest,'Restore',h);assert.equal(restoredState.accounts.find(x=>x.id===a).resolvedCoverId,cover);assert(row('SELECT id FROM publish_batches WHERE owner=?',dest));assert(restoredState.accounts.find(x=>x.id===a).nativeLocation);}finally{db.close();db=original;}
 });
}
await check('Username synchronization uses stable identity and preserves connections and group/cover references',async()=>{
 const owner='rename-qa',accountId=security.id(),group=security.id();await server.workspace(owner);
 const ciphertext=await security.seal({access_token:'FAKE-RENAME-ONLY'},testEnv.TOKEN_ENCRYPTION_KEY);
 run("INSERT INTO accounts(id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at,group_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",accountId,owner,'instagram','123456789','old.name','old.name',ciphertext,Date.now()+3600000,'basic','connected',Date.now(),group);
 run("INSERT INTO provider_configs(id,owner,platform,encrypted,updated_at) VALUES (?,?,?,?,?)",security.id(),owner,'instagram',await security.seal({clientId:'fake',clientSecret:'fake'},testEnv.TOKEN_ENCRYPTION_KEY),Date.now());
 const coverId=security.id();run("INSERT INTO media(id,owner,name,mime,size,storage_key,folder,created_at,group_id) VALUES (?,?,?,?,?,?,?,?,?)",coverId,owner,'old.name.jpg','image/jpeg',50,'fake-cover','Geral',Date.now(),group);
 const previousFetch=globalThis.fetch;
 try{globalThis.fetch=async(url,init)=>{assert.equal(new URL(url).hostname,'graph.instagram.com');assert.equal(new URL(url).searchParams.get('fields'),'user_id,username');assert.equal(init.headers.Authorization,'Bearer FAKE-RENAME-ONLY');return Response.json({user_id:'123456789',username:'new.name'});};
 const result=await providers.refreshInstagramIdentity(owner,accountId);assert(result.updated);let a=row('SELECT * FROM accounts WHERE id=?',accountId);assert.equal(a.username,'new.name');assert.equal(a.display_name,'new.name');assert.equal(a.group_id,group);assert.equal(a.cover_media_id,coverId);assert.equal(a.tokens,ciphertext);assert.equal(a.state,'connected');
 await assert.rejects(()=>providers.refreshInstagramIdentity('another-owner',accountId));
 globalThis.fetch=async()=>Response.json({user_id:'999',username:'wrong.profile'});await assert.rejects(()=>providers.refreshInstagramIdentity(owner,accountId));assert.equal(row('SELECT username FROM accounts WHERE id=?',accountId).username,'new.name');
 globalThis.fetch=async()=>Response.json({error:{code:190,message:'Expired'}},{status:400});await assert.rejects(()=>providers.refreshInstagramIdentity(owner,accountId));assert.equal(row('SELECT state FROM accounts WHERE id=?',accountId).state,'connected');
 const route=await mod('app/api/accounts/refresh/route');globalThis.testUser=null;assert.equal((await route.POST(new Request('https://firma.test/api/accounts/refresh',{method:'POST',headers:{Origin:'https://firma.test','Content-Type':'application/json'},body:JSON.stringify({accountId})}))).status,401);
 }finally{globalThis.fetch=previousFetch;globalThis.testUser=userA;}
});
console.log(`\n${total} meaningful integration checks passed. Platform calls were mocked.`);
db.close();fs.rmSync(out,{recursive:true,force:true});

