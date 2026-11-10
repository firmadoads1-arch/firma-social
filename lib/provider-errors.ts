import {AppError} from './security';

export type RemoteFailure = 'app_credentials' | 'app_secret' | 'redirect_uri' | 'authorization_code' | 'permissions' | 'account_type' | 'temporary' | 'provider';
export type RemoteDiagnostic = {httpStatus: number; providerCode: string; providerSubcode?: string};
export class RemoteError extends AppError {
  constructor(public code: string, public uncertain = false, public retryable = false, public failure: RemoteFailure = 'provider', public diagnostic?: RemoteDiagnostic) {
    super(retryable ? 'A plataforma está temporariamente indisponível. A consulta será tentada novamente.' : `A plataforma não confirmou a operação (${code}). Confira a conexão e a situação na rede.`, 422);
  }
}

const oauthCodes = new Set(['invalid_client','invalid_client_id','invalid_client_secret','invalid_grant','invalid_token','invalid_access_token','access_token_invalid','access_token_expired','unauthorized_client','access_denied','invalid_scope','temporarily_unavailable','server_error']);
function numericCode(value: unknown) {
  return (typeof value === 'number' || typeof value === 'string') && /^\d{1,12}$/.test(String(value)) ? String(value) : undefined;
}

// Inspect provider text only to select a fixed category. Never retain or expose
// that text: a provider may echo a credential, authorization code or request URL.
export function remoteError(status: number, body: any, readOnly: boolean) {
  const detail = body?.error && typeof body.error === 'object' ? body.error : body;
  const rawCode = detail?.code ?? (typeof body?.error === 'string' ? body.error : undefined);
  const code = numericCode(rawCode) ?? (typeof rawCode === 'string' && oauthCodes.has(rawCode) ? rawCode : String(status));
  const subcode = numericCode(detail?.error_subcode);
  const message = [detail?.message, detail?.error_message, body?.error_description].filter(v => typeof v === 'string').join(' ').slice(0, 8192).toLowerCase();
  const transient = status === 429 || status === 408 || status >= 500 || detail?.is_transient === true || ['temporarily_unavailable','server_error'].includes(code);
  let failure: RemoteFailure = 'provider';
  if (transient) failure = 'temporary';
  else if (/invalid (?:app_|client_)?secret|invalid client secret|client secret.*(?:invalid|incorrect)|app_secret.*(?:invalid|incorrect)/.test(message) || code === 'invalid_client_secret') failure = 'app_secret';
  else if (/redirect[_ ]uri|redirect url/.test(message)) failure = 'redirect_uri';
  else if (/matching code|verification code|authorization code.*(?:invalid|expired|used)/.test(message) || code === 'invalid_grant') failure = 'authorization_code';
  else if (/invalid (?:app|client)[_ ]?id|invalid client|invalid application|application.*does not exist/.test(message) || ['invalid_client','invalid_client_id','unauthorized_client'].includes(code)) failure = 'app_credentials';
  else if (/(?:professional|business|creator) account.*(?:required|must)|not a (?:professional|business|creator) account/.test(message)) failure = 'account_type';
  else if (/insufficient developer role|permission|not authorized|access denied|invalid scope/.test(message) || ['10','200','401','403','access_denied','invalid_scope'].includes(code)) failure = 'permissions';
  return new RemoteError(code, !readOnly && (status >= 500 || status === 408), readOnly && transient, failure, {httpStatus: status, providerCode: code, ...(subcode ? {providerSubcode: subcode} : {})});
}
