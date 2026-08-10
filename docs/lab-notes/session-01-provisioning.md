# Session 01 — Provisioning

Date: 2026-08-09 — continued on 2026-08-10

## Objective

Provisionar a primeira VPS do projeto OpsLab na DigitalOcean, configurar e
validar o acesso administrativo seguro por SSH, inspecionar e atualizar o
sistema operacional, estabelecer uma baseline de firewall com UFW, instalar e
validar o Nginx e publicar o primeiro conteúdo HTTP próprio do OpsLab.

Esta sessão representa o primeiro ambiente Cloud real do projeto e estabelece
a baseline inicial de sistema, acesso remoto, firewall e servidor web.

---

# Cloud Provider

DigitalOcean.

---

# Droplet

## Name

`opslab-01`

## Region

NYC1 — New York.

## Operating System

Ubuntu 24.04 LTS x64.

Após o provisionamento, o sistema reportou:

- Ubuntu 24.04.4 LTS;
- Architecture: x86-64;
- Virtualization: KVM;
- Hardware Vendor: DigitalOcean;
- Hardware Model: Droplet.

## Compute

- Basic Droplet;
- Shared CPU;
- Regular SSD;
- 1 vCPU;
- 1 GB RAM;
- 25 GB SSD;
- 1 TB Transfer;
- Estimated cost: US$ 6/month.

O plano inicial foi escolhido propositalmente sem realizar vertical scaling
antecipado.

Caso recursos como memória ou CPU se tornem gargalos futuramente, a intenção
é medir e documentar o problema antes de aumentar o tamanho da VPS.

---

# Storage Options

## Additional Block Storage

Disabled.

Nenhum volume adicional foi criado.

## Automated Backups

Disabled.

A intenção do laboratório é implementar e testar backup e restore manualmente
antes de utilizar soluções automatizadas do provedor.

---

# Networking

## Public IPv4

Enabled.

O Droplet recebeu um endereço IPv4 público para permitir acesso pela internet.

## Private IPv4

O servidor também recebeu um endereço IPv4 privado pertencente à VPC da
DigitalOcean.

Esse endereço pode ser utilizado para comunicação privada entre recursos
dentro da infraestrutura Cloud.

O acesso SSH a partir do computador local utiliza o IPv4 público.

## Public IPv6

Disabled initially.

IPv6 será estudado posteriormente como uma etapa separada, evitando
complexidade desnecessária durante os primeiros exercícios de networking.

---

# Monitoring

DigitalOcean Improved Metrics and Monitoring enabled.

O agente de métricas da DigitalOcean foi habilitado durante o provisionamento.

Nenhuma solução própria de observabilidade foi instalada nesta etapa.

Prometheus, Grafana e outras ferramentas serão estudados posteriormente.

---

# Startup Automation

Startup Scripts disabled.

O provisionamento inicial está sendo realizado manualmente para permitir o
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
```

---

## SSH Key Files

The command generated two files.

Private key:

```text
C:\Users\Marcos\.ssh\id_ed25519_opslab
```

Public key:

```text
C:\Users\Marcos\.ssh\id_ed25519_opslab.pub
```

The private key was protected with a passphrase.

A private key permanece exclusivamente no computador Windows local.

Ela não deve:

- ser enviada ao servidor;
- ser compartilhada;
- aparecer em screenshots;
- ser adicionada ao GitHub;
- ser armazenada dentro do repositório.

Somente a chave pública foi cadastrada na DigitalOcean.

DigitalOcean SSH Key name:

```text
Marcos-Windows-OpsLab
```

---

# SSH Host Verification

Durante a primeira conexão SSH, o servidor apresentou sua ED25519 Host Key.

Como o computador local ainda não conhecia aquele servidor, o OpenSSH exibiu
um fingerprint e solicitou confirmação antes de adicionar a identidade do
servidor ao arquivo `known_hosts`.

Em vez de aceitar o fingerprint imediatamente, ele foi verificado através de
um segundo canal utilizando o DigitalOcean Web Console.

Inside the server, the following command was executed:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Fingerprint validated:

```text
SHA256:QGCVz+YGNl+7pxmPze16H/YKZfaBtsUmXgJXCis/SwA
```

O fingerprint retornado diretamente pelo servidor era idêntico ao fingerprint
apresentado pelo cliente OpenSSH no Windows.

Somente após essa validação a Host Key foi aceita.

O OpenSSH então registrou a identidade conhecida do servidor no arquivo local:

```text
C:\Users\Marcos\.ssh\known_hosts
```

Este procedimento demonstrou a diferença entre:

- User SSH Key: permite ao servidor verificar a identidade do cliente;
- SSH Host Key: permite ao cliente verificar a identidade do servidor.

---

# First SSH Connection

A primeira conexão foi testada inicialmente utilizando o modo verbose:

```powershell
ssh -vvv -i "$env:USERPROFILE\.ssh\id_ed25519_opslab" root@<PUBLIC_IP>
```

O parâmetro `-vvv` permitiu observar detalhadamente o processo de conexão e
autenticação.

Durante o diagnóstico foi possível observar que o cliente SSH:

1. estabeleceu conexão com a porta 22;
2. validou a Host Key conhecida;
3. localizou a private key especificada;
4. ofereceu a public key correspondente;
5. recebeu confirmação de que o servidor aceitava aquela chave;
6. solicitou a passphrase local;
7. utilizou a private key para realizar a autenticação criptográfica;
8. abriu a sessão remota com sucesso.

A private key não foi transmitida para o servidor.

Após a validação inicial, o acesso normal foi testado sem modo verbose:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_opslab" root@<PUBLIC_IP>
```

The connection succeeded.

---

# DigitalOcean Web Console

Durante o troubleshooting inicial também foi utilizado o DigitalOcean Web
Console.

Ele foi útil como canal alternativo para:

- acessar o servidor;
- verificar a SSH Host Key;
- consultar logs;
- validar o estado do serviço SSH.

O Web Console é útil como ferramenta do provedor, mas não substitui o uso e o
aprendizado de SSH como método padrão de administração remota.

---

# Initial System Inspection

Antes de instalar aplicações ou alterar a arquitetura do servidor, foi
realizada uma inspeção inicial para registrar o estado do ambiente.

---

## Host Information

Command:

```bash
hostnamectl
```

Main results:

```text
Static hostname: opslab-01
Operating System: Ubuntu 24.04.4 LTS
Architecture: x86-64
Virtualization: kvm
Hardware Vendor: DigitalOcean
Hardware Model: Droplet
```

A inspeção confirmou que o Droplet é uma máquina virtual executada sobre
virtualização KVM.

---

## Memory

Command:

```bash
free -h
```

Observed during the initial inspection:

- approximately 961 MiB total RAM;
- approximately 315 MiB used;
- approximately 646 MiB available;
- no swap configured.

Foi observado que a coluna `free` isoladamente não representa toda a memória
que pode ser utilizada por novas aplicações.

O Linux utiliza memória disponível como cache e pode liberar parte desse
espaço quando necessário.

A coluna `available` fornece uma estimativa mais útil da quantidade de memória
que pode ser utilizada sem necessidade de swap.

Nenhuma swap foi criada durante esta etapa.

---

## Filesystem Usage

Command:

```bash
df -h
```

Main filesystem:

```text
/dev/vda1
```

Mounted at:

```text
/
```

Observed values:

- approximately 24 GB filesystem size;
- approximately 1.9 GB initially used;
- approximately 22 GB available;
- approximately 9% usage.

---

## Block Devices

Command:

```bash
lsblk
```

Observed structure:

```text
vda      25G   disk
├─vda1   24G   part   /
├─vda14   4M   part
├─vda15 106M   part   /boot/efi
└─vda16 913M   part   /boot
```

The main virtual disk is:

```text
vda
```

The main partition is:

```text
vda1
```

Mounted as:

```text
/
```

---

## Filesystem Information

Command:

```bash
lsblk -f
```

Observed filesystems included:

```text
vda1   ext4      cloudimg-rootfs
vda15  vfat      UEFI
vda16  ext4      BOOT
```

A small additional read-only device was also present:

```text
vdb
```

Filesystem:

```text
iso9660
```

Label:

```text
config-2
```

Esse dispositivo foi identificado como um Config Drive utilizado pelo
ambiente Cloud para disponibilizar metadados e informações de configuração
para a máquina virtual.

Essa inspeção também demonstrou características de uma Ubuntu Cloud Image.

---

## CPU

Command:

```bash
lscpu
```

Main observations:

- architecture: x86_64;
- 1 vCPU;
- Intel-compatible virtual CPU;
- QEMU virtual hardware;
- KVM hypervisor;
- full virtualization.

O sistema operacional enxerga uma CPU lógica disponível.

Como o plano utilizado é Basic / Shared CPU, a capacidade de processamento
virtual é compartilhada sobre a infraestrutura física do provedor.

---

# Initial Ubuntu Update

Ao acessar o servidor inicialmente, o Ubuntu informou que dezenas de
atualizações estavam disponíveis, incluindo várias atualizações de segurança.

Foi decidido atualizar o sistema antes de instalar novos serviços.

---

## Package Index Update

Command:

```bash
apt update
```

Esse comando atualizou o índice local de pacotes disponíveis nos repositórios.

---

## Package Upgrade

Command:

```bash
apt upgrade
```

Before confirmation, the upgrade reported:

```text
81 upgraded
6 newly installed
0 to remove
0 not upgraded
```

Também foram reportadas dezenas de atualizações de segurança.

Approximately:

```text
175 MB downloaded
194 MB additional disk usage
```

O upgrade foi confirmado manualmente.

---

# OpenSSH Package Update

Durante o upgrade, componentes do OpenSSH também foram atualizados.

Entre eles:

- openssh-client;
- openssh-server;
- openssh-sftp-server.

O package manager detectou que:

```text
/etc/ssh/sshd_config
```

possuía diferenças em relação à configuração fornecida pela nova versão do
pacote.

Foi escolhida a opção:

```text
keep the local version currently installed
```

Essa decisão preservou a configuração SSH que já estava funcionando no
servidor em vez de substituí-la automaticamente.

---

# Kernel Update

Before the upgrade, the running kernel was:

```text
6.8.0-124-generic
```

The upgrade installed:

```text
6.8.0-137-generic
```

Como o novo kernel só se torna ativo após uma nova inicialização, o Droplet
foi reiniciado conscientemente.

Após o reboot e uma nova conexão SSH, o kernel ativo foi validado com:

```bash
uname -r
```

Result:

```text
6.8.0-137-generic
```

Também foram verificadas atualizações restantes e serviços systemd com falha.

Nenhuma atualização pendente ou serviço relevante em estado failed foi
encontrado.

The initial Ubuntu update cycle was therefore considered successfully
completed.

---

# Administrative User

Após a atualização inicial, foi criado um usuário administrativo dedicado:

```text
marcos
```

Command:

```bash
adduser marcos
```

The account received its own home directory:

```text
/home/marcos
```

Uma senha local foi configurada para a conta.

Essa senha é diferente da passphrase utilizada para proteger a private key SSH.

---

## Sudo Configuration

The user was added to the `sudo` group:

```bash
usermod -aG sudo marcos
```

Membership was validated using:

```bash
id marcos
```

Observed result included:

```text
groups=1000(marcos),27(sudo),100(users)
```

Isso confirmou que o usuário pertence aos grupos:

- `marcos`;
- `sudo`;
- `users`.

Essa configuração permite realizar a administração normal utilizando uma conta
sem privilégio root permanente e elevar privilégios somente quando necessário.

---

# SSH Access for the Administrative User

An SSH directory was created for the new account:

```bash
mkdir -p /home/marcos/.ssh
```

The existing authorized public key was copied from the initial root account:

```bash
cp /root/.ssh/authorized_keys /home/marcos/.ssh/authorized_keys
```

Ownership was corrected:

```bash
chown -R marcos:marcos /home/marcos/.ssh
```

Permissions were configured:

```bash
chmod 700 /home/marcos/.ssh
chmod 600 /home/marcos/.ssh/authorized_keys
```

Validation confirmed:

```text
drwx------ marcos marcos /home/marcos/.ssh
-rw------- marcos marcos /home/marcos/.ssh/authorized_keys
```

A new SSH connection was then tested from Windows:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_opslab" marcos@<PUBLIC_IP>
```

The login succeeded.

---

## Sudo Validation

Administrative privilege elevation was tested with:

```bash
sudo whoami
```

Result:

```text
root
```

Isso comprovou que o usuário `marcos` consegue:

- autenticar remotamente utilizando a chave SSH;
- trabalhar como usuário normal;
- elevar privilégios administrativos quando necessário através do `sudo`.

Esse acesso alternativo foi validado antes de qualquer restrição ao login
remoto do root.

---

# SSH Hardening

Antes de alterar a configuração do OpenSSH, o estado efetivo do serviço foi
inspecionado.

Command:

```bash
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'
```

Initial effective configuration:

```text
permitrootlogin yes
pubkeyauthentication yes
passwordauthentication no
```

Isso demonstrou que:

- public-key authentication estava habilitado;
- password authentication já estava desabilitado;
- login SSH direto como root ainda estava permitido.

---

## Configuration Source Inspection

Os arquivos responsáveis pelas configurações foram identificados antes de
realizar mudanças.

Relevant files included:

```text
/etc/ssh/sshd_config
/etc/ssh/sshd_config.d/50-cloud-init.conf
/etc/ssh/sshd_config.d/60-cloudimg-settings.conf
```

A configuração principal permitia login remoto como root.

As configurações da imagem Cloud já desabilitavam autenticação SSH por senha.

---

# OpsLab SSH Policy

Foi criado um arquivo próprio para registrar as decisões de hardening do
OpsLab:

```text
/etc/ssh/sshd_config.d/00-opslab-hardening.conf
```

Contents:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

The intended SSH policy became:

- direct SSH login as root: disabled;
- SSH password authentication: disabled;
- SSH public-key authentication: enabled.

---

## SSH Configuration Validation

Antes de aplicar a nova configuração, sua sintaxe foi validada com:

```bash
sudo sshd -t
```

No errors were returned.

A configuração efetiva foi então consultada novamente:

```bash
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'
```

Validated result:

```text
permitrootlogin no
pubkeyauthentication yes
passwordauthentication no
```

Isso confirmou que a política desejada estava sendo aplicada pelo OpenSSH.

---

## Reload SSH Configuration

The SSH service configuration was reloaded with:

```bash
sudo systemctl reload ssh
```

Foi utilizado `reload` em vez de reiniciar completamente o servidor.

As sessões SSH existentes permaneceram abertas durante o processo.

---

# SSH Hardening Validation

A sessão SSH original como root foi mantida aberta temporariamente como
caminho de recuperação durante a alteração.

Após recarregar a configuração, uma nova conexão SSH foi aberta utilizando o
usuário:

```text
marcos
```

The connection succeeded.

Sudo was tested again:

```bash
sudo whoami
```

Result:

```text
root
```

Em seguida, foi realizada uma nova tentativa de conexão SSH utilizando
diretamente a conta root.

Command:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_opslab" root@<PUBLIC_IP>
```

Result:

```text
Permission denied (publickey).
```

Isso confirmou que:

- o novo acesso administrativo continuava funcional;
- sudo continuava funcional;
- login SSH direto como root estava efetivamente bloqueado.

---

# Final SSH State

Completed:

- [x] SSH Ed25519 key pair created;
- [x] private key protected with passphrase;
- [x] only public key registered in DigitalOcean;
- [x] SSH Host Key verified through a second channel;
- [x] server identity stored in `known_hosts`;
- [x] SSH public-key authentication tested;
- [x] dedicated administrative user created;
- [x] administrative user added to sudo;
- [x] SSH key configured for administrative user;
- [x] permissions on `.ssh` and `authorized_keys` validated;
- [x] SSH login as `marcos` tested;
- [x] sudo privileges tested;
- [x] SSH password authentication disabled;
- [x] SSH public-key authentication enabled;
- [x] direct SSH login as root disabled;
- [x] OpenSSH syntax validated with `sshd -t`;
- [x] effective OpenSSH configuration validated with `sshd -T`;
- [x] post-hardening SSH login tested;
- [x] root SSH login rejection validated.

Normal administrative access is now:

```text
Windows
   ↓
SSH public-key authentication
   ↓
marcos
   ↓
sudo when required
   ↓
root privileges
```

---

# Security Procedure Learned

Mudanças de autenticação remota nunca devem ser aplicadas fechando
imediatamente a sessão administrativa existente.

O procedimento utilizado foi:

1. manter a sessão administrativa existente aberta;
2. configurar um novo caminho de acesso;
3. testar a nova conta em uma segunda sessão;
4. validar SSH;
5. validar sudo;
6. alterar a configuração;
7. validar sintaxe;
8. recarregar o serviço;
9. abrir uma nova sessão;
10. confirmar que o novo acesso funciona;
11. testar que o acesso antigo foi bloqueado;
12. somente então considerar a mudança concluída.

Esse procedimento reduz o risco de perder acesso administrativo à VPS.

---

# UFW Firewall Baseline

Após concluir o hardening de SSH, foi configurado o firewall local da VPS com
UFW.

Antes de qualquer mudança, o estado foi verificado:

```bash
sudo ufw status verbose
```

Initial result:

```text
Status: inactive
```

Como a administração da VPS depende de SSH, a regra correspondente foi
adicionada antes da ativação do firewall.

Application profile used:

```text
OpenSSH
```

A regra cadastrada foi conferida com:

```bash
sudo ufw show added
```

Result:

```text
ufw allow OpenSSH
```

Somente após confirmar a existência da regra SSH o firewall foi habilitado:

```bash
sudo ufw enable
```

The firewall became active and enabled on system startup.

Effective baseline:

```text
Default incoming: deny
Default outgoing: allow
Logging: low
```

Initial allowed service:

```text
22/tcp (OpenSSH)  ALLOW IN
```

Uma nova conexão SSH foi aberta a partir do Windows depois da ativação do UFW.
O login como `marcos` continuou funcionando normalmente.

Isso validou que o acesso administrativo atravessava corretamente o firewall e
que a VPS não havia sido bloqueada por uma regra incorreta.

---

# Nginx Installation

Com a baseline de firewall ativa, o Nginx foi instalado:

```bash
sudo apt install nginx
```

The installation added:

```text
nginx
nginx-common
```

No packages were removed and no pending package upgrades remained.

O serviço foi inspecionado com:

```bash
systemctl status nginx
```

Observed state:

```text
Loaded: enabled
Active: active (running)
```

The service was therefore running and configured to start automatically with
the system.

Antes de liberar HTTP no firewall, o Nginx foi testado internamente na própria
VPS:

```bash
curl -I http://127.0.0.1
```

Observed response:

```text
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
```

Esse teste comprovou que o serviço HTTP funcionava localmente antes de sua
exposição à internet.

---

# UFW HTTP Rule

Após a instalação do Nginx, os application profiles disponíveis no UFW foram
consultados:

```bash
sudo ufw app list
```

Observed profiles:

```text
Nginx Full
Nginx HTTP
Nginx HTTPS
OpenSSH
```

Como HTTPS ainda não havia sido configurado, foi aplicado o princípio de menor
privilégio e somente o profile HTTP foi liberado:

```bash
sudo ufw allow 'Nginx HTTP'
```

The resulting firewall rules included:

```text
22/tcp (OpenSSH)     ALLOW IN    Anywhere
80/tcp (Nginx HTTP)  ALLOW IN    Anywhere
```

Equivalent IPv6 rules were also created by UFW, although public IPv6 remained
disabled at the DigitalOcean networking layer.

O acesso externo foi então validado em um navegador utilizando o IPv4 público
do Droplet.

The default Nginx page was successfully displayed.

This demonstrated the difference between:

- a service running locally;
- a process listening for HTTP;
- a firewall allowing external traffic to reach that service.

---

# Nginx Default Site Inspection

Antes de substituir a página padrão, a configuração ativa foi inspecionada:

```bash
sudo grep -nE '^\s*(listen|root|index|server_name)' /etc/nginx/sites-enabled/default
```

Relevant result:

```text
listen 80 default_server;
listen [::]:80 default_server;
root /var/www/html;
index index.html index.htm index.nginx-debian.html;
server_name _;
```

Foi identificado que o site padrão utilizava:

```text
/var/www/html
```

O conteúdo da pasta foi inspecionado:

```bash
ls -lah /var/www/html
```

The default page was identified as:

```text
/var/www/html/index.nginx-debian.html
```

Its contents were inspected with:

```bash
cat /var/www/html/index.nginx-debian.html
```

Isso confirmou que a página `Welcome to nginx!` exibida no navegador era um
arquivo HTML estático servido a partir do web root padrão.

---

# OpsLab Web Root

Em vez de apagar ou modificar diretamente os arquivos instalados pelo pacote
do Nginx, foi criado um web root próprio para o projeto:

```bash
sudo mkdir -p /var/www/opslab/html
```

Initial ownership:

```text
root:root
```

Para permitir que o usuário administrativo gerencie o conteúdo do projeto sem
utilizar `sudo` para cada edição, a propriedade foi alterada:

```bash
sudo chown -R marcos:marcos /var/www/opslab
```

Validated ownership:

```text
/var/www/opslab       marcos:marcos
/var/www/opslab/html  marcos:marcos
```

O Nginx não precisa ser proprietário desses arquivos; permissões de leitura
são suficientes para servir conteúdo estático.

---

# Initial OpsLab Web Content

O primeiro arquivo próprio do projeto foi criado como usuário `marcos`:

```bash
nano /var/www/opslab/html/index.html
```

Initial content:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>OpsLab</title>
</head>
<body>
    <h1>OpsLab</h1>
    <p>Servidor web funcionando em uma VPS Linux.</p>
</body>
</html>
```

The file was validated with:

```bash
ls -lah /var/www/opslab/html
cat /var/www/opslab/html/index.html
```

At this point the file existed, but the Nginx default site still pointed to
`/var/www/html`.

---

# Nginx Sites Structure

The Ubuntu Nginx site layout was inspected with:

```bash
ls -l /etc/nginx/sites-available /etc/nginx/sites-enabled
```

Observed structure:

```text
/etc/nginx/sites-available/default
/etc/nginx/sites-enabled/default -> /etc/nginx/sites-available/default
```

This demonstrated the separation between:

- `sites-available`: site configurations that exist;
- `sites-enabled`: symbolic links for configurations that are active.

---

# OpsLab Nginx Server Block

A dedicated Nginx configuration was created:

```text
/etc/nginx/sites-available/opslab
```

Configuration used:

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

The file was inspected before activation, including a numbered-line validation
with:

```bash
sudo nl -ba /etc/nginx/sites-available/opslab
```

A symbolic link was then created to enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/opslab /etc/nginx/sites-enabled/opslab
```

The enabled sites directory then contained both:

```text
default -> /etc/nginx/sites-available/default
opslab  -> /etc/nginx/sites-available/opslab
```

The default configuration was intentionally left in place rather than deleted,
keeping the original package configuration available as a reference and simple
rollback path.

---

# Nginx Configuration Validation and Reload

Before applying the new server block, the full Nginx configuration was tested:

```bash
sudo nginx -t
```

Result:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Only after this validation was the service configuration reloaded:

```bash
sudo systemctl reload nginx
```

`reload` was preferred over a full restart because the goal was to apply a
validated configuration change while keeping the web service running.

---

# Initial OpsLab HTTP Publication

After the Nginx reload, the Droplet public IPv4 was accessed again through a
browser.

The previous `Welcome to nginx!` page was replaced by the custom OpsLab
content:

```text
OpsLab
Servidor web funcionando em uma VPS Linux.
```

The effective request path became:

```text
Internet
   ↓
DigitalOcean public IPv4
   ↓
UFW — TCP/80 allowed
   ↓
Nginx
   ↓
OpsLab server block
   ↓
/var/www/opslab/html/index.html
```

This completed the first custom HTTP publication of the OpsLab environment.

---

# Final Firewall and Web Server State

Firewall baseline:

```text
UFW: active
Default incoming: deny
Default outgoing: allow
22/tcp: OpenSSH allowed
80/tcp: Nginx HTTP allowed
```

Web server baseline:

```text
Nginx installed
Nginx active (running)
Nginx enabled at boot
Local HTTP validated
External HTTP validated
Custom OpsLab web root configured
Custom OpsLab server block enabled
Nginx configuration validated before reload
```

The current public web path is intentionally HTTP-only.

HTTPS on TCP/443 remains a later phase and has not yet been configured.

---

# What I Learned

During this session I practiced and understood:

- Cloud VPS provisioning;
- DigitalOcean Droplets;
- basic Cloud compute concepts;
- public and private IPv4 addresses;
- SSH public/private key authentication;
- Ed25519 SSH keys;
- private-key passphrases;
- SSH Host Keys;
- SSH fingerprints;
- `known_hosts`;
- SSH verbose troubleshooting with `-vvv`;
- DigitalOcean Web Console as an alternative administrative channel;
- KVM virtualization;
- QEMU virtual hardware;
- Linux CPU inspection with `lscpu`;
- Linux memory inspection with `free`;
- filesystem inspection with `df`;
- disk and partition inspection with `lsblk`;
- filesystem inspection with `lsblk -f`;
- Cloud Config Drives;
- Ubuntu package management;
- difference between `apt update` and `apt upgrade`;
- kernel updates;
- reboot requirements after kernel updates;
- Linux users and groups;
- user home directories;
- file ownership;
- Linux file permissions;
- the `sudo` administrative model;
- principle of least privilege;
- OpenSSH configuration;
- SSH configuration directories;
- effective OpenSSH configuration with `sshd -T`;
- SSH syntax validation with `sshd -t`;
- SSH service reload;
- disabling remote root login;
- disabling SSH password authentication;
- importance of validating a second administrative path before restricting the original one;
- host firewall concepts with UFW;
- default-deny inbound firewall policy;
- UFW application profiles;
- relationship between services and TCP ports;
- SSH on TCP/22;
- HTTP on TCP/80;
- difference between a local service and external network exposure;
- Nginx installation and service management with systemd;
- local HTTP validation using `curl`;
- Nginx web roots;
- static HTML publication;
- ownership and permissions for web content;
- Ubuntu Nginx `sites-available` and `sites-enabled` structure;
- symbolic links for enabling Nginx sites;
- Nginx server blocks;
- `server_name`, `root`, `index`, `location` and `try_files`;
- Nginx configuration validation with `nginx -t`;
- applying Nginx configuration changes with `systemctl reload nginx`;
- exposing custom HTTP content through a public Cloud VPS.

---

# Current State

## Completed

### Provisioning, System Baseline & SSH Hardening

- [x] DigitalOcean Droplet provisioned;
- [x] Ubuntu 24.04 LTS running;
- [x] initial system inspection completed;
- [x] Ubuntu package index updated;
- [x] installed packages upgraded;
- [x] security updates applied;
- [x] updated kernel installed;
- [x] Droplet rebooted;
- [x] updated kernel validated;
- [x] no pending package updates detected;
- [x] no relevant failed systemd services detected;
- [x] SSH key authentication operational;
- [x] SSH Host Key verified;
- [x] dedicated administrative user created;
- [x] sudo configured;
- [x] SSH access migrated to the administrative user;
- [x] direct root SSH login disabled;
- [x] SSH password authentication disabled;
- [x] SSH hardening validated.

### Firewall Baseline & Initial Nginx HTTP Exposure

- [x] inspect initial UFW state;
- [x] allow OpenSSH before firewall activation;
- [x] enable UFW;
- [x] apply default deny incoming / allow outgoing policy;
- [x] validate new SSH access through the active firewall;
- [x] install Nginx;
- [x] validate Nginx systemd service;
- [x] validate Nginx locally with HTTP 200 response;
- [x] inspect UFW Nginx application profiles;
- [x] allow Nginx HTTP on TCP/80;
- [x] validate external HTTP access through the firewall.

### Web Server Configuration & OpsLab Content

- [x] inspect the default Nginx site configuration;
- [x] identify the default Nginx web root and page;
- [x] create `/var/www/opslab/html`;
- [x] configure `marcos` ownership for OpsLab web content;
- [x] create the initial OpsLab `index.html`;
- [x] inspect `sites-available` and `sites-enabled`;
- [x] create a dedicated OpsLab Nginx server block;
- [x] enable the OpsLab site using a symbolic link;
- [x] validate Nginx configuration with `nginx -t`;
- [x] reload Nginx safely;
- [x] validate the custom OpsLab page through the public IPv4.

- [x] implement application/API;
- [x] configure an application runtime/process;
- [x] configure Nginx reverse proxy;
- [x] keep the application port private/internal;


## Pending


- [ ] install PostgreSQL;
- [ ] configure HTTPS;
- [ ] configure backup procedures;
- [ ] test restore procedures;
- [ ] implement monitoring and observability;
- [ ] implement deployment workflow;
- [ ] implement CI/CD;
- [ ] practice rollback;
- [ ] practice disaster recovery.

---

# Next Step

Begin the **Application Runtime & Reverse Proxy** phase.

The next objective is to run an application/API as a process inside the VPS,
first validate it locally, and only then place Nginx in front of it as a reverse
proxy.

Initial intended flow:

```text
Internet
   ↓
UFW
   ↓
Nginx — TCP/80 initially, TCP/443 later
   ↓
reverse proxy
   ↓
127.0.0.1:<APP_PORT>
   ↓
application/API
```

The application port should not be exposed directly to the public internet.
Nginx will remain the public entry point and forward requests internally to the
application process.

Before automation, containers, CI/CD or orchestration are introduced, the next
phase should focus on understanding:

- application processes on Linux;
- local ports and loopback networking;
- application logs;
- process/service lifecycle;
- direct local API testing;
- Nginx reverse proxy behavior.

The project continues following the principle:

**UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**
