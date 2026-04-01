const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  const args = { date: null, git: false, wordle: true, connections: true };
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

function runNodeScript(scriptPath, args) {
  const full = ['node', scriptPath, ...args].join(' ');
  execSync(full, { stdio: 'inherit' });
}

async function main() {
  const args = parseArgs(process.argv);
  const iso = args.date || todayIso();

  const tmpWordle = path.resolve(process.cwd(), 'tmp-wordle.json');
  const tmpConnections = path.resolve(process.cwd(), 'tmp-connections.json');

  const wordleUrl = `https://www.nytimes.com/svc/wordle/v2/${iso}.json`;
  const connectionsUrl = `https://www.nytimes.com/svc/connections/v2/${iso}.json`;

  if (args.wordle) {
    const wordle = await fetchJson(wordleUrl);
    writeJson(tmpWordle, wordle);
    runNodeScript(path.resolve('scripts', 'update-wordle-today.js'), [tmpWordle]);
  }

  if (args.connections) {
    const connections = await fetchJson(connectionsUrl);
    writeJson(tmpConnections, connections);
    runNodeScript(path.resolve('scripts', 'update-connections-from-nyt.js'), [tmpConnections]);
    runNodeScript(path.resolve('scripts', 'generate-connections-pages.js'), [path.resolve('data', 'connections', `${iso}.json`)]);
  }

  try {
    fs.unlinkSync(tmpWordle);
  } catch {}
  try {
    fs.unlinkSync(tmpConnections);
  } catch {}

  if (args.git) {
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m Daily-Update-${iso}`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
  }
}

main().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
