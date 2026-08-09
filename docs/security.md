# Security

## SSH

Planejado:

- Autenticação utilizando chave SSH.
- Desabilitar autenticação por senha.
- Desabilitar login remoto direto como root.
- Utilizar usuário administrativo separado.

## Network

Inicialmente:

- IPv4 público habilitado.
- IPv6 não habilitado.
- Firewall UFW será configurado.

Portas planejadas:

| Porta | Serviço | Exposição |
|---|---|---|
| 22 | SSH | Pública |
| 80 | HTTP | Pública |
| 443 | HTTPS | Pública |
| 5432 | PostgreSQL | Não pública |

## Secrets

Nunca devem ser armazenados no Git:

- senhas;
- tokens;
- API keys;
- arquivos `.env`;
- chaves SSH privadas;
- credenciais de banco.


## Estado atual do acesso SSH

- Autenticação inicial realizada com chave Ed25519.
- A private key permanece apenas no computador administrativo.
- A private key possui passphrase.
- A Host Key Ed25519 do servidor foi verificada por canal alternativo antes
  de ser adicionada ao `known_hosts`.
- Login SSH como root ainda está habilitado temporariamente.
- Um usuário administrativo próprio ainda será criado e testado antes de
  restringir o acesso remoto de root.
- `PasswordAuthentication` ainda não foi alterado nesta fase.
- UFW ainda não foi configurado.