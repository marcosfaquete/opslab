# Session 03 — Process Management & systemd
# Repository checkpoint / PostgreSQL / Persistence

Date: 2026-08-11

## Objective

Transformar a OpsLab API de um processo Node.js iniciado manualmente em um serviço Linux gerenciado pelo `systemd`.

O objetivo desta sessão foi entender e validar:

- diferença entre processo manual e serviço gerenciado;
- papel do `systemd`;
- papel do comando `systemctl`;
- criação de uma unit `.service`;
- usuário responsável pelo processo;
- diretório de trabalho;
- uso de caminho absoluto para o runtime Node.js;
- start, stop, status e restart automático;
- comportamento do Nginx quando o backend está indisponível;
- logs do serviço com `journalctl`;
- recuperação automática após falha;
- inicialização automática no boot;
- validação completa após reboot da VPS.

A arquitetura HTTP construída na Session 02 permaneceu a mesma:

```text
Internet
   ↓
UFW
   ↓
Nginx :80
   ↓
reverse proxy
   ↓
127.0.0.1:3000
   ↓
Node.js API
```

Nesta sessão foi adicionada uma nova camada de **gerenciamento de processo**:

```text
systemd
   ↓
opslab-api.service
   ↓
Node.js
   ↓
server.js
   ↓
127.0.0.1:3000
```

O `systemd` não participa do caminho das requisições HTTP. Ele é responsável por iniciar, parar, supervisionar e recuperar o processo da aplicação.

---

# Initial State

No início desta sessão, a aplicação já possuía:

- Node.js 24 instalado via NVM;
- backend em `/var/www/opslab/app/server.js`;
- projeto Node.js com `package.json`;
- endpoint `GET /health`;
- bind em `127.0.0.1:3000`;
- Nginx configurado como reverse proxy em `/api/`;
- porta `3000` não exposta no UFW;
- acesso externo validado através de:

```text
http://<PUBLIC_IP>/api/health
```

Porém, o backend ainda dependia de execução manual:

```bash
node server.js
```

Isso significava que a aplicação ainda não possuía um ciclo de vida operacional controlado pelo sistema.

---

# Manual Process Inspection

Antes de criar o serviço, foi verificado se ainda existia um processo Node.js executando `server.js`.

Command:

```bash
ps -ef | grep '[n]ode .*server.js'
```

Result:

```text
no output
```

Nenhum processo correspondente estava ativo.

Também foi inspecionada a porta `3000`:

```bash
ss -ltnp | grep ':3000'
```

Result:

```text
no output
```

Isso confirmou:

```text
no Node process
      ↓
no listener on 127.0.0.1:3000
      ↓
backend unavailable
```

---

# Reverse Proxy Failure Without Backend

Com o Nginx ainda ativo e o backend indisponível, foi executado:

```bash
curl -i http://<PUBLIC_IP>/api/health
```

Observed response:

```text
HTTP/1.1 502 Bad Gateway
Server: nginx/1.24.0 (Ubuntu)
Content-Type: text/html
```

This demonstrated:

```text
Client
   ↓
Nginx ✅
   ↓
127.0.0.1:3000
   ↓
no backend process ❌
   ↓
502 Bad Gateway
```

O `502 Bad Gateway` mostrou que o Nginx estava funcionando normalmente, mas não conseguia alcançar o upstream configurado.

---

# Application File Validation

Antes de criar o serviço, o arquivo principal da aplicação foi validado:

```bash
ls -l /var/www/opslab/app/server.js
```

Observed result:

```text
-rw-rw-r-- 1 marcos marcos 535 Aug 10 07:07 /var/www/opslab/app/server.js
```

This confirmed:

- application file existed;
- owner was `marcos`;
- group was `marcos`;
- expected path was correct.

---

# systemd Unit Creation

A dedicated systemd service was created at:

```text
/etc/systemd/system/opslab-api.service
```

Command used:

```bash
sudo nano /etc/systemd/system/opslab-api.service
```

Configuration:

```ini
[Unit]
Description=OpsLab API
After=network.target

[Service]
Type=simple
User=marcos
WorkingDirectory=/var/www/opslab/app
ExecStart=/home/marcos/.nvm/versions/node/v24.19.0/bin/node /var/www/opslab/app/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

# systemd Unit Explanation

## `[Unit]`

```ini
[Unit]
Description=OpsLab API
After=network.target
```

`Description` provides a human-readable service name.

`After=network.target` establishes startup ordering so the service is started after the basic networking target.

---

## `[Service]`

```ini
Type=simple
```

The process started by `ExecStart` is treated as the main service process.

```ini
User=marcos
```

The API runs as the non-root user `marcos`.

This follows the principle of least privilege.

The system administrator controls the service through systemd, but the application process itself does not run as `root`.

```ini
WorkingDirectory=/var/www/opslab/app
```

This defines the application working directory.

Conceptually, it is equivalent to entering:

```bash
cd /var/www/opslab/app
```

before starting the application.

---

# Absolute Node.js Runtime Path

The Node.js runtime had previously been installed using NVM.

Validated path:

```text
/home/marcos/.nvm/versions/node/v24.19.0/bin/node
```

The systemd unit therefore uses:

```ini
ExecStart=/home/marcos/.nvm/versions/node/v24.19.0/bin/node /var/www/opslab/app/server.js
```

instead of:

```text
node server.js
```

This was done because systemd services should not depend on an interactive shell loading:

```text
~/.bashrc
NVM environment
interactive PATH
```

The service explicitly declares which Node.js executable must be used.

---

# Restart Policy

The unit contains:

```ini
Restart=on-failure
```

This means systemd should attempt to restart the application if its main process exits because of a failure.

It does not mean that an intentional:

```bash
systemctl stop opslab-api
```

should immediately start the application again.

This distinction was tested later in the session.

---

# Boot Target

The unit contains:

```ini
[Install]
WantedBy=multi-user.target
```

This makes it possible to enable the service as part of the normal multi-user boot target.

The service was not enabled immediately. Startup behavior was tested only after manual lifecycle validation.

---

# Unit File Inspection

After saving the service, the file was inspected:

```bash
cat /etc/systemd/system/opslab-api.service
```

The stored configuration matched the intended unit definition.

---

# Unit File Validation

The service file was validated before loading it into systemd:

```bash
sudo systemd-analyze verify /etc/systemd/system/opslab-api.service
```

Result:

```text
no output
```

No unit syntax or directive errors were reported.

---

# systemd Daemon Reload

Because a new unit file had been created, systemd was instructed to reload its service definitions:

```bash
sudo systemctl daemon-reload
```

This did not start the API.

It only made systemd aware of the new or changed unit configuration.

---

# First systemd Start

The OpsLab API was started through systemd:

```bash
sudo systemctl start opslab-api
```

The service status was inspected:

```bash
sudo systemctl status opslab-api
```

Observed state:

```text
Loaded: loaded (/etc/systemd/system/opslab-api.service; disabled; preset: enabled)
Active: active (running)
Main PID: 12299
```

The journal shown by `systemctl status` also contained:

```text
Started opslab-api.service - OpsLab API.
OpsLab API listening on http://127.0.0.1:3000
```

This confirmed that the application had been started by systemd rather than by an interactive terminal.

---

# Listening Socket Validation

The backend socket was validated:

```bash
ss -ltnp | grep ':3000'
```

Observed result:

```text
LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("MainThread",pid=12299,fd=21))
```

This proved that:

- the systemd-managed Node.js process was running;
- PID `12299` owned the listener;
- the application remained bound to `127.0.0.1`;
- TCP/3000 was still internal to the VPS.

---

# Reverse Proxy Validation With systemd-Managed Backend

With the API running under systemd, the existing Nginx reverse proxy continued to function.

The effective request path remained:

```text
Client
   ↓
Nginx :80
   ↓
/api/
   ↓
proxy_pass
   ↓
127.0.0.1:3000
   ↓
Node.js
```

The introduction of systemd did not modify the HTTP request path.

systemd manages the process lifecycle; Nginx manages HTTP traffic.

---

# Service Stop Test

The service was intentionally stopped:

```bash
sudo systemctl stop opslab-api
```

Status:

```bash
sudo systemctl status opslab-api
```

Observed state:

```text
Active: inactive (dead)
```

Journal entries included:

```text
Stopping opslab-api.service - OpsLab API...
opslab-api.service: Deactivated successfully.
Stopped opslab-api.service - OpsLab API.
```

This was an intentional administrative stop rather than an application failure.

---

# 502 Validation After Intentional Stop

With the API stopped, the endpoint was tested again:

```bash
curl -i http://<PUBLIC_IP>/api/health
```

Observed response:

```text
HTTP/1.1 502 Bad Gateway
Server: nginx/1.24.0 (Ubuntu)
```

This demonstrated that:

```text
Nginx remained active ✅
Node.js backend was stopped ❌
127.0.0.1:3000 had no listener
Nginx returned 502
```

---

# Service Start After Stop

The application was started again with:

```bash
sudo systemctl start opslab-api
```

The new service process received:

```text
Main PID: 12652
```

The application returned to:

```text
Active: active (running)
```

---

# Main PID Inspection

The PID known by systemd was inspected directly:

```bash
systemctl show opslab-api -p MainPID
```

Observed result:

```text
MainPID=12652
```

This identified the Node.js process supervised by systemd.

---

# Restart-on-Failure Test

To simulate an unexpected process failure, the main application process was killed directly:

```bash
kill -9 12652
```

The old process disappeared.

systemd detected the abnormal termination and, because of:

```ini
Restart=on-failure
```

started another process automatically.

A new inspection showed:

```bash
systemctl show opslab-api -p MainPID
```

Result:

```text
MainPID=13017
```

The service remained:

```text
Active: active (running)
```

systemd status showed:

```text
opslab-api.service: Scheduled restart job
Started opslab-api.service - OpsLab API.
OpsLab API listening on http://127.0.0.1:3000
```

This proved that systemd automatically recovered the backend from the simulated failure.

---

# Second Failure Recovery Test

The recovery behavior was tested a second time.

Current process:

```text
PID 13017
```

Command:

```bash
kill -9 13017
```

systemd again detected the failure.

A new process was created:

```text
Main PID: 13101
```

The service remained operational.

This confirmed that restart behavior was repeatable and not a one-time event.

---

# systemctl stop vs Process Failure

The session demonstrated two different service lifecycle events.

## Intentional stop

```bash
sudo systemctl stop opslab-api
```

Result:

```text
systemd knows the stop was requested
        ↓
service becomes inactive
        ↓
Restart=on-failure does not fight the administrator
```

## Unexpected process death

```bash
kill -9 <MAIN_PID>
```

Result:

```text
Node.js process dies unexpectedly
        ↓
systemd detects failure
        ↓
Restart=on-failure applies
        ↓
new Node.js process starts
```

---

# systemd Journal

Service logs were inspected with:

```bash
sudo journalctl -u opslab-api -n 20 --no-pager
```

The journal showed the complete lifecycle history.

Observed sequence included:

```text
Started opslab-api.service - OpsLab API.
OpsLab API listening on http://127.0.0.1:3000
```

Intentional stop:

```text
Stopping opslab-api.service - OpsLab API...
opslab-api.service: Deactivated successfully.
Stopped opslab-api.service - OpsLab API.
```

First simulated failure:

```text
opslab-api.service: Main process exited, code=killed, status=9/KILL
opslab-api.service: Failed with result 'signal'.
opslab-api.service: Scheduled restart job, restart counter is at 1.
Started opslab-api.service - OpsLab API.
```

Second simulated failure:

```text
opslab-api.service: Main process exited, code=killed, status=9/KILL
opslab-api.service: Failed with result 'signal'.
opslab-api.service: Scheduled restart job, restart counter is at 2.
Started opslab-api.service - OpsLab API.
```

The application `console.log()` output was also captured by the journal:

```text
OpsLab API listening on http://127.0.0.1:3000
```

This demonstrated that the application no longer depends on an interactive terminal for standard output logging.

---

# systemd and systemctl Mental Model

A conceptual distinction was established during the session:

```text
systemd
→ Linux service manager

systemctl
→ command-line control interface used to communicate with systemd
```

Example administrative flow:

```text
Administrator
      ↓
systemctl
      ↓
systemd
      ↓
opslab-api.service
      ↓
Node.js
```

This is separate from the HTTP request path:

```text
Client
   ↓
Internet
   ↓
UFW
   ↓
Nginx
   ↓
Node.js
```

A useful summary:

```text
Nginx manages traffic to the application.
systemd manages the life of the application.
systemctl is the command used to control systemd.
```

---

# Enable Service at Boot

Before enablement, the service status showed:

```text
disabled
```

This meant the application could be started manually by systemd but was not yet configured to start automatically during normal boot.

The service was enabled:

```bash
sudo systemctl enable opslab-api
```

Observed output:

```text
Created symlink /etc/systemd/system/multi-user.target.wants/opslab-api.service → /etc/systemd/system/opslab-api.service.
```

This linked the service to:

```text
multi-user.target
```

Boot enablement was validated:

```bash
systemctl is-enabled opslab-api
```

Result:

```text
enabled
```

The distinction became:

```text
active
→ service is running now

enabled
→ service is configured to start during boot
```

---

# Reboot Validation

A full VPS reboot was performed:

```bash
sudo reboot
```

The SSH session disconnected as expected.

After the server returned, a new SSH session was opened.

No manual application command was executed.

Specifically, the following were **not** required:

```bash
node server.js
```

or:

```bash
sudo systemctl start opslab-api
```

The service was inspected immediately:

```bash
systemctl status opslab-api
```

Observed state:

```text
Loaded: loaded (/etc/systemd/system/opslab-api.service; enabled; preset: enabled)
Active: active (running)
Main PID: 776
```

Journal output included:

```text
OpsLab API listening on http://127.0.0.1:3000
```

This proved that the application was automatically started by systemd during the boot sequence.

---

# Post-Reboot External Validation

The final validation was executed externally from Windows PowerShell:

```powershell
curl.exe -i http://<PUBLIC_IP>/api/health
```

Observed response:

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"status":"ok"}
```

This proved the complete post-reboot architecture:

```text
VPS boot
   ↓
systemd
   ├── Nginx service
   └── OpsLab API service
            ↓
         Node.js
            ↓
      127.0.0.1:3000
            ↑
            │
          Nginx
            ↑
           UFW
            ↑
        Internet
            ↑
         Windows
```

The complete application path returned to operation without manual process startup.

---

# Final systemd Service State

The OpsLab API now has:

```text
service definition      ✅
systemd management      ✅
non-root execution      ✅
working directory       ✅
absolute Node path      ✅
manual start            ✅
manual stop             ✅
status inspection       ✅
failure detection       ✅
automatic restart       ✅
journald logging        ✅
boot enablement         ✅
post-reboot startup     ✅
external validation     ✅
```

---

# Current Application Lifecycle

Before Session 03:

```text
SSH session
    ↓
node server.js
    ↓
Node process
    ↓
127.0.0.1:3000
```

After Session 03:

```text
Linux boot
   ↓
systemd
   ↓
opslab-api.service
   ↓
Node.js
   ↓
server.js
   ↓
127.0.0.1:3000
```

Administrative lifecycle:

```text
systemctl start opslab-api
systemctl stop opslab-api
systemctl status opslab-api
```

Failure recovery:

```text
Node process failure
        ↓
systemd
        ↓
Restart=on-failure
        ↓
new Node process
```

---

# Files Created or Modified

Created:

```text
/etc/systemd/system/opslab-api.service
```

Existing application files used:

```text
/var/www/opslab/app/server.js
/var/www/opslab/app/package.json
```

Existing Nginx reverse proxy used:

```text
/etc/nginx/sites-available/opslab
```

No firewall rule for TCP/3000 was added.

---

# Security Decisions

The application service runs as:

```text
User=marcos
```

and not as root.

The Node.js application continues listening only on:

```text
127.0.0.1:3000
```

The application is still not intended to be directly reachable from the public Internet.

Public HTTP traffic continues to enter through:

```text
Nginx :80
```

The architecture remains:

```text
Internet
   ↓
UFW
   ↓
Nginx
   ↓
reverse proxy
   ↓
Node.js
```

systemd adds process supervision without increasing public network exposure.

---

# What I Learned

During this session I practiced and understood:

- Linux process lifecycle;
- difference between manual processes and managed services;
- purpose of systemd;
- purpose of systemctl;
- systemd unit files;
- `/etc/systemd/system`;
- `[Unit]`;
- `[Service]`;
- `[Install]`;
- `Description`;
- `After`;
- `Type=simple`;
- `User`;
- `WorkingDirectory`;
- `ExecStart`;
- absolute executable paths;
- interaction between NVM-managed Node.js and systemd;
- `Restart=on-failure`;
- `WantedBy=multi-user.target`;
- service syntax validation with `systemd-analyze verify`;
- reloading unit definitions with `systemctl daemon-reload`;
- starting services with `systemctl start`;
- stopping services with `systemctl stop`;
- inspecting services with `systemctl status`;
- identifying a service `MainPID`;
- inspecting `MainPID` with `systemctl show`;
- difference between intentional stop and process failure;
- simulating application failure with `kill -9`;
- SIGKILL;
- automatic service recovery;
- restart counters;
- journald;
- service log inspection with `journalctl`;
- capturing application stdout through systemd;
- meaning of `active`;
- meaning of `inactive`;
- meaning of `enabled`;
- meaning of `disabled`;
- enabling services at boot;
- symlinks under `multi-user.target.wants`;
- validating application recovery after VPS reboot;
- validating the complete Nginx → Node.js path after boot;
- relationship between Nginx and systemd;
- difference between HTTP traffic management and process management.

---

# Current State

## Completed

### Process Management & systemd

- [x] inspect existing manual Node.js process state;
- [x] verify TCP/3000 listener state;
- [x] reproduce `502 Bad Gateway` with backend unavailable;
- [x] verify application source path and ownership;
- [x] create `opslab-api.service`;
- [x] configure service to run as `marcos`;
- [x] configure `WorkingDirectory`;
- [x] configure absolute NVM Node.js executable path;
- [x] configure `Restart=on-failure`;
- [x] validate unit file with `systemd-analyze verify`;
- [x] reload systemd unit definitions;
- [x] start application through systemd;
- [x] verify service status;
- [x] verify listener PID;
- [x] stop application through systemd;
- [x] validate intentional stop behavior;
- [x] validate Nginx `502` while backend is stopped;
- [x] restart application through systemd;
- [x] inspect `MainPID`;
- [x] simulate process failure with SIGKILL;
- [x] validate automatic restart;
- [x] repeat automatic restart test;
- [x] inspect service history with `journalctl`;
- [x] enable service at boot;
- [x] validate `systemctl is-enabled`;
- [x] reboot VPS;
- [x] validate automatic service startup after reboot;
- [x] validate external `/api/health` after reboot.

---

# Pending

- [ ] version application source code in GitHub;
- [ ] version safe service/configuration examples in GitHub;
- [ ] complete repository checkpoint for Sessions 02 and 03;
- [ ] install PostgreSQL;
- [ ] design initial database schema;
- [ ] connect Node.js API to PostgreSQL;
- [ ] implement persistence;
- [ ] implement CRUD;
- [ ] integrate frontend with backend data;
- [ ] implement authentication;
- [ ] configure domain;
- [ ] configure HTTPS;
- [ ] implement backup procedures;
- [ ] test restore procedures;
- [ ] improve application logging;
- [ ] implement monitoring and observability;
- [ ] implement deployment workflow;
- [ ] practice rollback;
- [ ] implement CI/CD;
- [ ] practice disaster recovery.

---

# Next Step

Before beginning the database phase, create a repository checkpoint.

The application source currently exists in the VPS at:

```text
/var/www/opslab/app/
├── package.json
└── server.js
```

The systemd service exists at:

```text
/etc/systemd/system/opslab-api.service
```

The next repository step should determine how to version:

- application source code;
- safe configuration examples;
- systemd service definition;
- updated documentation.

Secrets and machine-specific sensitive information must remain outside the public repository.

After this checkpoint, begin:

# Session 04 — PostgreSQL & Persistence

Initial target architecture:

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

PostgreSQL should initially remain internal to the VPS and should not be exposed directly to the public Internet.

The next phase will focus on understanding:

- PostgreSQL installation;
- database service lifecycle;
- local database networking;
- roles and users;
- database creation;
- authentication;
- SQL basics;
- tables and schema design;
- application database connections;
- persistence;
- CRUD operations;
- database logs;
- backup and restore foundations.

---

# Architecture After Session 03

```text
                         INTERNET
                             |
                             |
                         Public IPv4
                             |
                            UFW
                             |
                         TCP/80
                             |
                           Nginx
                         /       \
                        /         \
                       /           \
             static frontend      /api/
                    |                |
                    |          reverse proxy
                    |                |
                    |        127.0.0.1:3000
                    |                |
                    |             Node.js
                    |                |
                    |            server.js
                    |                ▲
                    |                |
                    |             systemd
                    |                |
                    |       opslab-api.service
                    |
          /var/www/opslab/html
```

Administrative process control:

```text
Marcos
   ↓
systemctl
   ↓
systemd
   ↓
opslab-api.service
   ↓
Node.js
```

Public application port:

```text
80
```

Internal backend port:

```text
3000
```

Backend bind:

```text
127.0.0.1
```

Backend boot state:

```text
enabled
```

Failure recovery policy:

```text
Restart=on-failure
```

---

# Session Result

The OpsLab API evolved from a manually started Node.js process into a Linux service managed by systemd.

Before:

```text
SSH
   ↓
node server.js
   ↓
application process
```

After:

```text
Linux boot
   ↓
systemd
   ↓
opslab-api.service
   ↓
Node.js
   ↓
application process
```

The service now:

- starts through systemd;
- stops through systemd;
- exposes its status through systemd;
- records lifecycle events in journald;
- recovers automatically from simulated process failure;
- starts automatically after a full VPS reboot;
- continues serving the public `/api/health` endpoint through Nginx after reboot.

The **Process Management & systemd** milestone is considered completed.

The project continues following the principle:

**UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**
