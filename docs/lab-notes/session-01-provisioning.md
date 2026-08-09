# Session 01 — Provisioning

Date: 2026-08-09

## Objective

Provisionar a primeira VPS do projeto OpsLab na DigitalOcean.

## Decisions

### Cloud Provider

DigitalOcean.

### Region

NYC1 - New York.

### Operating System

Ubuntu 24.04 LTS x64.

### Compute

- Basic Droplet
- Shared CPU
- Regular SSD
- 1 vCPU
- 1 GB RAM
- 25 GB SSD
- 1 TB Transfer
- US$ 6/month

### Authentication

SSH public-key authentication.

Password authentication was not selected.

### Networking

Public IPv4 enabled.

IPv6 initially disabled to reduce complexity during the first networking exercises.

### Monitoring

DigitalOcean Metrics Agent enabled.

### Backup

DigitalOcean automated backup initially disabled.

Backup and restore will be implemented manually during the laboratory.

### Startup Automation

Disabled.

Initial provisioning will be performed manually to understand each configuration step before introducing automation.

## What I learned

A Droplet is a virtual machine running on DigitalOcean infrastructure.

The Droplet continues to incur compute charges while it exists, even if powered off.

SSH keys allow authentication without sending a server password.

## Next Step

Generate an SSH key on the local Windows machine and associate the public key with the Droplet.