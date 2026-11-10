# Portabilidade do Firma Social

Clonar o Git copia código, não dados. O backup privado contém dados e todas as mídias, incluindo tokens OAuth e configurações dos aplicativos, cifrados com AES-256-GCM e uma chave derivada por scrypt da senha escolhida no computador. A senha não é enviada ao servidor. Nunca publique o backup, a autorização temporária ou segredos no GitHub, mesmo em repositório privado.

## Exportar e restaurar

1. Faça a migração com acesso à origem. Aguarde publicações em andamento, evite editar durante a exportação e interrompa o executor da origem antes da troca definitiva. O backup não interrompe a origem automaticamente.
2. Em Configurações → Backup e migração, autorize exportação. O código de acesso dura uma hora, limita-se a este workspace e permite ler seus dados privados.
3. Com Node 22 ou superior: `node scripts/migrate.mjs export ./backup-firma`. Informe URL, autorização e uma senha forte de pelo menos 16 caracteres nos prompts. Segredos não são exibidos. Use um diretório novo. Só um backup com arquivo COMPLETE terminou com sucesso.
4. Clone e publique o código em uma nova instalação compatível. Configure DB, BUCKET, APP_ORIGIN e uma nova TOKEN_ENCRYPTION_KEY aleatória com pelo menos 32 caracteres no cofre da hospedagem. Não reutilize o project_id do Site original para registrar um novo Site. Aplique todas as migrações de drizzle/.
5. Entre na conta do destino e use um workspace vazio. Gere uma autorização de restauração e execute `node scripts/migrate.mjs import ./backup-firma`. Informe URL e autorização do DESTINO e a senha original do backup.
6. Confira perfis, arquivos, configurações, conteúdos e histórico. As credenciais são recriptografadas com a chave do destino; não é preciso obter/copiar a chave da origem. A propriedade dos registros muda para a conta autenticada que autorizou a importação.
7. Se o domínio mudou, cadastre o novo callback de cada rede: `/api/oauth/instagram/callback`, `/api/oauth/tiktok/callback`, `/api/oauth/youtube/callback`. Preserve os mesmos aplicativos Meta/Google/TikTok. URLs públicas externas das mídias são preservadas: se apontam à infraestrutura antiga, mova também essa distribuição e atualize as URLs antes de publicar.
8. Teste uma operação autorizada em cada rede. Tokens revogados, expirados ou invalidados pela rede precisam de nova autorização; migração não garante validade eterna. Só depois desligue a origem e revise os agendamentos no destino.

## O que é preservado

Contas e tokens, configurações dos aplicativos, mídias originais, conteúdos, destinos, histórico de envios/eventos, modelos, referências, rotinas e configurações do workspace. O backup é limitado a 5.000 registros e 10 MB de metadados por restauração; arquivos de mídia são transferidos individualmente em streaming. A ferramenta verifica a autenticação criptográfica de todos os arquivos antes de escrever no destino. D1 restaura os registros em transação; uma falha não sobrescreve registros existentes. Não mescla workspaces e não restaura duas vezes no mesmo workspace.

Por segurança, conteúdos agendados/em publicação viram pendentes de aprovação; entregas ainda não concluídas são canceladas na cópia; rotinas ficam inativas. Histórico concluído permanece. OAuth em andamento, links de conexão, autorizações de migração, sessões e agendamentos externos do ChatGPT não são transferidos. Uma falha de importação pode deixar arquivos de staging em `migration/<id>/` no BUCKET, sem registros visíveis; remova apenas staging comprovadamente abandonado.

## Hospedagem e autenticação

O código atual usa Vinext/Cloudflare Workers, D1 e R2. Não funciona como GitHub Pages ou hospedagem estática. Hospedagens Node/PostgreSQL/S3 exigem adaptadores de runtime e banco; não basta clonar.

Dentro do Sites, a plataforma provê o login. Em outro Site, a importação atribui os dados ao novo login. Fora do Sites, o proxy de identidade da OpenAI não existe: use o adaptador de Cloudflare Access incluído: configure AUTH_MODE=cloudflare_access, ACCESS_ISSUER=https://SEU-TIME.cloudflareaccess.com e ACCESS_AUDIENCE com o AUD da aplicação. O servidor verifica assinatura RS256, emissor, público e validade do JWT; ignora os headers de identidade OpenAI nesse modo. Configure no Access a lista de e-mails permitidos e proteja as rotas do painel. Mantenha /connect, /api/connect, /api/oauth/*, /api/publish-media/* e /api/migration acessíveis ao Worker, que faz a própria validação de navegador/capability nessas rotas. Teste as políticas antes de importar. Nunca aceite `oai-authenticated-user-id`/email enviados livremente pelo visitante. Não publique o Worker fora do Sites com autenticação improvisada. O formato de backup é independente do endereço e da chave de criptografia, mas provisionamento e login da hospedagem de destino devem ser validados antes da mudança.

Mantenha SCHEDULER_ENABLED=false em instalações públicas. Não ative o runner legado baseado apenas em x-firma-service; para execução automática externa implemente autenticação de serviço adequada. A cópia não deve publicar simultaneamente com a origem.

## GitHub

O projeto está pronto para versionar os fontes, migrations e ferramenta. O envio a um repositório GitHub específico requer selecionar/conectar esse repositório. O backup é separado e não foi criado automaticamente: exporte pelo painel autenticado e guarde-o em armazenamento privado com a senha separada. Teste restauração antes de depender dele.

Referência de autenticação externa: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

### Publicar em uma conta Cloudflare própria

Crie um D1 e um bucket R2 na conta de destino. Instale as dependências com a versão de pnpm declarada no package.json, rode `npm run build` e depois `node scripts/standalone-config.mjs D1_ID R2_BUCKET https://DOMINIO https://TIME.cloudflareaccess.com AUD`. O comando só modifica a configuração gerada em dist, não a identidade do Site original.

Use `npx wrangler d1 migrations apply DB --remote --config dist/server/wrangler.json` e `npx wrangler secret put TOKEN_ENCRYPTION_KEY --config dist/server/wrangler.json` (digite um segredo aleatório longo no prompt, nunca no código). Publique com `npx wrangler deploy --config dist/server/wrangler.json`. Configure o domínio correspondente a APP_ORIGIN e as políticas de Access. O botão Sair seleciona o logout da hospedagem.

As mídias enviadas ao Instagram (incluindo capas de Reels) usam links temporários da própria instalação, gerados apenas no envio. O backup preserva a associação da capa em cada conteúdo; após restaurar e revisar o agendamento, os links passam a usar APP_ORIGIN do destino. A URL externa opcional da biblioteca é usada somente pelo TikTok.

Após a migração, configure um executor autenticado para o novo workspace conforme `docs/QUEUE_RUNNER.md`. Novos agendamentos ficam bloqueados enquanto essa configuração não estiver válida; rascunhos e contas permanecem disponíveis.
