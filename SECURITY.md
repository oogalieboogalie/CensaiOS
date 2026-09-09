# Security Policy

Censai runs AI agents with real tools — file access, shell, git, web. We take the integrity of
the codebase and the safety of self-hosters seriously. This document covers how to report
vulnerabilities and what our automated gate enforces on every contribution.

## Reporting a vulnerability

**Do not open a public issue for security problems.** Instead:

- Use **GitHub's private vulnerability reporting**: the *Security* tab → *Report a vulnerability*.
- Or email the maintainer (see the repo profile) with `SECURITY` in the subject.

Please include: what the issue is, how to reproduce it, and the potential impact. We aim to
acknowledge within a few days. Coordinated disclosure is appreciated — give us a reasonable
window to ship a fix before going public. We'll credit you unless you prefer otherwise.

### In scope
The application code (`server/`, `src/`), the Docker/compose setup, default configuration, the
agent tool sandboxing model, and anything that could let a workspace/agent escape its intended
permissions or exfiltrate secrets.

### Out of scope
Vulnerabilities in third-party model providers; issues that require an already-compromised host
or a malicious self-host operator attacking their own instance; missing hardening on a
deployment you control (that's your config — see the self-hosting guide).

## What the contribution gate enforces

Because agents in this project execute code, a malicious or compromised contribution is a
realistic threat. Every pull request runs an automated **Security** workflow
(`.github/workflows/security.yml`) in addition to the normal CI. All checks must pass to merge.

| Layer | Tool | Blocks merge? | Catches |
|---|---|---|---|
| Malicious-code tripwires | `scripts/security-tripwires.mjs` | **yes** | Trojan-Source bidi/invisible unicode, `npm` lifecycle-hook implants, `eval`/`new Function`, `child_process` in client code, hardcoded raw-IP endpoints, oversized encoded blobs, `curl … \| sh` installers, `pull_request_target` abuse |
| Secret scanning | gitleaks (full history) | **yes** | committed API keys, tokens, private keys |
| Dependency audit | `npm audit` | **yes** (high/critical) | known-vulnerable production dependencies |
| Deep analysis | CodeQL (`security-extended`) | informational | injection, taint flows, and other semantic vulnerabilities |

Run the fast layer locally before opening a PR:

```bash
npm run security
```

### Why these specific checks
Secret scanners and CodeQL are excellent but aimed at *accidental* mistakes and *known* bug
classes. The tripwire script targets the cheap tricks a *deliberately* malicious PR uses to slip
past a human reviewer — code that looks innocent on screen but isn't (reordered by unicode
controls), code that runs at install time before anyone reads it (lifecycle hooks), or code that
fetches its real payload at runtime (piped installers, raw-IP callbacks). They're fast,
dependency-free, and block by default.

### If a tripwire flags your honest change
False positives happen. If a hit is genuinely safe, add a `"<file>:<rule>"` entry to the `ALLOW`
set at the top of `scripts/security-tripwires.mjs` **in its own commit**, explaining in the
commit message why the pattern is legitimate in that file. Reviewers will see the exception
clearly rather than it hiding inside a feature change.

## A note for self-hosters

Censai is designed to run on infrastructure you control. The safe defaults — local-only database
binding, sandboxed agent execution, approval modes for risky tools — assume you keep them on.
Before exposing an instance to the internet or to other people, read the self-hosting guide's
hardening section: set a strong `SESSION_SECRET`, never reuse the example credentials, and keep
the agent tool permissions as tight as your use case allows.
