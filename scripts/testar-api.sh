#!/bin/sh
# Testa o fluxo da API a partir da máquina "cliente" da rede, por HTTPS.
# Uso: ./scripts/testar-api.sh
docker exec -i vinheria-cliente sh <<'TESTE'
set -e
PEDIDOS=https://pedidos.vinheria.local:8443
CA="--cacert /certs/ca.crt"

echo "1) Pedido sem token (esperado: 401)"
curl -s $CA -X POST $PEDIDOS/pedidos -H 'Content-Type: application/json' -d '{"vinhoId":1,"quantidade":2}'; echo

echo; echo "2) Login com senha errada (esperado: 401)"
curl -s $CA -X POST $PEDIDOS/auth/login -H 'Content-Type: application/json' -d '{"usuario":"vendas","senha":"errada"}'; echo

echo; echo "3) Login do usuário vendas"
TOKEN=$(curl -s $CA -X POST $PEDIDOS/auth/login -H 'Content-Type: application/json' \
  -d '{"usuario":"vendas","senha":"Vinho@2026"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "Token: $(echo $TOKEN | cut -c1-40)..."

echo; echo "4) Novo pedido: Pedidos consulta e reserva no Estoque com o mesmo token (esperado: 201)"
curl -s $CA -X POST $PEDIDOS/pedidos -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"vinhoId":1,"quantidade":2}'; echo

echo; echo "5) Pedido de vinho sem estoque (esperado: 409)"
curl -s $CA -X POST $PEDIDOS/pedidos -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"vinhoId":3,"quantidade":1}'; echo

echo; echo "6) Token adulterado (esperado: 401)"
curl -s $CA $PEDIDOS/pedidos -H "Authorization: Bearer ${TOKEN}x"; echo

TESTE
