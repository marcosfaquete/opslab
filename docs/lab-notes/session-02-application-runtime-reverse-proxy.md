# Session 02 — Application Runtime & Reverse Proxy

Date: 2026-08-10

## Objective

Introduzir a primeira aplicação backend do OpsLab dentro da VPS e configurar o Nginx como reverse proxy.

O objetivo desta sessão não foi criar funcionalidade complexa.

A intenção foi entender manualmente o fluxo:

```text
JavaScript source code
        ↓
Node.js runtime
        ↓
Linux process
        ↓
local TCP socket
        ↓
127.0.0.1:3000
        ↓
Nginx reverse proxy
        ↓
public HTTP request
```

A aplicação deveria permanecer acessível somente através do loopback da VPS.

A porta `3000` não deveria ser aberta no UFW.

Nginx permaneceria como único ponto público de entrada HTTP da aplicação.

---

# Initial State

At the beginning of this session, the following infrastructure was already operational:

```text
Internet
   ↓
DigitalOcean public IPv4
   ↓
UFW
   ↓
TCP/80
   ↓
Nginx
   ↓
OpsLab server block
   ↓
/var/www/opslab/html
   ↓
index.html
```

Existing security baseline:

```text
SSH root login: disabled
SSH password authentication: disabled
SSH public-key authentication: enabled

UFW: active
Default inbound: deny
TCP/22: allowed
TCP/80: allowed

TCP/443: not configured
TCP/3000: not exposed
```

No application backend was running yet.

---

# Node.js Runtime Inspection

Before installing a runtime, the current state was inspected.

Command:

```bash
node --version
```

Result:

```text
Command 'node' not found
```

Node.js was therefore not currently available through the shell `PATH`.

The Ubuntu repository candidate was inspected:

```bash
apt policy nodejs
```

Observed candidate:

```text
18.19.1+dfsg-6ubuntu5
```

The runtime was not installed from the Ubuntu package repository.

---

# curl Validation

Before using the NVM installation procedure, `curl` availability was validated:

```bash
curl --version
```

Observed version:

```text
curl 8.5.0
```

The command confirmed that HTTPS downloads could be performed from the server.

---

# NVM — Node Version Manager

NVM was selected to manage the Node.js runtime for the `marcos` user.

The installation/update command used was:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
```

The installer detected an existing NVM directory:

```text
/home/marcos/.nvm
```

and updated the existing installation.

It also confirmed that the NVM initialization entries already existed in:

```text
/home/marcos/.bashrc
```

The current shell configuration was reloaded:

```bash
source ~/.bashrc
```

NVM was then validated:

```bash
nvm --version
```

Result:

```text
0.40.6
```

---

# Node.js Installation

Node.js 24 was installed using NVM:

```bash
nvm install 24
```

Installed versions:

```text
Node.js v24.19.0
npm v11.17.0
```

NVM also created the default alias:

```text
default -> 24
```

The installation was validated independently:

```bash
node --version
npm --version
```

Results:

```text
v24.19.0
11.17.0
```

---

# Node Binary Location

The executable used by the shell was inspected:

```bash
which node
```

Result:

```text
/home/marcos/.nvm/versions/node/v24.19.0/bin/node
```

This confirmed that Node.js was being executed from the NVM-managed installation belonging to the `marcos` user rather than from a global `/usr/bin/node` package installation.

Runtime layout:

```text
/home/marcos/
└── .nvm/
    └── versions/
        └── node/
            └── v24.19.0/
                └── bin/
                    ├── node
                    └── npm
```

---

# OpsLab Application Directory

The existing OpsLab web structure was inspected:

```bash
ls -la /var/www/opslab
```

Initial structure:

```text
/var/www/opslab/
└── html/
```

A dedicated application directory was created:

```bash
mkdir /var/www/opslab/app
```

Resulting structure:

```text
/var/www/opslab/
├── app/
└── html/
```

Ownership remained:

```text
marcos:marcos
```

This separates:

```text
html/
```

for static content served directly by Nginx from:

```text
app/
```

for backend application source code.

---

# Application Working Directory

The application directory was entered:

```bash
cd /var/www/opslab/app
```

Current path was validated with:

```bash
pwd
```

Result:

```text
/var/www/opslab/app
```

---

# Node Project Initialization

A Node.js project was initialized:

```bash
npm init -y
```

This created:

```text
/var/www/opslab/app/package.json
```

Initial project metadata included:

```json
{
  "name": "app",
  "version": "1.0.0",
  "main": "index.js",
  "type": "commonjs"
}
```

No external application dependency was installed during this session.

The first HTTP server was intentionally built using Node.js core modules to make the relationship between runtime, process, socket and HTTP visible before introducing frameworks such as Express.

---

# First OpsLab Backend

The application file was created:

```text
/var/www/opslab/app/server.js
```

The server uses Node.js' built-in HTTP module.

Application code:

```javascript
const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`OpsLab API listening on http://${HOST}:${PORT}`);
});
```

---

# Application Binding

The application intentionally listens on:

```text
127.0.0.1:3000
```

and not:

```text
0.0.0.0:3000
```

This means the process is bound to the local loopback interface.

Intended security model:

```text
Internet
   X
   |
   | no direct TCP/3000 exposure
   |
127.0.0.1:3000
   ↓
Node.js application
```

The application port was not added to the UFW rules.

---

# Manual Application Process

The first process was started manually:

```bash
node server.js
```

Observed output:

```text
OpsLab API listening on http://127.0.0.1:3000
```

At this stage the application was running as a manually started process rather than a managed systemd service.

---

# Listening Socket Inspection

A second SSH session was used to inspect the TCP listener:

```bash
ss -ltnp | grep ':3000'
```

Observed result:

```text
LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("MainThread",pid=8564,fd=21))
```

This confirmed:

- TCP port `3000` was listening;
- the bind address was `127.0.0.1`;
- the application was not bound to all network interfaces;
- a process existed with PID `8564`.

Effective state:

```text
Linux kernel
   ↓
TCP socket
   ↓
127.0.0.1:3000
   ↓
Node.js process
```

---

# Direct Local API Validation

The backend was first tested directly without Nginx.

Command:

```bash
curl -i http://127.0.0.1:3000/health
```

Observed response:

```text
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

This validated the flow:

```text
curl
   ↓
127.0.0.1:3000
   ↓
Node.js
   ↓
server.js
   ↓
GET /health
   ↓
HTTP 200
```

Nginx was not involved in this test.

---

# Application 404 Validation

A non-existent route was tested:

```bash
curl -i http://127.0.0.1:3000/teste
```

Observed response:

```text
HTTP/1.1 404 Not Found
Content-Type: application/json

{"error":"not_found"}
```

This confirmed that the backend was executing application routing logic rather than merely exposing an open TCP port.

---

# Nginx Configuration Inspection

Before modifying the web server configuration, the active OpsLab server block was inspected:

```bash
cat /etc/nginx/sites-available/opslab
```

Existing configuration:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name <PUBLIC_IP>;

    root /var/www/opslab/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

The static landing page remained functional at this point.

---

# Nginx Configuration Backup

Before adding the reverse proxy, a backup of the working server block was created:

```bash
sudo cp /etc/nginx/sites-available/opslab /etc/nginx/sites-available/opslab.bak
```

The backup was validated:

```bash
ls -l /etc/nginx/sites-available/opslab*
```

Both files were present:

```text
/etc/nginx/sites-available/opslab
/etc/nginx/sites-available/opslab.bak
```

This provided a simple rollback path before editing the active configuration.

---

# Nginx Reverse Proxy

The OpsLab server block was updated with:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
}
```

Resulting configuration:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name <PUBLIC_IP>;

    root /var/www/opslab/html;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

The existing static landing page configuration was preserved.

---

# Reverse Proxy URI Mapping

Because the location is:

```nginx
location /api/
```

and `proxy_pass` contains a trailing URI slash:

```nginx
proxy_pass http://127.0.0.1:3000/;
```

the public request:

```text
/api/health
```

is forwarded internally as:

```text
/health
```

Therefore:

```text
Client
   ↓
GET /api/health
   ↓
Nginx
   ↓
location /api/
   ↓
proxy_pass
   ↓
GET /health
   ↓
127.0.0.1:3000
   ↓
Node.js
```

This matches the route implemented by the application.

---

# Nginx Configuration Validation

Before applying the modified configuration, its syntax was tested:

```bash
sudo nginx -t
```

Result:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Only after this validation was the configuration applied.

---

# Nginx Reload

The configuration was reloaded with:

```bash
sudo systemctl reload nginx
```

A reload was used instead of a full restart because only a validated configuration change needed to be applied.

---

# Virtual Host Behavior Observed

An initial test used:

```bash
curl -i http://127.0.0.1/api/health
```

and received an Nginx `404`.

The OpsLab server block was configured with the public IPv4 as its:

```nginx
server_name
```

while the request made to `127.0.0.1` generated a different HTTP Host value.

The default Nginx site remained enabled and was still configured as the default server.

This demonstrated that Nginx first selects the appropriate server block using the incoming request context before evaluating the `location` rules inside that server.

The public-IP test was therefore used for validation of the OpsLab server block.

---

# Application Process Persistence Observation

During testing, the original SSH session used to start the Node process disconnected.

A new attempt to start:

```bash
node server.js
```

returned:

```text
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

Socket inspection showed:

```bash
ss -ltnp | grep ':3000'
```

Result:

```text
127.0.0.1:3000
PID 8564
```

The original process was still alive and still owned the listening socket.

The second process failed because two normal listeners cannot independently bind the same address/port combination.

This demonstrated the meaning of:

```text
EADDRINUSE
```

and reinforced the need to inspect process/socket state before starting additional application instances.

The application is still not considered properly managed because it does not yet have an explicit service lifecycle controlled by systemd.

---

# Internal Reverse Proxy Validation

The reverse proxy was tested using the server's public IPv4:

```bash
curl -i http://<PUBLIC_IP>/api/health
```

Observed response:

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Content-Type: application/json

{"status":"ok"}
```

This confirmed:

```text
HTTP request
   ↓
Nginx :80
   ↓
OpsLab server block
   ↓
location /api/
   ↓
proxy_pass
   ↓
127.0.0.1:3000
   ↓
Node.js
```

---

# External Reverse Proxy Validation

The complete path was then tested from the Windows workstation rather than from inside the VPS.

Command:

```powershell
curl.exe -i http://<PUBLIC_IP>/api/health
```

Observed response:

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Content-Type: application/json

{"status":"ok"}
```

This validated the complete external request path:

```text
Windows workstation
       ↓
Internet
       ↓
DigitalOcean public IPv4
       ↓
UFW
       ↓
TCP/80
       ↓
Nginx
       ↓
/api/health
       ↓
reverse proxy
       ↓
127.0.0.1:3000/health
       ↓
Node.js
       ↓
{"status":"ok"}
```

The client never connected directly to TCP port `3000`.

---

# Nginx Access Log Inspection

Nginx access logs were inspected with:

```bash
sudo tail -n 10 /var/log/nginx/access.log
```

A request originating from the Windows test appeared as:

```text
"GET /api/health HTTP/1.1" 200
```

with a curl User-Agent.

A browser request to the same endpoint was also recorded.

This demonstrated that:

```text
request
   ↓
Nginx
   ↓
response
   ↓
access.log
```

Nginx access logs are stored at:

```text
/var/log/nginx/access.log
```

Nginx error logs are stored separately at:

```text
/var/log/nginx/error.log
```

---

# Public Internet Background Traffic

The access log also contained requests originating from addresses unrelated to the controlled OpsLab tests.

Some entries contained malformed or non-standard data rather than normal HTTP requests.

This traffic is consistent with general automated scanning and background traffic commonly received by publicly reachable IPv4 servers.

The observation demonstrated that publishing an IPv4 address exposes reachable services to unsolicited Internet traffic even when the address has not intentionally been shared.

This reinforced the purpose of the existing security baseline:

```text
UFW default deny incoming
SSH key authentication
SSH password authentication disabled
direct root SSH login disabled
minimum required public ports
Node.js bound only to loopback
```

Public reachability does not mean successful authentication or compromise, but unnecessary exposed services increase attack surface.

---

# Security Model After Reverse Proxy

Current public network exposure:

```text
Internet
   |
   +-- TCP/22
   |      ↓
   |    OpenSSH
   |
   +-- TCP/80
          ↓
        Nginx
```

Application topology:

```text
Internet
   ↓
TCP/80
   ↓
Nginx
   ↓
127.0.0.1:3000
   ↓
Node.js API
```

TCP port `3000` was not opened in UFW.

The backend is therefore not intentionally reachable directly from the public network.

Nginx remains the HTTP entry point.

---

# Files Created During This Session

Application files:

```text
/var/www/opslab/app/package.json
/var/www/opslab/app/server.js
```

Nginx configuration modified:

```text
/etc/nginx/sites-available/opslab
```

Backup created:

```text
/etc/nginx/sites-available/opslab.bak
```

Runtime managed under:

```text
/home/marcos/.nvm
```

---

# Current Application Layout

```text
/var/www/opslab/
├── app/
│   ├── package.json
│   └── server.js
└── html/
    └── index.html
```

Responsibilities:

```text
html/
→ static frontend content served directly by Nginx

app/
→ backend application executed by Node.js
```

---

# What I Learned

During this session I practiced and understood:

- difference between JavaScript in a browser and a server-side JavaScript runtime;
- Node.js as an application runtime;
- npm as the Node.js package and script manager;
- NVM as a per-user Node.js version manager;
- shell `PATH`;
- locating executables with `which`;
- difference between a runtime and an application;
- Node.js core HTTP module;
- creating an HTTP server without external frameworks;
- Linux processes;
- process IDs;
- TCP listening sockets;
- inspecting sockets with `ss`;
- loopback networking;
- `127.0.0.1`;
- difference between `127.0.0.1` and `0.0.0.0`;
- binding an application to a local-only interface;
- HTTP GET requests;
- HTTP status `200`;
- HTTP status `404`;
- JSON HTTP responses;
- application routing;
- testing APIs with `curl`;
- difference between direct backend access and reverse-proxied access;
- Nginx reverse proxy;
- Nginx `location`;
- Nginx `proxy_pass`;
- URI forwarding behavior;
- Nginx virtual-host/server-block selection;
- HTTP Host behavior;
- protecting application ports from direct public exposure;
- backing up configuration before changes;
- validating Nginx configuration with `nginx -t`;
- applying Nginx changes with `systemctl reload nginx`;
- `EADDRINUSE`;
- identifying a process already using a port;
- Nginx access logs;
- basic interpretation of HTTP access log entries;
- Internet background scanning against public IPv4 addresses;
- the difference between exposing a network port and successfully authenticating to a service.

---

# Current State

## Completed

### Application Runtime

- [x] inspect existing Node.js state;
- [x] inspect Ubuntu Node.js package candidate;
- [x] validate curl availability;
- [x] validate/update NVM;
- [x] install Node.js 24 through NVM;
- [x] validate Node.js version;
- [x] validate npm version;
- [x] identify the active Node.js executable path.

### Application Structure

- [x] inspect `/var/www/opslab`;
- [x] create `/var/www/opslab/app`;
- [x] preserve `/var/www/opslab/html` for static frontend content;
- [x] initialize Node.js project with `npm init`;
- [x] create `package.json`;
- [x] create `server.js`;
- [x] implement `GET /health`;
- [x] implement JSON `404` response.

### Local Backend Networking

- [x] bind backend to `127.0.0.1`;
- [x] use application port `3000`;
- [x] keep TCP/3000 closed to public Internet;
- [x] start the Node.js process manually;
- [x] validate listening socket with `ss`;
- [x] validate direct local `GET /health`;
- [x] validate application `404`.

### Nginx Reverse Proxy

- [x] inspect existing OpsLab server block;
- [x] create Nginx configuration backup;
- [x] configure `location /api/`;
- [x] configure `proxy_pass` to `127.0.0.1:3000`;
- [x] preserve the existing static landing page;
- [x] validate configuration with `nginx -t`;
- [x] reload Nginx;
- [x] diagnose server-block behavior using `127.0.0.1`;
- [x] validate reverse proxy using the public IPv4;
- [x] validate reverse proxy externally from Windows.

### Logging & Troubleshooting

- [x] inspect Nginx access logs;
- [x] identify the external `/api/health` request in logs;
- [x] observe unsolicited Internet traffic;
- [x] diagnose `EADDRINUSE`;
- [x] confirm an existing Node.js process using TCP/3000.

---

# Pending

- [ ] version application source code in GitHub;
- [ ] update repository documentation;
- [ ] create a controlled application service lifecycle;
- [ ] create a systemd service for the OpsLab API;
- [ ] configure automatic API startup at boot;
- [ ] validate API behavior after process restart;
- [ ] validate API behavior after VPS reboot;
- [ ] inspect application logs through systemd/journald;
- [ ] install PostgreSQL;
- [ ] connect application to PostgreSQL;
- [ ] implement persistence;
- [ ] implement CRUD;
- [ ] implement authentication;
- [ ] configure domain;
- [ ] configure HTTPS;
- [ ] implement backup;
- [ ] test restore;
- [ ] implement application monitoring;
- [ ] implement deployment workflow;
- [ ] implement rollback;
- [ ] implement CI/CD;
- [ ] practice disaster recovery.

---

# Next Step

First create a repository checkpoint for the application code and the documentation produced during this session.

The application currently exists inside the VPS at:

```text
/var/www/opslab/app/
├── package.json
└── server.js
```

These files should also be versioned in the OpsLab Git repository so that the Droplet is not the only location containing the application source code.

After the repository checkpoint, begin:

# Process Management & systemd

Current state:

```text
interactive/manual process
        ↓
node server.js
        ↓
127.0.0.1:3000
```

Target state:

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

The next phase should focus on understanding:

- manual process vs managed service;
- systemd units;
- service users;
- `ExecStart`;
- `WorkingDirectory`;
- absolute runtime paths;
- service start;
- service stop;
- service restart;
- service status;
- boot enablement;
- journald;
- `journalctl`;
- failure behavior;
- automatic application startup after VPS reboot.

Only after application process management is stable should the project move toward PostgreSQL and persistence.

---

# Architecture After Session 02

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
                    /         \
                   /           \
                  /             \
           static content      /api/
                |                |
                |          reverse proxy
                |                |
                |         127.0.0.1:3000
                |                |
                |             Node.js
                |                |
                |             server.js
                |
/var/www/opslab/html
```

Application port:

```text
3000
```

Public exposure:

```text
No
```

Backend bind:

```text
127.0.0.1
```

Public HTTP entry point:

```text
Nginx TCP/80
```

---

# Session Result

The OpsLab evolved from a static web server:

```text
Internet
   ↓
Nginx
   ↓
index.html
```

to a web server with an internal application backend:

```text
Internet
   ↓
UFW
   ↓
Nginx
   ├── / → static frontend
   │
   └── /api/
          ↓
      reverse proxy
          ↓
     127.0.0.1:3000
          ↓
       Node.js API
```

The application was successfully tested both directly inside the VPS and externally through Nginx.

The Node.js application remained inaccessible through a deliberately opened public TCP/3000 firewall rule because no such rule was created.

The **Application Runtime & Reverse Proxy** milestone is considered completed.

The project continues following the principle:

**UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**