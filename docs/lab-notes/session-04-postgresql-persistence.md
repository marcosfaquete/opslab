# Session 04 — PostgreSQL, Persistence & Services CRUD

**Project:** OpsLab  
**Date:** 2026-08-12  
**Status:** Concluída até o Repository Checkpoint pré-commit

---

# 1. Objetivo da sessão

A Session 04 teve como objetivo adicionar persistência real ao OpsLab através do PostgreSQL e integrar o banco de dados à API Node.js.

A arquitetura anterior era:

```text
Internet
   ↓
UFW
   ↓
Nginx
   ↓
Node.js API
```

Nesta sessão, a arquitetura evoluiu para:

```text
Internet
   ↓
UFW
   ↓
Nginx
   ↓
Node.js API
   ↓
PostgreSQL
```

O objetivo foi aprender e validar, passo a passo:

- instalação do PostgreSQL;
- funcionamento do serviço PostgreSQL no Ubuntu;
- cluster PostgreSQL;
- processos e usuários Linux relacionados ao banco;
- diferença entre usuário Linux e role PostgreSQL;
- databases;
- schemas;
- tables;
- autenticação local por socket Unix;
- autenticação TCP;
- `pg_hba.conf`;
- `peer`;
- `SCRAM-SHA-256`;
- criação de role de aplicação;
- princípio do menor privilégio;
- criação do database `opslab`;
- criação da tabela `services`;
- grants explícitos;
- persistência após restart;
- integração Node.js → PostgreSQL;
- pacote `pg`;
- credenciais fora do código;
- uso de `EnvironmentFile` no systemd;
- implementação de CRUD;
- queries parametrizadas;
- validação de erros HTTP;
- versionamento seguro no Git.

A filosofia continuou sendo:

> UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT

---

# 2. Estado inicial

Antes desta sessão, o OpsLab já possuía:

```text
Internet
   ↓
UFW
   ↓
Nginx :80
   ↓
reverse proxy /api/
   ↓
Node.js
127.0.0.1:3000
```

A API possuía apenas:

```text
GET /health
```

com resposta:

```json
{"status":"ok"}
```

A aplicação estava em:

```text
/var/www/opslab/app
```

Arquivos principais:

```text
server.js
package.json
```

O processo Node já era gerenciado pelo `systemd` através de:

```text
/etc/systemd/system/opslab-api.service
```

A API também já:
- rodava como usuário Linux `marcos`;
- estava limitada a `127.0.0.1:3000`;
- era acessada externamente através do Nginx;
- iniciava automaticamente no boot;
- utilizava `Restart=on-failure`.

---

# 3. Inspeção antes da instalação

Foi verificado se já existia algum pacote PostgreSQL:

```bash
dpkg -l | grep -i postgresql
```

Resultado:

```text
no output
```

Depois:

```bash
apt-cache policy postgresql
```

Resultado principal:

```text
Installed: (none)
Candidate: 16+257build1.1
```

Também:

```bash
apt-cache depends postgresql
```

Resultado:

```text
postgresql
  Depends: postgresql-16
```

Foi entendido:

```text
postgresql
→ metapacote

postgresql-16
→ servidor PostgreSQL real
```

---

# 4. Simulação da instalação

Foi utilizado:

```bash
sudo apt install --dry-run postgresql
```

A simulação mostrou:

```text
12 newly installed
0 upgraded
0 to remove
```

Principais pacotes:
- `postgresql`;
- `postgresql-16`;
- `postgresql-client-16`;
- `postgresql-client-common`;
- `postgresql-common`;
- `libpq5`;
- `ssl-cert`.

---

# 5. Instalação do PostgreSQL

Foi executado:

```bash
sudo apt install postgresql
```

Depois:

```bash
pg_lsclusters
```

Resultado:

```text
Ver Cluster Port Status Owner    Data directory              Log file
16  main    5432 online postgres /var/lib/postgresql/16/main /var/log/postgresql/postgresql-16-main.log
```

Isso confirmou:

```text
Version:        16
Cluster:        main
Port:           5432
Status:         online
Linux owner:    postgres
Data directory: /var/lib/postgresql/16/main
Log file:       /var/log/postgresql/postgresql-16-main.log
```

---

# 6. Conceito de cluster

No Ubuntu/Debian, um PostgreSQL cluster representa uma instância do PostgreSQL com sua própria configuração, diretório de dados, porta, processos e logs.

```text
VPS
└── PostgreSQL 16
    └── cluster main
        ├── port 5432
        ├── owner Linux postgres
        ├── data /var/lib/postgresql/16/main
        └── log /var/log/postgresql/postgresql-16-main.log
```

---

# 7. Validação de rede

Foi executado:

```bash
sudo ss -ltnp | grep ':5432'
```

Resultado:

```text
127.0.0.1:5432
[::1]:5432
```

Isso confirmou que PostgreSQL estava limitado ao loopback e não exposto no IP público.

Nenhuma regra UFW para `5432` foi criada.

---

# 8. systemd e PostgreSQL

Foi consultado:

```bash
systemctl status postgresql@16-main --no-pager
```

Resultado principal:

```text
Active: active (running)
Main PID: 7835 (postgres)
```

Processos observados:

```text
postgres
├── checkpointer
├── background writer
├── walwriter
├── autovacuum launcher
└── logical replication launcher
```

---

# 9. postgresql.service e postgresql@16-main.service

Foi também consultado:

```bash
systemctl status postgresql --no-pager
```

Resultado:

```text
Active: active (exited)
```

Depois:

```bash
systemctl cat postgresql
```

Conteúdo relevante:

```ini
[Service]
Type=oneshot
ExecStart=/bin/true
ExecReload=/bin/true
RemainAfterExit=on
```

Foi entendido:

```text
postgresql.service
→ meta unit

postgresql@16-main.service
→ serviço real do cluster
```

---

# 10. Template postgresql@.service

Foi executado:

```bash
systemctl cat 'postgresql@.service'
```

Variáveis estudadas:

```text
%i → version-cluster
%I → version/cluster
```

Para esta VPS:

```text
%i = 16-main
%I = 16/main
```

Foi observado:

```ini
ExecStart=-/usr/bin/pg_ctlcluster --skip-systemctl-redirect %i start
```

Modelo:

```text
systemd
   ↓
pg_ctlcluster
   ↓
PostgreSQL 16/main
   ↓
postgres
```

---

# 11. Usuário Linux postgres

Foi validado:

```bash
ps -o user,group,pid,ppid,cmd -p 7835
```

Resultado:

```text
USER      GROUP      PID   PPID
postgres  postgres   7835     1
```

Também:

```bash
getent passwd postgres
```

Resultado:

```text
postgres:x:109:113:PostgreSQL administrator,,,:/var/lib/postgresql:/bin/bash
```

Foi entendido:

```text
Linux user postgres
≠
PostgreSQL role postgres
```

---

# 12. Primeira conexão com psql

Foi executado:

```bash
sudo -u postgres psql -c '\conninfo'
```

Resultado:

```text
You are connected to database "postgres"
as user "postgres"
via socket in "/var/run/postgresql"
at port "5432".
```

Fluxo:

```text
marcos
   ↓ sudo -u postgres
Linux user postgres
   ↓
psql
   ↓
Unix socket
/var/run/postgresql
   ↓
PostgreSQL
   ↓
role postgres
   ↓
database postgres
```

---

# 13. Roles PostgreSQL

Foi executado:

```bash
sudo -u postgres psql -c '\du'
```

Resultado:

```text
postgres | Superuser, Create role, Create DB, Replication, Bypass RLS
```

Foram estudados os atributos:
- `SUPERUSER`;
- `CREATEROLE`;
- `CREATEDB`;
- `REPLICATION`;
- `BYPASSRLS`.

Foi decidido que a aplicação Node não utilizaria a role administrativa `postgres`.

---

# 14. Databases padrão

Foi executado:

```bash
sudo -u postgres psql -c '\l'
```

Databases encontrados:

```text
postgres
template0
template1
```

---

# 15. Schemas e tabelas

Foi consultado:

```bash
sudo -u postgres psql -d postgres -c '\dn'
```

Resultado:

```text
public | pg_database_owner
```

Depois:

```bash
sudo -u postgres psql -d postgres -c '\dt'
```

Resultado:

```text
Did not find any relations.
```

Hierarquia estudada:

```text
cluster
  ↓
database
  ↓
schema
  ↓
table
  ↓
rows
```

---

# 16. pg_hba.conf

Foi inspecionado:

```bash
sudo grep -vE '^[[:space:]]*(#|$)' /etc/postgresql/16/main/pg_hba.conf
```

Regras principais:

```text
local   all   postgres                 peer
local   all   all                      peer
host    all   all   127.0.0.1/32      scram-sha-256
host    all   all   ::1/128           scram-sha-256
```

Foi estudado:

```text
local
→ Unix socket

host
→ TCP/IP
```

---

# 17. Peer authentication

A autenticação local utiliza `peer`.

Modelo:

```text
Linux postgres
       ↓ peer
PostgreSQL role postgres
```

Por isso:

```bash
sudo -u postgres psql
```

funciona sem senha PostgreSQL.

---

# 18. SCRAM-SHA-256

Foi consultado:

```bash
sudo -u postgres psql -tAc "SHOW password_encryption;"
```

Resultado:

```text
scram-sha-256
```

Modelo:

```text
Node.js
   ↓
TCP
   ↓
127.0.0.1:5432
   ↓
SCRAM-SHA-256
   ↓
PostgreSQL
```

---

# 19. Criação da role opslab_app

Foi executado:

```bash
sudo -u postgres psql -c "CREATE ROLE opslab_app LOGIN;"
```

Resultado:

```text
CREATE ROLE
```

Depois:

```bash
sudo -u postgres psql -c '\du opslab_app'
```

Resultado:

```text
Role name  | Attributes
-----------+-----------
opslab_app |
```

A role não recebeu poderes administrativos especiais.

---

# 20. Definição segura da senha

Foi utilizado:

```bash
sudo -u postgres psql
```

Depois:

```text
\password opslab_app
```

A senha foi informada interativamente e não registrada nesta documentação.

---

# 21. Teste TCP da opslab_app

Foi executado:

```bash
psql -h 127.0.0.1 -U opslab_app -d postgres -W
```

Depois:

```text
\conninfo
```

Resultado confirmou:

```text
database postgres
user opslab_app
host 127.0.0.1
port 5432
SSL TLSv1.3
```

---

# 22. Criação do database opslab

Foi executado:

```bash
sudo -u postgres psql -c "CREATE DATABASE opslab OWNER postgres;"
```

Resultado:

```text
CREATE DATABASE
```

Depois foi validado com:

```bash
sudo -u postgres psql -c '\l'
```

Resultado:

```text
opslab | postgres | UTF8 ...
```

---

# 23. Schema public no database opslab

Foi executado:

```bash
sudo -u postgres psql -d opslab -c '\dn+'
```

Foi observado:

```text
public | pg_database_owner
```

Privilégios:

```text
pg_database_owner=UC
=U
```

Onde:

```text
U = USAGE
C = CREATE
```

Foi validado para `opslab_app`:

```text
CONNECT      true
schema USAGE true
schema CREATE false
```

---

# 24. Criação da tabela services

Foi criada:

```sql
CREATE TABLE public.services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Depois:

```bash
sudo -u postgres psql -d opslab -c '\d public.services'
```

Estrutura confirmada:

```text
id         bigint      identity     primary key
name       text        not null
status     text        not null     default 'unknown'
created_at timestamptz not null     default now()
```

---

# 25. Teste de negação antes do GRANT

Foi executado como `opslab_app`:

```bash
psql -h 127.0.0.1 -U opslab_app -d opslab -W -c "SELECT * FROM public.services;"
```

Resultado:

```text
ERROR: permission denied for table services
```

Isso comprovou que acesso ao database não significa acesso automático à tabela.

---

# 26. GRANT para opslab_app

Foram concedidos somente:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.services
TO opslab_app;
```

Foi validado com:

```bash
sudo -u postgres psql -d opslab -c '\dp public.services'
```

Resultado relevante:

```text
opslab_app=arwd/postgres
```

Onde:

```text
a = INSERT
r = SELECT
w = UPDATE
d = DELETE
```

---

# 27. Primeiro INSERT persistente

Foi executado:

```bash
psql -h 127.0.0.1 -U opslab_app -d opslab -W -c "INSERT INTO public.services (name, status) VALUES ('Nginx', 'online') RETURNING *;"
```

Resultado:

```text
id: 1
name: Nginx
status: online
```

O PostgreSQL gerou automaticamente `id` e `created_at`.

---

# 28. Leitura do dado persistido

Foi executado:

```bash
psql -h 127.0.0.1 -U opslab_app -d opslab -W -c "SELECT id, name, status, created_at FROM public.services;"
```

Resultado:

```text
1 | Nginx | online | ...
```

---

# 29. Teste de persistência após restart

Foi executado:

```bash
sudo systemctl restart postgresql@16-main
```

Depois:

```bash
systemctl status postgresql@16-main --no-pager
```

Resultado:

```text
Active: active (running)
```

Um novo PID foi criado.

A tabela foi consultada novamente e o registro continuou existindo.

Persistência comprovada.

---

# 30. Instalação do driver pg

No diretório:

```text
/var/www/opslab/app
```

foi executado:

```bash
npm install pg
```

Resultado:

```text
added 14 packages
audited 15 packages
found 0 vulnerabilities
```

O `package.json` passou a conter:

```json
"dependencies": {
  "pg": "^8.23.0"
}
```

Também foi criado:

```text
package-lock.json
```

---

# 31. Estratégia de credenciais

Foi decidido manter senha fora do código.

Arquitetura:

```text
/etc/opslab/opslab-api.env
        ↓
systemd
        ↓
opslab-api.service
        ↓
Node.js
        ↓
pg
        ↓
PostgreSQL
```

---

# 32. Diretório privado

Foi criado:

```bash
sudo mkdir -p /etc/opslab
```

Depois:

```bash
sudo chmod 750 /etc/opslab
```

Resultado:

```text
drwxr-x--- root root /etc/opslab
```

---

# 33. Environment file privado

Foi criado:

```text
/etc/opslab/opslab-api.env
```

Estrutura:

```text
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=opslab
PGUSER=opslab_app
PGPASSWORD=<senha real>
```

A senha real não é documentada.

Permissões:

```bash
sudo chmod 600 /etc/opslab/opslab-api.env
```

Resultado:

```text
-rw------- root root /etc/opslab/opslab-api.env
```

---

# 34. Backup da unit systemd

Foi criado:

```text
/etc/systemd/system/opslab-api.service.bak
```

---

# 35. EnvironmentFile no systemd

A unit passou a conter:

```ini
EnvironmentFile=/etc/opslab/opslab-api.env
```

Foi validada com:

```bash
sudo systemd-analyze verify /etc/systemd/system/opslab-api.service
```

Sem erros.

Depois:

```bash
sudo systemctl daemon-reload
```

E:

```bash
sudo systemctl show opslab-api -p EnvironmentFiles
```

Resultado:

```text
EnvironmentFiles=/etc/opslab/opslab-api.env (ignore_errors=no)
```

---

# 36. Restart da API

Foi executado:

```bash
sudo systemctl restart opslab-api
```

O serviço voltou como:

```text
Active: active (running)
```

O `/health` continuou funcionando.

---

# 37. Teste isolado Node.js → PostgreSQL

Foi criado temporariamente:

```text
db-test.js
```

O teste utilizou:

```js
const { Pool } = require("pg");
const pool = new Pool();
```

Foi executado com o ambiente do systemd através de `systemd-run`.

Resultado:

```text
id: '1'
name: 'Nginx'
status: 'online'
Finished with result: success
```

Isso provou Node.js → `pg` → PostgreSQL.

---

# 38. Backups do server.js

Durante a evolução foram criados:

```text
server.js.bak-pre-postgres
server.js.bak-get-services
server.js.bak-get-post-services
server.js.bak-get-post-put-services
```

Esses backups ficaram apenas na VPS e não devem ser versionados.

---

# 39. GET /services

Foi adicionada:

```text
GET /services
```

Query:

```sql
SELECT id, name, status, created_at
FROM public.services
ORDER BY id;
```

Foi validada a sintaxe com:

```bash
node --check /var/www/opslab/app/server.js
```

Sem erros.

---

# 40. Teste local GET /services

Foi executado:

```bash
curl -i http://127.0.0.1:3000/services
```

Resultado:

```text
HTTP/1.1 200 OK
```

e o registro `Nginx`.

---

# 41. Teste público GET /api/services

No Windows:

```powershell
curl.exe -i http://167.99.232.38/api/services
```

Resultado:

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
```

Fluxo validado:

```text
Windows
   ↓
Internet
   ↓
UFW
   ↓
Nginx
   ↓
Node.js
   ↓
pg
   ↓
PostgreSQL
   ↓
JSON
```

---

# 42. POST /services — CREATE

Foi implementado:

```text
POST /services
```

Body:

```json
{
  "name": "PostgreSQL",
  "status": "online"
}
```

Query parametrizada:

```sql
INSERT INTO public.services (name, status)
VALUES ($1, $2)
RETURNING id, name, status, created_at;
```

Foi utilizado `201 Created`.

---

# 43. SQL parametrizado

Foi adotado:

```text
SQL com placeholders
+
valores separados
```

Exemplo:

```sql
VALUES ($1, $2)
```

com:

```js
[body.name.trim(), body.status.trim()]
```

Isso evita concatenar entrada do usuário diretamente na query e reduz risco de SQL Injection.

---

# 44. Teste do POST

Foi executado:

```bash
curl -i -X POST http://127.0.0.1:3000/services   -H "Content-Type: application/json"   -d '{"name":"PostgreSQL","status":"online"}'
```

Resultado:

```text
HTTP/1.1 201 Created
```

Foi criado o registro `id 2`.

---

# 45. PUT /services/:id — UPDATE

Foi implementado:

```text
PUT /services/:id
```

Query:

```sql
UPDATE public.services
SET name = $1, status = $2
WHERE id = $3
RETURNING id, name, status, created_at;
```

---

# 46. Teste do PUT

Foi executado:

```bash
curl -i -X PUT http://127.0.0.1:3000/services/2   -H "Content-Type: application/json"   -d '{"name":"PostgreSQL","status":"maintenance"}'
```

Resultado:

```text
HTTP/1.1 200 OK
```

O status foi alterado para `maintenance`.

---

# 47. DELETE /services/:id

Foi implementado:

```text
DELETE /services/:id
```

Query:

```sql
DELETE FROM public.services
WHERE id = $1
RETURNING id, name, status, created_at;
```

---

# 48. Teste do DELETE

Foi executado:

```bash
curl -i -X DELETE http://127.0.0.1:3000/services/2
```

Resultado:

```text
HTTP/1.1 200 OK
```

O registro removido foi devolvido pela API.

Depois, `GET /services` confirmou que somente `Nginx` permanecia.

---

# 49. CRUD completo

```text
CREATE
POST /services
✅

READ
GET /services
✅

UPDATE
PUT /services/:id
✅

DELETE
DELETE /services/:id
✅
```

---

# 50. Teste 404

Foi repetido:

```bash
curl -i -X DELETE http://127.0.0.1:3000/services/2
```

Resultado:

```text
HTTP/1.1 404 Not Found
{"error":"service_not_found"}
```

---

# 51. Teste invalid_json

Foi enviado JSON malformado.

Resultado:

```text
HTTP/1.1 400 Bad Request
{"error":"invalid_json"}
```

---

# 52. Teste invalid_input

Foi enviado:

```json
{"name":"","status":"online"}
```

Resultado:

```text
HTTP/1.1 400 Bad Request
{"error":"invalid_input"}
```

---

# 53. Tratamento HTTP atual

```text
201 Created
→ create

200 OK
→ read / update / delete

400 Bad Request
→ invalid_json
→ invalid_input

404 Not Found
→ service_not_found

500 Internal Server Error
→ database_error
```

---

# 54. Logs da API

Foi executado:

```bash
sudo journalctl -u opslab-api -n 30 --no-pager
```

Não foram observados erros atuais de banco.

Os logs mostraram somente restarts administrativos esperados.

---

# 55. Arquivos atualizados na VPS

```text
/var/www/opslab/app/server.js
/var/www/opslab/app/package.json
/var/www/opslab/app/package-lock.json
/etc/systemd/system/opslab-api.service
```

---

# 56. Repository Checkpoint — Windows

Foram copiados para:

```text
C:\Projetos\opslab
```

os arquivos:

```text
app/server.js
app/package.json
app/package-lock.json
infra/systemd/opslab-api.service
```

Estado observado:

```text
M app/package.json
M app/server.js
M infra/systemd/opslab-api.service
?? app/package-lock.json
```

---

# 57. Environment example seguro

Foi criado:

```text
infra/env/opslab-api.env.example
```

Conteúdo:

```text
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=opslab
PGUSER=opslab_app
PGPASSWORD=CHANGE_ME
```

A senha real continua apenas na VPS.

---

# 58. SQL versionável

Foi criado:

```text
infra/postgresql/001-initial-schema.sql
```

Conteúdo:

```sql
-- OpsLab initial PostgreSQL schema
-- Run against the "opslab" database using an administrative role.

CREATE TABLE public.services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.services
TO opslab_app;
```

---

# 59. Verificações antes do commit

Foi validado:

```powershell
Select-String -Path .\infra\env\opslab-api.env.example -Pattern '^PGPASSWORD=CHANGE_ME$'
```

Resultado:

```text
PGPASSWORD=CHANGE_ME
```

Também:

```powershell
Get-ChildItem -Recurse -File -Filter "opslab-api.env"
```

Resultado:

```text
no output
```

Logo, o arquivo real de credenciais não está no repositório.

Foi executado:

```powershell
git diff --check
```

Não houve erro de conteúdo. Apenas avisos de conversão `LF` → `CRLF`.

---

# 60. Estrutura atual do repositório

```text
opslab/
├── app/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── infra/
│   ├── env/
│   │   └── opslab-api.env.example
│   ├── nginx/
│   │   └── opslab.conf
│   ├── postgresql/
│   │   └── 001-initial-schema.sql
│   └── systemd/
│       └── opslab-api.service
│
└── docs/
    └── lab-notes/
```

---

# 61. Arquivos que NÃO devem ser versionados

```text
/etc/opslab/opslab-api.env
node_modules/
db-test.js
server.js.bak-*
opslab-api.service.bak
private keys
passwords
tokens
credentials
```

---

# 62. Arquitetura atual

```text
                       INTERNET
                          |
                     Public IPv4
                          |
                         UFW
                          |
                       TCP/80
                          |
                        Nginx
                          |
                       /api/
                          |
                    reverse proxy
                          |
                  127.0.0.1:3000
                          |
                       Node.js
                          |
                         pg
                          |
                  127.0.0.1:5432
                          |
                    PostgreSQL 16
                          |
                  database: opslab
                          |
                  schema: public
                          |
                   table: services
```

---

# 63. Arquitetura de identidades

Linux:

```text
root
→ administração

marcos
→ executa Node.js

postgres
→ executa PostgreSQL
```

PostgreSQL:

```text
postgres
→ administração

opslab_app
→ aplicação
→ LOGIN
→ SELECT
→ INSERT
→ UPDATE
→ DELETE
```

---

# 64. Fluxo de autenticação da aplicação

```text
Node.js
   ↓
systemd EnvironmentFile
   ↓
PGHOST / PGPORT / PGDATABASE
PGUSER / PGPASSWORD
   ↓
pg
   ↓
TCP
   ↓
127.0.0.1:5432
   ↓
SCRAM-SHA-256
   ↓
PostgreSQL
```

---

# 65. Fluxo administrativo PostgreSQL

```text
marcos
   ↓
sudo -u postgres
   ↓
Linux user postgres
   ↓
psql
   ↓
Unix socket
   ↓
peer
   ↓
PostgreSQL role postgres
```

---

# 66. Princípio de menor privilégio

Linux:

```text
root
→ administração

marcos
→ aplicação
```

PostgreSQL:

```text
postgres
→ administração

opslab_app
→ aplicação
```

A aplicação não roda com privilégios máximos nem no Linux nem no PostgreSQL.

---

# 67. Current State

## PostgreSQL

- [x] PostgreSQL 16 instalado;
- [x] cluster `16/main` online;
- [x] data directory identificado;
- [x] logs identificados;
- [x] porta 5432 limitada ao loopback;
- [x] serviço systemd estudado;
- [x] usuário Linux `postgres` identificado;
- [x] role administrativa `postgres` estudada;
- [x] autenticação `peer` estudada;
- [x] autenticação `SCRAM-SHA-256` estudada;
- [x] role `opslab_app` criada;
- [x] database `opslab` criado;
- [x] schema `public` estudado;
- [x] tabela `services` criada;
- [x] privilégios mínimos concedidos;
- [x] persistência após restart validada.

## Node.js / API

- [x] pacote `pg` instalado;
- [x] `package-lock.json` criado;
- [x] credenciais fora do código;
- [x] `EnvironmentFile` configurado no systemd;
- [x] conexão Node → PostgreSQL validada;
- [x] `GET /services`;
- [x] `POST /services`;
- [x] `PUT /services/:id`;
- [x] `DELETE /services/:id`;
- [x] queries parametrizadas;
- [x] validação de JSON;
- [x] validação de input;
- [x] `404 service_not_found`;
- [x] `500 database_error` implementado;
- [x] teste público via Nginx.

## Repository Checkpoint

- [x] `server.js` atualizado localmente;
- [x] `package.json` atualizado;
- [x] `package-lock.json` copiado;
- [x] `opslab-api.service` atualizado;
- [x] `.env.example` seguro criado;
- [x] schema SQL versionável criado;
- [x] verificação de segredo real realizada;
- [ ] commit;
- [ ] push.

---

# 68. Commit sugerido

```text
feat: add PostgreSQL persistence and services CRUD
```

---

# 69. Próximos passos

Depois do commit e push:

- consolidar documentação no repositório;
- atualizar arquitetura;
- decidir o escopo da Session 05;
- criar migrations/bootstrap mais organizado;
- estudar backup/restore PostgreSQL;
- melhorar logging;
- considerar `GET /services/:id`;
- integrar frontend com dados reais;
- definir estados válidos;
- futuramente criar incidentes e histórico de status;
- avançar depois para autenticação, HTTPS e observabilidade.

Sem implementar tudo de uma vez.

---

# 70. Resultado da Session 04

Antes:

```text
GET /health
   ↓
Node.js
   ↓
resposta fixa
```

Depois:

```text
HTTP Client
   ↓
Nginx
   ↓
Node.js
   ↓
pg
   ↓
PostgreSQL
   ↓
dados persistentes
```

CRUD atual:

```text
POST   /services
GET    /services
PUT    /services/:id
DELETE /services/:id
```

O OpsLab passou de uma API sem persistência para uma aplicação com:

- banco relacional;
- role de aplicação dedicada;
- autenticação segura;
- privilégio mínimo;
- dados persistentes;
- CRUD HTTP;
- queries parametrizadas;
- secrets fora do código;
- integração com systemd;
- estrutura versionável no Git.

A milestone **PostgreSQL & Persistence** está concluída até o Repository Checkpoint pré-commit.

O projeto continua seguindo:

> UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT
