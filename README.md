# OpsLab

Laboratório prático de **Linux, Cloud Infrastructure, backend, banco de dados, observabilidade e operação**, desenvolvido em uma VPS real na DigitalOcean.

O projeto nasceu da curiosidade de entender, na prática, o que existe por trás da publicação de uma aplicação em uma VPS. A partir desse objetivo, o laboratório evoluiu do provisionamento inicial de um servidor Linux para uma arquitetura funcional com Nginx, Node.js, PostgreSQL, systemd, monitoramento, histórico de métricas, analytics first-party e fluxo de operação versionado com Git/GitHub.

> **UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**

**Status atual:** marco **OpsLab v1 concluído**.  
O laboratório continua aberto para novas evoluções.

---

## Live Lab

**Marcos Lab:** [http://marcosfaquete.com.br/](http://marcosfaquete.com.br/)  
**OpsLab:** [http://marcosfaquete.com.br/opslab/](http://marcosfaquete.com.br/opslab/)

O frontend do OpsLab consulta dados reais da infraestrutura através da API executada na própria VPS.

---

## Objetivo

O OpsLab foi criado para estudar como diferentes camadas de uma infraestrutura Linux se conectam em um ambiente real.

Durante o projeto foram praticados conceitos relacionados a:

- provisionamento e administração Linux;
- SSH e hardening;
- firewall;
- DNS;
- servidor web;
- reverse proxy;
- backend;
- gerenciamento de processos;
- PostgreSQL e persistência;
- monitoramento;
- histórico de métricas;
- analytics first-party;
- Git, deploy, rollback e troubleshooting.

A proposta foi compreender cada camada manualmente antes de introduzir níveis maiores de automação.

---

## Arquitetura

```text
                           INTERNET
                              │
                              ▼
                             DNS
                              │
                              ▼
                       DigitalOcean VPS
                              │
                       Ubuntu 24.04 LTS
                              │
                              ▼
                             UFW
                              │
                              ▼
                            Nginx
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
               /          /opslab/        /api/
          Marcos Lab       OpsLab      reverse proxy
                                            │
                                            ▼
                                     127.0.0.1:3000
                                            │
                                         Node.js
                                            │
                                            ▼
                                     PostgreSQL 16
                                     127.0.0.1:5432
```

O **Nginx** funciona como ponto público de entrada HTTP.

A Home do **Marcos Lab** e o frontend do **OpsLab** são publicados pelo servidor web. As requisições em `/api/` são encaminhadas para a aplicação Node.js através de reverse proxy.

A aplicação Node.js permanece restrita ao loopback da VPS, e o PostgreSQL também não possui exposição pública direta.

### Processos e coleta

```text
systemd
   │
   ├── opslab-api.service
   │        ↓
   │      Node.js
   │
   └── opslab-monitor.timer
            ↓
      opslab-monitor.service
            ↓
       coleta periódica
            ↓
         PostgreSQL
            ↓
   monitoring_snapshots
```

---

## Stack

### Infrastructure

- DigitalOcean
- Ubuntu Server 24.04 LTS
- Linux
- SSH
- UFW
- Nginx
- systemd

### Application

- HTML
- CSS
- JavaScript
- Node.js
- npm
- PostgreSQL 16
- `pg`

### Observability

- health checks
- system metrics
- monitoring snapshots
- historical charts
- systemd timers
- first-party analytics
- engagement metrics

### Operations

- Git
- GitHub
- branches
- Pull Requests
- rebase e resolução de conflitos
- journald
- deploy validation
- backups temporários
- rollback
- troubleshooting

---

## OpsLab v1

A versão atual reúne quatro áreas principais:

```text
OPSLAB V1
│
├── Infrastructure
├── Application
├── Observability / Analytics
└── Operations
```

### Infrastructure

- VPS Linux em ambiente Cloud;
- usuário administrativo separado;
- autenticação SSH por chave;
- autenticação SSH por senha desabilitada;
- UFW com política de entrada restritiva;
- Nginx como servidor web e reverse proxy;
- backend Node.js restrito a `127.0.0.1`;
- PostgreSQL restrito ao ambiente local;
- serviços e tarefas administrados pelo systemd.

### Application

A aplicação Node.js fornece endpoints utilizados pelo laboratório, incluindo:

```text
/api/health
/api/runtime
/api/system
/api/services
/api/monitoring/history
```

O backend também utiliza PostgreSQL para persistência e consultas utilizadas pela interface.

### Live checks

O frontend apresenta leituras reais do ambiente, como:

- disponibilidade da API;
- comunicação com PostgreSQL;
- estado do sistema operacional;
- runtime Node.js;
- uptime da VPS;
- utilização de memória;
- load average;
- heap utilizado pelo Node.js;
- estado dos componentes Nginx, Node.js, PostgreSQL e UFW.

As leituras principais são atualizadas periodicamente e de forma escalonada.

---

## Monitoramento e histórico

O laboratório registra snapshots periódicos da infraestrutura.

```text
opslab-monitor.timer
        ↓
opslab-monitor.service
        ↓
coleta de métricas
        ↓
PostgreSQL
        ↓
monitoring_snapshots
        ↓
API
        ↓
gráficos históricos
```

A coleta é executada aproximadamente a cada **5 minutos**.

A interface permite consultar períodos como:

- 1 hora;
- 6 horas;
- 24 horas;
- 7 dias.

Atualmente o histórico acompanha métricas como:

- memória utilizada;
- load average;
- memória RSS do processo Node.js.

---

## Analytics first-party

O Marcos Lab e o OpsLab possuem uma camada própria de analytics, sem depender exclusivamente de uma plataforma externa.

```text
navegador
   ↓
coleta da aplicação
   ↓
API
   ↓
PostgreSQL
   ↓
métricas e histórico
```

Entre os dados tratados pelo sistema estão:

- pageviews;
- visitantes;
- sessões;
- tipos de navegação;
- tempo ativo;
- profundidade de scroll;
- páginas distintas;
- navegações da sessão;
- métricas de engajamento.

O sistema também possui um **dashboard administrativo de acesso restrito** para análise agregada e inspeção do histórico de acessos.

A coleta foi projetada de forma que uma eventual falha no analytics não impeça o funcionamento normal da Home ou do OpsLab.

---

## Segurança

A segurança do laboratório foi construída em camadas.

Entre as decisões aplicadas:

- autenticação SSH por chave;
- autenticação SSH por senha desabilitada;
- usuário administrativo separado;
- uso de `sudo` para elevação de privilégio;
- UFW ativo;
- somente portas necessárias expostas;
- Nginx concentrando a entrada HTTP;
- Node.js limitado ao loopback;
- PostgreSQL limitado ao loopback;
- role PostgreSQL dedicada à aplicação;
- princípio do menor privilégio;
- queries parametrizadas;
- secrets fora do código e do repositório;
- validação de configurações antes de reload;
- backups temporários antes de alterações críticas;
- dashboard administrativo de analytics com acesso restrito.

Segurança aqui não é tratada como uma única ferramenta, mas como a combinação de isolamento, controle de privilégios, redução de exposição e validação operacional.

---

## Git, deploy e validação

O fluxo do projeto evoluiu de commits diretos para um processo com maior preocupação operacional.

```text
alteração
   ↓
revisão
   ↓
branch
   ↓
testes
   ↓
commit
   ↓
Pull Request / merge
   ↓
deploy
   ↓
validação em produção
   ↓
rollback se necessário
```

Durante a evolução do laboratório foram praticados:

- `git status`;
- `git diff`;
- staging;
- commits;
- branches;
- Pull Requests;
- merge;
- rebase;
- resolução de conflitos;
- comparação entre repositório e artefato publicado;
- validação dos endpoints após deploy;
- backups e restauração de versões funcionais.

Na VPS, alterações importantes são acompanhadas por verificações como:

```bash
sudo nginx -t
systemctl status
curl
```

---

## Estrutura do repositório

```text
opslab/
├── app/
│   └── Node.js API
│
├── html/
│   └── OpsLab frontend
│
├── infra/
│   ├── env/
│   ├── nginx/
│   ├── postgresql/
│   └── systemd/
│
├── docs/
│   └── lab-notes.md
│
├── .gitignore
└── README.md
```

Credenciais, private keys, tokens e arquivos `.env` reais de produção não fazem parte do repositório.

---

## Lab Notes

A construção completa do laboratório está documentada em:

[**docs/lab-notes.md**](docs/lab-notes.md)

O documento registra em mais detalhes:

- decisões técnicas;
- arquitetura;
- provisionamento;
- Linux;
- SSH e segurança;
- Nginx;
- Node.js;
- systemd;
- PostgreSQL;
- monitoramento;
- analytics;
- deploy;
- falhas e troubleshooting;
- reconstrução da VPS;
- principais aprendizados.

O objetivo das Lab Notes é preservar não apenas o estado final, mas também o processo que levou até ele.

---

## Metodologia

O projeto começou com o princípio:

```text
UNDERSTAND
    ↓
EXECUTE
    ↓
TEST
    ↓
DOCUMENT
    ↓
COMMIT
```

Durante a evolução do laboratório, esse modelo também passou a incluir uma parte essencial do aprendizado prático:

> **entender, executar, testar, quebrar, diagnosticar, corrigir, documentar e versionar.**

---

## Estado atual

O **OpsLab v1** chegou a um estado funcional, público e coerente com seu objetivo original.

```text
Infrastructure
├── DigitalOcean VPS
├── Ubuntu Server 24.04 LTS
├── SSH
├── UFW
└── Nginx

Application
├── Node.js
├── systemd
├── API
└── PostgreSQL 16

Observability
├── live health checks
├── system metrics
├── monitoring snapshots
├── historical charts
└── first-party analytics

Operations
├── Git / GitHub
├── branches / Pull Requests
├── deploy validation
├── backups / rollback
└── troubleshooting
```

Declarar a **v1 concluída** não significa encerrar o laboratório.

Significa que o objetivo inicial — compreender e operar uma infraestrutura Linux real, do provisionamento à observabilidade — atingiu um marco consistente e apresentável.

---

## Roadmap

As seguintes tecnologias e práticas podem ser estudadas futuramente, mas **não representam funcionalidades já implementadas**:

- HTTPS;
- estratégia formal de backup;
- teste completo de restore;
- CI/CD;
- GitHub Actions;
- Docker;
- Prometheus;
- Grafana;
- alertas;
- infraestrutura como código;
- disaster recovery mais completo.

---

## Sobre o projeto

O **OpsLab** faz parte do **Marcos Lab**, um espaço pessoal para criar, testar e publicar projetos digitais.

O OpsLab registra especificamente a jornada de estudo em:

**Linux · Cloud · Infrastructure · Backend · PostgreSQL · Observability · Operations · DevOps**

Desenvolvido por **Marcos Faquete**.

[LinkedIn](https://www.linkedin.com/in/marcosfaquete/) · [Lab Notes](docs/lab-notes.md)
