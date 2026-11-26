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

Pré-requisitos: Git para clonar o repositório e Docker Desktop em execução, com Docker Compose v2. As APIs rodam dentro da rede Docker; as portas 8080 e 8443 dos microsserviços não são publicadas na máquina host. Os testes do ambiente usam o container cliente.

Na raiz do repositório, crie o `.env` apenas se ele ainda não existir:

```bash
cp .env.example .env
```

Edite os dois valores antes de subir o ambiente:

| Variável | Uso |
|---|---|
| `JWT_SECRET` | Segredo longo e aleatório, compartilhado por Pedidos e Estoque para assinar e validar tokens |
| `JENKINS_ADMIN_SENHA` | Senha do usuário `admin` do Jenkins |

Preserve um `.env` já configurado. Depois execute:

```bash
docker compose up -d --build
```

1. Abra o Jenkins em **http://localhost:8081** (usuário `admin`, senha do `.env`).
2. Abra o job `vinheria-deploy` e clique em **Build Now** no primeiro uso.
3. Aguarde o pipeline terminar com sucesso. Os serviços aguardam os arquivos em `publicacao/` e não atendem antes do primeiro deploy.
4. Execute os testes do ambiente publicado:

```bash
./scripts/testar-api.sh
```

O job consulta a cada dois minutos a branch `main` do **repositório local**, montado como `file:///repo` no Jenkins. Alterações precisam estar commitadas na `main` para serem publicadas. Commits existentes somente no GitHub precisam ser trazidos para essa cópia local antes do build. **Build Now** também usa o código commitado, e não alterações ainda sem commit.

Ao atualizar um ambiente existente, registre as mudanças na `main`, execute novamente `docker compose up -d --build` para atualizar as imagens e os volumes montados e então dispare **Build Now**. Isso é necessário, por exemplo, quando a imagem do Jenkins ou os arquivos do Compose mudam.

### Testes e repetibilidade

O script aguarda os dois serviços por até 60 segundos, valida HTTPS com a CA interna e limita cada requisição a cinco segundos. Cada cenário imprime `PASSOU` ou `FALHOU`; qualquer falha faz o comando terminar com código diferente de zero. O login precisa retornar um token antes dos testes autenticados. Nenhum token é impresso.

| Cenário | Resultado esperado |
|---|---|
| Pedido sem token e consulta ao Estoque sem token | 401 |
| Login com senha incorreta | 401 |
| Login válido | 200, token e validade de 900 segundos |
| Pedido válido | 201, pedido confirmado, listado e baixa de duas unidades no Estoque |
| Vinho sem estoque | 409 e disponibilidade zero |
| Quantidade zero, negativa, fracionária ou texto | 400 |
| Vinho inexistente | 404 |
| Token adulterado ou expirado, nos dois serviços | 401 |

Os pedidos e o estoque ficam **em memória**. O teste do ambiente publicado reserva duas unidades do vinho 1 por execução bem-sucedida; após 12 execuções sem reiniciar o Estoque, esse cenário deixa de ter saldo. Reiniciar os serviços apaga pedidos e restaura as quantidades iniciais:

```bash
docker compose restart estoque pedidos
./scripts/testar-api.sh
```

O script aguarda automaticamente os serviços voltarem. Não há persistência em banco de dados.

Para desenvolver e repetir os testes sem consumir o estoque da demonstração, use **Node.js 20 ou superior** e **OpenSSL** disponíveis no PATH:

```bash
node --test testes/jwt.test.js
node testes/integracao.js
```

Não é necessário `npm install`. A integração cria processos separados de Pedidos e Estoque, portas livres na interface de loopback, segredo aleatório e uma CA com certificado temporário. Executa os mesmos cenários por HTTPS, incluindo a comunicação Pedidos → Estoque, verifica a rejeição de CA não confiável e de versão divergente e remove os processos e certificados ao terminar. Os testes isolados não verificam DHCP, DNS ou Jenkins; a verificação do deploy e o script no cliente complementam essa cobertura.

### Usuários de teste

| Usuário | Senha |
|---|---|
| `vendas` | `Vinho@2026` |

### Diagnóstico

```bash
docker compose ps                                              # estado dos containers
docker compose logs --tail=100 pedidos estoque                  # espera de publicação, DHCP e erros da API
docker compose logs --tail=100 jenkins                          # inicialização do Jenkins
docker exec vinheria-cliente curl -fsS --connect-timeout 3 --max-time 5 --cacert /certs/ca.crt https://pedidos.vinheria.local:8443/health
docker exec vinheria-cliente curl -fsS --connect-timeout 3 --max-time 5 --cacert /certs/ca.crt https://estoque.vinheria.local:8443/health
docker exec vinheria-dns-dhcp cat /var/lib/misc/dnsmasq.leases   # concessões DHCP
docker exec vinheria-cliente dig +short estoque.vinheria.local   # resolução DNS
docker logs vinheria-dns-dhcp                                    # log de DHCP e DNS
```

Se aparecer “Aguardando /app/...”, confira o primeiro build e o console do job no Jenkins. Se o DNS não resolver, confira as concessões DHCP e os logs de `dns-dhcp`. Uma falha de certificado exige verificar a CA e a validade dos certificados; não desative a validação TLS. Se a porta 8081 estiver ocupada, libere-a ou ajuste o mapeamento no Compose.

## Pipeline de deploy (Jenkinsfile)

| Etapa | O que faz |
|---|---|
| Checkout | Baixa o último commit da `main` |
| Build | Confere a sintaxe de cada arquivo, interrompe no primeiro erro e gera o pacote `.tar.gz` (guardado como artefato) |
| Testes | Executa os testes de JWT e os cenários de integração HTTPS em processos com estado descartável, antes de publicar |
| Deploy | Copia os serviços para a pasta de publicação e grava `VERSAO.txt` com o build e o commit |
| Verificação | Aguarda `/health` por HTTPS pelo nome DNS, valida a CA e compara a versão de cada serviço com a gerada neste build; falha após 60 segundos sem correspondência |

Builds do mesmo job são executados em sequência para evitar publicação simultânea. O pipeline tem limite total de 15 minutos. A verificação HTTPS usa a pasta `certs/` montada somente para leitura no Jenkins.

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
├── scripts/          # teste da API, verificação do deploy e captura de tráfego
├── testes/           # cenários da API, integração isolada e testes do JWT
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

## Uso de IA generativa

Usamos um assistente de IA generativa para apoiar a escrita do código, dos arquivos de configuração e do texto do relatório. Rodamos todo o ambiente, e as capturas de tela vêm dessa execução.
