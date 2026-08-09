# Implementation Plan

## Fase 01 — Provisionamento

- [ ] Criar Droplet na DigitalOcean
- [ ] Configurar autenticação SSH
- [ ] Realizar primeiro acesso ao servidor
- [ ] Atualizar o sistema operacional
- [ ] Criar usuário administrativo
- [ ] Configurar privilégios sudo
- [ ] Desabilitar login SSH do root
- [ ] Desabilitar autenticação SSH por senha
- [ ] Configurar firewall UFW
- [ ] Validar acesso remoto

## Fase 02 — Servidor Web

- [ ] Instalar Nginx
- [ ] Entender portas 80 e 443
- [ ] Configurar virtual host
- [ ] Publicar página inicial
- [ ] Configurar domínio
- [ ] Configurar HTTPS

## Fase 03 — Aplicação

- [ ] Definir aplicação do laboratório
- [ ] Preparar runtime
- [ ] Realizar deploy manual
- [ ] Configurar serviço da aplicação
- [ ] Criar health check

## Fase 04 — Banco de Dados

- [ ] Instalar PostgreSQL
- [ ] Criar database
- [ ] Criar usuário da aplicação
- [ ] Configurar privilégios
- [ ] Restringir acesso externo
- [ ] Realizar backup
- [ ] Testar restore

## Fase 05 — Containers

- [ ] Instalar Docker
- [ ] Containerizar aplicação
- [ ] Utilizar Docker Compose
- [ ] Entender volumes e networks

## Fase 06 — CI/CD

- [ ] Criar pipeline
- [ ] Automatizar deploy
- [ ] Implementar health check
- [ ] Testar rollback

## Fase 07 — Observabilidade

- [ ] Monitorar CPU
- [ ] Monitorar memória
- [ ] Monitorar disco
- [ ] Instalar Prometheus
- [ ] Instalar Grafana
- [ ] Configurar alertas

## Fase 08 — Operação

- [ ] Criar estratégia de backup
- [ ] Criar runbooks
- [ ] Simular incidentes
- [ ] Simular recuperação de desastre