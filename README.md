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
- Histórico de operações. As contagens são reais do workspace; não simulam métricas sociais.

## Configuração de produção

O Site usa autenticação do ChatGPT e é privado do proprietário. Em **Contas conectadas**, configure o Client ID e Client Secret de seus próprios aplicativos, cadastre a URL de retorno mostrada e autorize cada conta pelo portal oficial.

Segredos da aplicação são configurados nativamente no ambiente de hospedagem:

| Chave | Uso |
|---|---|
| TOKEN_ENCRYPTION_KEY | Segredo estável com pelo menos 32 caracteres. Criptografa credenciais e checkpoints. Não rotacionar sem migrar os dados. |
| APP_ORIGIN | Origem HTTPS canônica do Site. |
| SCHEDULER_ENABLED | Habilita acesso de serviço ao processador (`true` após configurar o agendamento). |

As credenciais específicas das redes são armazenadas criptografadas em D1. Nunca coloque segredos em arquivos, código cliente, Git ou prompts.

**Mídias públicas:** uploads do workspace permanecem privados. Instagram e TikTok precisam de uma URL HTTPS pública do arquivo original. Informe-a em Biblioteca → Detalhes; no TikTok, configure e verifique seu domínio/prefixo. Nesta versão não há provisionamento automático de um CDN público. O YouTube recebe o arquivo diretamente do armazenamento privado.

**Aprovações:** a disponibilidade de escopos e contas depende do aplicativo registrado e da aprovação da plataforma. Direct Post do TikTok tem restrições para ferramentas exclusivamente internas. O envio para a caixa de entrada requer ação final do criador no TikTok.

## Referências pessoais

Cadastre arrobas ou links de perfis em **Referências → Meus perfis**. A mesma identidade não pode ser duplicada na mesma rede; nomes são normalizados. Organize em **Por nicho** e marque favoritos. Em **Modelos**, salve um exemplo, suas observações e uma legenda própria. **Usar modelo** abre o editor com título, rede, formato e legenda, sem criar um envio nem assumir consentimento. Gancho e roteiro permanecem como notas no modelo. Excluir um perfil mantém seus modelos sem vínculo; excluir um modelo mantém os rascunhos já salvos.

As referências são um acervo manual de inspiração. Não fazem scraping, downloads de conteúdo alheio, coleta de métricas ou acompanhamento automático. Links abrem nos sites originais. Todos os registros são restritos ao proprietário autenticado, com proteção contra sobrescrita de versões antigas.

## Operação e limites

A rotina vinculada ao Site chama a fila a cada 60 minutos. O horário selecionado é o início elegível do envio, não uma garantia de horário exato de publicação. Cada execução processa até três entregas e a rede pode levar mais tempo para processar. Processos ativos não podem ser editados/cancelados; crie outra versão somente após verificar a rede. Consultas de status com falhas temporárias retomam o checkpoint sem recriar mídias ou repetir envios. Escritas com resultado incerto exigem conferência na rede. Falhas temporárias de renovação não expiram a conexão; revogação confirmada exige reconectar. Consulte [OPERATIONS.md](OPERATIONS.md).

Não há renderização/corte de vídeo no servidor, geração de vídeo com IA, métricas de alcance/engajamento, caixa de mensagens ou automação de curtidas/seguidores. O estúdio desta versão edita imagens. Não há integração de faturamento ou equipe compartilhada.

## Desenvolvimento e verificação

Stack: React + Vinext, Cloudflare Workers, D1/SQLite, R2, TypeScript, Zod, Drizzle.

```sh
node tests/integration.mjs
node node_modules/typescript/bin/tsc --noEmit
```

O teste usa as rotas e a fila reais com SQLite temporário e HTTP das redes simulado. São 29 verificações de autorização, OAuth oficial e de uso único, isolamento, concorrência, cancelamento, renovação de tokens, recuperação de consultas, criptografia, horário de verão, rotinas, referências e os três adaptadores. Não publica nas redes. Migrações ficam em `drizzle/` e são aplicadas pela hospedagem.

A compilação de produção usa o helper de build do Sites. Os testes com APIs reais exigem credenciais e contas autorizadas. A revisão visual em navegador ainda não foi executada neste ambiente.

## Documentação oficial consultada

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- https://developers.tiktok.com/docs/en/content-sharing-guidelines
- https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
- https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- https://developers.google.com/youtube/data/reference/rest/v3/videos/insert

Revisão: 18 de outubro de 2026. Meta Graph versão v26.0 configurada no servidor.
