#!/bin/sh
# 1. Larga o endereço dado pelo Docker e pede um ao servidor DHCP da rede, informando o nome do host.
# 2. Espera o Jenkins publicar o serviço (arquivos em $ESPERAR).
# 3. Inicia o processo do serviço.
set -e

ip addr flush dev eth0
udhcpc -i eth0 -x hostname:"$NOME_HOST" -s /usr/local/bin/dhcp.sh -q -t 10 -T 2

for arquivo in $ESPERAR; do
  until [ -f "$arquivo" ]; do
    echo "Aguardando $arquivo (o Jenkins ainda não publicou este serviço)..."
    sleep 5
  done
done

exec "$@"
