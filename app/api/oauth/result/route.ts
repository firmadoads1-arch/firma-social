import {platformSchema,platformNames} from '@/lib/domain';
import {connectionErrors,type ConnectionResult} from '@/lib/connections';
import {runtime} from '@/lib/server';
import {randomToken} from '@/lib/security';

export function GET(req: Request) {
  const url = new URL(req.url);
  const platform = platformSchema.safeParse(url.searchParams.get('platform'));
  if (!platform.success) return new Response('Conexão inválida.', {status: 400});
  const account = url.searchParams.get('account');
  const success = !!account && /^[0-9a-f-]{36}$/.test(account) && url.searchParams.get('connected') === platform.data;
  const error = url.searchParams.get('oauth_error') ?? 'provider';
  const remote = url.searchParams.get('device') === 'remote';
  const result: ConnectionResult = {type: 'firma:connection', platform: platform.data, ...(success ? {accountId: account!} : {error: Object.hasOwn(connectionErrors,error) ? error : 'provider'})};
  const title = success ? 'Conta conectada ao Firma Social' : 'A conexão não foi concluída';
  const message = success ? remote ? 'O perfil foi salvo no workspace que gerou o link. Você pode fechar esta página: ele aparecerá no painel original, mesmo que esteja aberto em outro dispositivo.' : 'Volte à aba do Firma Social. O perfil estará em Contas conectadas e poderá ser selecionado nos seus conteúdos.' : connectionErrors[result.error!];
  const nonce = randomToken();
  const origin = new URL(runtime().APP_ORIGIN).origin;
  const scriptData = JSON.stringify({result, origin}).replaceAll('<', '\\u003c');
  const actions = remote ? '<p>Este link permite vincular perfis. Ele não dá acesso ao painel nem às outras contas.</p><a href="/connect" target="_top">'+(success?'Conectar outra conta neste dispositivo':'Tentar novamente neste dispositivo')+'</a>' : '<p>Seu acesso ao Firma Social continua sendo o mesmo. Cada perfil conectado fica sob sua gestão.</p><button id="close">Voltar à aba anterior</button><a href="/?view=accounts" target="_top">Abrir contas conectadas</a>';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Firma Social</title><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171e15;color:#edf2e6;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:24px;padding:36px;border:1px solid #405035;border-radius:18px;background:#20291c}small{color:#b2ca81;letter-spacing:.15em}h1{font-size:26px;line-height:1.25}p{color:#b5c1aa}button,a{display:inline-block;padding:12px 18px;margin:8px 8px 0 0;border-radius:9px;border:0;background:#d4ecaa;color:#20291c;font:inherit;text-decoration:none;cursor:pointer}a{background:#33432b;color:#edf2e6}</style></head><body><main><small>FIRMA SOCIAL · ${platformNames[platform.data]}</small><h1>${title}</h1><p>${message}</p>${actions}</main><script nonce="${nonce}">const {result,origin}=${scriptData};try{if(window.opener)window.opener.postMessage(result,origin);const channel=new BroadcastChannel('firma-connections');channel.postMessage(result);channel.close();}catch{}const closeButton=document.getElementById('close');if(closeButton)closeButton.onclick=()=>{try{if(window.opener)window.opener.focus();}catch{}window.close();};</script></body></html>`;
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`}});
}
