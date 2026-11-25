# 🍷 Vinheria Agnello: infraestrutura, deploy e segurança

Fase 7 · Inovações em Desenvolvimento · FIAP 3ESOA · Equipe XFive

Parte da arquitetura de microsserviços da Vinheria Agnello (definida na Fase 6) rodando de verdade em containers Docker: dois microsserviços, uma rede com DHCP e DNS próprios, um pipeline de deploy no Jenkins e a comunicação entre os serviços protegida com JWT e HTTPS.

## Serviços escolhidos

| Microsserviço | O que faz | Rotas |
|---|---|---|
| **Pedidos** | Login (emite o JWT) e criação de pedidos | `POST /auth/login`, `POST /pedidos`, `GET /pedidos`, `GET /health` |
| **Estoque** | Disponibilidade e reserva de vinhos | `GET /estoque/vinhos`, `GET /estoque/vinhos/{id}`, `POST /estoque/vinhos/{id}/reserva`, `GET /health` |

Para confirmar um pedido, o Pedidos consulta o vinho no Estoque e faz a reserva, por REST, repassando o token do usuário. O Estoque confere a assinatura e o perfil antes de responder. Cada serviço atende em HTTP (porta 8080) e HTTPS (porta 8443).

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

Pré-requisito: Docker Desktop.

```bash
cp .env.example .env        # depois troque os dois valores do .env
docker compose up -d --build
```

1. Abra o Jenkins em **http://localhost:8081** (usuário `admin`, senha do `.env`).
2. O job `vinheria-deploy` verifica o repositório a cada 2 minutos e roda sozinho a cada commit na `main`. Também dá para clicar em **Build Now**.
3. Depois do primeiro deploy, teste a API a partir da máquina cliente:

```bash
./scripts/testar-api.sh
```

### Usuários de teste

| Usuário | Senha | Perfil |
|---|---|---|
| `vendas` | `Vinho@2026` | Pode consultar e reservar |
| `consulta` | `Adega@2026` | Só consulta (reserva devolve 403) |

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
| Segurança | Para o deploy se encontrar chave privada ou segredo no código |
| Deploy | Copia os serviços para a pasta de publicação e grava `VERSAO.txt` com o build e o commit |
| Verificação | Chama o `/health` dos dois serviços pelo nome DNS e confere a versão publicada |

O Jenkins é configurado por código (`infra/jenkins/jenkins.yaml`): usuário, permissões e o job já sobem prontos.

## Segurança

- **JWT (HS256):** o login devolve um token assinado, válido por 15 minutos, com o usuário e o perfil. Sem token, com token adulterado ou expirado, a resposta é 401; com perfil errado, 403.
- **Senhas com hash:** guardadas como hash scrypt com sal, comparadas em tempo constante.
- **HTTPS:** uma CA interna (`infra/pki`) emite os certificados de `pedidos.vinheria.local` e `estoque.vinheria.local`. O Pedidos confia nessa CA e chama o Estoque por HTTPS.
- **Segredos fora do Git:** `JWT_SECRET` e a senha do Jenkins ficam no `.env`; chaves e certificados em `certs/`. Os dois estão no `.gitignore`, e o pipeline barra o deploy se algum aparecer no código.

### Demonstração com o Wireshark

```bash
./scripts/capturar-trafego.sh http     # grava capturas/http.pcap  (sem criptografia)
./scripts/capturar-trafego.sh https    # grava capturas/https.pcap (TLS)
docker compose --profile analise up -d wireshark   # Wireshark em http://localhost:3000
```

No Wireshark, abra `/capturas/http.pcap` e use **Follow → HTTP Stream**: a senha do login e o JWT aparecem em texto puro, tanto do cliente para o Pedidos quanto do Pedidos para o Estoque. Quem capturar esse token consegue usá-lo enquanto ele não expirar. Em `/capturas/https.pcap` só aparecem o handshake TLS e dados cifrados (*Application Data*).

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
│   └── jenkins/      # Jenkins configurado por código
├── scripts/          # teste da API e captura de tráfego
├── docs/evidencias/  # capturas de tela
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

## Uso de IA generativa

Usamos um assistente de IA generativa para apoiar a escrita do código, dos arquivos de configuração e do texto do relatório. Rodamos todo o ambiente, e as capturas de tela vêm dessa execução.
