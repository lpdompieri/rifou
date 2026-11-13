# Backend RIFOU — APIs públicas de rifas

Esta stack cria uma API Gateway HTTP API, Lambdas para as rotas públicas e autenticadas, tabelas DynamoDB próprias do RIFOU, e um bucket privado para imagens. Os índices atendem às consultas de rifas ativas, destacadas e do proprietário sem fazer Scan. O CloudFront entrega as imagens sem tornar o bucket público.

## Contratos públicos

- `GET /api/v1/raffles?status=ACTIVE|DRAWN&featured=true|false&limit=24&nextToken=...` lista rifas ativas ou o histórico de rifas sorteadas.
- `GET /api/v1/raffles/{raffleId}` retorna os dados públicos de uma rifa ativa ou sorteada. Rifas inexistentes e inativas retornam `404`.
- `GET /api/v1/raffles/{raffleId}/numbers?from=1&limit=30` retorna a página solicitada de números e os totais disponíveis, reservados e confirmados. O limite máximo por página é 100.
- `POST /api/v1/raffles/{raffleId}/pix-orders` recebe `{ "customer": { "name": "...", "phone": "..." }, "numbers": [1, 2] }`, calcula o valor pelo preço atual da rifa, aplica o limite acumulado por telefone, grava a transação e pré-reserva os números por 15 minutos.

A criação retorna `201` e um objeto com `transactionId`, `raffleId`, `numbers`, `amountInCents`, `expiresAt` e `copyPasteCode`. `copyPasteCode` é fictício e não representa uma cobrança Pix válida. Uma disputa por números retorna `409` e não grava parcialmente a transação.

As respostas de números contêm somente o número e seu status (`AVAILABLE`, `RESERVED` ou `CONFIRMED`); não incluem dados de compradores. A tabela `rifou-raffle-numbers-{ambiente}` usa `raffleId` como chave de partição e `number` como chave de ordenação. As tabelas têm `DeletionPolicy` e `UpdateReplacePolicy` como `Retain`.

O Pix e seu código copia e cola são fictícios; nenhum pagamento é recebido ou confirmado automaticamente. Enquanto uma reserva válida estiver `PENDING`, o organizador pode registrar uma confirmação manual após verificar o recebimento por outro meio. A confirmação só é aceita dentro dos 15 minutos da reserva e altera em uma transação o pedido, os números e os contadores financeiros; números confirmados passam a ser elegíveis ao sorteio. O pedido mantém nome e telefone associados ao ID da transação. O registro não é apagado quando expira: a reserva muda para `EXPIRED` e os números voltam a `AVAILABLE` pela rotina agendada, que roda a cada minuto. A tabela usa `Retain` e não apaga automaticamente os registros de contato.

## Acesso do organizador

A stack cria um User Pool Cognito dedicado ao RIFOU (`rifou-organizers-<ambiente>`), com login por e-mail, senha forte e criação de conta somente por administrador. O formulário público `POST /api/v1/organizer/access-requests` grava as solicitações pendentes na tabela `rifou-organizer-access-requests-<ambiente>`; os itens expiram após 180 dias. A aprovação e criação da conta são manuais no Cognito: crie o usuário por e-mail e envie a senha temporária. No primeiro acesso, o organizador define sua senha pessoal.

O Next.js autentica pelo Cognito no servidor e mantém access/refresh tokens em cookies `HttpOnly`, `SameSite=Strict` e `Secure` em produção. Não exponha tokens ou senha no navegador. O `.env.local` do Next precisa de `RIFOU_COGNITO_REGION=sa-east-1` e `RIFOU_COGNITO_CLIENT_ID=<OrganizerUserPoolClientId>` do output do stack. O ID do User Pool já é referenciado pela infraestrutura do API Gateway e não é necessário no frontend. O pool e a tabela de solicitações têm políticas de retenção para evitar remoção acidental.

### Gestão autenticada de rifas

As rotas abaixo exigem um access token do app client do Cognito. O navegador chama o BFF do Next.js; o BFF encaminha o token ao API Gateway. O `sub` validado pelo JWT é a única origem do proprietário da rifa; a Lambda não confia em um `organizerSub` enviado pelo cliente.

As gravações em `TransactWriteItems` também exigem permissões IAM para cada operação interna: `PutItem`, `UpdateItem` e `ConditionCheckItem` quando houver uma ação `ConditionCheck`. A role da Lambda limita essas permissões às tabelas RIFOU usadas em cada transação; permitir apenas uma ação chamada `TransactWriteItems` não autoriza as gravações internas.

- `GET /api/v1/organizer/dashboard` retorna totais e rifas do organizador autenticado.
- `GET /api/v1/organizer/finance?month=AAAA-MM&raffleId=...` retorna valores gerais ou filtrados por mês e/ou rifa. O mês considera a data de confirmação do pagamento; reservas ainda válidas são incluídas se foram criadas no mês.
- `GET /api/v1/organizer/settings/raffles` consulta o prazo configurado para concluir rifas sorteadas; `PUT` recebe `{ "completionDelayDays": 30 }` (de 1 a 365 dias). Sem configuração, o prazo padrão é 30 dias.
- `GET /api/v1/organizer/raffles?limit=50&nextToken=...` lista as rifas do organizador.
- `POST /api/v1/organizer/raffles` cria uma rifa `DRAFT` ou `ACTIVE`.
- `GET /api/v1/organizer/raffles/{raffleId}` consulta uma rifa própria.
- `PATCH /api/v1/organizer/raffles/{raffleId}` altera seus campos e status.
- `POST /api/v1/organizer/raffles/{raffleId}/draw` realiza e registra o sorteio de uma rifa elegível.
- `GET /api/v1/organizer/raffles/{raffleId}/transactions?limit=30&nextToken=...` lista os pedidos/participantes de uma rifa própria; dados de contato nunca ficam disponíveis em rotas públicas.
- `POST /api/v1/organizer/raffles/{raffleId}/transactions/{transactionId}/confirm` confirma manualmente, uma única vez, uma reserva pendente ainda válida. Registra `paymentConfirmedAt`, `paymentConfirmationMethod=MANUAL` e o organizador que confirmou; o pedido deixa o índice de expiração e os números e contadores são atualizados atomicamente.
- `POST /api/v1/organizer/raffle-images/upload-url` emite autorização de curta duração para enviar uma imagem JPG, PNG, WebP ou AVIF de até 5 MB.
- `PUT /api/v1/organizer/home-featured-raffle` recebe `{ "raffleId": "..." }` para selecionar a rifa da home, ou `{ "raffleId": null }` para limpar a seleção.

No BFF, `GET/PATCH /api/organizador/profile` consulta e altera nome e telefone no Cognito. `POST /api/organizador/profile/verify-phone` confirma o código SMS recebido ao trocar o telefone. O envio de SMS depende de a configuração de mensagens SMS do User Pool estar habilitada na AWS.

Exemplo do corpo do `POST` (o `PATCH` aceita qualquer subconjunto desses campos):

```json
{
  "title": "Smartphone Pro 256 GB",
  "description": "Sorteio de um smartphone novo, lacrado.",
  "prizeValueInCents": 150000,
  "image": "/images/smartphone.avif",
  "imageAlt": "Smartphone preto",
  "priceInCents": 1500,
  "numberCount": 100,
  "maxNumbersPerUser": 2,
  "drawingDate": "2026-12-20",
  "status": "DRAFT"
}
```

Os campos editáveis são `title`, `description`, `prizeValueInCents`, `image`, `imageAlt`, `priceInCents`, `numberCount`, `maxNumbersPerUser`, `drawingDate` (`YYYY-MM-DD` ou vazio) e `status` (`DRAFT`, `ACTIVE` ou `INACTIVE`). O valor do prêmio precisa ser exatamente `priceInCents × numberCount`; o backend valida a igualdade em centavos na criação e em toda edição. `maxNumbersPerUser` é obrigatório na criação, precisa ser pelo menos 1 e não pode superar a quantidade total de números. Rifas ativas e sorteadas aparecem no catálogo público e no histórico, respectivamente; inativar uma rifa a remove da área pública. O status `DRAWN` é definido somente pela rota de sorteio, nunca por uma edição comum. Rifas `DRAWN` ou `COMPLETED` não podem mais ser editadas. A primeira reserva marca `financialsLocked` na mesma transação que reserva os números. Essa trava é permanente, mesmo se a reserva expirar; preço, total do prêmio e quantidade não podem mais ser alterados. No primeiro carregamento após esta atualização, rifas antigas sem a marca são verificadas uma vez pelo histórico de transações e recebem a trava se já tiveram uma reserva. O endpoint financeiro calcula os valores pelos contadores atômicos e faz leitura consistente dos registros base das rifas; receita confirmada só aparece quando existir conciliação de pagamento.

O sorteio só pode ser iniciado quando a rifa estiver ativa, a data prevista já tiver chegado no fuso `America/Sao_Paulo` e houver ao menos um número com pagamento confirmado. Reservas pendentes podem existir, mas são avisadas na confirmação e não participam do sorteio; somente os números confirmados entram na escolha aleatória. A Lambda usa `crypto.randomInt`, valida a transação e o número vencedor em uma única transação DynamoDB, salva `drawResult` e muda o status para `DRAWN`. A rifa não pode ser sorteada novamente e confirmações pendentes posteriores são bloqueadas. O resultado público contém somente número, primeiro nome com inicial do sobrenome e data/hora; nome completo, telefone e ID da transação não são copiados para o resultado público. O prazo configurado começa a contar da hora do sorteio. Ao vencer, a rifa muda automaticamente para `COMPLETED` e deixa de aparecer para visitantes; o proprietário continua vendo o resultado e o comprovante no painel.

O cadastro oferece upload direto ao S3 por um POST assinado de curta duração emitido pela rota autenticada do organizador. O tamanho máximo e o tipo de conteúdo são verificados pelo formulário assinado do S3; o nome do objeto é aleatório e a API salva no DynamoDB a URL permanente do CloudFront. Criações e substituições de imagem aceitam somente caminhos emitidos por esse fluxo; imagens antigas podem permanecer ao editar outros campos. O bucket bloqueia acesso público e só aceita leitura da distribuição CloudFront com OAC. O upload por navegador usa o parâmetro `AllowedOrigin`, configurado no `samconfig.toml` como `http://localhost:3000` para o Next.js local; informe o domínio HTTPS do site ao implantar em produção.

Enquanto o RIFOU opera com um cliente, o formulário de criação/edição permite escolher uma única rifa ativa para o destaque global da home. A home consulta a rifa destacada pelo índice próprio e mantém o destaque no topo mesmo que a lista paginada de rifas ativas não a inclua. A troca usa uma gravação transacional e a tabela `RaffleAppConfigTable`, separada dos itens de rifa. Ao adicionar múltiplos clientes, essa ação deverá migrar para uma função administrativa da plataforma.

O limite é acumulado pelo telefone normalizado para a rifa inteira: pedidos `PENDING` ainda dentro dos 15 minutos e participações confirmadas contam juntos. Se um pedido expirar, sua quantidade é liberada no mesmo processo transacional que devolve os números. A Lambda gera um HMAC do telefone com um segredo dedicado do Secrets Manager; a tabela `RaffleParticipantLimitsTable` armazena apenas esse identificador e a quantidade ativa, não o telefone. Pedidos criados antes deste recurso não são retroativamente contabilizados.

A tabela de rifas tem o índice `OrganizerRafflesByOwnerIndex` por `organizerSub` e `createdAt`, usado com `Query` para isolar as contas sem `Scan`. As rifas de seed atuais não têm `organizerSub`, então permanecem no catálogo público, mas não aparecem como propriedade de uma conta recém-criada. Rifas novas não gravam previamente um item por número; um número sem item na tabela de disponibilidade é tratado como `AVAILABLE` até sua primeira reserva.

## Decisões dos recursos

- `RaffleNumbersTable` guarda os estados persistidos dos números para que a API consulte intervalos ordenados sem Scan. Números sem item são disponíveis; a primeira reserva cria o item dentro da transação. A retenção evita remover a disponibilidade persistida se a stack for excluída ou substituir a tabela.
- `GetRaffleFunction` faz `GetItem` por `raffleId` e retorna apenas a projeção pública da rifa.
- `GetRaffleNumbersFunction` primeiro confirma que a rifa está ativa, depois faz `Query` por faixa na tabela de números. A função só recebe `GetItem` na tabela de rifas e `Query` na tabela de números.
- `RaffleTransactionsTable` registra cada pedido com `raffleId`, contato, números, valor, prazo e status. O índice por rifa/hora dá suporte à consulta futura do histórico; o índice por pedidos pendentes e prazo permite localizar expirações sem Scan.
- `CreatePixOrderFunction` valida a rifa e usa `TransactWriteItems` para gravar a transação, reservar todos os números ainda disponíveis, incrementar os contadores da rifa e do participante e ativar permanentemente `financialsLocked`. Cada pedido aceita até 97 números, para não passar de 100 ações na transação.
- `ExpirePixOrdersFunction` usa EventBridge Scheduler uma vez por minuto. O índice de pedidos pendentes localiza candidatos; a Lambda lê o registro completo da transação e libera os números, decrementa os contadores e marca o pedido como `EXPIRED` atomicamente. O Scheduler usa retries e uma DLQ SQS gerada pelo SAM para falhas de entrega.
- `CompleteDrawnRafflesFunction` roda de hora em hora. Consulta o índice `RafflesByCompletionIndex` e conclui atomicamente rifas cujo prazo venceu, remove seus atributos de publicação pública e grava auditoria. A rotina também agenda/conclui rifas sorteadas antes da implantação que ainda não têm o prazo indexado.
- `OrganizerRafflesFunction` valida o valor total contra preço unitário e quantidade; também emite POSTs assinados para upload e troca o destaque global em transação com o item de configuração.
- `OrganizerRafflesFunction` confirma pagamentos manuais somente após validar o proprietário da rifa, o pedido pendente e a validade de cada número reservado; a mudança atômica preserva a associação entre número e pedido para a validação do sorteio.
- `GET /api/v1/organizer/finance` consulta as rifas do proprietário pelo GSI, relê os dados financeiros na tabela base com leituras consistentes e retorna totais gerais e por rifa. Com `month`, agrega transações pela data de confirmação; com `raffleId`, limita os resultados à rifa própria indicada.
- `POST /api/v1/organizer/raffles/{raffleId}/draw` só aceita uma rifa ativa com data alcançada e números confirmados. Reservas pendentes não são elegíveis e podem expirar após o sorteio. O resultado fica gravado no item da rifa; as rotas públicas expõem somente os campos mascarados necessários ao histórico.
- `RaffleImagesBucket` bloqueia acesso público, habilita SSE-S3, versionamento, CORS restrito à origem de desenvolvimento/produção e política que exige HTTPS. `RaffleImagesDistribution` entrega imagens com HTTPS e OAC; a Lambda autenticada recebe somente `s3:PutObject` no prefixo das imagens.
- `RaffleAppConfigTable` mantém a única rifa destacada no nível da aplicação, não no perfil do organizador.
- `RafflesApi` expõe rotas públicas e autenticadas via `GET`, `POST`, `PATCH`, `PUT` e `OPTIONS`; o browser acessa as rotas BFF do Next.js e o servidor Next encaminha as chamadas AWS. O browser recebe apenas dados de upload assinados e limitados, nunca credenciais AWS.

## Pré-requisitos

- Conta AWS e uma identidade local configurada com permissão para criar os recursos da stack.
- AWS CLI e AWS SAM CLI instalados.
- Node.js para instalar as dependências e executar o script de seed.

Não coloque access keys neste repositório. Configure o perfil AWS localmente ou use IAM Identity Center.

## Deploy inicial no PowerShell

Na raiz do projeto, para o primeiro deploy:

```powershell
cd backend
npm.cmd install
sam build
sam deploy --guided
```

Na primeira execução, informe o nome de stack `rifou-app`, região `sa-east-1` e perfil `rifou-dev`. Mantenha a confirmação do change set habilitada e confira os recursos IAM, Lambda, API Gateway, DynamoDB, Scheduler e SQS antes de aprovar. Para atualizar a stack existente, use `sam build` e depois `sam deploy --profile rifou-dev --region sa-east-1`. O frontend Next.js chama a API AWS server-side via BFF.

Depois que o CloudFormation concluir e as tabelas estiverem ativas, carregue as rifas e a disponibilidade inicial dos números:

```powershell
$env:AWS_PROFILE = "rifou-dev"
$env:AWS_REGION = "sa-east-1"
npm.cmd run seed:dev
```

Troque o perfil e a região pelos mesmos escolhidos no deploy. O script adiciona apenas itens ausentes; rifas e números existentes são mantidos sem sobrescrever status.

O endereço da API e os nomes das tabelas aparecem nos Outputs da stack. O output `RafflesApiUrl` termina em `/api/v1/raffles`; acrescente `/{raffleId}` ou `/{raffleId}/numbers` para consultar os demais endpoints.

## Exemplo de respostas

```json
{
  "items": [
    {
      "id": "relogio",
      "title": "Relógio Premium Classic",
      "price": "10,00",
      "numbers": "100",
      "status": "ACTIVE",
      "featured": true
    }
  ],
  "count": 1,
  "nextToken": null
}
```

Disponibilidade resumida:

```json
{
  "raffleId": "relogio",
  "totalNumbers": 100,
  "availableCount": 70,
  "reservedCount": 13,
  "confirmedCount": 17,
  "items": [{ "number": 1, "status": "AVAILABLE" }],
  "nextFrom": 31
}
```

Criação de pedido demonstrativo:

```json
{
  "item": {
    "transactionId": "uuid-da-transacao",
    "raffleId": "relogio",
    "numbers": [12, 35],
    "quantity": 2,
    "unitPriceInCents": 1000,
    "amountInCents": 2000,
    "status": "PENDING",
    "expiresAt": 1790000000000,
    "copyPasteCode": "RIFOU-DEMO|...",
    "isDemo": true
  }
}
```

As imagens enviadas por usuários são servidas pelo domínio da distribuição CloudFront. O bucket usa armazenamento S3 e versionamento; a entrega pública do CloudFront gera custos de solicitações e transferência conforme o uso. Consulte os [preços do S3](https://aws.amazon.com/s3/pricing/) e do [CloudFront](https://aws.amazon.com/cloudfront/pricing/). Para produção, habilite também eventos de dados do S3 no CloudTrail e monitore solicitações e erros do bucket/distribuição.
