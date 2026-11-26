# 🍷 Vinheria Agnello: infraestrutura, deploy e segurança

Fase 7 · Inovações em Desenvolvimento · FIAP 3ESOA · Equipe XFive

Parte da arquitetura de microsserviços da Vinheria Agnello (definida na Fase 6) rodando de verdade em containers Docker: dois microsserviços, uma rede com DHCP e DNS próprios, um pipeline de deploy no Jenkins e a comunicação entre os serviços protegida com JWT e HTTPS.

## Serviços escolhidos

| Microsserviço | O que faz | Rotas |
|---|---|---|
| **Pedidos** | Login (emite o JWT) e criação de pedidos | `POST /auth/login`, `POST /pedidos`, `GET /pedidos`, `GET /health` |
| **Estoque** | Disponibilidade e reserva de vinhos | `GET /estoque/vinhos`, `GET /estoque/vinhos/{id}`, `POST /estoque/vinhos/{id}/reserva`, `GET /health` |

Para confirmar um pedido, o Pedidos consulta o vinho no Estoque e faz a reserva, por REST, repassando o token do usuário. O Estoque confere a assinatura do token antes de responder. Cada serviço atende em HTTP (porta 8080) e HTTPS (porta 8443).

## Infraestrutura

```
                    Rede vinheria.local (10.20.0.0/24)
 ┌────────────────────────────────────────────────────────────────────┐
 │  dns-dhcp 10.20.0.2      jenkins 10.20.0.3       cliente (DHCP)     │
 │  dnsmasq: DHCP + DNS     pipeline de deploy      10.20.0.100-150    │
 │                                │                                    │
 │                                ▼ publica em ./publicacao            │
 │  pedidos 10.20.0.101  ── REST + JWT (HTTPS) ──▶  estoque 10.20.0.102 │
 │  (reserva DHCP)                                  (reserva DHCP)     │
 └────────────────────────────────────────────────────────────────────┘
```

- **DHCP:** ao subir, cada microsserviço larga o IP dado pelo Docker e pede um ao dnsmasq, informando o nome do host. Pedidos e Estoque têm MAC fixo e reserva por MAC (sempre .101 e .102), e o cliente recebe um IP do pool.
- **DNS:** o dnsmasq registra cada cliente DHCP como `<nome>.vinheria.local`. Os serviços se encontram pelo nome (`estoque.vinheria.local`), nunca pelo IP.
- **Publicação:** a pasta `publicacao/` faz o papel do diretório do IIS. Os containers dos serviços só rodam o que o Jenkins publicou ali e reiniciam sozinhos a cada novo deploy.

## Como rodar

Pré-requisitos: **Docker Desktop aberto e rodando** e Git. No Windows, rode os comandos no **Git Bash** (instalado junto com o Git), porque os scripts são `.sh`.

```bash
git clone https://github.com/TeamXFive/VinheriaAgnello-DevOps.git
cd VinheriaAgnello-DevOps
cp .env.example .env
docker compose up -d --build
```

O `.env` guarda a chave que assina os tokens e a senha do Jenkins. Os valores que vêm do `.env.example` já funcionam, não precisa trocar nada.

A primeira subida baixa as imagens e leva alguns minutos. Pedidos e Estoque ficam aguardando o primeiro deploy do Jenkins:

1. Abra o Jenkins em **http://localhost:8081**. Para clicar em **Build Now**, entre com o usuário `admin` e a senha `JENKINS_ADMIN_SENHA` do `.env`.
2. O job `vinheria-deploy` roda sozinho em até 2 minutos (ele verifica a `main` do repositório local) ou na hora, pelo **Build Now**. Espere o build ficar verde.
3. Teste a API a partir da máquina cliente da rede:

```bash
./scripts/testar-api.sh
```

As portas 8080 e 8443 dos microsserviços não ficam abertas no computador: as chamadas saem do container `cliente`, de dentro da rede `vinheria.local`. Os dados ficam em memória, então `docker compose restart estoque pedidos` apaga os pedidos e volta o estoque ao inicial. Para desligar tudo: `docker compose down`.

### Usuários de teste

| Usuário | Senha |
|---|---|
| `vendas` | `Vinho@2026` |

### Comandos úteis

```bash
docker exec vinheria-dns-dhcp cat /var/lib/misc/dnsmasq.leases   # concessões DHCP
docker exec vinheria-cliente dig +short estoque.vinheria.local   # resolução DNS
docker logs vinheria-dns-dhcp                                    # log de DHCP e DNS
```

## Pipeline de deploy (Jenkinsfile)

| Etapa | O que faz |
|---|---|
| Checkout | Baixa o último commit da `main` |
| Build | `echo "Deploy da Vinheria"`, confere a sintaxe dos serviços e gera o pacote `.tar.gz` (guardado como artefato) |
| Deploy | Copia os serviços para a pasta de publicação e grava `VERSAO.txt` com o build e o commit |
| Verificação | Chama o `/health` dos dois serviços pelo nome DNS e confere a versão publicada |

O Jenkins já sobe com o usuário e o job `vinheria-deploy` criados (`infra/jenkins/jenkins.yaml`).

## Segurança

- **JWT (HS256):** o login devolve um token assinado, válido por 15 minutos. O Pedidos repassa o token ao Estoque, que confere a assinatura antes de responder. Sem token, com token adulterado ou expirado, a resposta é 401.
- **HTTPS:** uma autoridade certificadora interna (`infra/pki`) emite os certificados de `pedidos.vinheria.local` e `estoque.vinheria.local`. O Pedidos confia nessa CA e chama o Estoque por HTTPS.
- **Segredos fora do Git:** `JWT_SECRET` e a senha do Jenkins ficam no `.env`; chaves e certificados em `certs/`. Os dois estão no `.gitignore`.

### Demonstração com o Wireshark

```bash
./scripts/capturar-trafego.sh http     # grava capturas/http.pcap  (sem criptografia)
./scripts/capturar-trafego.sh https    # grava capturas/https.pcap (TLS)
docker compose --profile analise up -d wireshark   # Wireshark em http://localhost:3000
```

No Wireshark, abra `/capturas/http.pcap` e use **Follow → HTTP Stream**: a senha do login e o JWT aparecem em texto puro, tanto do cliente para o Pedidos quanto do Pedidos para o Estoque. Em `/capturas/https.pcap` só aparecem o handshake TLS e dados cifrados (*Application Data*).

## Relatório

O relatório da atividade, com as capturas de tela e a reflexão final, está em [docs/Relatorio-Fase7-VinheriaAgnello.pdf](docs/Relatorio-Fase7-VinheriaAgnello.pdf).

## Estrutura

```
├── servicos/
│   ├── comum/        # JWT e servidor HTTP/HTTPS
│   ├── pedidos/      # microsserviço de Pedidos
│   └── estoque/      # microsserviço de Estoque
├── infra/
│   ├── dns-dhcp/     # dnsmasq (DHCP + DNS)
│   ├── servicos/     # imagem dos serviços (cliente DHCP)
│   ├── pki/          # geração da CA e dos certificados
│   └── jenkins/      # Jenkins com o job de deploy pronto
├── scripts/          # teste da API e captura de tráfego
├── docs/            # relatório em PDF e capturas de tela (evidencias/)
├── Jenkinsfile
└── docker-compose.yml
```

## Integrantes

| RM | Nome |
|---|---|
| 559160 | Caroline Nunes Levino Brandão |
| 86833 | Carolina Santana Ferraz |
| 556964 | Ivan Ramos Biagioni |
| 558703 | Luiz Henrique Sani |
| 554364 | José Othon |
