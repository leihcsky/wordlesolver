const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function monthName(dt) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[dt.getMonth()];
}
function monthSlug(dt) {
  const slugs = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return slugs[dt.getMonth()];
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
  const bankPath = path.join(REPO_ROOT, 'data', 'word-bank.json');
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

function buildAnswerTilesMarkup(wordUpper) {
  const w = String(wordUpper || '').toUpperCase();
  const letters = w.split('');
  if (!letters.length) return '';
  const btns = letters
    .map(
      (_, i) =>
        `<button type="button" class="answer-tile w-12 h-12 sm:w-14 sm:h-14 border-2 border-gray-300 bg-white flex items-center justify-center text-2xl sm:text-3xl font-bold text-gray-400 cursor-pointer select-none transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1" data-tile-index="${i}" data-revealed="false" aria-label="Reveal letter ${i + 1}">?</button>`
    )
    .join('\n                            ');
  return `<div id="answer-tiles" class="flex flex-wrap justify-center gap-2 mb-6" data-answer="${w}" role="group" aria-label="Answer letters. Tap a square to reveal one letter.">
                            ${btns}
                        </div>`;
}

function updateWordleToday(absJsonPath) {
  const todayPath = path.join(REPO_ROOT, 'wordle-hints-today.html');
  if (!fs.existsSync(todayPath)) throw new Error('wordle-hints-today.html not found');
  const rawJson = fs.readFileSync(absJsonPath, 'utf8').replace(/^\uFEFF/, '');
  const api = JSON.parse(rawJson);
  const newNum = api.days_since_launch;
  const sol = String(api.solution || '').toUpperCase();
  const todayIso = String(api.print_date || '');
  const human = humanDate(todayIso);

  if (sol.length !== 5 || !/^[A-Z]{5}$/.test(sol)) {
    throw new Error(`Expected 5-letter A–Z solution, got: ${JSON.stringify(api.solution)}`);
  }

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
    const dailyAbs = path.join(REPO_ROOT, dailyFile);
    fs.mkdirSync(path.dirname(dailyAbs), { recursive: true });
    fs.writeFileSync(dailyAbs, backup, 'utf8');
  }

  const vowels = ['A', 'E', 'I', 'O', 'U'];
  const vset = Array.from(new Set(sol.split('').filter((c) => vowels.includes(c))));
  const repeats = repeatedLetters(sol);
  const pattern = letterPattern(sol);

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
  html = html.replace(/\"description\": \"[^\"]+\"/, `"description": "Daily Wordle solution for #${newNum}. Answer: ${sol}."`);

  // Answer tiles (per-letter reveal UI) + visible answer line
  const tilesMarkup = buildAnswerTilesMarkup(sol);
  if (tilesMarkup) {
    const beforeTiles = html;
    html = html.replace(/<div id="answer-tiles"[\s\S]*?<\/div>\s*(?=\s*<div id="answer-explanation")/m, tilesMarkup);
    if (html === beforeTiles) {
      throw new Error('Could not replace #answer-tiles block (expected before #answer-explanation). Update template or regex.');
    }
  }
  html = html.replace(/The answer is <span class=\"text-green-600 font-bold\">[A-Z]+<\/span>/, `The answer is <span class=\"text-green-600 font-bold\">${sol}<\/span>`);
  html = html.replace(/<strong>Definition:<\/strong>[^<]*/g, `<strong>Definition:</strong> An English word used as a valid Wordle answer.`);

  // Spoiler-free hint bodies (aligned with manual “today” page style)
  const hint2Soft = `It contains <strong>${vset.length}</strong> distinct vowel letter${vset.length === 1 ? '' : 's'}. ${
    repeats.length
      ? '<strong>At least one letter appears twice.</strong>'
      : '<strong>No letter is used more than once.</strong>'
  }`;
  const alternating = pattern === 'CVCVC' || pattern === 'VCVCV';
  const hint3Soft = alternating
    ? 'Its structure alternates between consonants and vowels from start to finish.'
    : `Its consonant/vowel structure follows <strong>${pattern}</strong> (<strong>C</strong> = consonant, <strong>V</strong> = vowel).`;

  html = html.replace(/<div id=\"hint-1\"[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/, `<div id="hint-1" class="hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-green-400">
                        <p>A common everyday English word, used as an adjective.</p>
                    </div>`);
  html = html.replace(/<div id=\"hint-2\"[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/, `<div id="hint-2" class="hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-blue-400">
                        <p>${hint2Soft}</p>
                    </div>`);
  html = html.replace(/<div id=\"hint-3\"[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/, `<div id="hint-3" class="hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 border-red-400">
                        <p>${hint3Soft}</p>
                    </div>`);

  const repeatTip = repeats.length ? ' Watch for a double letter somewhere.' : '';
  const strategyP1 = `The solution uses <strong>${vset.length}</strong> distinct vowel letter${vset.length === 1 ? '' : 's'} from A, E, I, O, U — use your yellow/green feedback to place them.`;
  const strategyP2 = repeats.length
    ? 'A repeated letter is possible; if your guesses feel almost right, test a double before chasing new letters.'
    : 'Every letter in the answer is unique, so duplicate letters in a guess can only yield one green/yellow per slot.';
  const strategyP3 = `The consonant/vowel pattern is <strong>${pattern}</strong>. Narrow candidates with gray eliminations and common five-letter fits.${repeatTip}`;

  html = html.replace(
    /<section class="border-t pt-8">\s*<h2 class="text-2xl font-bold text-gray-900 mb-4">Strategy &amp; Analysis<\/h2>[\s\S]*?<\/section>/,
    `<section class="border-t pt-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-4">Strategy &amp; Analysis</h2>
                    <p class="text-gray-700 mb-3">
                        ${strategyP1}
                    </p>
                    <p class="text-gray-700 mb-3">
                        ${strategyP2}
                    </p>
                    <p class="text-gray-700 mb-3">
                        <strong>Strategic Tip:</strong> ${strategyP3}
                    </p>
                </section>`
  );

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
const jsonArg = process.argv[2];
const absJson = path.isAbsolute(jsonArg) ? jsonArg : path.join(REPO_ROOT, jsonArg);
updateWordleToday(absJson);

