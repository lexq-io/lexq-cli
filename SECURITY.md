# Security Policy

## Reporting a vulnerability

Please report security issues through GitHub's private vulnerability reporting:

**[Report a vulnerability](https://github.com/lexq-io/lexq-cli/security/advisories/new)**

That form is private. Only the maintainers can read it, and it stays private until a fix is
released. Do not open a public issue or pull request for a security problem — an issue is
world-readable the moment it is filed, which tells everyone about the flaw before there is
anything to upgrade to.

Reports are read by the maintainers and acknowledged as soon as one is available.

## Scope

This policy covers the `@lexq/cli` package and the tool definitions it exports. That includes
anything reachable from the CLI or from the MCP tools it registers: argument handling,
credential storage, the API client, and the schemas published through `tools/list`.

Findings in the hosted service this client talks to belong here too. Report them the same
way; they reach the same maintainers.

## Supported versions

Fixes go to the latest published version on npm. There are no long-term support branches, so
upgrading is the remedy.

## Credentials

Never include a real API key, token, or customer data in a report. A redacted example or a
description of the shape is enough to reproduce anything this package does.
