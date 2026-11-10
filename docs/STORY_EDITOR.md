# Editor rápido de imagens para Stories

Ao selecionar Story com Instagram no compositor, o editor abre automaticamente. Também pode ser reaberto pelo botão Abrir mini editor. A foto selecionada vira o fundo; vídeos não são convertidos e podem continuar no fluxo normal ao fechar sem aplicar.

A montagem tem 1080 × 1920 pixels. Fundo por foto da biblioteca, envio local ou cor; enquadramento preencher/mostrar inteira; camadas de texto, emojis e a caixinha visual fornecida pelo proprietário. Arrastar no canvas ou usar os campos X/Y, largura, tamanho de texto, cor, negrito, centralizar, trazer à frente e remover. Histórico local de desfazer/refazer, sem edição de conteúdos já publicados.

Usar imagem no Story gera um JPG sem as linhas de seleção e envia pela rota autenticada `/api/upload`, com o grupo atual. A nova mídia substitui a seleção do compositor e permanece na biblioteca; os originais não são alterados. Isso não salva, aprova, agenda nem publica o post. O usuário continua a revisão normal. Em caso de erro, o editor permanece aberto.

As camadas são temporárias: a biblioteca e o rascunho guardam apenas a imagem final. Voltar sem aplicar pede confirmação quando há alterações. O molde público em `/story-assets/question-box.png` é apenas uma imagem, sem funcionalidade de adesivo interativo ou coleta de respostas. Nenhuma permissão ou credencial é adicionada.

Validação: TypeScript, testes existentes de domínio/isolamento/publicação, regressão de renderização das listas e build Worker. A prévia local não ficou acessível no navegador desta execução; arraste, fontes/emojis e exportação visual ainda precisam de uma conferência no navegador do usuário.

## Grade e encaixe

Grade opcional fina (60 px), média (120 px) ou larga (240 px), com eixos centrais destacados. O encaixe pode ser ativado independentemente da exibição da grade e prioriza o centro exato do Story (tolerância de 16 px). Arraste limitado às dimensões do elemento, inclusive sua altura medida. Botões centralizam na horizontal/vertical; textos também têm alinhamento à esquerda, centro e direita. Grade e seleção são desenhadas somente no preview, nunca no JPG exportado. Teste de geometria: `node tests/story-alignment.mjs`.
