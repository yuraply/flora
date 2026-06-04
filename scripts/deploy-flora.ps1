param(
    [string]$HostName = $env:FLORA_DEPLOY_HOST,
    [string]$RemoteAppDir = "/opt/flora",
    [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

if (-not $HostName) {
    throw "Set -HostName or FLORA_DEPLOY_HOST, for example: .\scripts\deploy-flora.ps1 -HostName user@example.com"
}

$remoteScript = @'
set -euo pipefail

APP_DIR="__REMOTE_APP_DIR__"
BRANCH="__BRANCH__"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT="/root/backups/flora"
BACKUP_DIR="$BACKUP_ROOT/pre-deploy-$STAMP"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

if [ ! -d .git ]; then
    echo "$APP_DIR is not a git checkout" >&2
    exit 1
fi

cp .env server.js docker-compose.yml package.json package-lock.json "$BACKUP_DIR/" 2>/dev/null || true
docker run --rm -v flora_flora_data:/volume -v "$BACKUP_DIR:/backup" alpine sh -c 'cd /volume && tar -czf /backup/flora_data-volume.tar.gz .'
docker compose ps > "$BACKUP_DIR/docker-compose-ps.txt" || true
git rev-parse HEAD > "$BACKUP_DIR/git-head-before.txt"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

if [ -f "$BACKUP_DIR/.env" ]; then
    cp "$BACKUP_DIR/.env" .env
fi

docker compose up -d --build flora
for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:20010/api/health; then
        break
    fi
    if [ "$i" -eq 30 ]; then
        docker compose logs --tail=120 flora
        exit 1
    fi
    sleep 2
done

printf '\n'
printf 'DEPLOYED_HEAD='
git rev-parse --short HEAD
docker compose ps flora
printf 'PRE_DEPLOY_BACKUP=%s\n' "$BACKUP_DIR"
'@

$remoteScript = $remoteScript.
    Replace("__REMOTE_APP_DIR__", $RemoteAppDir).
    Replace("__BRANCH__", $Branch)

$remoteScript | ssh $HostName "bash -s"
