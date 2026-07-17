# Deployment Guide (CI/CD to VPS with Docker)

This project deploys with Docker Compose to a Linux VPS. Deployment is triggered
**manually** from GitHub Actions (a "Run workflow" button). Nothing deploys
automatically when you push code.

## How it works

1. You click **Run workflow** in the GitHub Actions tab (only the `develop` branch is allowed).
2. GitHub Actions connects to your VPS over SSH.
3. It copies the code, writes the `.env` files from your GitHub Secrets, then runs
   `docker compose up -d --build` on the VPS.
4. Two containers come up:
   - `frontend` (Next.js) published on host **port 80**.
   - `backend` (Express API) on internal port 4000, reachable only by the frontend
     over the private Docker network. The browser calls the frontend, and Next.js
     proxies `/api/*` to the backend. Only port 80 needs to be open publicly.

PDF generation (Puppeteer) runs inside the backend container using the system
Chromium that the Docker image installs, so you do not install Chrome on the VPS.

---

## Part A: One-time VPS setup

Run these on the VPS (as a sudo-capable user). Replace placeholders as needed.

### 1. Install Docker + Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # so you can run docker without sudo
# log out and back in for the group change to take effect
docker compose version             # confirm the compose plugin is available
```

### 2. Create the app directory

Match this to `APP_DIR` (default `/opt/resume-maker`).

```bash
sudo mkdir -p /opt/resume-maker
sudo chown -R $USER:$USER /opt/resume-maker
```

### 3. Create a deploy SSH key (for GitHub to log in)

On your **local machine** (not the VPS), generate a dedicated key pair:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ./vps_deploy_key
```

- Add the **public** key to the VPS user's authorized keys:

  ```bash
  # copy the contents of vps_deploy_key.pub, then on the VPS:
  echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  ```

- Keep the **private** key (`vps_deploy_key`) for the `VPS_SSH_KEY` GitHub Secret (Part B).

### 4. Open the firewall

Only port 80 (web) and 22 (SSH) need to be open. The backend port 4000 stays
internal to Docker and must **not** be exposed.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

If your VPS provider has its own firewall/security group (DigitalOcean, AWS, etc.),
open ports 22 and 80 there as well.

> If something else is already using port 80 on the VPS (for example an old PM2
> `next start` process), stop it first: `pm2 stop all` / `pm2 delete all`, or
> change the published port in `docker-compose.yml` (for example `8080:3000`).

---

## Part B: GitHub configuration

Go to your repository -> **Settings** -> **Secrets and variables** -> **Actions**.

### Secrets (Settings -> Secrets and variables -> Actions -> New repository secret)

| Secret name    | What to put in it                                                        |
| -------------- | ------------------------------------------------------------------------ |
| `VPS_HOST`     | VPS IP address or hostname (for example `203.0.113.10`)                  |
| `VPS_USER`     | SSH username on the VPS (for example `ubuntu` or `deploy`)               |
| `VPS_SSH_KEY`  | The **private** key contents from `vps_deploy_key` (the whole file)      |
| `BACKEND_ENV`  | The full contents of the backend `.env` file (see below)                 |
| `FRONTEND_ENV` | The full contents of the root `.env` for the frontend build (see below)  |

### Variables (optional, Settings -> Variables -> New repository variable)

| Variable name | Default            | Purpose                              |
| ------------- | ------------------ | ------------------------------------ |
| `VPS_PORT`    | `22`               | SSH port, if not the default         |
| `APP_DIR`     | `/opt/resume-maker`| Where the app lives on the VPS       |

### What goes in the `BACKEND_ENV` secret

Paste this whole block as the value, filling in real values. Do **not** include
`PUPPETEER_EXECUTABLE_PATH` or `PORT`; the compose file sets those for the container.

```env
CORS_ORIGIN=http://YOUR_VPS_IP_OR_DOMAIN

OPENROUTER_API_KEY=...
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini
OPENROUTER_EXTRACT_MODEL=openai/gpt-4.1-mini
AI_FALLBACK_MODEL=

OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# Required for admin cross-user reads and reliable AI usage logging from
# background generation jobs (bypasses RLS; JWT fallback can miss rows).
SUPABASE_SERVICE_ROLE_KEY=...
```

### What goes in the `FRONTEND_ENV` secret

These `NEXT_PUBLIC_*` values are baked into the browser bundle at build time.
Leave `NEXT_PUBLIC_API_URL` empty so the browser uses the same-origin proxy to the
backend (recommended for a single VPS).

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=
```

> When you rotate a key later, just edit the secret and re-run the workflow.

---

## Part C: Deploy

1. Push your changes to the `develop` branch.
2. In GitHub, open the **Actions** tab.
3. Select **Deploy to VPS** in the left sidebar.
4. Click **Run workflow**, choose the `develop` branch, and confirm.
5. Watch the logs. When it finishes, the last step prints `docker compose ps`.

Open `http://YOUR_VPS_IP` in a browser to verify.

---

## Useful commands (run only when needed, not on a schedule)

The app runs on its own. Containers use `restart: unless-stopped`, so they survive
crashes and VPS reboots automatically. You do not need to run anything daily. These
are just handy when you want to check status or troubleshoot.

```bash
cd /opt/resume-maker

docker compose ps            # container status
docker compose logs -f       # follow logs (both services)
docker compose logs -f backend
docker compose restart       # restart without rebuilding
docker compose down          # stop and remove containers
docker compose up -d --build # rebuild and start (same as the workflow)
```

Health check for the backend (from the VPS):

```bash
docker compose exec backend node -e "fetch('http://localhost:4000/health').then(r=>r.json()).then(console.log)"
```

---

## Troubleshooting

- **Workflow fails at "Set up SSH" / permission denied**: the public key is not in
  the VPS `~/.ssh/authorized_keys`, or `VPS_USER` / `VPS_HOST` / `VPS_PORT` are wrong.
- **"host key verification failed"**: the `ssh-keyscan` step could not reach the host;
  confirm the VPS is up and port 22 (or your `VPS_PORT`) is open.
- **Site loads but API calls fail**: check `docker compose logs backend`. Confirm the
  backend started and that `CORS_ORIGIN` in `BACKEND_ENV` matches your public URL.
- **PDF generation fails**: check backend logs for a Chromium launch error. The image
  installs `chromium` and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`; do not
  override that in the `BACKEND_ENV` secret.
- **`Failed to proxy .../api/analyze Error: socket hang up (ECONNRESET)` on the VPS
  but not locally**: the Next.js rewrite proxy defaults to a 30s `proxyTimeout`, which
  used to abort the long-running AI request. Generation is now **asynchronous** — POST
  `/api/analyze` returns a `jobId` in seconds and the frontend polls
  `GET /api/analyze/status/:jobId`, so no single request blocks for minutes and the 30s
  limit no longer bites. `frontend/next.config.js` still raises `proxyTimeout` via
  `experimental.proxyTimeout` (default 10 min, override with `PROXY_TIMEOUT_MS`) as a
  safety net for other long endpoints. It is a build-time setting, so rebuild the
  frontend image: `docker compose up -d --build`. Locally you typically set
  `NEXT_PUBLIC_API_URL=http://localhost:4000`, which makes the browser call the backend
  directly and bypasses the rewrite proxy entirely — that is why the error only
  appeared on the VPS (where `NEXT_PUBLIC_API_URL` is empty).
- **Port 80 already in use**: stop the previous PM2/native process, or change the
  published port in `docker-compose.yml`.
- **Login/Supabase broken in the browser after deploy**: the `NEXT_PUBLIC_*` values in
  `FRONTEND_ENV` were wrong or empty at build time. Fix the secret and re-run the workflow
  (these values are baked at build, so a rebuild is required).

---

## Files added for CI/CD

| File                          | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `.github/workflows/deploy.yml`| Manual deploy workflow (develop branch, SSH to VPS)        |
| `backend/Dockerfile`          | Backend image (Node + tsx + Chromium for PDFs)             |
| `frontend/Dockerfile`         | Frontend image (Next.js build with public env baked in)    |
| `docker-compose.yml`          | Runs both containers; publishes only port 80               |
| `.dockerignore`               | Keeps build context small and secrets out of images        |
