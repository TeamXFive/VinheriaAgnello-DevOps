#!/bin/sh
# Cria uma autoridade certificadora interna e os certificados TLS dos dois serviços.
# Os arquivos ficam em ./certs, fora do Git.
set -e
cd /certs

if [ -f ca.crt ] && [ -f estoque.crt ] && [ -f pedidos.crt ]; then
  echo "Certificados já existem."
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ca.key -out ca.crt -subj "/CN=Vinheria Agnello CA interna"

for servico in estoque pedidos; do
  openssl req -newkey rsa:2048 -nodes \
    -keyout "$servico.key" -out "$servico.csr" -subj "/CN=$servico.vinheria.local"
  printf "subjectAltName=DNS:%s.vinheria.local,DNS:%s\nextendedKeyUsage=serverAuth\n" "$servico" "$servico" > "$servico.ext"
  openssl x509 -req -days 365 -in "$servico.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "$servico.crt" -extfile "$servico.ext"
  rm "$servico.csr" "$servico.ext"
done

echo "Certificados criados em ./certs"
