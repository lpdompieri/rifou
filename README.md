# RIFOU — App de Rifas

Aplicação web do RIFOU em Next.js, com o fluxo público de participação e a área autenticada do organizador.

## Executar localmente

1. Instale o [Node.js](https://nodejs.org/) (versão 20.9 ou mais recente).
2. Instale as dependências na raiz do projeto:

   ```powershell
   npm.cmd install
   ```

3. Configure a URL do endpoint AWS no arquivo local `.env.local`:

   ```env
   RIFOU_AWS_RAFFLES_URL=https://seu-id.execute-api.sa-east-1.amazonaws.com/api/v1/raffles
   ```

   Use a URL exibida no output `RafflesApiUrl` da stack. Mantenha o nome da variável sem o prefixo `NEXT_PUBLIC_`; `.env.local` já está ignorado pelo Git.

4. Inicie o Next.js:

   ```powershell
   npm.cmd run dev
   ```

5. Abra [http://localhost:3000](http://localhost:3000).

## Conexão com a API

- O catálogo e a home chamam `GET /api/raffles` para rifas ativas e sorteadas; os detalhes chamam `GET /api/raffles/{raffleId}`.
- A grade chama `GET /api/raffles/{raffleId}/numbers?from={número inicial}&limit=30` ao abrir cada página. As rotas BFF encaminham as requisições server-side à API AWS usando `RIFOU_AWS_RAFFLES_URL`.
- Ao confirmar o contato, o app envia `POST /api/raffles/{raffleId}/pix-orders` com nome, telefone e números. A AWS grava o pedido e reserva os números juntos; a resposta fornece o ID, o código QR demonstrativo e o prazo.
- As rifas e a disponibilidade dos números vêm do DynamoDB. As rifas de exemplo continuam no painel demonstrativo do organizador.
- O Pix continua fictício e não recebe pagamentos. A reserva é persistida por 15 minutos; o organizador pode confirmar manualmente uma reserva válida quando recebeu por outro meio.

### Painel do organizador

- `GET /api/v1/organizer/audit?raffleId=&action=&from=&to=` lista eventos da conta ou de uma rifa, com filtros por ação e período.
- `GET /api/v1/organizer/support-tickets` lista os chamados da conta; `POST /api/v1/organizer/support-tickets` registra um chamado e retorna seu protocolo.
- A auditoria é gravada na mesma transação DynamoDB das ações da rifa: criação, edição, mudança de status, destaque, confirmação manual de pagamento e sorteio. A conclusão automática e alterações de configuração também são registradas; a coluna “Quem” mostra o e-mail do organizador.
- Chamados ficam persistidos e podem ser acompanhados no painel. Notificação por e-mail e resposta/gestão administrativa do chamado ainda não fazem parte desta etapa.
- Para cada participação confirmada, o organizador pode visualizar o comprovante, compartilhar a imagem PNG pelo menu nativo do celular ou baixar a imagem e enviar pelo aplicativo desejado. No WhatsApp também há compartilhamento de texto como alternativa.
- O painel inclui filtros de mês na visão geral e em “Minhas rifas”, e filtros gerais, por mês ou por rifa no financeiro. O comprovante do sorteio mostra o número, o ganhador abreviado e a data, com compartilhamento em imagem.
- Os valores do prêmio, do número e a quantidade precisam fechar exatamente. Antes da primeira reserva, alterar o prêmio recalcula o preço unitário; alterar o preço recalcula a quantidade. Depois da primeira reserva, os três ficam bloqueados.

## Estrutura

- `app/layout.jsx`: layout global e importação dos estilos.
- `app/[[...slug]]/page.jsx`: mantém as rotas existentes do protótipo dentro do App Router.
- `app/api/raffles/`: rotas BFF para listar rifas, buscar um detalhe, consultar uma página de números e criar um pedido Pix demonstrativo.
- `src/App.jsx`: experiência pública, seleção de números e etapas de identificação e pagamento.
- `src/OrganizerApp.jsx`: painel autenticado para rifas, participantes, financeiro, destaque e sorteios.
- `src/styles.css`: identidade visual e layout responsivo.
- `src/services/pixOrdersApi.js`: chamada server-side BFF para criar um pedido demonstrativo.
- `public/images/`: imagens do protótipo.
- `backend/`: stack AWS SAM da API Gateway, Lambda e DynamoDB.

O login do organizador, a recuperação de senha e as APIs do painel usam Cognito e AWS. O QR code e o código Pix desta etapa são demonstrativos e não aceitam pagamentos. A confirmação manual permite concluir testes da jornada enquanto a integração com um parceiro pagador não existe.

O organizador pode conduzir o sorteio na seção “Sorteios” depois da data prevista, quando não houver reservas pendentes e existir pelo menos um número com pagamento confirmado. O resultado fica registrado na rifa e aparece no histórico público com o número sorteado, o primeiro nome e a inicial do sobrenome do ganhador, além da data e hora.
