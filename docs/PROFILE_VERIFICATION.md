# Verificação pública sem falsos sinais vermelhos

**Verificar TODAS as contas** continua percorrendo os perfis de todos os grupos, até três consultas em paralelo. Cada perfil consulta `/username/reels/` primeiro. Quando a página de Reels não confirma acesso, consulta também `/username/`, exceto por limitação de chamadas ou username inválido.

- Se uma das páginas confirma a identidade pública, o resultado é `available` (`reels_accessible` ou `profile_accessible`). Uma conta ativa não é marcada como indisponível apenas porque Reels não abriu.
- Somente se ambas as páginas exibirem a tela ou mensagem de indisponibilidade o resultado é `unavailable`, com motivo `profile_unavailable_confirmed`. Só essa evidência permite o indicador vermelho.
- Redirecionamento, tela de acesso, bloqueio da consulta, erro de rede, limite, tempo esgotado ou resposta sem identidade são `unknown`. Exibem ? sem diagnosticar indisponibilidade e ficam fora da seleção de páginas confirmadas disponíveis.

Um resultado inconclusivo preserva a última evidência válida para o mesmo username. Renomear o perfil invalida os resultados anteriores. Os indicadores aparecem nas telas que exibem usernames, incluindo Desempenho e seleção de destinos. A verificação não altera conexões, tokens, consentimentos, conteúdos, entregas ou horários.

A correção explícita de dados `POST /api/accounts/verify` com `{"action":"repairLegacyFlags"}` exige o acesso de serviço configurado. Remove classificações antigas `needs_review` ou `unavailable` sem o motivo corroborado atual, deixando o resultado pendente, nunca disponível por suposição. É limitada ao proprietário autenticado pelo serviço e idempotente; preserva os motivos anteriores para diagnóstico. A interface também recusa esses registros como prova de indisponibilidade.

Os endpoints GET/POST normais mantêm os controles de proprietário, grupo e mesma origem (ou acesso de serviço existente). Cada perfil tem intervalo mínimo de um minuto. As consultas públicas não enviam tokens ou cookies do Instagram, não fazem login e seguem somente redirecionamentos HTTPS para a mesma página no Instagram. Cada página tem quinze segundos e limite de 2 MB. Uma tela HTTP 200 genérica não comprova acesso.

Validação: `node tests/profile-availability.mjs`, `node tests/integration.mjs`, `node tests/rendering.mjs`. Os testes de integração simulam as APIs de publicação.

## Compatibilidade da requisição pública

O verificador envia explicitamente `User-Agent` com compatibilidade de página web e identificação explícita `FirmaSocialProfileCheck/1.0`. Sem esse cabeçalho, foi reproduzido um redirecionamento para `www.facebook.com/unsupportedbrowser`, inclusive para perfis ativos. Essa página não é evidência sobre a conta. A identificação é do próprio Firma Social; não usa cookies, login ou identidade de navegador do usuário. O teste de regressão exige o cabeçalho nas consultas. Diagnósticos de redirecionamento registram somente protocolo e hostname, sem query string ou conteúdo remoto.
