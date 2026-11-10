# Prisma no Firma Social

## Uso

1. No menu do Firma, abra **Ferramentas do Prisma**.
2. Crie ou selecione um projeto. A área de trabalho atual (Geral ou grupo) é mantida.
3. Em **Templates de perfis**, use **Importar modelos do pacote** para carregar as 11 fotos originais, com seus enquadramentos. A operação pode ser repetida: não substitui modelos existentes.
4. Abra uma das 14 ferramentas. É possível importar arquivos do computador ou escolher os arquivos da biblioteca do Firma, inclusive vários vídeos para o lote de uma modelo.
5. Com **Salvar na biblioteca** ativado, originais e exportações ficam em `Prisma / nome do projeto`, na biblioteca já existente. Sem essa opção, os resultados continuam disponíveis para download local.
6. **Criar conteúdo** abre o editor de publicação do Firma com o arquivo selecionado. O usuário ainda escolhe as contas, revisa e decide publicar ou agendar. Exportar não publica nas redes.

O processamento usa FFmpeg WASM no navegador; mantenha a aba aberta. Há um único motor por aba. Lotes renderizam um vídeo por vez e admitem no máximo dois salvamentos pendentes. O motor acelerado é usado apenas quando o navegador e a memória comportam; a alternativa compatível permanece disponível. Fotos são detectadas e enquadradas localmente, sem envio a um serviço de reconhecimento facial.

Limites preservados do Prisma: 80 MB por arquivo, vídeos de até 3 minutos, áudio de até 10 minutos, 2 GB em mídias do Prisma, 100 templates de perfis e 50 entradas por lote. A biblioteca do Prisma mostra até 300 arquivos recentes, em páginas de 24. As ferramentas de publicação continuam aplicando os limites de cada rede e formato.

## Decisões de integração

- Página própria `/prisma`, carregada apenas ao entrar no laboratório; estilos limitados a `.prisma-app`. O editor, calendário e listas do Firma não carregam o motor de vídeo.
- Namespace `/api/prisma/*`, tabelas próprias e migração aditiva `0007_prisma_lab`. A tabela `media` e o bucket existentes continuam sendo a única biblioteca de arquivos.
- Cada projeto tem proprietário, grupo e pasta. Consultas e gravações validam o proprietário e a área atual no servidor. Os templates de perfis são compartilhados entre os projetos do mesmo workspace; os experimentos pertencem a um projeto.
- A sessão e a política de acesso do Firma são reutilizadas. A integração não modifica a visibilidade do Site nem cria credenciais. Uma identidade enviada num cabeçalho pelo cliente não autentica a API. Exclusões exigem a identidade protegida do proprietário, como no Firma.
- Fotos dos modelos ficam fora de `public/`. Os dados do pacote só são importados por uma ação explícita. A importação valida os hashes e preserva arquivos, IDs, nomes e crops existentes.
- Um identificador estável de upload/exportação é o recibo do arquivo. Uma transação grava a mídia compartilhada e o registro do projeto. Reenvios simultâneos não criam cópias; respostas desconhecidas são conferidas por GET. Dados de lote, origem, modelo e ajustes são preservados.
- Arquivos usados em posts, rotinas ou capas permanecem protegidos contra exclusão. Remover uma mídia sem referências também limpa seu registro no projeto. Excluir ou trocar a foto de um modelo não apaga uma imagem já preservada na biblioteca por uma migração.
- COOP/COEP é aplicado só ao documento do laboratório e aos workers do motor. OAuth, fila de postagem, consentimentos e configurações de provedores não são alterados.
- Os quatro layouts fornecidos estão nas opções padrão. Layouts personalizados continuam locais ao navegador e podem ser exportados/importados em JSON, como no Prisma original.

## Backup e migração

O backup criptografado existente inclui os projetos, registros de exportação, experimentos e templates do Prisma. Fotos privadas entram no mesmo transporte criptografado das mídias. Ao restaurar, as referências de armazenamento são reescritas para o novo destino. Backups anteriores, sem as tabelas do Prisma, continuam aceitos. Agendamentos restaurados continuam pausados para revisão, como já ocorria no Firma.

## Validação

- `node tests/integration.mjs`: 77 verificações do Firma, com SQLite e provedores simulados.
- `node tests/prisma-integration.mjs`: identidade, origem, grupos, projetos, mídia compartilhada, reenvios simultâneos, importação idempotente dos 11 modelos, checkpoints, exclusão protegida e restauração completa.
- `node tests/prisma-ui.mjs`: renderização das 14 ferramentas, isolamento dos estilos e reconciliação de resposta de upload desconhecida.
- `node tests/rendering.mjs`, `node tests/composer-media.mjs`, `node tests/worker-oauth.mjs`: listas com 600 vídeos, editor e OAuth no workerd.
- `node scripts/prepare-prisma-fixtures.mjs` cria clipes sintéticos apenas em `outputs/prisma-qa`. Não há vídeo privado nem fixture de QA no deploy.
- `tests/prisma/`: motor WASM real, prévias, exportações Full HD, áudio, layouts, lotes, ZIP, cancelamento, deadlines, recuperação de falhas e modo multithread. Somente o transporte do navegador é substituído nos testes de motor executados em Node.

A prévia gerenciada iniciou em 06/11/2026, mas a rota local não foi acessível pelo navegador de teste. A validação visual e os gestos de edição no navegador não foram confirmados nesse ambiente. Isso é distinto dos testes do motor e de integração acima.
