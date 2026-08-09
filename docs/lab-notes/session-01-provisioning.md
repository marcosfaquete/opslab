# Session 01 — Provisioning

Date: 2026-08-09

## Objective

Provisionar a primeira VPS do projeto OpsLab na DigitalOcean, configurar o
acesso remoto inicial por SSH com autenticação por chave pública, validar a
identidade do servidor, inspecionar o estado inicial do sistema e aplicar as
primeiras atualizações do Ubuntu.

Esta sessão representa o primeiro ambiente Cloud real do projeto.

---

## Cloud Provider

DigitalOcean.

---

## Droplet

### Name

`opslab-01`

### Region

NYC1 — New York.

### Operating System

Ubuntu 24.04 LTS x64.

Após o provisionamento, o sistema reportou:

- Ubuntu 24.04.4 LTS
- Architecture: x86-64
- Virtualization: KVM
- Hardware Vendor: DigitalOcean
- Hardware Model: Droplet

### Compute

- Basic Droplet
- Shared CPU
- Regular SSD
- 1 vCPU
- 1 GB RAM
- 25 GB SSD
- 1 TB Transfer
- Estimated cost: US$ 6/month

O plano inicial foi escolhido propositalmente sem realizar vertical scaling
antecipado.

Caso recursos como memória ou CPU se tornem gargalos futuramente, a intenção
é medir o problema antes de aumentar o tamanho da VPS.

---

## Storage Options

### Additional Block Storage

Disabled.

Nenhum volume adicional foi criado.

### Automated Backups

Disabled.

A intenção do laboratório é implementar e testar backup e restore
manualmente antes de utilizar soluções automatizadas do provedor.

---

## Networking

### Public IPv4

Enabled.

O Droplet recebeu um endereço IPv4 público para permitir acesso pela internet.

### Private IPv4

O servidor também recebeu um endereço privado pertencente à VPC da
DigitalOcean.

Esse endereço é utilizado para comunicação privada dentro da infraestrutura
Cloud e não foi utilizado para o acesso SSH a partir do computador local.

### Public IPv6

Disabled initially.

IPv6 será estudado posteriormente como uma etapa separada para evitar
complexidade desnecessária durante os primeiros exercícios de networking.

---

## Monitoring

DigitalOcean Improved Metrics and Monitoring enabled.

O agente de métricas da DigitalOcean foi instalado automaticamente durante
o provisionamento.

Nenhuma solução própria de observabilidade foi instalada nesta etapa.

Prometheus, Grafana e outras ferramentas serão estudados posteriormente.

---

## Startup Automation

Startup Scripts disabled.

O provisionamento inicial será realizado manualmente para permitir o
entendimento das configurações antes da introdução de automação.

Futuramente poderão ser estudados:

- cloud-init;
- shell scripts;
- Ansible;
- Terraform.

---

# SSH Authentication

## Authentication Method

SSH public-key authentication.

Password authentication was not selected during Droplet creation.

Foi criado um par de chaves Ed25519 exclusivo para o OpsLab no computador
Windows local.

Command used:

```powershell
ssh-keygen -t ed25519 -C "opslab-digitalocean" -f "$env:USERPROFILE\.ssh\id_ed25519_opslab"