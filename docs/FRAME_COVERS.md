# Capa a partir de um frame

Em Novo conteúdo, selecione Instagram, formato Vídeo e um único vídeo da biblioteca. Na seção Capa do Reel, escolha Escolher frame do vídeo. Arraste a posição ou use os passos de 0,1 segundo; confirme Usar este frame como capa.

O navegador decodifica a mídia privada pela rota autenticada /api/media/:id. O canvas captura o quadro atual em JPEG, mantendo proporções e limitando a imagem a 1080 × 1920. O upload usa a mesma rota de capas existente, respeita o grupo e salva a imagem na biblioteca. O compositor seleciona coverMode=custom e instagramCoverMediaId; a fila envia cover_url normalmente. A capa pertence ao conteúdo e não altera a capa padrão da conta nem o vídeo original.

Sem confirmação, abrir ou mover o seletor não grava imagem. O botão de captura fica bloqueado até haver um quadro decodificado e durante o seek/upload. Se o codec não puder ser reproduzido no navegador, o editor mostra um erro e mantém a alternativa de imagem da biblioteca/upload. A escolha sem imagem personalizada continua permitindo ao Instagram usar um quadro automático. O recorte na grade/feed depende do Instagram.

O seletor baixa uma cópia privada do vídeo com limite de 50 MB, progresso, cancelamento ao fechar e prazo máximo de 60 segundos. A última cópia é reaproveitada apenas na memória desta aba; URLs temporárias são liberadas ao fechar. O seek passa a operar nessa cópia local e agrupa movimentos rápidos da barra. Falhas de download ou decodificação oferecem Tentar novamente; o estado de captura é reinicializado a cada abertura.

Validação: TypeScript, testes de renderização do compositor e seletor, teste de cache/reabertura/limite de tamanho/falha seguida de nova tentativa, e integração existente de capas/isolamento/persistência. A prévia gerenciada não ficou acessível pelo navegador de QA; teste visual de seek, captura e upload com vídeo real permanece pendente. Nenhuma publicação real foi realizada para validar esta alteração.
