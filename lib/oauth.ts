import type {Platform} from './domain';

// Meta's return can lack Sites identity. Bind it separately to its browser.
export type OAuthTransaction = {verifier: string; browserHash: string; connectionLinkId?: string};
export const oauthCookieName = (stateHash: string) => '__Host-firma-oauth-' + stateHash;
export function oauthCookie(stateHash: string, value = '') {
  return `${oauthCookieName(stateHash)}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value ? 600 : 0}`;
}
export function readOAuthCookie(request: Request, stateHash: string) {
  const name = oauthCookieName(stateHash) + '=';
  return (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(name))?.slice(name.length) ?? '';
}
export function oauthResult(origin: string, platform: Platform, result: {accountId?: string; error?: string; remote?: boolean}, stateHash?: string) {
  const url = new URL('/api/oauth/result', origin);
  url.searchParams.set('platform', platform);
  if (result.remote) url.searchParams.set('device', 'remote');
  if (result.accountId) {
    url.searchParams.set('connected', platform);
    url.searchParams.set('account', result.accountId);
  } else url.searchParams.set('oauth_error', result.error ?? 'provider');
  return new Response(null, {status: 302, headers: {
    Location: url.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    ...(stateHash ? {'Set-Cookie': oauthCookie(stateHash)} : {}),
  }});
}
