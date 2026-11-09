# CI/CD notes

Workflow: `.github/workflows/ci-deploy.yml` (+ `.github/dependabot.yml`).

## Required setup (GitHub → repo Settings)
- Environments → New environment `production`.
  - Secrets: `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` (Hostek FTP account).
  - Variables (optional): `FTP_SERVER_DIR` (default `./`; use `wwwroot/` if the
    FTP login lands above it), `FTP_PORT` (default `21`), `FTP_SECURITY` (`strict` default; `loose` skips
    certificate hostname checks, needed while `FTP_HOST` doesn't match `*.hostek.se`).
- Never commit credentials.

## FTPS mode
Workflow uses explicit FTPS (`protocol: ftps`, port 21). If connection fails,
Hostek may need implicit FTPS: change `protocol` to `ftps-legacy` and set
`FTP_PORT=990`.

## Testing
Actions → CI / Deploy → Run workflow with `dry_run` checked (works from any
branch), then once from `main` with it unchecked.

## Future: API deploy to the Raspberry Pi (not implemented)
Options: self-hosted runner on the Pi running `git pull && npm ci &&
npm run build:api && systemctl restart`, or an SSH deploy job over Tailscale.
Out of scope for the current pipeline.
