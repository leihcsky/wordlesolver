const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function buildSpoilerFreeHint(title, color) {
  const t = String(title || '').toUpperCase();
  const c = String(color || '').toLowerCase();

  if (t.includes('___') || t.includes('BLANK')) {
    return 'Find words that can pair with the same missing word or phrase.';
  }
  if (t.includes('KINDS OF') || t.includes('TYPES OF')) {
    return 'These words are all members of the same subtype/category.';
  }
  if (t.includes('WORDS FOR') || t.includes('TERMS FOR')) {
    return 'Look for words used in similar language situations or roles.';
  }
  if (t.includes('MINUS') || t.includes('WITHOUT') || t.includes('SOUND')) {
    return 'This group uses a wordplay transformation (remove or change a sound/ending).';
  }

  if (c === 'yellow') return 'The easiest set: a straightforward shared meaning links all four.';
  if (c === 'green') return 'This set shares a practical everyday concept with close usage.';
  if (c === 'blue') return 'Think niche knowledge, symbols, or domain-specific associations.';
  if (c === 'purple') return 'Expect wordplay: sounds, affixes, or phrase-level transformations.';
  return 'These four words share one hidden connection.';
}

function run(nytPath) {
  const absNyt = path.isAbsolute(nytPath) ? nytPath : path.join(REPO_ROOT, nytPath);
  const raw = fs.readFileSync(absNyt, 'utf8');
  const nyt = JSON.parse(raw);
  const date = String(nyt.print_date || '').slice(0, 10);
  const colors = ['yellow', 'green', 'blue', 'purple'];

  const outPath = path.join(REPO_ROOT, 'data', 'connections', `${date}.json`);
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
    const html = fs.readFileSync(path.join(REPO_ROOT, 'connections-hints-today.html'), 'utf8');
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
  const hints = groups.map((g) => buildSpoilerFreeHint(g.title, g.color));

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
