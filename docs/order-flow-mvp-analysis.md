# ShopeeMz Order Flow Review

## Objetivo

Este documento resume uma revisao critica do fluxo atual de pedidos da ShopeeMz e propoe um MVP mais simples, vendavel e operacionalmente leve para a X DIGITAL.

O foco e:

- aumentar conversao
- reduzir friccao no checkout
- diminuir trabalho manual do admin
- melhorar confianca do cliente
- manter margem e controle operacional

## Leitura do fluxo atual

### Pedido `INTERNAL`

- nasce do carrinho
- calcula total, margem e entrega imediatamente
- entra em `PENDING_PAYMENT` ou `PAID`
- cria fila de pagamento
- apos pagamento confirmado segue para entrega
- baixa stock quando o pagamento e aprovado

### Pedido `EXTERNAL`

- nasce por link manual ou por carrinho com itens externos
- entra em `UNDER_REVIEW`
- admin monta cotacao
- pedido vai para `QUOTED`
- cliente aprova
- pedido vai para `PENDING_PAYMENT` ou `PAID`
- depois segue o fluxo logistico `ORDERED -> IN_TRANSIT -> ARRIVED -> OUT_FOR_DELIVERY -> DELIVERED`

## Diagnostico de negocio

### O que esta forte hoje

- O sistema separa bem os pedidos com risco e lead time diferente.
- O pedido interno tem boa base para conversao rapida.
- O pedido externo protege a margem porque obriga validacao humana antes de fechar preco.
- O fluxo de pagamento manual esta alinhado com a realidade local de M-Pesa, e-Mola e transferencia.

### O que esta a prejudicar o negocio

#### 1. O externo parece um servico burocratico, nao um produto simples

Para o cliente, enviar link, esperar analise, esperar cotacao, aprovar, pagar e depois acompanhar varios estados cria sensacao de esforco alto antes de comprar.

Impacto:

- mais abandono
- menor impulso de compra
- menor recorrencia

#### 2. O cliente ve ou sente complexidade demais

Estados como `UNDER_REVIEW`, `QUOTED`, `ORDERED`, `ARRIVED` e `OUT_FOR_DELIVERY` sao uteis internamente, mas nao sao a melhor linguagem comercial para o cliente.

Impacto:

- ansiedade
- duvidas no suporte
- percepcao de processo complicado

#### 3. Proibicao de mistura entre local e externo reduz ticket medio

Hoje o sistema bloqueia checkout misto. Isso protege operacao, mas quebra uma expectativa natural do cliente: comprar tudo de uma vez.

Impacto:

- perda de conversao
- perda de cross-sell
- sensacao de limitacao da plataforma

#### 4. Existem dois jeitos de criar externo, mas o cliente entende os dois como a mesma coisa

Pedido externo manual e pedido externo por carrinho externo convergem para quase a mesma operacao humana de cotacao.

Impacto:

- duplicacao de conceito
- mais superficie de manutencao
- experiencia menos clara

#### 5. O admin vira gargalo cedo demais

Cada pedido externo exige leitura, interpretacao, precificacao e acompanhamento detalhado.

Impacto:

- operacao pouco escalavel
- SLA dependente de pessoas especificas
- risco de filas em horarios de pico

## O que deve permanecer

### Manter sem debate no MVP

- Separacao de `INTERNAL` e `EXTERNAL` no backend.
- Calculo imediato do interno.
- Validacao humana do externo quando o preco nao e confiavel.
- Pagamentos locais manuais com fila de validacao.
- Controle logistico mais detalhado internamente.

### Motivo

Esses pontos protegem margem, reduzem risco de preco errado e respeitam a realidade operacional de Mocambique.

## O que simplificar

### 1. Unificar a entrada do externo do ponto de vista do cliente

Em vez de o cliente pensar em dois fluxos diferentes, a UX deve ter apenas uma promessa:

`Comprar do estrangeiro`

Dentro disso, o cliente pode:

- colar link
- importar carrinho
- escolher produtos externos ja cadastrados

No backend pode continuar separado por origem, mas no produto deve parecer o mesmo servico.

### 2. Reduzir os estados expostos ao cliente

O cliente nao precisa ver toda a maquina interna.

Modelo recomendado para o cliente:

- `Recebemos o teu pedido`
- `Estamos a confirmar o preco`
- `Aguardando o teu pagamento`
- `Pagamento confirmado`
- `Em processamento`
- `A caminho`
- `Entregue`

Estados internos como `QUOTED`, `ORDERED`, `ARRIVED` e `OUT_FOR_DELIVERY` continuam a existir se forem uteis, mas ficam escondidos ou agrupados.

### 3. Transformar o externo num fluxo de cotacao rapida

Hoje a cotacao parece um passo pesado. Para o MVP vendavel, o ideal e prometer:

- resposta rapida
- total transparente
- CTA claro para aprovar e pagar

A cotacao precisa parecer um carrinho assistido, nao um processo burocratico.

### 4. Permitir checkout misto sem misturar operacao

Nao e preciso unificar tudo no mesmo pedido interno de banco de dados.

Opcao recomendada:

- o cliente faz um unico checkout
- o sistema divide internamente em dois pedidos ou dois grupos
- o frontend mostra isso como uma compra unica com duas entregas ou duas etapas

Assim, o negocio ganha ticket medio sem destruir a operacao.

## O que remover do MVP

### Remover da experiencia do cliente

- linguagem tecnica de estado
- excesso de passos de aprovacao visivel
- separacao conceitual entre externo manual e externo de catalogo

### Remover da operacao manual quando possivel

- recotacao completa quando os dados do produto externo ja estao estruturados
- repeticao de preenchimento de taxas iguais em cada cotacao
- dependencia de o admin interpretar tudo do zero para produtos externos recorrentes

## O que adiar para versoes futuras

- automacao avancada de importacao de link por loja
- tracking internacional detalhado por evento
- regra inteligente de consolidacao de multiplos fornecedores
- precificacao automatica completa por store externa
- previsao dinamica de prazo por origem
- motor de recomendacao de carrinho misto

## Fluxo ideal para o MVP

### Fluxo interno ideal

1. Cliente adiciona produtos da loja.
2. Vê total, prazo e metodo de entrega imediatamente.
3. Finaliza com pagamento local simples.
4. Recebe status comercial curto.
5. Acompanha entrega sem excesso de detalhe.

### Fluxo externo ideal

1. Cliente entra em `Comprar do estrangeiro`.
2. Cola link ou seleciona produto externo do catalogo.
3. Informa quantidade, contacto e entrega.
4. Sistema responde com uma destas opcoes:
   - preco quase imediato se houver base de precificacao
   - promessa de cotacao rapida se precisar de analise humana
5. Cliente recebe proposta clara com:
   - custo do produto
   - taxas
   - entrega local
   - prazo estimado
6. Cliente aprova e paga.
7. Acompanha apenas macroestados.

## Melhor experiencia para o cliente

### Promessa comercial recomendada

- `Produtos da loja: entrega rapida em Mocambique`
- `Compras internacionais: nos compramos por ti, com preco final claro e suporte local`

### Principios de UX

- nao forcar o cliente a entender a operacao
- mostrar sempre proximo passo unico
- mostrar valor antes de mostrar processo
- transformar espera em confianca com prazo e comunicacao

### Checkout recomendado

#### Para interno

- resumo do pedido
- morada ou levantamento
- metodo de pagamento
- CTA unico: `Confirmar pedido`

#### Para externo

- campo de link ou selecao de produto
- quantidade
- contacto
- entrega
- CTA unico:
  - `Pedir cotacao`
  - ou `Receber preco final`

### Conteudo que aumenta conversao

- prazo estimado visivel
- explicacao curta do servico
- destaque de suporte local
- prova de confianca: pagamento local, acompanhamento e entrega em Mocambique

## Melhor organizacao operacional para admin

### Separar operacao em tres filas

- `Novos externos para analisar`
- `Pedidos aguardando pagamento`
- `Pedidos em execucao`

### Regra pratica

O admin nao deve pensar em todos os estados ao mesmo tempo. Ele deve trabalhar por fila de decisao.

### Acoes prioritarias por fila

#### Novos externos para analisar

- validar link ou item
- montar ou reaproveitar cotacao
- enviar proposta

#### Aguardando pagamento

- validar comprovativo
- confirmar pendencias

#### Em execucao

- atualizar status macro
- atuar apenas por excecao

## Proposta de status por camada

### Estados internos do sistema

Podem continuar proximos dos atuais, mas recomendo reduzir semanticamente para:

- `DRAFT` ou `CREATED`
- `PRICING`
- `WAITING_PAYMENT`
- `PAID`
- `PROCUREMENT`
- `INBOUND`
- `LOCAL_DELIVERY`
- `DONE`
- `CANCELLED`

### Estados mostrados ao cliente

- `Recebido`
- `Em analise`
- `Aguardando pagamento`
- `Confirmado`
- `Em processamento`
- `A caminho`
- `Entregue`

### Estados operacionais para admin

- `Por analisar`
- `Cotado`
- `Pagamento pendente`
- `Pago`
- `Em compra`
- `Em transito`
- `Pronto para entrega`
- `Finalizado`

## Decisoes de produto recomendadas

### Decisao 1. Manter dois motores, vender uma experiencia

Internamente continue com `INTERNAL` e `EXTERNAL`.
Externamente venda uma jornada mais simples.

### Decisao 2. Permitir checkout misto por composicao

Nao tente unificar toda a logica financeira no mesmo pedido agora.
Crie uma compra composta que gera:

- um pedido interno
- um pedido externo

Mas o cliente sente que finalizou uma unica compra.

### Decisao 3. Tornar o externo mais assistido e menos artesanal

Produtos externos ja catalogados devem herdar defaults de cotacao:

- margem base
- risco
- custo operacional
- prazo medio

Assim o admin apenas ajusta excecoes.

### Decisao 4. Tratar cotacao como oferta comercial

A cotacao deve ter validade, beneficios e CTA claro.
Nao deve parecer uma planilha operacional.

## Roadmap pratico

### Fase 1. Melhor MVP comercial

- unificar a entrada de compra internacional no frontend
- esconder complexidade de status do cliente
- simplificar copy e CTAs
- separar filas operacionais do admin

### Fase 2. Reducao de trabalho manual

- defaults de cotacao por store
- reaproveitamento de cotacao por produto externo
- modelos de margem por categoria

### Fase 3. Escalabilidade

- checkout misto com split interno
- SLA por tipo de pedido
- automacao parcial de importacao de dados externos

## Mudancas prioritarias com maior ROI

### Alta prioridade

- simplificar estados exibidos ao cliente
- unificar a narrativa do externo
- transformar cotacao em proposta clara e rapida
- operar pedidos por fila e nao por lista unica

### Media prioridade

- permitir checkout misto com split interno
- criar defaults de cotacao por store ou categoria
- reduzir recotacao manual para itens externos recorrentes

### Baixa prioridade no MVP

- rastreio internacional detalhado
- automacao avancada de scraping
- granularidade total de eventos ao cliente

## Leitura final de dono

Hoje o sistema esta mais forte como operacao protegida do que como maquina de conversao.

Para vender melhor, a ShopeeMz precisa:

- parecer simples para o cliente
- continuar segura para a margem
- reduzir decisao manual do admin

O melhor MVP nao e o que mostra mais controle.
E o que vende com clareza, confirma rapido e executa com disciplina.

## Proxima traducao para codigo

Se esta direcao for aprovada, a implementacao mais segura deve acontecer nesta ordem:

1. camada de status comercial simplificado
2. unificacao da UX do pedido externo
3. filas operacionais do admin
4. checkout misto com split interno
5. defaults e automacoes de cotacao
