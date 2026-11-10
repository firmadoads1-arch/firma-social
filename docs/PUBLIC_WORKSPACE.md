# Workspace público por solicitação do proprietário

`PUBLIC_WORKSPACE_ENABLED=true` abre o painel e a gestão de conteúdos sem Google ou ChatGPT. O workspace é o `RUNNER_OWNER_ID` existente; o modo não cria um usuário nem um workspace novo. Desabilitado ou sem owner configurado, o login anterior permanece.

Qualquer visitante pode ver e baixar as mídias, consultar métricas e criar, editar, cancelar ou excluir conteúdos e rotinas. Esta é uma abertura deliberada do gerenciamento, não apenas uma página pública de apresentação. Requisições de escrita mantêm a validação de Origin e os controles de versão e de fila.

Backups de contas, configuração dos provedores, novas autorizações OAuth, links de conexão e desconexão de contas continuam exigindo a identidade real do proprietário. Tokens e segredos não são retornados pelo painel. As rotinas de serviço continuam exigindo o token existente e gravando seus checkpoints próprios.

O modo não publica conteúdo ao ser ativado. Agendamentos ainda precisam ser criados e passam pelas validações normais de perfil, mídia, capa e horário.
