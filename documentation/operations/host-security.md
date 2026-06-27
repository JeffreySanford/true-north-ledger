# Host Security

This guide covers host-level controls that sit outside the Docker Compose application stack.

## SSH Brute-Force Protection

Production hosts that expose SSH should run fail2ban with an `sshd` jail. The repository provides a baseline jail template at `scripts/production/fail2ban-sshd.local`.

Install on Ubuntu or Debian hosts:

```sh
sudo apt-get update
sudo apt-get install -y fail2ban
sudo install -m 0644 scripts/production/fail2ban-sshd.local /etc/fail2ban/jail.d/true-north-ledger-sshd.local
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

The template enables the `sshd` jail, uses the systemd backend, bans after 5 failed attempts within 10 minutes, and applies a 1 hour ban. Update `ignoreip` before installation if operators need to preserve access from a bastion, VPN, or static office egress.

## Applicability

fail2ban is required when operators administer the production host over SSH. It is not part of the Docker Compose stack and should not be installed inside the application containers. If SSH is disabled or the host is accessed only through a managed provider console, document that exception in the deployment runbook.

## Verification

After installation, verify:

```sh
sudo systemctl is-active fail2ban
sudo fail2ban-client status sshd
```

The `sshd` jail should be listed as enabled and should report the configured retry, findtime, and ban behavior through fail2ban status output and logs.
