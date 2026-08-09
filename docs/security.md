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