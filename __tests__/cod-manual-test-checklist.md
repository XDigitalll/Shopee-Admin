# COD Flow — Checklist de Testes Manuais

Fase 3 — 2026-06-16. Executar em staging com backend Xdigital e admin BFF activos.

## Pré-condição

Criar pedido interno com `payment_method = CASH_ON_DELIVERY`, `cod_enabled = true`.
Avançar até `READY_FOR_DELIVERY` via painel admin.

---

## Bloco A — Rota e cobrança PaySuite

| # | Acção | Resultado esperado |
|---|-------|--------------------|
| A1 | Clicar "Mandar para entrega" | Estado → `OUT_FOR_DELIVERY`. Pedido aparece em `/admin/delivery/active`. |
| A2 | Abrir card do pedido em `/admin/delivery/active` | Botão "Cobrar cliente" visível. Botão "Concluir entrega" ausente ou bloqueado. |
| A3 | Clicar "Cobrar cliente" → escolher PaySuite → confirmar | `link PaySuite` aparece na resposta. Estado → `AWAITING_DELIVERY_PAYMENT`. |
| A4 | Card recarregado após PaySuite | Pedido permanece visível na fila activa (status `AWAITING_DELIVERY_PAYMENT`). |
| A5 | Simular webhook PaySuite bem-sucedido (Postman `POST /paysuite/webhook`) | `deliveryPaymentStatus = RECEIVED` na BD. Timeline regista `COD_PAYMENT_COLLECTED` e `DELIVERY_PAYMENT_CONFIRMED`. |
| A6 | Após webhook: botão "Concluir entrega" desbloqueado | Clicar → estado → `DELIVERED`. `hasPendingDeliveryPayment()` devolveu false. |

---

## Bloco B — Cobrança em dinheiro (CASH_IN_HAND)

| # | Acção | Resultado esperado |
|---|-------|--------------------|
| B1 | Pedido em `OUT_FOR_DELIVERY`. Abrir card activo | Botão "Cobrar cliente" visível. |
| B2 | Clicar "Cobrar cliente" → escolher "Dinheiro em mãos" → confirmar | Backend: `payment.method = CASH_IN_HAND`, `collection_method = CASH_IN_HAND`, `purpose = COD_COLLECTION`, `reconciliation_status = PENDING_RECONCILIATION`, `delivery_payment_status = RECEIVED`. |
| B3 | Após confirmação de dinheiro | Frontend auto-chama `/api/orders/{id}/delivery-complete`. Estado → `DELIVERED` sem clique extra. |
| B4 | Timeline do pedido | Eventos `COD_CASH_COLLECTED`, `COD_PAYMENT_COLLECTED`, `DELIVERY_PAYMENT_CONFIRMED`. |
| B5 | BD — tabela `payments` | `purpose = 'COD_COLLECTION'` preenchido. `reconciliation_status = 'PENDING_RECONCILIATION'`. |

---

## Bloco C — Transferência manual

| # | Acção | Resultado esperado |
|---|-------|--------------------|
| C1 | Pedido em `OUT_FOR_DELIVERY`. Escolher "Transferência bancária" | Formulário para referência da transferência aparece. |
| C2 | Preencher referência e confirmar | Estado → `AWAITING_DELIVERY_PAYMENT`. `payment.status = COD_PROOF_SUBMITTED`, `collection_method = MANUAL_TRANSFER`, `purpose = COD_COLLECTION`. |
| C3 | Fila financeira `/admin/payments?queue=AWAITING` | Submissão de prova da entrega visível. `metadata` contém `DELIVERY_COLLECTION`. |
| C4 | Finance aprova a submissão | `delivery_payment_status = RECEIVED`. Botão "Concluir entrega" desbloqueado. |

---

## Bloco D — Não consegui cobrar (mark-not-collected)

| # | Acção | Resultado esperado |
|---|-------|--------------------|
| D1 | Pedido em `AWAITING_DELIVERY_PAYMENT`. Clicar "Não consegui cobrar" | Modal abre com campo de motivo obrigatório. |
| D2 | Confirmar sem motivo | Botão desactivado ou erro "motivo obrigatório". |
| D3 | Preencher motivo → confirmar | Estado → `DELIVERY_FAILED`. Timeline: `DELIVERY_PAYMENT_NOT_COLLECTED`, `ORDER_DELIVERY_FAILED`. |
| D4 | BD após D3 | `payment.status = COD_NOT_COLLECTED`. Registo financeiro preservado (não apagado). `remaining_amount_on_delivery` restaurado. |
| D5 | Pedido em `OUT_FOR_DELIVERY`. Clicar "Não consegui cobrar" | Mesmo comportamento que D3. |

---

## Bloco E — DTO serialização `/admin/delivery/active`

| # | Verificação | Resultado esperado |
|---|-------------|---------------------|
| E1 | `GET /admin/delivery/active` (Postman) com pedido COD em `OUT_FOR_DELIVERY` | Resposta JSON contém `paymentStatus`, `deliveryPaymentStatus`, `remainingAmountOnDelivery`. |
| E2 | Pedido COD em `AWAITING_DELIVERY_PAYMENT` | `deliveryPaymentStatus = "PENDING"` ou `"RECEIVED"` conforme estado. |
| E3 | Após `confirmCodCashCollected` | `deliveryPaymentStatus = "RECEIVED"`, `remainingAmountOnDelivery = 0`. |

---

## Bloco F — Regressão (checkout normal)

| # | Verificação | Resultado esperado |
|---|-------------|---------------------|
| F1 | Pedido externo com PaySuite — checkout completo | Fluxo normal sem interferência COD. Estado: `PENDING_PAYMENT → PAID → TO_PURCHASE`. |
| F2 | Pedido interno pré-pago — entrega normal | "Cobrar cliente" ausente no card activo. |
| F3 | Botão "Cobrar cliente" ausente para pedido pré-pago em rota | `isCod = false` e `deliveryChargePending = false`. |
