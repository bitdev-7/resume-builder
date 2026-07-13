// PM2 process config for Resume Maker (backend + frontend).
//
//   Build the frontend first (next start needs the .next output):
//     npm install
//     npm run build
//
//   Then, from an ADMINISTRATOR terminal (port 80 is privileged on Windows):
//     pm2 start ecosystem.config.js
//     pm2 status
//     pm2 logs
//     pm2 save               # remember the process list for reboots
//
// Notes:
//   - Backend runs TypeScript directly via tsx (no compile step).
//   - Env vars come from backend/.env and frontend/.env.local (each app loads its own),
//     so we do not duplicate secrets here.

const fs = require("fs");
const path = require("path");

// npm workspaces may hoist a dependency to the repo-root node_modules or keep it in the
// package's own node_modules. Point PM2 at whichever real file exists.
function firstExisting(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const tsxCli = firstExisting([
  path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(__dirname, "backend", "node_modules", "tsx", "dist", "cli.mjs"),
]);

const nextBin = firstExisting([
  path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
  path.join(__dirname, "frontend", "node_modules", "next", "dist", "bin", "next"),
]);

module.exports = {
  apps: [
    {
      name: "resume-backend",
      cwd: path.join(__dirname, "backend"),
      script: tsxCli,
      args: "src/index.ts",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      max_memory_restart: "1G",
      time: true,
      out_file: path.join(__dirname, "logs", "backend-out.log"),
      error_file: path.join(__dirname, "logs", "backend-error.log"),
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "resume-frontend",
      cwd: path.join(__dirname, "frontend"),
      script: nextBin,
      args: "start -p 80",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      max_memory_restart: "1G",
      time: true,
      out_file: path.join(__dirname, "logs", "frontend-out.log"),
      error_file: path.join(__dirname, "logs", "frontend-error.log"),
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
