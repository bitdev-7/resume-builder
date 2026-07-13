# Serve Resume Maker on your local network (access by IP)

Run the app on one Windows "host" laptop and reach it from other laptops on the same
Wi-Fi/LAN just by typing the host's IP address, e.g. `http://192.168.1.50`.

Ports used:

| Service | Port | Reached by |
|---|---|---|
| Frontend (Next.js) | 80 | clients, in the browser: `http://<host-ip>` (port 80 is the default, so no `:port` needed) |
| Backend API (Express) | 9999 | the browser, directly: `http://<host-ip>:9999` |

Supabase (database/auth) is cloud-hosted, so every laptop only needs internet access for
that part. Nothing about Supabase changes here.

## How the pieces talk

```
Client browser  ->  http://<host-ip>        (Next.js frontend, port 80 on the host)
Client browser  ->  http://<host-ip>:9999   (Express backend API on the host)
Backend (host)  ->  Supabase cloud + AI provider (internet)
```

The browser calls the backend directly (not through the Next.js proxy) because the resume
pipeline can run for minutes and the proxy resets long requests ("socket hang up"). The
frontend figures out the backend address at runtime from whatever host you opened the page
from, so there is nothing to rebuild when your IP changes. This is set by
`NEXT_PUBLIC_API_URL=:9999` in `frontend/.env.local`.

---

## Step 1 - Find the host laptop's LAN IP

On the host, in PowerShell:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp','Manual' } | Select-Object IPAddress, InterfaceAlias
```

Pick the address on your Wi-Fi/Ethernet adapter, e.g. `192.168.1.50`. That is the address
other laptops will type. To keep it stable, reserve a static IP for this laptop in your router.

---

## Step 2 - Environment variables (already set in this repo)

These are configured for you; listed here so you know what they do.

`frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=:9999          # backend on the same host, port 9999 (resolved in the browser)
BACKEND_URL=http://localhost:9999  # only used if NEXT_PUBLIC_API_URL is empty
```

`backend/.env`:

```
PORT=9999
# CORS_ORIGIN left unset = allow any origin (fine on a trusted LAN accessed by IP).
# ...your OPENROUTER_API_KEY etc. stay as-is
```

Note: `NEXT_PUBLIC_*` values are compiled into the frontend during `npm run build`. Because
we use `:9999` (resolved at runtime) rather than a hard-coded IP, you do NOT need to rebuild
when your IP changes. You only rebuild if you edit these values.

---

## Step 3 - Open the Windows firewall for ports 80 and 9999

On the host, in an **Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Resume Maker Frontend 80"  -Direction Inbound -Protocol TCP -LocalPort 80   -Action Allow
New-NetFirewallRule -DisplayName "Resume Maker Backend 9999" -Direction Inbound -Protocol TCP -LocalPort 9999 -Action Allow
```

Also make sure your network profile is "Private", not "Public":

```powershell
Get-NetConnectionProfile
```

---

## Step 4 - Build and run on the host

Port 80 is a privileged port on Windows, so run these terminals **as Administrator**.

Production mode (recommended - stable and fast):

```powershell
npm install
npm run build          # builds the frontend
npm run start:backend  # terminal 1 (Administrator)
npm run start:frontend # terminal 2 (Administrator) - serves on port 80
```

Run under PM2 (keeps both alive, restarts on crash, survives logoff):

```powershell
npm install
npm run build                       # frontend build (needed before next start)
pm2 start ecosystem.config.js       # Administrator terminal (port 80 is privileged)
pm2 status                          # see both processes
pm2 logs                            # tail logs (also written to ./logs)
pm2 save                            # remember the process list
```

Common PM2 commands: `pm2 restart all`, `pm2 stop all`, `pm2 delete all`,
`pm2 restart resume-backend`. To start automatically on Windows boot, install a startup
helper (PM2's built-in `pm2 startup` does not support Windows), e.g. `pm2-installer` or
`npm i -g pm2-windows-startup && pm2-startup install`, then `pm2 save`.

Quick dev mode (hot reload, no PM2):

```powershell
npm run dev            # Administrator terminal; backend on 9999, frontend on 80
```

If you use dev mode and open the site by IP, add that IP to `allowedDevOrigins` in
`frontend/next.config.js` so Next.js allows it, e.g.:

```js
allowedDevOrigins: ["192.168.1.50", "localhost", "127.0.0.1"],
```

(Production mode ignores that setting.)

---

## Step 5 - Open it from another laptop

Browse to the host IP:

```
http://192.168.1.50
```

Sign in and use it normally.

---

## Optional - use a name instead of the IP

If you prefer `http://resume.local` over the bare IP, add this line to each laptop's hosts
file (`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on macOS/Linux),
edited as Administrator/root:

```
192.168.1.50   resume.local
```

Then browse to `http://resume.local`. Because the backend address is derived from the host
you opened, `http://resume.local:9999` is used automatically - no extra config. If your
router supports "local DNS", add the mapping there once instead of on every laptop.

---

## Verify quickly

From a client laptop:

- Backend health: open `http://192.168.1.50:9999/health` -> should return `{"ok":true}`.
- Frontend: open `http://192.168.1.50` -> the login page should load.

On the host, confirm both servers listen on all interfaces:

```powershell
netstat -ano | Select-String ":80 |:9999 "
```

You should see `0.0.0.0:80` and `0.0.0.0:9999` (not just `127.0.0.1`).

---

## Troubleshooting

- **Frontend will not start / "port 80 in use" or "access denied"**: run the terminal as
  Administrator, and free port 80. See what holds it:
  ```powershell
  netstat -ano | Select-String ":80 "
  ```
  Common culprits are IIS ("World Wide Web Publishing Service") and the "Web Deployment Agent".
  Stop the web service with `Stop-Service W3SVC` (Administrator), or pick a different frontend
  port by changing `-p 80` in `frontend/package.json` (then clients must include that port).
- **Client cannot connect at all**: firewall (Step 3), the network is "Public", or the laptops
  are on different networks (guest vs main Wi-Fi).
- **Site loads but API calls fail with a CORS error**: `CORS_ORIGIN` in `backend/.env` is set
  to specific origins that do not match. Leave it unset to allow any LAN origin, or add the
  exact `http://<host-ip>` value. Restart the backend after changing it.
- **"socket hang up" during resume generation**: confirm `NEXT_PUBLIC_API_URL=:9999` (direct to
  backend, not the proxy) and that `SERVER_TIMEOUT_MS` is set (default 600000 in the backend).
- **IP changed and clients broke**: no rebuild needed - clients just use the new IP (or update
  the single hosts/router entry if you used a name).

---

## Known limitation - where downloads land

The "Download" action saves the PDF to the **host** laptop's Downloads folder (the backend
writes the file server-side). When the server save is unavailable, the browser falls back to a
normal download on the client. For multi-laptop use, treat the browser download as the file the
remote user gets, and the host's Downloads folder as a copy on the host.

---

## Security note

This exposes the app to everyone on the LAN with no gateway or HTTPS. Only do this on a network
you trust. Secrets live in `backend/.env` on the host; it is not intended as an internet-facing
deployment.
