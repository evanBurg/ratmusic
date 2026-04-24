import express from 'express';
import basicAuth from 'express-basic-auth';
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use(
  basicAuth({
    users: { [config.admin.user]: config.admin.password },
    challenge: true,
    realm: 'discord-music-bot-admin',
  }),
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (_req, res) => {
  try {
    const [bot, admin] = await Promise.all([
      systemctlStatus(config.admin.botService),
      systemctlStatus(config.admin.adminService),
    ]);
    let commit = null;
    try {
      const { stdout } = await execAsync('git log -1 --pretty=%h%x09%s', { cwd: REPO_ROOT });
      commit = stdout.trim();
    } catch {}
    res.json({ bot, admin, commit, repo: REPO_ROOT });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/logs', (req, res) => {
  const service = req.query.service === 'admin' ? config.admin.adminService : config.admin.botService;
  const lines = clampInt(req.query.lines, 200, 10, 5000);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  const proc = spawn('journalctl', ['--user', '-u', service, '-n', String(lines), '--no-pager', '-o', 'short-iso']);
  let killed = false;
  proc.stdout.pipe(res, { end: false });
  let stderr = '';
  proc.stderr.on('data', (c) => (stderr += c));
  proc.on('close', (code) => {
    if (killed) return;
    if (code !== 0 && stderr) res.write(`\n[journalctl exit ${code}]\n${stderr}`);
    res.end();
  });
  req.on('close', () => { killed = true; try { proc.kill('SIGKILL'); } catch {} });
});

app.get('/api/logs/stream', (req, res) => {
  const service = req.query.service === 'admin' ? config.admin.adminService : config.admin.botService;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const proc = spawn('journalctl', ['--user', '-u', service, '-f', '-n', '50', '--no-pager', '-o', 'short-iso']);
  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line) res.write(`data: ${line.replace(/\r/g, '')}\n\n`);
    }
  });
  proc.stderr.on('data', (chunk) => {
    res.write(`data: [stderr] ${chunk.toString().trim()}\n\n`);
  });
  proc.on('close', () => res.end());

  const ka = setInterval(() => res.write(': keepalive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ka);
    try { proc.kill('SIGKILL'); } catch {}
  });
});

app.post('/api/restart', async (req, res) => {
  const service = req.body?.service === 'admin' ? config.admin.adminService : config.admin.botService;
  try {
    const out = await runCmd('systemctl', ['--user', 'restart', service]);
    res.json({ ok: true, service, out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/stop', async (req, res) => {
  const service = req.body?.service === 'admin' ? config.admin.adminService : config.admin.botService;
  try {
    const out = await runCmd('systemctl', ['--user', 'stop', service]);
    res.json({ ok: true, service, out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/start', async (req, res) => {
  const service = req.body?.service === 'admin' ? config.admin.adminService : config.admin.botService;
  try {
    const out = await runCmd('systemctl', ['--user', 'start', service]);
    res.json({ ok: true, service, out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/git-pull', async (_req, res) => {
  try {
    const pullOut = await runCmd('git', ['-C', REPO_ROOT, 'pull', '--ff-only']);
    let installOut = '';
    try {
      installOut = await runCmd('bash', ['-lc', `cd ${shellQuote(REPO_ROOT)} && pnpm install --prod=false --frozen-lockfile`]);
    } catch (e) {
      installOut = `npm install warning: ${e.message}`;
    }
    let restartOut = '';
    try {
      restartOut = await runCmd('systemctl', ['--user', 'restart', config.admin.botService]);
    } catch (e) {
      restartOut = `restart warning: ${e.message}`;
    }
    res.json({ ok: true, pull: pullOut, install: installOut, restart: restartOut });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const port = config.admin.port;
const bind = config.admin.bind;
app.listen(port, bind, () => {
  logger.info({ url: `http://${bind}:${port}/` }, 'admin panel listening');
});

async function systemctlStatus(service) {
  try {
    const { stdout } = await execAsync(
      `systemctl --user show ${shellQuote(service)} --property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,UnitFileState`,
    );
    const out = {};
    for (const line of stdout.trim().split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
    }
    return { name: service, ...out };
  } catch (e) {
    return { name: service, error: e.message };
  }
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (c) => (stdout += c));
    proc.stderr.on('data', (c) => (stderr += c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${cmd} exit ${code}: ${stderr.trim() || stdout.trim()}`));
      resolve((stdout + stderr).trim());
    });
  });
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}
