# 01 — Server setup: provision the host

Provision a fresh Ubuntu/Debian host so it can build and run the Compose stack.
The target server is `91.107.147.127`, reachable as `ssh inja`. Run everything
below on that host **as root**.

## 1. Install Docker, the Compose plugin, and git

```bash
# on 91.107.147.127 (ssh inja), as root
apt-get update && apt-get install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

`docker-compose-plugin` provides the `docker compose` (v2) subcommand used
throughout these runbooks.

## 2. Create the `/opt/inja` layout and clone both repos

```bash
mkdir -p /opt/inja/{secrets,keys}
git clone git@github.com:lilihosieni-amin/injaprocess_code-repo.git /opt/inja/code-repo
git clone git@github.com:lilihosieni-amin/injaprocess_data-repo.git /opt/inja/data-repo
```

> **Note:** cloning both repos needs an SSH key on the server with read access to
> them — either GitHub deploy keys on each repo, or the account key. (A separate
> **write** deploy key for `git-push` is created later, in
> [`02-secrets-and-auth.md`](02-secrets-and-auth.md).)

This leaves `/opt/inja/code-repo`, `/opt/inja/data-repo`, `/opt/inja/secrets`,
and `/opt/inja/keys` in place — the layout shown in
[`00-overview.md`](00-overview.md).

## 3. Firewall: allow SSH + 443 only

The stack publishes exactly one port (443, via the `proxy`), so lock the host
down to SSH and 443:

```bash
# firewall: allow SSH + 443 only
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable
```

## Next

Continue with [`02-secrets-and-auth.md`](02-secrets-and-auth.md) to create the
secret env files, the git-push deploy key, and the Claude subscription login.
