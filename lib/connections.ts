import type {Account, Platform} from './domain';

export const connectionErrors: Record<string, string> = {
  expired: 'Esta tentativa venceu ou já foi utilizada. Clique em Conectar conta para iniciar outra.',
  cancelled: 'A autorização foi cancelada na rede social. Nenhuma conta foi adicionada.',
  browser: 'Esta autorização foi iniciada em outro navegador. Para conectar aqui, abra o link de conexão do Firma Social e inicie uma nova autorização neste dispositivo.',
  link_expired: 'Este link de conexão venceu ou foi revogado. Gere outro em Contas conectadas → Conectar em outro dispositivo.',
  workspace: 'A conexão foi iniciada em outro workspace. Volte à sua sessão original e tente novamente.',
  configuration: 'A configuração do aplicativo está incompleta. Confira o App ID, o segredo e a URL de retorno.',
  app_credentials: 'O Instagram recusou as credenciais do aplicativo. Em Contas conectadas → Instagram → Configurar, use o Instagram App ID e o Instagram App Secret do mesmo aplicativo.',
  app_secret: 'O Instagram recusou o segredo do aplicativo. Em Contas conectadas → Instagram → Configurar, atualize o campo Instagram App Secret com o segredo correspondente ao Instagram App ID.',
  redirect_uri: 'O Instagram recusou a URL de retorno. Copie a URL exibida em Configurar Instagram e cadastre esse mesmo endereço nas URLs de redirecionamento OAuth do aplicativo na Meta.',
  authorization_code: 'O Instagram recusou o código desta tentativa. Ele pode ter vencido, já ter sido usado ou pertencer a outra configuração do aplicativo. Volte ao Firma Social e inicie uma nova conexão.',
  account_type: 'Esta conexão exige um Instagram profissional. Confira se o perfil está configurado como Empresa ou Criador de conteúdo e tente novamente.',
  permissions: 'O Instagram recusou a autorização. Confira as permissões e, se o aplicativo estiver em teste, o convite de testador aceito para este perfil.',
  temporary: 'A comunicação com a rede social falhou temporariamente. Aguarde um pouco e inicie uma nova conexão pelo Firma Social.',
  token_exchange: 'O Instagram devolveu a autorização, mas a troca pelo acesso à conta falhou. Confira o Instagram App ID e o Instagram App Secret do mesmo aplicativo em Configurar Instagram e inicie uma nova conexão.',
  token_extension: 'O Instagram autorizou o acesso inicial, mas não concluiu a autorização de longa duração. Confira o Instagram App Secret em Configurar Instagram e inicie uma nova conexão.',
  profile_lookup: 'A autorização foi recebida, mas não foi possível identificar o perfil do Instagram. Confira a permissão instagram_business_basic e se a conta é profissional; depois, inicie uma nova conexão.',
  provider: 'A rede social não concluiu a conexão. Inicie uma nova tentativa pelo Firma Social. Se persistir, informe esta mensagem para verificarmos o registro da falha.',
  storage: 'A autorização não pôde ser salva. Tente conectar novamente.',
};
export type ConnectionResult = {type: 'firma:connection'; platform: Platform; accountId?: string; error?: string};
export type ConnectionNotice = {message: string; error: boolean};
export function connectionError(reason: unknown) {
  return typeof reason === 'string' && Object.hasOwn(connectionErrors, reason) ? connectionErrors[reason] : connectionErrors.provider;
}
export function accountLabel(account: Pick<Account, 'platform' | 'username' | 'displayName'>) {
  return account.platform === 'instagram' ? '@' + account.username.replace(/^@/, '') : account.displayName || account.username;
}
