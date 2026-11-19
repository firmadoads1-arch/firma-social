import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'firma-profile-availability-'));
try{
 const file=path.join(dir,'availability.mjs');fs.writeFileSync(file,ts.transpileModule(fs.readFileSync('lib/profile-availability.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 const {classifyPublicProfile:classify,fetchPublicProfile,profileIsRed,withoutRedProfiles}=await import(file);
 const errorView={resource:{__dr:'PolarisErrorRoot.react'},props:{page_logging:{name:'httpErrorPage'},failure_reason:null,restricted_age:null,page_type:'PROFILE',show_lox_redesigned_404_page:true}};
 const route=view=>'<script type="application/json">'+JSON.stringify({require:[{route:{rootView:view}}]})+'</script>';
 assert.equal(classify(route(errorView),200,'perfil').status,'unavailable');
 for(const phrase of ['Esta página não está disponível.','Sorry, this page isn’t available.','Esta página no está disponible.','Cette page n’est pas disponible.','Diese Seite ist nicht verfügbar.','このページはご利用いただけません'])assert.equal(classify('<h2>'+phrase+'</h2>',200,'perfil').status,'unavailable',phrase);
 for(const status of [302,401,403,429,500,503])assert.equal(classify('<h2>Esta página não está disponível.</h2>',status,'perfil').status,'unknown');
 assert.equal(classify(route({...errorView,props:{...errorView.props,restricted_age:18}}),200,'perfil').status,'unknown');
 assert.equal(classify('<script>var translated="Esta página não está disponível."</script><h1>Instagram</h1>',200,'perfil').status,'unknown');
 assert.equal(classify('<title>Instagram</title><script>PolarisErrorRoot.react</script>',404,'perfil').status,'unknown');
 const available='<meta property="og:title" content="Perfil (&#064;perfil) • Instagram"><meta property="og:url" content="https://www.instagram.com/perfil/"><p>Esta página não está disponível.</p>';
 assert.equal(classify(available,200,'perfil').status,'available');assert.equal(classify(available,200,'outro').status,'unavailable');
 const a={id:'a',platform:'instagram',username:'perfil',availabilityUsername:'perfil',availabilityStatus:'unavailable',availabilityReason:'profile_unavailable_confirmed'},b={...a,id:'b',username:'outro'},c={...a,id:'c',availabilityStatus:null},d={...a,id:'d',availabilityResult:'unknown'};
 assert(profileIsRed(a));assert(!profileIsRed(b));assert(!profileIsRed({...a,platform:'tiktok'}));const e={...a,id:'e',availabilityStatus:'available',availabilityResult:'available',availabilityReason:'reels_accessible'};assert.deepEqual(withoutRedProfiles([a,b,c,d,e]).map(x=>x.id),['e']);assert.deepEqual(withoutRedProfiles([{...e,availabilityResult:'unknown'}]),[]);
 const original=globalThis.fetch;try{
  globalThis.fetch=async(url,init)=>{assert(['https://www.instagram.com/perfil/reels/?hl=en','https://www.instagram.com/perfil/?hl=en'].includes(url));assert.equal(init.redirect,'manual');assert(init.headers['User-Agent'].includes('FirmaSocialProfileCheck/1.0'));assert(init.headers['User-Agent'].includes('Chrome/'));assert(!init.headers.Authorization&&!init.headers.Cookie);return new Response(route(errorView),{headers:{'content-type':'text/html'}});};
  assert.equal((await fetchPublicProfile('perfil')).status,'unavailable');
  globalThis.fetch=async()=>new Response('<meta property="og:title" content="Perfil (@perfil)"><meta property="og:url" content="https://www.instagram.com/perfil/reels/">',{headers:{'content-type':'text/html'}});assert.deepEqual(await fetchPublicProfile('perfil'),{status:'available',reason:'reels_accessible'});
  globalThis.fetch=async url=>new Response(url.includes('/reels/')?route(errorView):'<meta property="og:title" content="Perfil (@perfil)"><meta property="og:url" content="https://www.instagram.com/perfil/">',{headers:{'content-type':'text/html'}});assert.deepEqual(await fetchPublicProfile('perfil'),{status:'available',reason:'profile_accessible'});
  assert(!profileIsRed({...a,availabilityStatus:'needs_review',availabilityReason:'unexpected_redirect'}));assert(!profileIsRed({...a,availabilityReason:'network_or_timeout'}));
  globalThis.fetch=async()=>new Response('<title>Instagram</title>',{headers:{'content-type':'text/html'}});assert.equal((await fetchPublicProfile('perfil')).status,'unknown');
  let hops=0;globalThis.fetch=async()=>++hops===1?new Response(null,{status:301,headers:{location:'https://instagram.com/perfil/reels/?hl=en'}}):new Response(route(errorView),{headers:{'content-type':'text/html'}});assert.equal((await fetchPublicProfile('perfil')).status,'unavailable');assert.equal(hops,3);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://www.instagram.com/accounts/login/?next=%2Fperfil%2F'}});assert.equal((await fetchPublicProfile('perfil')).reason,'instagram_access_redirect');
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://attacker.invalid/perfil/'}});assert.equal((await fetchPublicProfile('perfil')).reason,'unexpected_redirect:https::attacker.invalid');
  globalThis.fetch=async()=>{throw Error('Network');};assert.equal((await fetchPublicProfile('perfil')).status,'unknown');assert.equal((await fetchPublicProfile('../private')).status,'unknown');
 }finally{globalThis.fetch=original;}
 console.log('✓ Public screen detection, translated messages, login/temporary ambiguity, stale usernames, safe selection and credential-free requests.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
