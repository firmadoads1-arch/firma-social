# Operação da fila da Firma Social

Site: `appgprj_6ad3a88a6fd08191bcba9ab302a6bce7`.

O agendador disponível permite no máximo uma execução por hora. A tarefa vinculada verifica a fila a cada 60 minutos e atualiza dados; não reconstrói nem republica o site. Publica somente conteúdos que o proprietário revisou e agendou no editor. Rotinas geram rascunhos, nunca publicações por conta própria.

## Execução em segundo plano

1. Leia o Site associado pelo `get_site` nativo. Confirme que continua privado do proprietário: sem público, grupos, outros espectadores ou editores. Se o público tiver mudado, pare e informe a pendência; não mude permissões.
2. Use apenas a `current_live_url` retornada. Obtenha o `siwc_bypass_bearer_token` existente dessa mesma resposta e mantenha-o apenas na memória. Não gere, rotacione, registre ou salve credenciais.
3. Chame `POST /api/runner` nessa origem, com corpo `{}`, `Content-Type: application/json`, `x-firma-service: queue-v1` e `OAI-Sites-Authorization: Bearer <credencial obtida>`. Sem cabeçalho Origin. O dispatch autentica a credencial e a consome antes do Worker; não representa um visitante logado.
4. Consulte `GET /api/runner` com os mesmos cabeçalhos de serviço para ler o heartbeat persistido. Confirme que `lastRun.checkedAt` corresponde ao resultado da chamada POST.
5. Não acesse os endpoints das redes diretamente, não crie conteúdo e não edite consentimentos ou datas. Se o POST tiver resposta incerta, consulte o heartbeat antes de uma nova tentativa. Leases impedem concorrência da mesma entrega; resultados externos incertos não são reenviados automaticamente.

Se faltar acesso de serviço, a hospedagem retornar erro ou a configuração de uma rede exigir intervenção, comunique a pendência. Sucesso sem ação pendente não precisa notificação. Não inclua tokens em respostas ou logs.

O proprietário também pode usar **Verificar fila agora** no painel. Essa operação exige sua identidade e validação de origem.

## Segurança do contrato

O endpoint sem identidade de visitante depende da fronteira de acesso do Site privado. Tornar o Site público ou compartilhar com outras pessoas exige redesenhar essa autorização antes. Não basta manter o cabeçalho `x-firma-service`, pois ele não é um segredo. Os registros de usuário permanecem isolados pelo identificador autenticado do ChatGPT.
