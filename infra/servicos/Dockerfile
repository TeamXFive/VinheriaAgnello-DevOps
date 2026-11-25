# Imagem base dos microsserviços e do cliente de testes
FROM node:22-alpine
RUN apk add --no-cache curl openssl tcpdump bind-tools
COPY iniciar.sh dhcp.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/iniciar.sh /usr/local/bin/dhcp.sh
ENTRYPOINT ["iniciar.sh"]
