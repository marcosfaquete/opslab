# OpsLab

Laboratório prático de **Linux, Cloud Infrastructure e DevOps**, desenvolvido em uma VPS real na DigitalOcean.

O projeto reúne infraestrutura, backend, banco de dados, monitoramento e práticas de operação em um ambiente funcional, documentando não apenas o resultado, mas também o processo de construção, validação e troubleshooting.

> **UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**

---

## Live Lab

**OpsLab:**
http://marcosfaquete.com.br/opslab/

O frontend consulta dados reais da infraestrutura através da API executada na própria VPS.

---

## Objetivo

O OpsLab foi criado para estudar, na prática, como diferentes camadas de uma infraestrutura Linux se conectam.

O laboratório evoluiu desde o provisionamento inicial de uma VPS até uma arquitetura contendo:

* administração Linux;
* SSH e hardening;
* firewall;
* servidor web;
* reverse proxy;
* API;
* gerenciamento de processos;
* banco de dados;
* persistência;
* monitoramento;
* histórico de métricas;
* analytics;
* domínio próprio;
* Git e fluxo de deploy.

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
                      Ubuntu Server
                           │
                           ▼
                          UFW
                           │
                           ▼
                         Nginx
                    ┌──────┴──────┐
                    │             │
                 Frontend       /api/
                                  │
                           reverse proxy
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

O **Nginx** é o ponto público de entrada HTTP.

A aplicação **Node.js** permanece restrita ao loopback da VPS e é acessada externamente apenas através do reverse proxy.

O **PostgreSQL** também permanece interno ao servidor e não possui exposição pública direta.

---

## Stack

### Infrastructure

* DigitalOcean
* Ubuntu Server 24.04 LTS
* Linux
* SSH
* UFW
* Nginx
* systemd

### Application

* HTML
* CSS
* JavaScript
* Node.js
* npm
* PostgreSQL
* `pg`

### Operations

* Git
* GitHub
* systemd services
* systemd timers
* journald
* health checks
* monitoring snapshots
* first-party analytics

---

## Funcionalidades atuais

### Infraestrutura

* VPS Linux em ambiente Cloud;
* autenticação SSH por chave;
* usuário administrativo separado;
* firewall com política default deny para conexões de entrada;
* Nginx como servidor web e reverse proxy;
* backend Node.js restrito a `127.0.0.1`;
* PostgreSQL restrito ao ambiente local;
* serviços gerenciados pelo systemd.

### API

Endpoints utilizados pelo laboratório incluem:

```text
/api/health
/api/runtime
/api/system
/api/services
/api/monitoring/history
```

A API fornece informações reais sobre o ambiente e também utiliza PostgreSQL para persistência.

### Monitoramento

O laboratório registra snapshots periódicos da infraestrutura.

```text
systemd timer
      ↓
monitor service
      ↓
coleta
      ↓
PostgreSQL
      ↓
monitoring history
```

O frontend permite consultar diferentes períodos históricos, incluindo:

* 1 hora;
* 6 horas;
* 24 horas;
* 7 dias.

### Analytics

O OpsLab também possui coleta própria de pageviews através da aplicação e do PostgreSQL.

---

## Segurança

Algumas das decisões aplicadas no ambiente:

* autenticação SSH por chave;
* autenticação SSH por senha desabilitada;
* usuário administrativo separado;
* uso de `sudo` para elevação de privilégio;
* UFW ativo;
* somente portas necessárias expostas;
* backend Node.js limitado ao loopback;
* PostgreSQL limitado ao loopback;
* role PostgreSQL dedicada à aplicação;
* princípio do menor privilégio;
* secrets fora do código e do repositório;
* validação de configurações antes de reload.

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

---

## Lab Notes

A história completa da construção do laboratório está documentada em:

**[docs/lab-notes.md](docs/lab-notes.md)**

O documento registra:

* decisões técnicas;
* comandos utilizados;
* arquitetura;
* validações;
* erros encontrados;
* troubleshooting;
* segurança;
* banco de dados;
* monitoramento;
* deploy;
* principais aprendizados.

---

## Metodologia

O projeto foi desenvolvido seguindo o princípio:

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

A intenção é compreender cada camada manualmente antes de introduzir níveis maiores de automação.

---

## Próximas evoluções

Tecnologias e práticas que podem ser adicionadas futuramente:

* HTTPS;
* backup e restore estruturados;
* CI/CD;
* GitHub Actions;
* Docker;
* Prometheus;
* Grafana;
* alertas;
* infraestrutura como código;
* disaster recovery.

Esses itens representam **roadmap** e não funcionalidades já concluídas.

---

## Sobre o projeto

O OpsLab é um projeto de estudo e portfólio voltado à prática de:

**Linux · Cloud · Infrastructure · Backend · PostgreSQL · Observability · DevOps**

Desenvolvido por **Marcos Faquete**.

[LinkedIn](https://www.linkedin.com/in/marcosfaquete/) · [Lab Notes](docs/lab-notes.md)
