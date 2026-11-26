#!/bin/sh
# Testa o ambiente publicado. Cada execução reserva duas unidades do vinho 1.
set -eu
cd "$(dirname "$0")/.."
TOKEN_EXPIRADO=$(docker exec vinheria-pedidos node -e '
  const { gerarToken } = require("/app/comum/jwt");
  console.log(gerarToken({ sub: "vendas" }, process.env.JWT_SECRET, -60));
')
docker exec -e TOKEN_EXPIRADO="$TOKEN_EXPIRADO" vinheria-cliente node /testes/api.js
