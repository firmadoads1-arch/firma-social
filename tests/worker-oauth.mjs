// Exercise the real provider code in workerd, not Node's Fetch implementation.
// Every external response is mocked; no real account or credential is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(fs.realpathSync(path.resolve('node_modules/wrangler/package.json')));
const {Miniflare} = require('miniflare');
const {build} = require('esbuild');
const bundle = await build({
  stdin: {contents: `
    import {exchange, api} from './lib/providers';
    export default {async fetch(req) {
      try {
        if (new URL(req.url).pathname === '/redirect') {
          await api('https://graph.instagram.com/redirect-test', {headers:{Authorization:'Bearer TEST-ONLY'}});
          return Response.json({unexpectedSuccess:true});
        }
        const result = await exchange('instagram', {clientId:'test-app',clientSecret:'test-secret'}, 'test-code', 'https://firma.test/api/oauth/instagram/callback', 'test-verifier');
        return Response.json({providerId:result.providerId,username:result.username,expiresIn:result.tokens.expires_in});
      } catch (error) {
        return Response.json({error:error.code ?? error.reason,stage:error.stage},{status:422});
      }
    }};
  `, resolveDir: process.cwd(), loader: 'ts'},
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
  plugins: [{name:'no-database-in-provider-test',setup(b) {
    b.onResolve({filter:/^\.\/server$/}, args => args.importer.endsWith('/lib/providers.ts') ? {path:'server',namespace:'test-server'} : undefined);
    b.onLoad({filter:/.*/,namespace:'test-server'}, () => ({contents:`export const config = () => {throw new Error('Unexpected database access');};export const first=config,list=config,run=config,runtime=config;`,loader:'js'}));
  }}],
});

let exchanges = 0, extensions = 0, profiles = 0;
const calls=[];
const outboundService=async req=>{
  const u=new URL(req.url);calls.push(u.origin+u.pathname);
  if(u.origin==='https://api.instagram.com'&&u.pathname==='/oauth/access_token'){
    exchanges++;assert.equal(req.method,'POST');const body=await req.formData();
    assert.equal(body.get('client_id'),'test-app');assert.equal(body.get('client_secret'),'test-secret');assert.equal(body.get('code'),'test-code');assert.equal(body.get('redirect_uri'),'https://firma.test/api/oauth/instagram/callback');
    return Response.json({access_token:'TEST-SHORT',user_id:'test-profile-id',permissions:['instagram_business_basic','instagram_business_content_publish']});
  }
  if(u.origin==='https://graph.instagram.com'&&u.pathname==='/access_token'){
    extensions++;assert.equal(u.searchParams.get('access_token'),'TEST-SHORT');assert.equal(u.searchParams.get('grant_type'),'ig_exchange_token');
    return Response.json({access_token:'TEST-LONG',expires_in:5184000});
  }
  if(u.origin==='https://graph.instagram.com'&&u.pathname==='/v26.0/me'){
    profiles++;assert.equal(u.searchParams.get('fields'),'user_id,username');assert.equal(req.headers.get('Authorization'),'Bearer TEST-LONG');
    return Response.json({user_id:'test-profile-id',username:'test_profile'});
  }
  if(u.origin==='https://graph.instagram.com'&&u.pathname==='/redirect-test')return new Response(null,{status:302,headers:{Location:'https://unexpected.example.invalid/collect'}});
  throw new Error('Unexpected outbound request');
};
const mf = new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,outboundService});
try {
  const connected=await mf.dispatchFetch('https://unit.test/connect');
  const result=await connected.json();
  assert.equal(connected.status,200,JSON.stringify(result));
  assert.deepEqual(result,{providerId:'test-profile-id',username:'test_profile',expiresIn:5184000});
  assert.deepEqual([exchanges,extensions,profiles],[1,1,1]);
  console.log('✓ Instagram code exchange, token extension and profile lookup run in workerd');
  const redirect=await mf.dispatchFetch('https://unit.test/redirect');
  assert.equal(redirect.status,422);
  assert.equal((await redirect.json()).error,'unexpected_redirect');
  assert.deepEqual(calls,['https://api.instagram.com/oauth/access_token','https://graph.instagram.com/access_token','https://graph.instagram.com/v26.0/me','https://graph.instagram.com/redirect-test']);
  console.log('✓ Provider redirects are rejected without forwarding credentials');
} finally { await mf.dispose(); }
