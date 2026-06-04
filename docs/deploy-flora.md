# Flora deployment

Production is designed to run from `/opt/flora` behind a reverse proxy. Docker
stores SQLite data in the `flora_flora_data` volume.

## Deploy from this workstation

```powershell
.\scripts\deploy-flora.ps1 -HostName user@example.com
```

The script:

1. Expects `/opt/flora` to be a git checkout of `yuraply/flora`.
2. Creates a pre-deploy backup under `/root/backups/flora/pre-deploy-*`.
3. Backs up `.env`, key config files, current git head, and the
   `flora_flora_data` Docker volume.
4. Fetches `origin/master` from the repository remote.
5. Resets `/opt/flora` to `origin/master`.
6. Restores the production `.env`.
7. Rebuilds and restarts `flora`.
8. Verifies `http://127.0.0.1:20010/api/health`.

Before running the script, commit and push local changes:

```powershell
git status --short
npm test
npm run build
git push origin master
.\scripts\deploy-flora.ps1 -HostName user@example.com
```

For public repositories, the production checkout can use an HTTPS remote:

```bash
git remote set-url origin https://github.com/OWNER/REPO.git
```

## Manual checks

```bash
cd /opt/flora
docker compose ps flora
docker compose logs -f flora
curl -fsS http://127.0.0.1:20010/api/test
curl -fsS https://your-domain.example/api/health
```

## Restore outline

Use the latest full backup under `/root/backups/flora` or the latest
`pre-deploy-*` directory. Restore `/opt/flora`, restore `flora_flora_data`, then
run:

```bash
cd /opt/flora
docker compose up -d --build flora
curl -fsS https://your-domain.example/api/health
```
