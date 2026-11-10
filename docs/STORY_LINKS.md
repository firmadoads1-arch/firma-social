# Stories com link

Em **Novo conteúdo → Instagram → Story → Link do Story**, ative a opção de link e informe uma URL HTTPS pública e, opcionalmente, o texto do adesivo. O campo é exclusivo de Stories do Instagram.

**Guardar no calendário** salva mídia, perfis, link e horário para finalização manual. A interface explica essa condição antes da confirmação. O aviso de horário é mostrado somente no painel; não há push, envio de rascunho ao Instagram ou publicação automática deste conteúdo.

Em **Conteúdos → Finalizar no Instagram**, abra o Story para copiar o link e baixar a mídia. No Instagram, selecione o perfil correto, crie o Story, adicione **Figurinhas → Link**, cole o endereço e publique. Volte ao Firma e registre a conclusão em cada perfil. O registro é uma declaração do usuário, não uma confirmação da API. É possível desfazer o registro sem alterar o Instagram.

## Persistência e fila

- `options.instagramStoryLink` guarda `{url,label}` ou `null`; URL e formato são validados no servidor. Não há consulta ao destino do link.
- Stories preparados com link usam `manual_pending` no conteúdo e nas entregas. Cada perfil pode passar para `manual_published`; o conteúdo recebe esse estado somente quando todos foram confirmados.
- A fila só executa os estados automáticos existentes. Há uma segunda proteção no publicador que recusa qualquer conteúdo com `instagramStoryLink` antes de obter tokens ou contatar provedores, caso um job antigo/importado tenha estados incorretos.
- Edições e cancelamentos são permitidos antes de qualquer confirmação manual. Depois disso, duplique ou desfaça os registros antes de alterar. Controle de versão e transações preservam as confirmações concorrentes.
- Remover explicitamente o link no editor permite voltar ao agendamento automático normal. Conteúdos existentes sem link mantêm seu comportamento.
- Links e registros manuais fazem parte dos backups portáveis existentes, sem mudança de schema ou credenciais.

## Verificação

Os testes de integração cobrem persistência, URLs inválidas, isolamento entre proprietários, confirmações por perfil, conflitos, cancelamento, conversão entre os modos, bloqueio da fila e restauração de backup. Provedores são simulados; os testes não publicam conteúdo real.
