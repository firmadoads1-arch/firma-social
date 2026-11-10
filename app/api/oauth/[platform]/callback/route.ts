import {platformSchema, type Platform} from '@/lib/domain';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {config,first,run,runtime,event} from '@/lib/server';
import {hash,seal,unseal,id} from '@/lib/security';
import {exchange,RemoteError,OAuthExchangeError} from '@/lib/providers';
import {readOAuthCookie,oauthResult,type OAuthTransaction} from '@/lib/oauth';
import {activeLink} from '@/lib/connection-links';

export async function GET(req: Request, {params}: {params: Promise<{platform: string}>}) {
  const base = runtime().APP_ORIGIN;
  let platform: Platform = 'instagram', stateHash: string | undefined;
  let stage = 'state', reason = 'expired', owner: string | undefined;
  let connectionLinkId: string | undefined;
  try {
    platform = platformSchema.parse((await params).platform);
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    if (!state || state.length > 200) throw new Error('Invalid state');
    stateHash = await hash(state);
    const row = await first('SELECT * FROM oauth_states WHERE id=? AND platform=? AND expires_at>?', stateHash, platform, Date.now());
    if (!row) throw new Error('Expired state');
    const saved = await unseal<OAuthTransaction | string>(row.verifier, runtime().TOKEN_ENCRYPTION_KEY);
    connectionLinkId = typeof saved === 'string' ? undefined : saved.connectionLinkId;
    if (connectionLinkId && !await activeLink(connectionLinkId,row.owner,platform)) { reason='link_expired'; throw new Error('Link unavailable'); }
    const user = await getChatGPTUser();
    if (!connectionLinkId && user && user.userId !== row.owner) { reason = 'workspace'; throw new Error('Wrong workspace'); }
    const browser = readOAuthCookie(req, stateHash);
    const browserMatches = typeof saved !== 'string' && !!browser && await hash(browser) === saved.browserHash;
    // Legacy attempts require the original authenticated visitor. New attempts
    // can complete without Sites identity using their HttpOnly browser binding.
    // A transferred link starts a NEW flow on the receiving device. Its browser
    // proof is mandatory even if that device has a different Sites identity.
    if (!browserMatches && (connectionLinkId || user?.userId !== row.owner)) { reason = 'browser'; throw new Error('Missing browser binding'); }
    const claimed = await first('DELETE FROM oauth_states WHERE id=? AND owner=? AND platform=? AND expires_at>? RETURNING id', stateHash, row.owner, platform, Date.now());
    if (!claimed) throw new Error('Already claimed');
    owner = row.owner;
    if (url.searchParams.has('error')) { reason = 'cancelled'; throw new Error('Authorization declined'); }
    const code = url.searchParams.get('code');
    if (!code) throw new Error('Missing code');
    stage = 'configuration'; reason = 'configuration';
    const c = await config(row.owner, platform);
    if (!c) throw new Error('Missing configuration');
    stage = 'exchange'; reason = 'provider';
    const result = await exchange(platform, c, code, row.redirect_uri, typeof saved === 'string' ? saved : saved.verifier);
    stage = 'save'; reason = 'storage';
    const now = Date.now();
    const account = await first("INSERT INTO accounts (id,owner,platform,provider_id,username,display_name,tokens,expires_at,scopes,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,'connected',? WHERE (? IS NULL OR EXISTS (SELECT 1 FROM connection_links WHERE id=? AND owner=? AND platform=? AND expires_at>?)) ON CONFLICT(owner,platform,provider_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,tokens=excluded.tokens,expires_at=excluded.expires_at,scopes=excluded.scopes,state='connected' RETURNING id",
      id(), row.owner, platform, result.providerId, result.username, result.displayName, await seal(result.tokens, runtime().TOKEN_ENCRYPTION_KEY), now + Number(result.tokens.expires_in ?? 3600) * 1000, result.tokens.scope ?? '', now,
      connectionLinkId??null,connectionLinkId??null,row.owner,platform,Date.now());
    if (!account) {if(connectionLinkId)reason='link_expired';throw new Error('Account not saved');}
    // A renewed authorization can immediately retry insights without erasing
    // historical measurements or changing any publication.
    if(platform==='instagram')await run("UPDATE analytics_sync SET next_sync_at=0,status='waiting',error=NULL WHERE id=? AND owner=?",account.id,row.owner).catch(()=>{});
    if(connectionLinkId)await run('UPDATE connection_links SET completed_count=completed_count+1 WHERE id=?',connectionLinkId).catch(()=>{});
    // A logging failure must not turn a committed connection into a failure.
    await event(row.owner, 'Conta conectada', `${platform} · @${result.username}`).catch(() => {});
    return oauthResult(base, platform, {accountId: account.id,remote:!!connectionLinkId}, stateHash);
  } catch (e) {
    let diagnostic;
    if (e instanceof OAuthExchangeError) { stage = e.stage; reason = e.reason; diagnostic = e.diagnostic; }
    else if (e instanceof RemoteError) { reason = e.failure !== 'provider' ? e.failure : 'provider'; diagnostic = e.diagnostic; }
    // Fixed categories and sanitized error numbers only; never authorization
    // codes, credentials, request URLs or raw provider responses.
    console.warn('OAuth connection failed', {platform, stage, reason, ...diagnostic});
    if (owner) await event(owner, 'Conexão não concluída', `${platform} · ${reason}`).catch(() => {});
    return oauthResult(base, platform, {error: reason,remote:!!connectionLinkId}, owner ? stateHash : undefined);
  }
}
