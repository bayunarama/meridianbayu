import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getOverview() {
  const state = readJSON(path.join(__dirname, 'state.json'));
  const lessons = readJSON(path.join(__dirname, 'lessons.json'));
  const poolMem = readJSON(path.join(__dirname, 'pool-memory.json'));
  const config = readJSON(path.join(__dirname, 'user-config.json'));

  const positions = state ? Object.values(state.positions || {}) : [];
  const open = positions.filter(p => !p.closed);
  const closed = positions.filter(p => p.closed);
  const perf = lessons?.performance || [];
  const pools = poolMem ? Object.values(poolMem) : [];

  let totalPnL = 0, wins = 0, losses = 0, totalFees = 0, totalInvested = 0;
  for (const p of perf) {
    totalPnL += p.pnl_usd || 0;
    totalFees += p.fees_earned_usd || 0;
    totalInvested += p.initial_value_usd || 0;
    if ((p.pnl_pct || 0) > 0) wins++;
    else losses++;
  }

  const totalDeploys = pools.reduce((s, p) => s + (p.total_deploys || 0), 0);
  const poolWins = pools.filter(p => (p.win_rate || 0) > 0.5).length;
  const poolLosses = pools.filter(p => (p.win_rate || 0) <= 0.5).length;

  return {
    totalPositions: positions.length,
    openPositions: open.length,
    closedPositions: closed.length,
    totalDeploys,
    totalPnL: Math.round(totalPnL * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    totalInvested: Math.round(totalInvested * 100) / 100,
    winRate: perf.length > 0 ? Math.round((wins / perf.length) * 100) : 0,
    wins,
    losses,
    totalTrades: perf.length,
    poolsTracked: pools.length,
    poolWins,
    poolLosses,
    avgPnL: perf.length > 0 ? Math.round((totalPnL / perf.length) * 100) / 100 : 0,
    avgFeePct: totalInvested > 0 ? Math.round((totalFees / totalInvested) * 10000) / 100 : 0,
    bestTrade: perf.reduce((b, p) => ((p.pnl_pct || 0) > (b?.pnl_pct || -Infinity) ? p : b), null),
    worstTrade: perf.reduce((w, p) => ((p.pnl_pct || 0) < (w?.pnl_pct || Infinity) ? p : w), null),
    dryRun: config?.dryRun ?? true,
  };
}

function getDecisions() {
  const data = readJSON(path.join(__dirname, 'decision-log.json'));
  return data?.decisions?.slice(-30).reverse() || [];
}

function getActions() {
  const logsDir = path.join(__dirname, 'logs');
  try {
    const files = fs.readdirSync(logsDir).filter(f => f.startsWith('actions-') && f.endsWith('.jsonl'));
    if (!files.length) return [];
    const latest = files.sort().pop();
    const lines = fs.readFileSync(path.join(logsDir, latest), 'utf-8').trim().split('\n');
    return lines.slice(-50).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function getSnapshotsForPool(poolData) {
  return (poolData?.snapshots || []).map(s => ({
    ...s,
    pool_name: poolData.name,
  }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // API routes
  if (pathname === '/api/overview') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getOverview()));
    return;
  }

  if (pathname === '/api/performance') {
    const lessons = readJSON(path.join(__dirname, 'lessons.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lessons?.performance || []));
    return;
  }

  if (pathname === '/api/positions') {
    const state = readJSON(path.join(__dirname, 'state.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state?.positions ? Object.values(state.positions).reverse() : []));
    return;
  }

  if (pathname === '/api/pools') {
    const poolMem = readJSON(path.join(__dirname, 'pool-memory.json'));
    const pools = poolMem ? Object.entries(poolMem).map(([addr, data]) => ({ address: addr, ...data })) : [];
    const allSnapshots = pools.flatMap(p => getSnapshotsForPool(p));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pools, allSnapshots }));
    return;
  }

  if (pathname === '/api/decisions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDecisions()));
    return;
  }

  if (pathname === '/api/lessons') {
    const lessons = readJSON(path.join(__dirname, 'lessons.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lessons?.lessons || []));
    return;
  }

  if (pathname === '/api/config') {
    const config = readJSON(path.join(__dirname, 'user-config.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config || {}));
    return;
  }

  if (pathname === '/api/actions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getActions()));
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'dashboard.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = process.env.MONITOR_PORT || 3030;
const HOST = process.env.MONITOR_HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  const ip = HOST === '0.0.0.0' ? 'your-server-ip' : HOST;
  console.log(`📊 Monitor dashboard: http://${ip}:${PORT}`);
  console.log(`   API:              http://${ip}:${PORT}/api/overview`);
});
