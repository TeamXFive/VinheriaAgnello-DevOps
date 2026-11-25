#!/bin/sh
# Grava o tráfego da interface do serviço Pedidos durante um login e um pedido.
#   ./scripts/capturar-trafego.sh http   -> tudo em HTTP (sem criptografia)
#   ./scripts/capturar-trafego.sh https  -> tudo em HTTPS (TLS)
# O arquivo vai para capturas/<modo>.pcap, para abrir no Wireshark.
set -e
MODO=${1:-http}
cd "$(dirname "$0")/.."
mkdir -p capturas

if [ "$MODO" = "http" ]; then
  PEDIDOS=http://pedidos.vinheria.local:8080
  ESTOQUE_URL=http://estoque.vinheria.local:8080 docker compose up -d pedidos
else
  PEDIDOS=https://pedidos.vinheria.local:8443
  docker compose up -d pedidos
fi

echo "Aguardando o Pedidos subir..."
until docker exec vinheria-cliente curl -fsS --cacert /certs/ca.crt "$PEDIDOS/health" >/dev/null 2>&1; do sleep 2; done

rm -f "capturas/$MODO.pcap"
docker exec -d vinheria-pedidos tcpdump -i eth0 -U -w "/capturas/$MODO.pcap" 'tcp port 8080 or tcp port 8443'
sleep 2

docker exec -e PEDIDOS="$PEDIDOS" vinheria-cliente sh -c '
  CA="--cacert /certs/ca.crt"
  TOKEN=$(curl -s $CA -X POST $PEDIDOS/auth/login -H "Content-Type: application/json" \
    -d "{\"usuario\":\"vendas\",\"senha\":\"Vinho@2026\"}" | sed -E "s/.*\"token\":\"([^\"]+)\".*/\1/")
  curl -s $CA -X POST $PEDIDOS/pedidos -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d "{\"vinhoId\":2,\"quantidade\":1}"; echo'

sleep 2
docker exec vinheria-pedidos pkill tcpdump || true
sleep 1
echo "Captura salva em capturas/$MODO.pcap"

# Volta o Pedidos para a configuração padrão (Estoque por HTTPS)
[ "$MODO" = "http" ] && docker compose up -d pedidos >/dev/null 2>&1 || true
