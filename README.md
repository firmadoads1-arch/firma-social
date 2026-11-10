# Firma Social

Workspace privado para preparar e agendar conteúdo próprio no Instagram, TikTok e YouTube usando suas APIs oficiais. Implementação original, inspirada apenas nos fluxos observáveis do painel de referência. Nenhum código privado, cookie ou token de terceiros faz parte do projeto.

## O que está implementado

- Menu pessoal, painel operacional, calendário mensal, rascunhos e revisão.
- Referências: perfis por arroba/link, páginas, criadores e modelos, nichos, favoritos, busca, edição e exclusão.
- Modelos de conteúdo: links originais, gancho, roteiro privado e legenda inicial; abertura no editor sem agendamento automático.
- Biblioteca persistente em R2, pastas, imagens/vídeos e downloads privados (50 MB/arquivo).
- Editor com legenda base e personalização por rede; prévia; consentimento de envio.
- Estúdio de imagem no navegador: enquadramento, formatos, texto e exportação JPEG.
- Modelos de legenda e rotinas que geram rascunhos para revisão no dia anterior.
- OAuth e tokens criptografados no servidor; Instagram Login, Google e TikTok Login Kit.
- Adaptadores de publicação e consulta do resultado; fila com leases, checkpoints e proteção contra reenvio de resultado incerto.
- Instagram: JPEG, carrosséis de imagens, Reels e Stories. Conta profissional necessária.
- TikTok: vídeo via URL verificada; caixa de entrada por padrão. Direct Post só após configurar aplicativo revisado, opções atuais de privacidade e consentimento.
- YouTube: upload resumível com título, descrição, privacidade e declarações de conteúdo.
- Histórico de operações e desempenho do Instagram, com coleta autorizada de métricas reais.
- Organização por grupos, capas por perfil e agendamento de Reels em lote.
- Laboratório Prisma com 14 ferramentas de imagem, vídeo e áudio no navegador, integrado à biblioteca.

## Configuração de produção

O Site usa autenticação do ChatGPT e é privado do proprietário. Em **Contas conectadas**, configure o Client ID e Client Secret de seus próprios aplicativos, cadastre a URL de retorno mostrada e autorize cada conta pelo portal oficial.

Segredos da aplicação são configurados nativamente no ambiente de hospedagem:

| Chave | Uso |
|---|---|
| TOKEN_ENCRYPTION_KEY | Segredo estável com pelo menos 32 caracteres. Criptografa credenciais e checkpoints. Não rotacionar sem migrar os dados. |
| APP_ORIGIN | Origem HTTPS canônica do Site. |
| SCHEDULER_ENABLED | Habilita acesso de serviço ao processador (`true` após configurar o agendamento). |

As credenciais específicas das redes são armazenadas criptografadas em D1. Nunca coloque segredos em arquivos, código cliente, Git ou prompts.

**Distribuição de mídias:** uploads permanecem no armazenamento privado. O Instagram recebe links temporários gerados pela instalação no envio. O TikTok exige uma URL HTTPS em domínio/prefixo verificado; informe-a em Biblioteca → Detalhes. O YouTube recebe o arquivo diretamente do armazenamento privado.

**Aprovações:** a disponibilidade de escopos e contas depende do aplicativo registrado e da aprovação da plataforma. Direct Post do TikTok tem restrições para ferramentas exclusivamente internas. O envio para a caixa de entrada requer ação final do criador no TikTok.

## Referências pessoais

Cadastre arrobas ou links de perfis em **Referências → Meus perfis**. A mesma identidade não pode ser duplicada na mesma rede; nomes são normalizados. Organize em **Por nicho** e marque favoritos. Em **Modelos**, salve um exemplo, suas observações e uma legenda própria. **Usar modelo** abre o editor com título, rede, formato e legenda, sem criar um envio nem assumir consentimento. Gancho e roteiro permanecem como notas no modelo. Excluir um perfil mantém seus modelos sem vínculo; excluir um modelo mantém os rascunhos já salvos.

As referências são um acervo manual de inspiração. Não fazem scraping, downloads de conteúdo alheio, coleta de métricas ou acompanhamento automático. Links abrem nos sites originais. Todos os registros são restritos ao proprietário autenticado, com proteção contra sobrescrita de versões antigas.

## Operação e limites

A rotina vinculada ao Site chama a fila a cada 60 minutos. O horário selecionado é o início elegível do envio, não uma garantia de horário exato de publicação. Cada execução processa até três entregas e a rede pode levar mais tempo para processar. Processos ativos não podem ser editados/cancelados; crie outra versão somente após verificar a rede. Consultas de status com falhas temporárias retomam o checkpoint sem recriar mídias ou repetir envios. Escritas com resultado incerto exigem conferência na rede. Falhas temporárias de renovação não expiram a conexão; revogação confirmada exige reconectar. Consulte [OPERATIONS.md](OPERATIONS.md).

O Prisma processa imagem, vídeo e áudio no navegador; não há renderização de vídeo no servidor nem geração de vídeo com IA. Métricas do Instagram exigem autorização adicional de Insights. Não há caixa de mensagens, automação de curtidas/seguidores, integração de faturamento ou equipe compartilhada.

## Desenvolvimento e verificação

Stack: React + Vinext, Cloudflare Workers, D1/SQLite, R2, TypeScript, Zod, Drizzle.

Requisitos: Node.js 22.13 ou superior e pnpm 11.25.0 (versão declarada no `package.json`). A partir de um clone limpo:

```sh
corepack pnpm install --frozen-lockfile
npm run check
npm run build
```

`npm run check` verifica os tipos e executa as oito suítes de teste independentes de navegador. Também é possível executar `npm run test:core` (painel, publicação, OAuth, mídias e Stories) ou `npm run test:prisma` (integração e interface do estúdio) separadamente. Os testes de integração usam SQLite temporário e respostas simuladas das plataformas; não precisam de contas reais e não publicam nas redes. A suíte principal contém 79 verificações; a integração Prisma contém outras 11.

A compilação prepara o FFmpeg e o detector facial locais antes de gerar o Worker em `dist/server/` e os arquivos de cliente em `dist/client/`. Dentro do Sites, use o helper de build da hospedagem. O repositório já contém a identidade da instalação original em `.openai/hosting.json`; preserve-a ao atualizar essa instalação. Para uma instalação independente e restauração dos dados, siga [docs/MIGRATION.md](docs/MIGRATION.md). Clonar o repositório não copia banco, mídias, contas conectadas nem segredos.

O código inclui organização por grupos, capas e agendamento em lote ([guia](docs/GRUPOS_E_LOTES.md)), coleta de desempenho ([guia](docs/ANALYTICS.md)) e as 14 ferramentas do Prisma ([guia](docs/PRISMA.md)). A configuração atual do executor está em [docs/QUEUE_RUNNER.md](docs/QUEUE_RUNNER.md).

As migrações ficam em `drizzle/` e são aplicadas pela hospedagem. Testes com APIs reais exigem aplicativos e contas autorizadas. Os testes de processamento WASM em `tests/prisma/` são verificações adicionais com fixtures e requisitos próprios; não fazem parte de `npm run check`. A aprovação dos testes automatizados não substitui a validação visual em navegador.

## Documentação oficial consultada

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- https://developers.tiktok.com/docs/en/content-sharing-guidelines
- https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
- https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- https://developers.google.com/youtube/data/reference/rest/v3/videos/insert

Revisão: 18 de outubro de 2026. Meta Graph versão v26.0 configurada no servidor.
