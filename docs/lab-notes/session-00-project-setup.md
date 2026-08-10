# Session 00 — Project Setup

## Objective

Preparar o repositório local e remoto utilizado para documentar e versionar o projeto OpsLab.

O repositório será utilizado como fonte versionada para:

- documentação técnica;
- arquitetura;
- decisões de segurança;
- lab notes;
- código da aplicação;
- configurações reproduzíveis;
- scripts e automações futuras.

A VPS não deve ser considerada a única cópia permanente do projeto.

---

## Repository

- Local repository initialized with Git.
- Default branch: `main`.
- Remote repository hosted on GitHub.
- Repository visibility: Public.

---

## Initial Repository Structure

A estrutura inicial de documentação inclui:

```text
opslab/
├── .gitignore
├── README.md
└── docs/
    ├── architecture.md
    ├── implementation-plan.md
    ├── security.md
    └── lab-notes/
        ├── session-00-project-setup.md
        └── session-01-provisioning.md
```

Novos diretórios poderão ser adicionados conforme o laboratório evoluir.

O código da aplicação também deverá ser versionado no repositório, evitando que exista exclusivamente dentro do filesystem da VPS.

---

## Git Workflow

O workflow utilizado durante o laboratório é:

```text
git status
    ↓
git diff
    ↓
git add
    ↓
git status
    ↓
git diff --cached
    ↓
git commit
    ↓
git push
    ↓
git status
```

A intenção é revisar conscientemente as alterações antes de cada commit.

---

## First Commit

Initial documentation was added and committed with:

```bash
git add .
git commit -m "docs: initialize OpsLab documentation"
```

---

## Documentation Strategy

Cada marco técnico relevante deve ser documentado em uma nova Lab Note.

Exemplo:

```text
docs/lab-notes/
├── session-00-project-setup.md
├── session-01-provisioning.md
└── session-02-application-runtime-reverse-proxy.md
```

As sessões devem registrar:

- objetivo;
- estado inicial;
- comandos utilizados;
- alterações realizadas;
- arquivos criados ou modificados;
- testes;
- erros encontrados;
- diagnóstico;
- decisões de segurança;
- estado final;
- próximos passos.

---

## Repository Philosophy

O GitHub deve armazenar o estado reproduzível do projeto, incluindo:

- application source code;
- documentation;
- architecture;
- safe configuration examples;
- deployment instructions;
- automation scripts when introduced.

Secrets must never be committed.

Examples of information that must remain outside the public repository:

- SSH private keys;
- private-key passphrases;
- database passwords;
- API keys;
- authentication tokens;
- production `.env` files containing secrets.

---

## Recovery Principle

Uma VPS deve ser considerada uma infraestrutura substituível.

O objetivo futuro é que uma nova máquina possa ser criada e o serviço reconstruído utilizando:

```text
Git repository
      +
infrastructure documentation / automation
      +
external backups
      +
secrets restored securely
```

Git does not replace:

- filesystem snapshots;
- database backups;
- application data backups;
- secret management.

Essas camadas serão implementadas posteriormente.

---

## Project Methodology

O projeto segue o princípio:

**UNDERSTAND → EXECUTE → TEST → DOCUMENT → COMMIT**

Automação só deve ser introduzida depois que a camada correspondente tiver sido entendida manualmente.