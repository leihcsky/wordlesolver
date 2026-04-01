const fs = require('fs');
const path = require('path');

function run(nytPath) {
  const raw = fs.readFileSync(nytPath, 'utf8');
  const nyt = JSON.parse(raw);
  const date = String(nyt.print_date || '').slice(0, 10);
  const colors = ['yellow', 'green', 'blue', 'purple'];

  const outPath = path.join('data', 'connections', `${date}.json`);
  let puzzleNumber = 0;
  try {
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (existing && typeof existing.puzzleNumber === 'number' && Number.isFinite(existing.puzzleNumber)) {
        puzzleNumber = existing.puzzleNumber;
      }
    }
  } catch {}

  let prevNum = 0;
  try {
    const html = fs.readFileSync(path.resolve('connections-hints-today.html'), 'utf8');
    const m = html.match(/Connections #([0-9]+)/);
    if (m) prevNum = parseInt(m[1], 10) || 0;
  } catch {}
  if (!puzzleNumber) puzzleNumber = prevNum ? prevNum + 1 : (nyt.id || 0);

  const groups = (nyt.categories || []).slice(0, 4).map((cat, i) => ({
    color: colors[i] || 'yellow',
    title: String(cat.title || '').toUpperCase(),
    words: (cat.cards || []).map((c) => String((c.content != null ? c.content : c.image_alt_text) || '').toUpperCase()),
    explanation: String(cat.title || '')
  }));
  const words = groups.flatMap((g) => g.words);
  const hints = groups.map((g) => g.title);

  const out = { date, puzzleNumber, words, groups, hints };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  process.stdout.write(`wrote ${outPath} #${puzzleNumber}\n`);
}

if (process.argv.length < 3) {
  console.error('Usage: node scripts/update-connections-from-nyt.js tmp-connections.json');
  process.exit(1);
}
run(process.argv[2]);
