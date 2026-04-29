/**
 * Daily refresh for Wordle + NYT Connections “today” pages.
 *
 * Pipeline:
 * 1) Fetch NYT JSON for the date (UTC calendar day by default, or --date YYYY-MM-DD).
 * 2) Wordle: tmp JSON → scripts/update-wordle-today.js → wordle-hints-today.html
 *    (soft hints, strategy blurbs, data-answer + per-letter tiles).
 * 3) Connections: tmp JSON → scripts/update-connections-from-nyt.js → data/connections/YYYY-MM-DD.json
 *    → scripts/generate-connections-pages.js → connections-hints-today.html, daily-connections/*.html, connections-archive.html
 *
 * Options: --date ISO, --git (add/commit/push), --wordle-only, --connections-only
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function todayIso() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${y}-${m}-${dd}`;
}

function parseArgs(argv) {
  const args = { date: null, git: false, wordle: true, connections: true, connectionsData: null };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--date') {
      args.date = argv[i + 1];
      i += 1;
      continue;
    }
    if (v === '--git') {
      args.git = true;
      continue;
    }
    if (v === '--wordle-only') {
      args.wordle = true;
      args.connections = false;
      continue;
    }
    if (v === '--connections-only') {
      args.wordle = false;
      args.connections = true;
      continue;
    }
    if (v === '--connections-data') {
      args.connectionsData = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return args;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(buf);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function runNodeScript(scriptRelative, args) {
  const scriptPath = path.join(REPO_ROOT, scriptRelative);
  execFileSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit', cwd: REPO_ROOT });
}

async function main() {
  const args = parseArgs(process.argv);
  const iso = args.date || todayIso();

  const tmpWordle = path.join(REPO_ROOT, 'tmp-wordle.json');
  const tmpConnections = path.join(REPO_ROOT, 'tmp-connections.json');

  const wordleUrl = `https://www.nytimes.com/svc/wordle/v2/${iso}.json`;
  const connectionsUrl = `https://www.nytimes.com/svc/connections/v2/${iso}.json`;

  if (args.wordle) {
    const wordle = await fetchJson(wordleUrl);
    writeJson(tmpWordle, wordle);
    runNodeScript(path.join('scripts', 'update-wordle-today.js'), [tmpWordle]);
  }

  if (args.connections) {
    const connectionsSource = args.connectionsData
      ? path.isAbsolute(args.connectionsData)
        ? args.connectionsData
        : path.join(REPO_ROOT, args.connectionsData)
      : tmpConnections;

    if (args.connectionsData) {
      if (!fs.existsSync(connectionsSource)) {
        throw new Error(`Connections data file not found: ${connectionsSource}`);
      }
    } else {
      const connections = await fetchJson(connectionsUrl);
      writeJson(tmpConnections, connections);
    }

    runNodeScript(path.join('scripts', 'update-connections-from-nyt.js'), [connectionsSource]);
    runNodeScript(path.join('scripts', 'generate-connections-pages.js'), [
      path.join('data', 'connections', `${iso}.json`),
    ]);
  }

  try {
    fs.unlinkSync(tmpWordle);
  } catch {}
  try {
    fs.unlinkSync(tmpConnections);
  } catch {}

  if (args.git) {
    execSync('git add -A', { stdio: 'inherit', cwd: REPO_ROOT });
    execSync(`git commit -m Daily-Update-${iso}`, { stdio: 'inherit', cwd: REPO_ROOT });
    execSync('git push origin main', { stdio: 'inherit', cwd: REPO_ROOT });
  }
}

main().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
