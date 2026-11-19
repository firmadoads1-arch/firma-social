# Executor da fila

O site pode permanecer público. O executor aceita apenas solicitações de serviço autenticadas e limita o trabalho ao workspace configurado. O cabeçalho x-firma-service sozinho nunca autoriza uma execução.

Configuração no cofre de runtime: SCHEDULER_ENABLED=true; RUNNER_OWNER_ID com o owner exato do workspace; RUNNER_SERVICE_TOKEN_SHA256 com o SHA-256 em base64url (sem padding) do acesso de serviço existente retornado por get_site. Nunca salve o token em fontes, prompts, logs ou argumentos de comando. A mesma credencial vai somente ao current_live_url, em OAI-Sites-Authorization e Authorization, ambos com Bearer. Cabeçalho adicional x-firma-service: queue-v1. Alterações de runtime exigem novo deploy.

A rotina vinculada executa conteúdos já aprovados e cria rascunhos das regras existentes. POST /api/runner recebe {}. Confirme por GET /api/runner que lastRun.checkedAt é igual ao checkedAt do POST. Enquanto houver queue.pending, queue.processing, queue.working ou queue.batchSoon, consultas/execuções adicionais respeitam queue.nextCheckAt e têm limite de cinco etapas por rodada. Não repita um POST com resultado de transporte desconhecido sem consultar o estado primeiro. Entregas incertas jamais são reenviadas automaticamente.

O helper scripts/runner-service.py recebe uma linha JSON por stdin oculto: url (current_live_url), token (acesso de serviço existente), mode (status para GET ou run para executar e acompanhar). Ele não imprime a credencial e não segue redirecionamentos. Use exec com tty e aguarde a mensagem Ready antes de enviar a linha; mantenha os valores só em memória. As respostas mostram apenas confirmação e contadores.

A automação roda a cada 60 minutos. Com o painel aberto, o navegador autenticado consulta a fila geral a cada 15 segundos, inclusive em segundo plano e fora do grupo selecionado. O navegador pode reduzir a frequência ou suspender abas; com o site fechado, permanece a rotina horária. Ao abrir o painel, voltar à janela ou mudar a visibilidade, consulta o estado para retomar o acompanhamento. Leases e checkpoints evitam disputa e reenvio entre ambos. Lotes gravam os horários a cada minuto, mantêm a ordem e bloqueiam o próximo vídeo até passar pelo menos 60 segundos da confirmação do anterior. Um resultado incerto impede os vídeos seguintes do mesmo lote. O horário agendado é o início da janela de envio, não garantia de publicação naquele minuto. O painel exibe a última confirmação automática, indisponibilidade e atrasos; sem configuração válida, novos agendamentos são recusados, mas rascunhos continuam disponíveis.

Em outra hospedagem, configure acesso de serviço próprio com segredo forte, seu hash e o owner do destino; substitua o agendador e a aquisição do segredo conforme a infraestrutura. O adaptador de login Cloudflare Access continua independente. Se o acesso do Sites for rotacionado, atualize somente o hash correspondente no runtime e republique. Não altere a chave de criptografia das contas.

Para cadência de minuto com o painel fechado, há também o modo opcional `watch` do mesmo helper, em um processo supervisionado em hospedagem própria. Ele usa o mesmo JSON por entrada oculta, consulta o estado a cada até 15 segundos e só envia o POST quando o horário elegível chega. Cada escrita é confirmada por leitura, e qualquer resultado desconhecido encerra o processo sem reenviar. Não passe o segredo em argumento, arquivo ou log. A instalação desse processo é opcional; a rotina vinculada ao Site continua horária. Leases do banco permitem a convivência. O intervalo mínimo não garante o prazo de processamento da plataforma.

## Botão manual permanente

O painel Motor de postagens e agendamentos aparece em todas as abas, inclusive em grupos e com o agendador saudável. Verificar fila agora consulta o estado, executa até cinco etapas aprovadas e confirma cada POST por GET (checkedAt). Aguarda nextCheckAt por no máximo um minuto nesta ação e mantém os limites e leases existentes. Exibe progresso, contadores e avisos de conclusão manual/atenção; não aprova rascunhos nem publica Stories com adesivos manuais. O executor é geral para todas as contas do workspace e isso fica explícito mesmo num grupo. Resultado desconhecido interrompe o acompanhamento e pausa o disparo automático desta tela até nova consulta manual, sem reenvio imediato.

O painel sinaliza também consultas automáticas em andamento e bloqueia cliques concorrentes. Cada consulta do motor tem limite de 65 segundos, incluindo a leitura da resposta; exceder esse prazo pausa o acompanhamento sem repetir o POST. A verificação manual respeita nextCheckAt já na primeira etapa e informa quantas entregas ainda estão pendentes ou em processamento.

## Publicar agora

O compositor oferece Publicar agora ao lado de Agendar publicação. Exige a revisão explícita do conteúdo, valida mídia, contas e permissões e ignora o horário futuro do formulário. A ação post.publishNow grava o horário atual no servidor e inicia somente as entregas desse post, sem executar outros posts vencidos ou gerar rascunhos de rotinas. Os checkpoints internos da fila continuam sendo usados; não se trata de criar um agendamento para o futuro. Processamento ainda depende da plataforma e pode continuar pelo executor normal. O retorno informa o status real, sem chamar de publicado um conteúdo em processamento, incerto ou na caixa de entrada.

Novos conteúdos usam UUID estável por compositor: repetição após resposta perdida consulta o registro existente, sem recriar entregas ou enviar novamente. Edições de rascunhos mantêm controle de versão. Stories que exigem finalização manual no Instagram não aceitam envio imediato automático. Nenhuma publicação real é feita durante os testes; cenários usam APIs simuladas.

## Stories diários aprovados

Em Rotinas → Nova rotina → Repetir o mesmo Story todos os dias, o proprietário escolhe uma mídia JPEG/MP4/MOV, data inicial, horário do workspace e até 100 perfis Instagram conectados. A caixa de aprovação autoriza as próximas ocorrências; nenhuma rotina existente é convertida automaticamente. As rotinas de rascunho continuam no modo original.

`rules.mode=daily_story` e `approved_at` registram a autorização. Ao criar/retomar e antes de cada execução normal, o servidor prepara ocorrências aprovadas para hoje e amanhã (ou o primeiro dia futuro), sem publicar na criação. Cada ocorrência tem `posts.recurrence_key=<rotina>:<data-local>` e índice único por workspace. Post e entregas são inseridos em uma transação. A mídia é sempre a mesma; não há rotação. Repetir o pedido de criação usa o mesmo UUID e não cria uma segunda rotina.

Pausar bloqueia novas entregas pendentes; envios já iniciados podem concluir pelos checkpoints existentes. Retomar preserva o futuro e descarta pendências anteriores à retomada. Excluir encerra a repetição e cancela entregas ainda não iniciadas, preservando histórico e envios incertos. Dias anteriores não são repostos. Um resultado incerto anterior bloqueia a próxima ocorrência desse perfil na mesma rotina até conferência humana. Horários inexistentes na mudança de fuso são ignorados naquele dia. A cadência, leases e confirmação pelo heartbeat permanecem os mesmos. A fila horária não garante que todos os perfis publiquem no minuto escolhido.

Stories diários não usam adesivos, links ou finalização manual. Para esses formatos, mantenha o planejamento manual. A biblioteca protege a mídia referenciada pela rotina contra exclusão. A restauração portátil pausa as rotinas como antes; backups antigos recebem modo `draft`.

## Bloqueio temporário de publicação

Recusas explícitas do Instagram por bloqueio temporário (código 368, HTTP 4xx) mantêm a entrega aprovada em processamento, com nova tentativa após uma hora. A retomada reutiliza os checkpoints e o container salvo; se o Instagram confirmar que esse container expirou, prepara outro. Posts confirmados não são repetidos. Respostas ambíguas, falhas de transporte e autorizações vencidas não são convertidas em bloqueio temporário. Entregas antigas já encerradas como falha ou incertas não são reabertas automaticamente.

## Muitos perfis e progresso

Um conteúdo aceita até 100 perfis. A preparação grava arrays de até 20 destinos por instrução, dentro da mesma transação, com uma entrega independente por conta. A fila continua limitada a três entregas elegíveis por etapa; não envia 100 pedidos simultaneamente.

No lote Prisma, a opção explícita Publicar automaticamente após concluir as edições inicia o primeiro envio ao terminar a preparação, preservando o intervalo de três minutos entre perfis. Falhas, resultados incertos e bloqueios com nova tentativa não retêm os outros perfis desse lote depois do intervalo de segurança. O perfil com resultado incerto não é reenviado. Lotes de vários vídeos no mesmo perfil mantêm o bloqueio anterior por incerteza.

O painel acompanha edição (0–60%), preparação (60–65%) e proporção de publicações confirmadas (65–100%). Só mostra 100% quando todas as entregas estão publicadas; falhas, caixa de entrada e incerteza aparecem separadamente. O painel deve permanecer aberto para acompanhar a fila continuamente; com ele fechado, continua a rotina horária existente.

## Prioridade de confirmação

Entre entregas elegíveis, o motor prioriza as que já estão em processamento e sem erro antes de preparar novos destinos. Horários, leases, limites por etapa e bloqueios de lote continuam sendo verificados. Isso evita preparar todos os perfis de um conteúdo grande antes de confirmar os primeiros. Uma consulta ainda sem resultado volta a respeitar seu next_run; respostas incertas permanecem sem reenvio automático. O detalhe do conteúdo mostra os contadores ao reabrir a publicação e diferencia conclusão integral de encerramento com pendências.

O heartbeat inclui `queue.working` para entregas com lease em execução. Seu próximo horário é o vencimento do lease; consultas não reclamam um envio já em andamento. Falhas de confirmação continuam pausando o painel para conferência, sem repetir envios incertos.

Testes de regressão: `node tests/queue-client.mjs` cobre fila geral em segundo plano/grupo vazio, horário futuro e parada sem replay em resposta incerta. `python3 tests/runner-service.py` cobre pendentes sem processamento, limite de cinco etapas e confirmação obrigatória do heartbeat. A integração testa a leitura de leases ativos. As chamadas de publicação nesses testes são simuladas.


### Lotes com vários vídeos
O formulário “Vídeos em vários perfis” cria uma publicação separada por par vídeo/perfil. A ordem dos vídeos e perfis é revisável. O intervalo configurado (3 a 43200 minutos) é mínimo entre vídeos no mesmo perfil; a pausa global de três minutos do Prisma permanece. O início de cada rodada usa o maior valor entre o intervalo escolhido e três minutos multiplicados pelo número de perfis. Após atrasos, o cooldown também respeita o intervalo desde a confirmação anterior no mesmo perfil. O identificador de cada exportação inclui lote, perfil e vídeo; o recibo mantém a criação idempotente. Novas publicações não recebem localização automática.

Cada vídeo pode ter sua própria capa JPG, escolhida na revisão do lote. A capa se mantém associada ao ID do vídeo ao reordenar e é aplicada a todas as versões por perfil desse vídeo. O servidor valida acesso, formato e tamanho de todas as capas antes da preparação ou criação do lote. Lotes antigos com capa comum continuam compatíveis.
