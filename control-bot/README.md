# control-bot — launch profile for claude-code-telegram (ARD §12)

No custom code here: this folder holds config + launch profile for
[`RichardAtCT/claude-code-telegram`](https://github.com/RichardAtCT/claude-code-telegram),
installed from the tagged version:

```bash
uv tool install git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0
```

(`uv` is not installed on this dev machine yet; this runs on the server / in the
Docker image — see `deploy/`.)

The runtime profile is `runtime.env.example` (ARD §3). Copy to a real env file
outside git and fill in the secrets.

References to read during implementation: the repo's `docs/setup.md`,
`docs/tools.md`, `docs/configuration.md`, `.env.example`.
