const fs = require('fs');
const path = require('path');

function monthName(dt) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[dt.getMonth()];
}
function monthSlug(dt) {
  const slugs = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return slugs[dt.getMonth()];
}

function uniqueLettersUpper(s) {
  const set = new Set(String(s || '').toUpperCase().split(''));
  return Array.from(set);
}

function humanDate(iso) {
  const dt = new Date(iso + 'T00:00:00');
  return `${monthName(dt)} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function buildDailyFileName(num, iso) {
  const dt = new Date(iso + 'T00:00:00');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `daily-solutions/wordle-${num}-${monthSlug(dt)}-${dd}-${dt.getFullYear()}.html`;
}

function ensureWordInBank(wordUpper, iso) {
  const bankPath = path.resolve('data', 'word-bank.json');
  if (!fs.existsSync(bankPath)) return false;
  const raw = fs.readFileSync(bankPath, 'utf8');
  const bank = JSON.parse(raw);
  if (!bank || !Array.isArray(bank.words)) return false;
  const w = String(wordUpper || '').toLowerCase();
  if (!w || w.length !== 5) return false;
  if (bank.words.includes(w)) return false;
  bank.words.push(w);
  if (bank.meta && typeof bank.meta === 'object') {
    bank.meta.count = bank.words.length;
    bank.meta.last_updated = iso;
  }
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 4) + '\n', 'utf8');
  return true;
}

function letterPattern(wordUpper) {
  const vowels = new Set(['A', 'E', 'I', 'O', 'U']);
  return String(wordUpper || '')
    .toUpperCase()
    .split('')
    .map((c) => (vowels.has(c) ? 'V' : 'C'))
    .join('');
}

function repeatedLetters(wordUpper) {
  const counts = new Map();
  for (const c of String(wordUpper || '').toUpperCase()) {
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n > 1)
    .map(([c]) => c);
}

function updateWordleToday(jsonPath) {
  const todayPath = path.resolve('wordle-hints-today.html');
  if (!fs.existsSync(todayPath)) throw new Error('wordle-hints-today.html not found');
  const api = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const newNum = api.days_since_launch;
  const sol = String(api.solution || '').toUpperCase();
  const todayIso = String(api.print_date || '');
  const human = humanDate(todayIso);

  ensureWordInBank(sol, todayIso);

  let html = fs.readFileSync(todayPath, 'utf8');

  const prevNum = (html.match(/Wordle #(\d{3,4})/) || [])[1];
  const prevIso = (html.match(/datetime=\"(\d{4}-\d{2}-\d{2})\"/) || [])[1];
  const prevSolMatch = html.match(/The answer is <span class=\"text-green-600 font-bold\">([A-Z]+)<\/span>/);
  const prevSol = prevSolMatch ? prevSolMatch[1] : '';

  // Backup previous today page to daily file with canonical/url fixups
  if (prevNum && prevIso) {
    const dailyFile = buildDailyFileName(prevNum, prevIso);
    const dailyUrl = dailyFile;
    let backup = html;
    backup = backup.replace(/<link rel=\"canonical\"[^>]*>/, `<link rel=\"canonical\" href=\"https://wordlesolver.best/${dailyUrl}\">`);
    backup = backup.replace(/<meta property=\"og:url\"[^>]*>/, `<meta property=\"og:url\" content=\"https://wordlesolver.best/${dailyUrl}\">`);
    backup = backup.replace(/<meta name=\"twitter:url\"[^>]*>/, `<meta name=\"twitter:url\" content=\"https://wordlesolver.best/${dailyUrl}\">`);
    backup = backup.replace(/\"@id\": \"https:\/\/wordlesolver\.best\/wordle-hints-today\"/, `"@id": "https://wordlesolver.best/${dailyUrl}"`);
    fs.mkdirSync(path.dirname(dailyFile), { recursive: true });
    fs.writeFileSync(dailyFile, backup, 'utf8');
  }

  // Build letters list for hint-2
  const letters = uniqueLettersUpper(sol);
  const lettersList = letters.length > 1 ? `${letters.slice(0, -1).join(', ')}, and ${letters.slice(-1)}` : letters[0];

  // Replace number and dates
  html = html.replace(/Wordle #\d+/g, `Wordle #${newNum}`);
  html = html.replace(/datetime=\"\d{4}-\d{2}-\d{2}\"/, `datetime=\"${todayIso}\"`);
  html = html.replace(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/g, human);

  // Meta/title
  html = html.replace(/<title>Wordle #\d+ Hints & Answer - [^<]+<\/title>/, `<title>Wordle #${newNum} Hints & Answer - ${human} | Wordle Solver</title>`);
  html = html.replace(/<meta property=\"og:title\" content=\"[^\"]+\"\>/, `<meta property=\"og:title\" content=\"Wordle #${newNum} Hints & Answer - ${human}\">`);
  html = html.replace(/<meta name=\"twitter:title\" content=\"[^\"]+\"\>/, `<meta name=\"twitter:title\" content=\"Wordle #${newNum} Hints & Answer - ${human}\">`);
  html = html.replace(/<meta name=\"description\" content=\"[^\"]+\"\>/, `<meta name=\"description\" content=\"Get the hints and answer for Wordle #${newNum} (${human}). See the solution '${sol}' and our daily strategy breakdown.\">`);
  html = html.replace(/<meta name=\"keywords\" content=\"[^\"]+\"\>/, `<meta name="keywords" content="wordle ${newNum} hints, wordle ${newNum} answer, ${human.toLowerCase()} wordle, wordle ${sol.toLowerCase()}, daily wordle archive">`);
  html = html.replace(/<meta property=\"og:description\" content=\"[^\"]+\"\>/, `<meta property=\"og:description\" content=\"Solution and hints for Wordle #${newNum}. The answer was ${sol}.\">`);
  html = html.replace(/<meta name=\"twitter:description\" content=\"[^\"]+\"\>/, `<meta name=\"twitter:description\" content=\"Solution and hints for Wordle #${newNum}. The answer was ${sol}.\">`);
  html = html.replace(/\"headline\": \"[^\"]+\"/, `"headline": "Wordle #${newNum} Hints & Answer - ${human}"`);
  html = html.replace(/\"datePublished\": \"\d{4}-\d{2}-\d{2}\"/, `"datePublished": "${todayIso}"`);

  // Answer and hints
  html = html.replace(/data-answer=\"[A-Z]+\"/g, `data-answer=\"${sol}\"`);
  html = html.replace(/The answer is <span class=\"text-green-600 font-bold\">[A-Z]+<\/span>/, `The answer is <span class=\"text-green-600 font-bold\">${sol}<\/span>`);
  html = html.replace(/<div id=\"hint-3\"[\s\S]*?<\/div>/, `<div id=\"hint-3\" class=\"hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-red-400 font-mono text-lg tracking-widest\">${sol.split('').join(' ')}<\/div>`);
  html = html.replace(/<div id=\"hint-2\"[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/, `<div id=\"hint-2\" class=\"hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-blue-400\">
                        <p>Starts with ${sol[0]}, ends with ${sol[sol.length-1]}. Contains ${lettersList}.</p>
                    </div>`);
  html = html.replace(/<div id=\"hint-1\"[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/, `<div id="hint-1" class="hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-green-400">
                        <p>An English word used as a valid Wordle answer.</p>
                    </div>`);
  html = html.replace(/<strong>Definition:<\/strong>[^<]*/g, `<strong>Definition:</strong> An English word used as a valid Wordle answer.`);

  // Strategy small tweaks
  html = html.replace(/Today\'s word ends with the letter [A-Z]\./, `Today's word ends with the letter ${sol[sol.length-1]}.`);
  const vowels = ['A','E','I','O','U'];
  const vset = Array.from(new Set(sol.split('').filter(c => vowels.includes(c))));
  const repeats = repeatedLetters(sol);
  const repeatsText = repeats.length ? `and has a repeated letter (${repeats.join(', ')}).` : 'and has no repeated letters.';
  html = html.replace(/It contains \d+ vowels? \([A-Z, ]+\) and has (no repeated letters|no repeated letter|a repeated letter\([A-Z, ]+\))\./, `It contains ${vset.length} vowel${vset.length === 1 ? '' : 's'} (${vset.join(', ')}) ${repeatsText}`);
  const pattern = letterPattern(sol);
  const mask = `${sol[0]} _ _ _ ${sol[sol.length - 1]}`;
  const repeatTip = repeats.length ? ` Watch for a repeated letter.` : '';
  html = html.replace(/<p class=\"text-gray-700 mb-3\">\s*<strong>Strategic Tip:<\/strong>[\s\S]*?<\/p>/, `<p class="text-gray-700 mb-3">
                        <strong>Strategic Tip:</strong> Pattern: ${pattern}. If you have ${mask}, try fitting common vowels/consonants and eliminate options with gray letters.${repeatTip}
                    </p>`);

  // Yesterday link
  if (prevNum && prevIso) {
    const pdHuman = humanDate(prevIso);
    const prevFile = '/' + buildDailyFileName(prevNum, prevIso);
    html = html.replace(/<p class=\"text-sm bg-blue-50 text-blue-800 p-4 rounded-md border-l-4 border-blue-400\">[\s\S]*?<\/p>/, `<p class="text-sm bg-blue-50 text-blue-800 p-4 rounded-md border-l-4 border-blue-400">
                        <strong>Missed yesterday's Wordle?</strong> Check out the solution for <a href="${prevFile}" class="underline hover:text-blue-600 font-medium">${pdHuman} (${prevSol})</a>.
                    </p>`);
  }

  fs.writeFileSync(todayPath, html, 'utf8');
  process.stdout.write(`Updated Wordle today -> #${newNum} ${todayIso} ${sol}\n`);
}

if (process.argv.length < 3) {
  console.error('Usage: node scripts/update-wordle-today.js tmp-wordle.json');
  process.exit(1);
}
updateWordleToday(process.argv[2]);

