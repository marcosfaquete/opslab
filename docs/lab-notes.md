# OpsLab — Lab Notes

> Registro consolidado da construção, evolução e dos principais aprendizados técnicos do OpsLab.

## Sobre o projeto

O **OpsLab** é um laboratório prático de Linux, infraestrutura Cloud, backend, banco de dados, observabilidade e práticas de operação.

O projeto foi desenvolvido em uma VPS real na DigitalOcean com o objetivo de aprender infraestrutura não apenas pela teoria, mas através da execução, validação, falhas, correções e documentação de um ambiente em produção.

A proposta do laboratório é compreender cada camada antes de automatizá-la.

O princípio utilizado durante o desenvolvimento foi:

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

---

# Arquitetura atual

De forma simplificada, o ambiente evoluiu para:

```text
                         INTERNET
                            │
                            ▼
                          DNS
                            │
                            ▼
                           VPS
                     Ubuntu Server
                            │
                            ▼
                           UFW
                            │
                            ▼
                          Nginx
                   ┌────────┴────────┐
                   │                 │
                   │                 │
              conteúdo web        /api/
                   │                 │
                   │           reverse proxy
                   │                 │
                   │                 ▼
                   │          127.0.0.1:3000
                   │                 │
                   │              Node.js
                   │                 │
                   │                 ▼
                   │          PostgreSQL 16
                   │          127.0.0.1:5432
                   │
                   └── Marcos Lab / OpsLab
```

O Nginx funciona como ponto público de entrada.

A aplicação Node.js permanece em uma porta interna da VPS e o PostgreSQL também permanece restrito ao ambiente local.

Além do caminho das requisições, serviços do Linux administram o ciclo de vida da aplicação e a coleta periódica de dados:

```text
systemd
   │
   ├── opslab-api.service
   │        ↓
   │      Node.js
   │
   └── opslab-monitor.timer
            ↓
      coleta periódica
            ↓
       PostgreSQL
            ↓
 monitoring_snapshots
```

---

# 01 — Repositório e metodologia

**Status:** Concluído

O projeto começou com a criação de um repositório Git público utilizado como fonte versionada para código, documentação e configurações reproduzíveis.

Uma decisão importante foi não tratar a VPS como a única cópia do projeto.

O modelo adotado foi:

```text
Git repository
      +
configurações versionáveis
      +
documentação
      +
backups
      +
secrets externos
```

Arquivos sensíveis como senhas, private keys, tokens e arquivos `.env` de produção não devem ser armazenados no Git.

Durante o desenvolvimento, o fluxo Git passou a incluir inspeção consciente das alterações antes de cada commit:

```bash
git status
git diff
git add
git status
git diff --cached
git commit
git push
```

Posteriormente, o fluxo também passou a utilizar branches, staging, Pull Requests, merge e validação do estado publicado.

### Aprendizado

Git não é apenas um local para salvar código.

Ele funciona como histórico, ponto de recuperação, registro das decisões e fonte confiável do estado do projeto.

---

# 02 — Provisionamento da VPS e baseline Linux

**Status:** Concluído

O primeiro ambiente do OpsLab foi criado em um Droplet da DigitalOcean.

A configuração inicial utilizou:

```text
Cloud Provider: DigitalOcean
Region: NYC1
Operating System: Ubuntu 24.04 LTS
Virtualization: KVM
vCPU: 1
RAM: aproximadamente 1 GB
Disk: 25 GB SSD
```

Antes da instalação das aplicações, o ambiente foi inspecionado utilizando ferramentas nativas do Linux.

Entre os comandos estudados:

```bash
hostnamectl
free -h
df -h
lsblk
lsblk -f
lscpu
```

Foram estudados conceitos como:

* CPU virtual;
* memória disponível e memória livre;
* filesystem;
* discos e partições;
* virtualização KVM;
* infraestrutura Cloud;
* public IPv4;
* private IPv4.

O sistema também foi atualizado:

```bash
sudo apt update
sudo apt upgrade
```

Uma atualização de kernel foi aplicada e validada após reboot.

### Aprendizado

Provisionar uma máquina é apenas o começo.

Antes de instalar serviços, é importante compreender qual sistema está sendo administrado, quais recursos estão disponíveis e qual é o estado inicial da máquina.

---

# 03 — SSH e hardening

**Status:** Concluído

O acesso administrativo foi configurado utilizando autenticação SSH por chave.

Foi utilizado um par de chaves Ed25519.

A private key permaneceu exclusivamente na máquina administrativa, enquanto somente a chave pública foi registrada no servidor.

Durante a primeira conexão, a SSH Host Key do servidor também foi validada através de um segundo canal antes de ser adicionada ao `known_hosts`.

Foi criado um usuário administrativo dedicado:

```text
marcos
```

com privilégios administrativos através do grupo:

```text
sudo
```

O fluxo administrativo passou a ser:

```text
computador local
      ↓
SSH com chave
      ↓
marcos
      ↓
sudo quando necessário
      ↓
privilégios administrativos
```

A autenticação SSH por senha foi desabilitada e o acesso passou a utilizar chaves públicas.

Antes de qualquer alteração crítica no SSH, a configuração foi validada:

```bash
sudo sshd -t
sudo sshd -T
```

Uma segunda sessão SSH era testada antes de abandonar o caminho administrativo anterior.

### Aprendizado

Uma das principais lições foi que alterações de autenticação remota devem possuir um caminho seguro de recuperação.

O procedimento utilizado foi:

```text
configurar
    ↓
validar sintaxe
    ↓
manter sessão existente
    ↓
testar nova sessão
    ↓
validar sudo
    ↓
aplicar restrição
    ↓
testar novamente
```

Isso reduz o risco de perder acesso ao próprio servidor.

---

# 04 — Firewall com UFW

**Status:** Concluído

O firewall local foi configurado utilizando UFW.

A política adotada foi:

```text
incoming → deny
outgoing → allow
```

Antes de habilitar o firewall, a regra de SSH foi criada para evitar bloquear o acesso administrativo.

Comandos importantes:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

Posteriormente, HTTP foi liberado para o Nginx.

A ideia foi expor somente os serviços realmente necessários.

A porta interna da aplicação Node.js não foi aberta publicamente.

A porta do PostgreSQL também permaneceu sem exposição pública.

### Aprendizado

Firewall não substitui as demais camadas de segurança.

Seu papel é reduzir a superfície de exposição da máquina e controlar conscientemente quais serviços podem receber conexões externas.

---

# 05 — Nginx e publicação HTTP

**Status:** Concluído

O Nginx foi instalado como servidor web e posteriormente passou a funcionar também como reverse proxy.

Após a instalação:

```bash
sudo apt install nginx
```

o serviço foi validado localmente antes da exposição externa:

```bash
curl -I http://127.0.0.1
```

Foi criado um web root próprio para o OpsLab em vez de utilizar apenas a página padrão instalada pelo pacote.

Também foram estudadas as estruturas:

```text
/etc/nginx/sites-available
/etc/nginx/sites-enabled
```

e o uso de symbolic links para ativar sites.

Antes de aplicar alterações na configuração:

```bash
sudo nginx -t
```

Somente depois da validação:

```bash
sudo systemctl reload nginx
```

### Aprendizado

Uma configuração não deve ser aplicada apenas porque parece correta.

O fluxo utilizado passou a ser:

```text
editar
  ↓
validar
  ↓
reload
  ↓
testar
```

---

# 06 — Node.js e primeira API

**Status:** Concluído

O OpsLab deixou de ser apenas um site estático quando foi introduzida uma aplicação backend em Node.js.

Node.js foi instalado utilizando NVM.

Versões utilizadas durante o projeto:

```text
Node.js 24
npm 11
```

Foi criado inicialmente um servidor HTTP utilizando módulos nativos do Node.js.

O primeiro endpoint foi:

```text
GET /health
```

com resposta:

```json
{
  "status": "ok"
}
```

A aplicação foi configurada para escutar em:

```text
127.0.0.1:3000
```

em vez de:

```text
0.0.0.0:3000
```

Isso tornou o backend acessível apenas internamente pela VPS.

A porta foi inspecionada com:

```bash
ss -ltnp
```

e a API testada diretamente:

```bash
curl http://127.0.0.1:3000/health
```

### Aprendizado

Foi possível visualizar concretamente a diferença entre:

```text
código JavaScript
runtime Node.js
processo Linux
socket TCP
porta
requisição HTTP
```

---

# 07 — Reverse proxy

**Status:** Concluído

O Nginx passou a encaminhar requisições públicas da API para o backend Node.js.

O modelo ficou:

```text
Internet
   ↓
Nginx
   ↓
/api/
   ↓
reverse proxy
   ↓
127.0.0.1:3000
   ↓
Node.js
```

Assim, o navegador não precisa acessar diretamente a porta da aplicação.

Durante os testes também foi estudado o comportamento de virtual hosts e do header HTTP `Host`.

Um teste utilizando `127.0.0.1` inicialmente atingiu outro server block do Nginx, demonstrando que a seleção do virtual host ocorre antes da avaliação das regras `location`.

Também foi observado o erro:

```text
EADDRINUSE
```

quando uma segunda aplicação tentou utilizar uma porta já ocupada.

### Aprendizado

Um reverse proxy cria uma separação clara entre:

```text
serviço público
        ↓
Nginx
        ↓
serviço interno
```

Isso permite manter o backend isolado da Internet e concentrar a entrada HTTP no Nginx.

---

# 08 — Process management com systemd

**Status:** Concluído

Inicialmente a API dependia de:

```bash
node server.js
```

executado manualmente.

Isso não seria adequado para um serviço que precisa continuar funcionando independentemente de uma sessão SSH.

Foi criado:

```text
opslab-api.service
```

O serviço passou a definir:

```text
User=marcos
WorkingDirectory=/var/www/opslab/app
ExecStart=<caminho absoluto do Node.js> server.js
Restart=on-failure
```

O systemd passou a controlar:

```text
start
stop
status
restart
boot
failure recovery
logs
```

Foram estudados:

```bash
systemctl start
systemctl stop
systemctl status
systemctl enable
systemctl show
journalctl
```

Uma falha foi simulada terminando propositalmente o processo Node.js.

O systemd detectou a falha e iniciou uma nova instância automaticamente por causa de:

```text
Restart=on-failure
```

Também foi realizado reboot completo da VPS.

A API iniciou automaticamente sem necessidade de executar manualmente `node server.js`.

### Aprendizado

Nginx e systemd possuem responsabilidades diferentes:

```text
Nginx
→ administra o caminho do tráfego HTTP

systemd
→ administra a vida do processo
```

---

# 09 — PostgreSQL e persistência

**Status:** Concluído

O PostgreSQL 16 foi instalado para adicionar persistência real ao OpsLab.

A arquitetura passou de:

```text
Nginx
   ↓
Node.js
```

para:

```text
Nginx
   ↓
Node.js
   ↓
PostgreSQL
```

O PostgreSQL permaneceu limitado ao loopback:

```text
127.0.0.1:5432
```

A porta `5432` não foi liberada no UFW.

Foram estudados:

* PostgreSQL clusters;
* databases;
* schemas;
* tables;
* roles;
* Unix sockets;
* TCP;
* `peer`;
* SCRAM-SHA-256;
* privilégios;
* princípio do menor privilégio.

Foi criada uma role dedicada para a aplicação:

```text
opslab_app
```

sem privilégios administrativos.

Também foi criado:

```text
database: opslab
```

e inicialmente a tabela:

```text
services
```

A aplicação recebeu somente os privilégios necessários para trabalhar com seus próprios dados.

### Aprendizado

Usuário Linux e role PostgreSQL são identidades diferentes.

Da mesma forma:

```text
root
≠
postgres Linux
≠
postgres PostgreSQL
≠
opslab_app
```

Cada camada possui suas próprias permissões e responsabilidades.

---

# 10 — Secrets e configuração da aplicação

**Status:** Concluído

A senha do banco nunca foi incluída diretamente no código.

Foi criado um arquivo privado na VPS para as variáveis da aplicação.

Modelo:

```text
/etc/opslab/opslab-api.env
```

com informações como:

```text
PGHOST
PGPORT
PGDATABASE
PGUSER
PGPASSWORD
```

O systemd utiliza esse arquivo através de:

```text
EnvironmentFile
```

No GitHub existe apenas um exemplo seguro sem a senha real.

### Aprendizado

Código e segredo não são a mesma coisa.

O repositório deve possuir tudo que for necessário para entender e reconstruir a configuração, mas não deve armazenar credenciais reais.

---

# 11 — CRUD e API persistente

**Status:** Concluído

A API foi integrada ao PostgreSQL utilizando o pacote:

```text
pg
```

Foram criadas operações de CRUD sobre os serviços registrados.

```text
CREATE
POST /services

READ
GET /services

UPDATE
PUT /services/:id

DELETE
DELETE /services/:id
```

As queries utilizaram parâmetros:

```sql
VALUES ($1, $2)
```

em vez de concatenar diretamente valores recebidos pela API.

Também foram implementados tratamentos para situações como:

```text
201 Created
200 OK
400 Bad Request
404 Not Found
500 Internal Server Error
```

Foram testados:

* JSON inválido;
* input inválido;
* registros inexistentes;
* operações persistentes;
* persistência após restart do PostgreSQL.

### Aprendizado

O OpsLab deixou de responder apenas dados fixos e passou a possuir:

```text
HTTP
 ↓
API
 ↓
SQL
 ↓
PostgreSQL
 ↓
dados persistentes
```

---

# 12 — Frontend integrado à infraestrutura real

**Status:** Concluído

O frontend do OpsLab evoluiu de uma página estática para uma interface que consulta informações reais da VPS através da API.

Entre os endpoints utilizados durante a evolução do projeto estão:

```text
/api/health
/api/runtime
/api/system
/api/services
/api/monitoring/history
```

A página passou a exibir informações como:

* estado da aplicação;
* runtime Node.js;
* dados do sistema;
* memória;
* load average;
* serviços registrados;
* infraestrutura configurada;
* histórico de monitoramento.

A atualização dos principais cards ocorre de forma periódica e escalonada para evitar que todas as requisições sejam disparadas exatamente no mesmo instante.

### Aprendizado

O frontend deixou de simplesmente representar visualmente uma infraestrutura.

Ele passou a funcionar como uma janela para dados coletados no ambiente real.

---

# 13 — Monitoramento e histórico

**Status:** Concluído

Foi criada uma camada própria de coleta de snapshots.

O sistema utiliza um serviço de coleta executado periodicamente por um timer do systemd.

Modelo:

```text
opslab-monitor.timer
        ↓
opslab-monitor.service
        ↓
coleta métricas
        ↓
PostgreSQL
        ↓
monitoring_snapshots
```

A coleta é executada aproximadamente a cada:

```text
5 minutos
```

O frontend pode consultar períodos como:

```text
1 hora
6 horas
24 horas
7 dias
```

Isso permitiu observar não apenas o estado instantâneo da VPS, mas também sua evolução ao longo do tempo.

Durante essa etapa também foram encontrados problemas relacionados a dados antigos de monitoramento, o que exigiu inspeção, limpeza e nova validação dos períodos históricos.

### Aprendizado

Há uma diferença importante entre:

```text
estado atual
```

e:

```text
histórico de estados
```

Observabilidade começa a ganhar mais valor quando é possível analisar comportamento ao longo do tempo.

---

# 14 — Analytics first-party

**Status:** Implementado

Também foi introduzido registro próprio de acessos ao laboratório.

Em vez de depender exclusivamente de um serviço externo de analytics, o OpsLab passou a registrar pageviews através de sua própria aplicação e banco de dados.

O fluxo segue aproximadamente:

```text
navegador
   ↓
OpsLab
   ↓
API
   ↓
PostgreSQL
   ↓
pageviews
```

A coleta foi desenvolvida de forma que uma falha no analytics não impeça o carregamento normal da página.

### Aprendizado

Analytics também pode ser tratado como uma funcionalidade de backend.

A aplicação pode registrar sua própria telemetria, desde que isso seja feito conscientemente e sem tornar esse componente um ponto crítico para o funcionamento do site.

---

# 15 — Domínio e Marcos Lab

**Status:** Concluído para publicação HTTP

Durante a evolução do projeto foi criado um novo ambiente e o domínio pessoal passou a apontar para a VPS.

O hostname atual do laboratório passou a ser:

```text
marcos-lab-01
```

O Nginx passou a hospedar mais de uma responsabilidade:

```text
marcosfaquete.com.br
        │
        ├── Marcos Lab
        │
        └── /opslab/
                ↓
              OpsLab
```

A configuração também mantém o backend atrás de:

```text
/api/
```

Isso permitiu transformar a VPS em uma base para diferentes experimentos, mantendo o OpsLab como um dos projetos disponíveis dentro do ambiente.

### Aprendizado

DNS, Nginx e aplicação resolvem problemas diferentes:

```text
DNS
→ encontra o servidor

Nginx
→ decide para onde a requisição deve ir

aplicação
→ processa a lógica da requisição
```

---

# 16 — Reconstrução do ambiente

**Status:** Concluído

Em determinado momento do laboratório, a infraestrutura foi reconstruída em uma nova VPS.

Em vez de tratar isso apenas como perda de ambiente, a reconstrução serviu como exercício para repetir e validar conceitos aprendidos anteriormente.

O novo ambiente recebeu novamente:

* Ubuntu;
* usuário administrativo;
* SSH;
* UFW;
* Nginx;
* Node.js;
* systemd;
* PostgreSQL;
* aplicação;
* frontend;
* configurações do OpsLab.

Esse processo reforçou uma das ideias definidas no início do projeto:

> Uma VPS deve ser tratada como infraestrutura substituível, e não como a única cópia permanente do sistema.

### Aprendizado

Conseguir construir uma infraestrutura uma vez é importante.

Conseguir entender e reconstruir essa infraestrutura é uma evidência muito maior de domínio do processo.

---

# 17 — Deploy, Git e validação operacional

**Status:** Em evolução contínua

O processo de publicação também evoluiu.

Alterações passaram a ser realizadas com maior preocupação em relação a:

* estado do repositório;
* backups;
* staging;
* branches;
* commits;
* Pull Requests;
* merge;
* sincronização entre Git e produção;
* validação depois da publicação.

Entre as verificações utilizadas estão:

```bash
git status
git diff
git diff --cached
git diff --check
```

Na VPS:

```bash
nginx -t
systemctl status
curl
```

Também foram utilizados testes dos endpoints públicos após alterações.

Em mudanças importantes, cópias do estado funcional anterior foram mantidas temporariamente para facilitar rollback.

### Aprendizado

Deploy não significa apenas copiar um arquivo novo para produção.

Um processo mais seguro possui:

```text
alteração
   ↓
revisão
   ↓
backup
   ↓
deploy
   ↓
validação
   ↓
rollback se necessário
   ↓
registro no Git
```

---

# 18 — Segurança em camadas

A segurança do laboratório não depende de uma única ferramenta.

Ela foi construída através de várias decisões complementares:

```text
SSH por chave
        +
usuário administrativo separado
        +
sudo
        +
UFW default deny
        +
somente portas necessárias
        +
Nginx como entrada HTTP
        +
Node.js em loopback
        +
PostgreSQL em loopback
        +
role dedicada no banco
        +
privilégio mínimo
        +
secrets fora do Git
        +
validação antes de reload
        +
backups antes de alterações críticas
```

### Princípio

Segurança não é um botão que deixa o servidor "seguro".

Ela é o resultado de reduzir exposição, separar responsabilidades, controlar privilégios e validar mudanças.

---

# 19 — Principais falhas e troubleshooting

Parte importante do projeto foi entender o que acontece quando alguma camada não funciona.

Entre as situações estudadas estiveram:

### Backend indisponível

```text
Nginx funcionando
        ↓
backend parado
        ↓
502 Bad Gateway
```

### Porta ocupada

```text
EADDRINUSE
```

Foi necessário identificar qual processo já possuía o socket.

### Configuração Nginx

Foi estudada a importância do `Host` e da seleção de server blocks.

### Process failure

Um processo Node.js foi encerrado propositalmente para validar:

```text
Restart=on-failure
```

### Reboot

A VPS foi reiniciada para validar que os serviços retornavam sem intervenção manual.

### Histórico de monitoramento

Dados antigos precisaram ser identificados e corrigidos para que os períodos exibidos representassem corretamente o ambiente atual.

### Aprendizado

Erros deixaram de ser apenas algo a corrigir.

Eles passaram a ser utilizados para compreender qual camada da arquitetura havia falhado.

---

# 20 — Modelo mental do OpsLab

Uma das principais evoluções durante o projeto foi deixar de enxergar o servidor como uma única "caixa".

Hoje o ambiente pode ser compreendido por responsabilidades:

```text
DigitalOcean
→ fornece a infraestrutura virtual

Ubuntu
→ sistema operacional

SSH
→ administração remota

UFW
→ controla exposição de rede

Nginx
→ servidor web e reverse proxy

Node.js
→ runtime da aplicação

systemd
→ gerencia processos e tarefas

PostgreSQL
→ persistência de dados

Git/GitHub
→ versionamento e histórico

OpsLab frontend
→ apresenta o estado do laboratório

monitoring snapshots
→ registram comportamento ao longo do tempo
```

Cada camada possui uma função diferente.

---

# 21 — Principais aprendizados

Durante a construção do OpsLab foram praticados conceitos relacionados a:

## Linux

* filesystem;
* processos;
* usuários;
* grupos;
* permissões;
* ownership;
* sudo;
* systemd;
* journald;
* sockets;
* portas;
* gerenciamento de pacotes;
* kernel e reboot.

## Networking

* public IPv4;
* private IPv4;
* loopback;
* TCP;
* portas;
* firewall;
* DNS;
* HTTP;
* reverse proxy.

## Segurança

* SSH keys;
* Ed25519;
* Host Keys;
* fingerprints;
* `known_hosts`;
* password authentication;
* princípio do menor privilégio;
* isolamento de serviços;
* secrets fora do repositório.

## Web

* Nginx;
* web root;
* server blocks;
* virtual hosts;
* reverse proxy;
* headers HTTP;
* status HTTP.

## Backend

* Node.js;
* npm;
* NVM;
* processos;
* APIs;
* JSON;
* CRUD;
* validação;
* tratamento de erros.

## Banco de dados

* PostgreSQL;
* clusters;
* roles;
* databases;
* schemas;
* tables;
* SQL;
* grants;
* SCRAM-SHA-256;
* queries parametrizadas;
* persistência.

## Operação

* logs;
* health checks;
* monitoramento;
* snapshots;
* timers;
* deploy;
* rollback;
* backups temporários;
* validação pós-deploy.

## Git

* repository;
* status;
* diff;
* staging;
* commits;
* branches;
* Pull Requests;
* merge;
* histórico;
* recuperação.

---

# 22 — Estado atual

Atualmente o OpsLab possui uma infraestrutura funcional que combina:

```text
Cloud VPS
Ubuntu Server
SSH
UFW
Nginx
Node.js
systemd
PostgreSQL
API
frontend integrado
monitoramento
histórico de métricas
analytics first-party
Git/GitHub
domínio próprio
```

O projeto deixou de ser somente um exercício de provisionamento.

Ele passou a funcionar como um laboratório onde infraestrutura, aplicação e observabilidade convivem em um ambiente real.

---

# 23 — Próximas evoluções

As seguintes tecnologias e práticas podem ser estudadas futuramente, mas **não devem ser interpretadas como já implementadas**:

* HTTPS;
* estratégia formal de backup;
* teste completo de restore;
* CI/CD;
* GitHub Actions;
* Docker;
* Prometheus;
* Grafana;
* alertas;
* infraestrutura como código;
* disaster recovery mais completo.

Essas etapas somente devem ser adicionadas ao estado concluído quando forem realmente implementadas e validadas.

---

# Conclusão

O OpsLab começou como um exercício para aprender a colocar uma página HTML dentro de uma VPS.

Durante sua evolução passou a envolver:

```text
servidor
   ↓
segurança
   ↓
rede
   ↓
servidor web
   ↓
runtime
   ↓
API
   ↓
process management
   ↓
banco de dados
   ↓
persistência
   ↓
frontend
   ↓
monitoramento
   ↓
analytics
   ↓
deploy
   ↓
operação
```

Mais importante do que cada ferramenta individual foi compreender como essas camadas se relacionam.

O objetivo do laboratório continua sendo aprender infraestrutura através de uma combinação de:

> **entender, executar, testar, quebrar, diagnosticar, corrigir, documentar e versionar.**
