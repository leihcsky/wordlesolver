const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { jsonPath: null, dryRun: false, outDir: null };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (v === '--out-dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --out-dir');
      args.outDir = next;
      i += 1;
      continue;
    }
    if (!args.jsonPath) args.jsonPath = v;
  }
  if (!args.jsonPath) {
    throw new Error('Usage: node scripts/generate-connections-pages.js data/connections/YYYY-MM-DD.json [--dry-run] [--out-dir <dir>]');
  }
  return args;
}

function parseIsoDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  return dt;
}

function formatMonthName(dt) {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return monthNames[dt.getUTCMonth()];
}

function formatMonthSlug(dt) {
  const monthSlugs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return monthSlugs[dt.getUTCMonth()];
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWord(w) {
  return String(w || '').trim().toUpperCase();
}

function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seedStr) {
  const prng = mulberry32(xfnv1a(String(seedStr || 'seed')));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function validateData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON payload');
  if (typeof data.date !== 'string') throw new Error('Missing "date"');
  parseIsoDate(data.date);
  if (typeof data.puzzleNumber !== 'number' || !Number.isFinite(data.puzzleNumber)) throw new Error('Missing/invalid "puzzleNumber"');
  if (!Array.isArray(data.words) || data.words.length !== 16) throw new Error('"words" must have length 16');
  if (!Array.isArray(data.groups) || data.groups.length !== 4) throw new Error('"groups" must have length 4');

  const wordSet = new Set(data.words.map(normalizeWord));
  if (wordSet.size !== 16) throw new Error('"words" must be 16 unique entries');

  for (const g of data.groups) {
    if (!g || typeof g !== 'object') throw new Error('Invalid group');
    if (typeof g.color !== 'string') throw new Error('Group missing "color"');
    if (typeof g.title !== 'string') throw new Error('Group missing "title"');
    if (!Array.isArray(g.words) || g.words.length !== 4) throw new Error('Group "words" must have length 4');
    for (const w of g.words) {
      const nw = normalizeWord(w);
      if (!wordSet.has(nw)) throw new Error(`Group word not in word list: ${nw}`);
    }
    if (typeof g.explanation !== 'string') throw new Error('Group missing "explanation"');
  }

  if (data.hints != null) {
    if (!Array.isArray(data.hints) || data.hints.length !== 4) throw new Error('"hints" must have length 4 if provided');
  }
}

function groupStyle(color) {
  const c = String(color || '').toLowerCase();
  if (c === 'yellow') return { name: 'Yellow', container: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-800' };
  if (c === 'green') return { name: 'Green', container: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-800' };
  if (c === 'blue') return { name: 'Blue', container: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800' };
  if (c === 'purple') return { name: 'Purple', container: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-800' };
  return { name: escapeHtml(color), container: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-800' };
}

function buildHintReasoning(title, color) {
  const t = String(title || '').toLowerCase();
  const c = String(color || '').toLowerCase();
  if (t.includes('salad')) return 'Look for words that commonly appear together in one food context, not just loose ingredient words.';
  if (t.includes('film') || t.includes('movie')) return 'Proper-noun phrases can hide in plain sight when you read them as ordinary word pairs.';
  if (t.includes('simpsons')) return 'Character names can mix first names, titles, and aliases, which creates easy false pairings.';
  if (t.includes('nba') || t.includes('player')) return 'This is a tail-end pattern, so focus on word endings instead of the first word.';
  if (t.includes('fiction')) return 'These are shelf-level categories, so think of broad genres rather than specific plot elements.';
  if (t.includes('planet')) return 'Mnemonic words often look random unless you recognize a memorization phrase.';
  if (t.includes('book')) return 'The commonality is packaging format, not meaning.';
  if (t.includes('laundry')) return 'The actions form a practical sequence, which helps you validate the set.';
  if (t.includes('entreaty')) return 'All four work as asking verbs, but the tone ranges from neutral to urgent.';
  if (c === 'yellow') return 'Start with this group first because the connection is usually the most direct.';
  if (c === 'purple') return 'Save this for last; this color often relies on wordplay or hidden phrase structure.';
  return 'Check both literal meaning and phrase behavior before locking the group.';
}

function buildGroupAnalysisMarkup(groups) {
  return groups.map((g) => {
    const style = groupStyle(g.color);
    const reasoning = buildHintReasoning(g.title, g.color);
    const spoilerSafeCategory = (String(g.color || '').toLowerCase() === 'yellow')
      ? 'Most straightforward semantic link'
      : (String(g.color || '').toLowerCase() === 'green')
        ? 'Everyday action/theme cluster'
        : (String(g.color || '').toLowerCase() === 'blue')
          ? 'Context-heavy/trivia-leaning link'
          : 'Wordplay or phrase-structure link';
    return `                    <div class="rounded-lg border ${style.container} p-5">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <span class="inline-flex items-center ${style.badge} text-xs font-bold px-2 py-1 rounded uppercase">${style.name} Group</span>
                            <span class="font-semibold text-gray-900 text-right">${escapeHtml(spoilerSafeCategory)}</span>
                        </div>
                        <p class="text-sm text-gray-700"><strong>How to identify it:</strong> ${escapeHtml(reasoning)}</p>
                        <p class="text-sm text-gray-700 mt-2"><strong>Possible confusion:</strong> Similar-looking words may fit by tone but not by a single precise rule. Validate with one shared definition before submitting.</p>
                    </div>`;
  }).join('\n');
}

/** Revealed-answer card: category title is only in the header; optional body text if explanation differs from title. */
function buildRevealedAnswerGroupMarkup(g, indent = '                        ') {
  const style = groupStyle(g.color);
  const words = g.words
    .map(
      (w) =>
        `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white border border-gray-200/80 shadow-sm">${escapeHtml(normalizeWord(w))}</span>`
    )
    .join(' ');
  const exp = String(g.explanation || '').trim();
  const titleTrim = String(g.title || '').trim();
  const showExplanation = exp.length > 0 && exp.toUpperCase() !== titleTrim.toUpperCase();
  const i = indent;
  const i1 = `${indent}    `;
  const i2 = `${indent}        `;
  const expl = showExplanation
    ? `\n${i1}<p class="text-gray-700 text-sm leading-relaxed border-t border-gray-200/60 pt-3 mt-1">${escapeHtml(exp)}</p>`
    : '';
  return `${i}<div class="rounded-lg p-6 border ${style.container} shadow-sm">
${i1}<div class="flex items-start justify-between gap-3">
${i2}<span class="inline-flex shrink-0 items-center ${style.badge} text-xs font-bold px-2 py-1 rounded uppercase">${style.name}</span>
${i2}<span class="text-gray-900 font-bold text-lg text-right leading-snug min-w-0">${escapeHtml(g.title)}</span>
${i1}</div>
${i1}<div class="flex flex-wrap gap-2.5 mt-4${showExplanation ? ' mb-3' : ''}">
${i2}${words}
${i1}</div>${expl}
${i}</div>`;
}

function wordRevealStyle(color) {
  const c = String(color || '').toLowerCase();
  if (c === 'yellow') return { bg: 'bg-yellow-200', border: 'border-yellow-300', text: 'text-yellow-900' };
  if (c === 'green') return { bg: 'bg-green-200', border: 'border-green-300', text: 'text-green-900' };
  if (c === 'blue') return { bg: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-900' };
  if (c === 'purple') return { bg: 'bg-purple-200', border: 'border-purple-300', text: 'text-purple-900' };
  return { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-800' };
}

function buildDailySlug(dt, puzzleNumber) {
  const yyyy = dt.getUTCFullYear();
  const mmSlug = formatMonthSlug(dt);
  const dd = pad2(dt.getUTCDate());
  return `connections-${puzzleNumber}-${mmSlug}-${dd}-${yyyy}.html`;
}

function listConnectionJsonFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(e.name))
    .map((e) => path.join(rootDir, e.name))
    .sort();
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildConnectionsTodayHtml(data, previousDailyHref) {
  const dt = parseIsoDate(data.date);
  const monthName = formatMonthName(dt);
  const day = dt.getUTCDate();
  const yyyy = dt.getUTCFullYear();
  const humanDate = `${monthName} ${day}, ${yyyy}`;
  const title = `NYT Connections Hints Today #${data.puzzleNumber} - ${humanDate}`;
  const h1 = `NYT Connections Hints Today #${data.puzzleNumber} - ${humanDate}`;
  const description = `Get help solving today’s NYT Connections (#${data.puzzleNumber}) with spoiler-free hints, topic reveals, and full answers. Updated daily.`;
  const keywords = `nyt connections hints, nyt connections answer, connections hints today, connections ${data.puzzleNumber} hints, connections ${data.puzzleNumber} answer, ${monthName.toLowerCase()} ${day} ${yyyy} connections`;
  const canonical = 'https://wordlesolver.best/connections-hints-today';

  const wordToColor = new Map();
  for (const g of data.groups) {
    for (const w of g.words) {
      wordToColor.set(normalizeWord(w), String(g.color || '').toLowerCase());
    }
  }

  const normalizedWords = data.words.map((w) => normalizeWord(w));
  const shuffled = seededShuffle(normalizedWords, `${data.date}#${data.puzzleNumber}`);
  const wordsHtml = shuffled
    .map((nw) => {
      const c = wordToColor.get(nw) || 'gray';
      return `<button type="button" class="connections-word bg-gray-100 border border-gray-200 rounded-lg p-3 text-center text-gray-800 font-mono tracking-wide hover:border-gray-300 hover:shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300" data-word="${escapeHtml(nw)}" data-color="${escapeHtml(c)}">${escapeHtml(nw)}</button>`;
    })
    .join('\n                                ');

  const topicsByColor = new Map(data.groups.map((g) => [String(g.color || '').toLowerCase(), String(g.title || '')]));
  const topicBar = (colorName) => {
    const topicTitle = topicsByColor.get(colorName) || '';
    const style = wordRevealStyle(colorName);
    const label = colorName === 'yellow'
      ? 'Yellow'
      : colorName === 'green'
        ? 'Green'
        : colorName === 'blue'
          ? 'Blue'
          : 'Purple';
    return `<button type="button" class="topic-bar w-full rounded-md py-3 font-bold ${style.bg} ${style.text} hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-indigo-300" aria-pressed="false" data-topic-color="${escapeHtml(colorName)}" data-topic-title="${escapeHtml(topicTitle)}">${label}</button>`;
  };

  const topicBarsHtml = ['yellow', 'green', 'blue', 'purple'].map(topicBar).join('\n                                ');

  const hintColors = ['yellow', 'green', 'blue', 'purple'];
  const hintStyle = (colorName) => {
    const c = String(colorName || '').toLowerCase();
    if (c === 'yellow') return { badge: 'bg-yellow-100 text-yellow-800', btn: 'text-yellow-700 hover:text-yellow-900', border: 'border-yellow-400' };
    if (c === 'green') return { badge: 'bg-green-100 text-green-800', btn: 'text-green-700 hover:text-green-900', border: 'border-green-400' };
    if (c === 'blue') return { badge: 'bg-blue-100 text-blue-800', btn: 'text-blue-700 hover:text-blue-900', border: 'border-blue-400' };
    if (c === 'purple') return { badge: 'bg-purple-100 text-purple-800', btn: 'text-purple-700 hover:text-purple-900', border: 'border-purple-400' };
    return { badge: 'bg-indigo-100 text-indigo-800', btn: 'text-indigo-600 hover:text-indigo-800', border: 'border-indigo-400' };
  };

  const hints = Array.isArray(data.hints) && data.hints.length === 4 ? data.hints : ['Hint 1', 'Hint 2', 'Hint 3', 'Hint 4'];
  const hintsHtml = hints
    .map((h, idx) => {
      const id = `hint-${idx + 1}`;
      const color = hintColors[idx] || 'indigo';
      const style = hintStyle(color);
      const colorLabel = color === 'yellow'
        ? 'Yellow'
        : color === 'green'
          ? 'Green'
          : color === 'blue'
            ? 'Blue'
            : color === 'purple'
              ? 'Purple'
              : 'Hint';
      return `
                    <div class="hint-card bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold text-gray-800 flex items-center">
                                <span class="${style.badge} text-xs font-bold px-2 py-1 rounded uppercase mr-2">Hint ${idx + 1}</span>
                                ${colorLabel} Category Clue
                            </h3>
                            <button class="${style.btn} text-sm font-medium focus:outline-none" data-toggle-target="${id}">Show hint</button>
                        </div>
                        <div id="${id}" class="hidden text-gray-700 bg-gray-50 p-4 rounded-md border-l-4 ${style.border}">
                            ${escapeHtml(h)}
                        </div>
                    </div>`.trim();
    })
    .join('\n');

  const groupsHtml = data.groups.map((g) => buildRevealedAnswerGroupMarkup(g, '                        ')).join('\n');

  const prevBlock = previousDailyHref
    ? `<p class="text-sm bg-blue-50 text-blue-800 p-4 rounded-md border-l-4 border-blue-400"><strong>Missed yesterday’s Connections?</strong> See <a href="${escapeHtml(previousDailyHref)}" class="underline hover:text-blue-600 font-medium">yesterday’s solution</a>.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>

    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
    <link rel="manifest" href="/assets/site.webmanifest">

    <meta name="description" content="${escapeHtml(description)}">
    <meta name="keywords" content="${escapeHtml(keywords)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">

    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="https://wordlesolver.best/assets/og-image.png">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${canonical}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="https://wordlesolver.best/assets/twitter-card.png">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "${escapeHtml(title)}",
      "datePublished": "${escapeHtml(data.date)}",
      "dateModified": "${escapeHtml(data.date)}",
      "description": "${escapeHtml(description)}",
      "author": {
        "@type": "Organization",
        "name": "Wordle Solver"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Wordle Solver",
        "logo": {
          "@type": "ImageObject",
          "url": "https://wordlesolver.best/assets/logo.svg"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "${canonical}"
      }
    }
    </script>

    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TDK582NJ9N"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-TDK582NJ9N');
    </script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3293976111230987"
    crossorigin="anonymous"></script>

    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .hint-card { transition: all 0.2s ease; }
        .hint-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08); }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <header class="bg-white shadow-sm border-b">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-3">
                    <a href="/index.html" class="hover:opacity-80 transition-opacity">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-12 w-auto">
                    </a>
                </div>
                <div class="hidden md:flex items-center space-x-8">
                    <a href="/index.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Home</a>
                    <a href="/blog.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Blog</a>
                    <a href="/wordle-hints-today.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Today's Hints</a>
                    <a href="/connections-hints-today.html" class="text-green-600 font-bold transition-colors">Connections</a>
                </div>
                <div class="md:hidden flex items-center">
                    <button id="mobile-menu-btn" class="text-gray-600 hover:text-green-600 focus:outline-none p-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </nav>
        <div id="mobile-menu" class="hidden md:hidden bg-white border-t border-gray-100">
            <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                <a href="/index.html" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-green-600 hover:bg-green-50">Home</a>
                <a href="/blog.html" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-green-600 hover:bg-green-50">Blog</a>
                <a href="/wordle-hints-today.html" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-green-600 hover:bg-green-50">Today's Hints</a>
                <a href="/connections-hints-today.html" class="block px-3 py-2 rounded-md text-base font-bold text-green-600 bg-green-50">Connections</a>
            </div>
        </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article class="bg-white rounded-lg shadow-lg overflow-hidden">
            <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 px-6 sm:px-8 py-8 sm:py-10 text-white">
                <div class="flex flex-wrap items-center text-sm mb-4 opacity-90">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <time datetime="${escapeHtml(data.date)}">${escapeHtml(humanDate)}</time>
                    <span class="mx-3">•</span>
                    <span>Connections #${escapeHtml(data.puzzleNumber)}</span>
                </div>
                <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
                    ${escapeHtml(h1)}
                </h1>
                <p class="text-lg sm:text-xl text-indigo-100 max-w-2xl">
                    Your daily Connections hints today page: start spoiler-free, then use analysis to understand why each group works.
                </p>
                <div class="mt-6 flex flex-wrap gap-3">
                    <a href="#hints" class="bg-white text-indigo-700 px-4 py-2 rounded-full font-bold hover:bg-indigo-50 transition-colors text-sm sm:text-base">
                        Get Hints
                    </a>
                    <a href="#reveal-answers" class="bg-indigo-900 bg-opacity-30 text-white border border-white border-opacity-30 px-4 py-2 rounded-full font-bold hover:bg-opacity-40 transition-colors text-sm sm:text-base backdrop-blur-sm">
                        Reveal Answers
                    </a>
                </div>
            </div>

            <div class="px-6 sm:px-8 py-8 sm:py-10 space-y-10">
                <div class="prose prose-lg text-gray-600 max-w-none">
                    <p>
                        Looking for <strong>Connections hints today</strong>? This page is built for the current NYT puzzle and focuses on practical help before full reveals.
                    </p>
                    <p>
                        Today’s Connections rewards pattern recognition across literal themes and phrase-based traps. Start with gentle clues, then move to analysis only if you still need help.
                    </p>
                    ${prevBlock}
                </div>

                <section id="quick-helper" class="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm space-y-6">
                    <div class="flex items-start justify-between gap-6 flex-col sm:flex-row">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-900">Quick Helper</h2>
                            <p class="text-gray-600 mt-2">
                                Use this section if you want help without immediately revealing the full answers. Scroll down for full analysis once you finish.
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <a href="#hints" class="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
                                See Hints
                            </a>
                            <a href="#reveal-answers" class="inline-flex items-center px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
                                Reveal Answers
                            </a>
                        </div>
                    </div>

                    <div class="space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-lg font-semibold text-gray-900">Reveal Color Groups</h3>
                            <p class="text-sm text-gray-600">
                                Tap a word to reveal its group color. Tap again to hide it.
                            </p>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="connections-word-grid">
                                ${wordsHtml}
                            </div>
                        </div>

                        <div class="space-y-3">
                            <h3 class="text-lg font-semibold text-gray-900">Reveal Topics (Category Names)</h3>
                            <p class="text-sm text-gray-600">
                                Click a color bar to reveal that group’s topic. Colors run from easiest to hardest.
                            </p>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="connections-topic-bars">
                                ${topicBarsHtml}
                            </div>
                            <div id="connections-topic-display" class="hidden bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div class="text-sm text-gray-600">Topic</div>
                                <div id="connections-topic-title" class="mt-1 text-lg font-bold text-gray-900"></div>
                            </div>
                            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                                Not sure where to start? Solve the easiest color you can identify first. Then try the official puzzle at <a href="https://www.nytimes.com/games/connections" target="_blank" rel="noopener noreferrer" class="underline font-medium">NYT Connections</a>.
                            </div>
                        </div>
                        <div class="space-y-3" id="hints">
                            <h3 class="text-lg font-semibold text-gray-900">Connections Hints Today (Spoiler-Free)</h3>
${hintsHtml}
                        </div>
                    </div>
                </section>

                <section class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Today’s Connections Analysis</h2>
${buildGroupAnalysisMarkup(data.groups)}
                </section>

                <section class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">How to Solve Today’s Puzzle Step by Step</h2>
                    <ol class="list-decimal pl-5 space-y-2 text-gray-700">
                        <li>Lock the most literal category first to remove four words from the board.</li>
                        <li>Use elimination on overlap candidates by testing which group can still be explained with one clean phrase.</li>
                        <li>Leave the trickiest wordplay set for last and validate by phrase behavior, not single-word meaning.</li>
                    </ol>
                </section>

                <section class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Common Mistakes in Today’s Puzzle</h2>
                    <ul class="list-disc pl-5 space-y-2 text-gray-700">
                        <li>Grouping by loose association instead of one precise category definition.</li>
                        <li>Submitting a set when one word still needs a different rule to fit.</li>
                        <li>Ignoring phrase-level clues in the hardest group and treating everything literally.</li>
                    </ul>
                </section>

                <section class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Today’s Difficulty & Pattern</h2>
                    <p class="text-gray-700">
                        This puzzle plays as <strong>medium</strong> difficulty: one group is straightforward, two require context knowledge, and one relies on hidden phrase structure.
                    </p>
                </section>

                <section id="reveal-answers" class="bg-gray-50 p-6 rounded-lg border">
                    <div class="text-center">
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Ready for the answers?</h2>
                        <button id="reveal-answers-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full transition-colors shadow-md text-lg">
                            Reveal today’s groups
                        </button>
                    </div>
                    <div id="answers-container" class="hidden mt-8 space-y-6">
${groupsHtml}
                    </div>
                </section>

                <section class="bg-white border border-gray-200 rounded-lg p-6 sm:p-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-4">More Daily Puzzle Help</h2>
                    <div class="text-gray-700 space-y-3">
                        <p>
                            Prefer a smaller nudge? Use the hints section first. If you’re trying to improve long-term, compare your thought process with the revealed categories after you solve.
                        </p>
                        <p>
                            Play the official daily puzzle here: <a href="https://www.nytimes.com/games/connections" target="_blank" rel="noopener noreferrer" class="underline hover:text-indigo-700 font-semibold">NYT Connections</a>.
                        </p>
                    </div>
                </section>
            </div>
        </article>
    </main>

    <footer class="bg-gray-800 text-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
                <div>
                    <div class="flex items-center space-x-3 mb-4">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-10 w-auto">
                    </div>
                    <p class="text-gray-300">The best free online tool to solve Wordle puzzles faster and improve your word game skills.</p>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Quick Links</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/how-to-play.html" class="hover:text-white transition-colors">How to Play Wordle</a></li>
                        <li><a href="/word-lists.html" class="hover:text-white transition-colors">Word Lists</a></li>
                        <li><a href="/tips-tricks.html" class="hover:text-white transition-colors">Tips & Tricks</a></li>
                        <li><a href="/index.html" class="hover:text-white transition-colors">Solver Tool</a></li>
                        <li><a href="/blog.html" class="hover:text-white transition-colors">Blog</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Support</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/faq.html" class="hover:text-white transition-colors">FAQ</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Contact Us</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">About Us</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Feature Request</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Legal</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Privacy Policy</a></li>
                        <li><a href="/terms-of-service.html" class="hover:text-white transition-colors">Terms of Service</a></li>
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Cookie Policy</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">Disclaimer</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-700 mt-8 pt-8 text-center text-gray-300">
                <p>&copy; ${yyyy} <strong>Wordle Solver</strong> - Free AI-Powered Word Game Helper. All rights reserved.</p>
                <p class="text-sm mt-2">Not affiliated with The New York Times or the official Wordle game. Wordle is a trademark of The New York Times Company.</p>
                <p class="text-xs mt-2 text-gray-400">
                    <a href="https://wordlesolver.best" class="hover:text-gray-300">WordleSolver.best</a> |
                    <a href="/privacy-policy.html" class="hover:text-gray-300 ml-2">Privacy</a> |
                    <a href="/terms-of-service.html" class="hover:text-gray-300 ml-2">Terms</a>
                </p>
            </div>
        </div>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const mobileBtn = document.getElementById('mobile-menu-btn');
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileBtn && mobileMenu) {
                mobileBtn.addEventListener('click', () => {
                    mobileMenu.classList.toggle('hidden');
                });
            }
            const colorStyles = {
                yellow: { bg: 'bg-yellow-200', border: 'border-yellow-300', text: 'text-yellow-900' },
                green: { bg: 'bg-green-200', border: 'border-green-300', text: 'text-green-900' },
                blue: { bg: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-900' },
                purple: { bg: 'bg-purple-200', border: 'border-purple-300', text: 'text-purple-900' },
                gray: { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-800' }
            };
            function applyWordColor(el, color) {
                const c = (color || 'gray').toLowerCase();
                const style = colorStyles[c] || colorStyles.gray;
                Object.values(colorStyles).forEach((s) => {
                    el.classList.remove(s.bg, s.border, s.text);
                });
                el.classList.add(style.bg, style.border, style.text);
            }
            document.querySelectorAll('.connections-word').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const color = (btn.getAttribute('data-color') || 'gray').toLowerCase();
                    const revealed = btn.getAttribute('data-revealed') === 'true';
                    if (revealed) {
                        btn.setAttribute('data-revealed', 'false');
                        applyWordColor(btn, 'gray');
                        return;
                    }
                    btn.setAttribute('data-revealed', 'true');
                    applyWordColor(btn, color);
                });
            });
            const topicDisplay = document.getElementById('connections-topic-display');
            const topicTitleEl = document.getElementById('connections-topic-title');
            let activeTopicColor = null;
            document.querySelectorAll('.topic-bar').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const color = (btn.getAttribute('data-topic-color') || '').toLowerCase();
                    const title = btn.getAttribute('data-topic-title') || '';
                    const isSame = activeTopicColor === color && topicDisplay && !topicDisplay.classList.contains('hidden');
                    document.querySelectorAll('.topic-bar').forEach((b) => {
                        b.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-400');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    if (isSame) {
                        activeTopicColor = null;
                        if (topicDisplay) topicDisplay.classList.add('hidden');
                        return;
                    }
                    activeTopicColor = color;
                    btn.classList.add('ring-2', 'ring-offset-2', 'ring-indigo-400');
                    btn.setAttribute('aria-pressed', 'true');
                    if (topicTitleEl) topicTitleEl.textContent = title;
                    if (topicDisplay) topicDisplay.classList.remove('hidden');
                });
            });
            document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const targetId = btn.getAttribute('data-toggle-target');
                    const targetEl = document.getElementById(targetId);
                    if (!targetEl) return;
                    const isHidden = targetEl.classList.contains('hidden');
                    targetEl.classList.toggle('hidden');
                    btn.textContent = isHidden ? 'Hide hint' : 'Show hint';
                });
            });
            const revealBtn = document.getElementById('reveal-answers-btn');
            const answersContainer = document.getElementById('answers-container');
            if (revealBtn && answersContainer) {
                revealBtn.addEventListener('click', () => {
                    answersContainer.classList.remove('hidden');
                    revealBtn.classList.add('hidden');
                });
            }
        });
    </script>
</body>
</html>`;
}

function buildConnectionsDailyHtml(data, canonicalUrl, todayHref, archiveHref) {
  const dt = parseIsoDate(data.date);
  const monthName = formatMonthName(dt);
  const day = dt.getUTCDate();
  const yyyy = dt.getUTCFullYear();
  const humanDate = `${monthName} ${day}, ${yyyy}`;
  const title = `Connections #${data.puzzleNumber} Hints & Answers - ${humanDate} | Wordle Solver`;
  const description = `Connections solution for #${data.puzzleNumber} (${humanDate}). Includes today’s 16 words, spoiler-free hints, and the full answers.`;

  const normalizedWords = data.words.map((w) => normalizeWord(w));
  const shuffled = seededShuffle(normalizedWords, `${data.date}#${data.puzzleNumber}`);
  const wordsHtml = shuffled
    .map((nw) => `<div class="bg-gray-50 border rounded-lg p-3 text-center text-gray-800 font-mono tracking-wide">${escapeHtml(nw)}</div>`)
    .join('\n                        ');

  const groupsHtml = data.groups.map((g) => buildRevealedAnswerGroupMarkup(g, '                        ')).join('\n');

  const hints = Array.isArray(data.hints) && data.hints.length === 4 ? data.hints : ['Hint 1', 'Hint 2', 'Hint 3', 'Hint 4'];
  const hintsHtml = hints
    .map((h, idx) => `<li>${escapeHtml(h)}</li>`)
    .join('\n                        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>

    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
    <link rel="manifest" href="/assets/site.webmanifest">

    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

    <meta property="og:type" content="article">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="https://wordlesolver.best/assets/og-image.png">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="https://wordlesolver.best/assets/twitter-card.png">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "${escapeHtml(title)}",
      "datePublished": "${escapeHtml(data.date)}",
      "description": "${escapeHtml(description)}",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "${escapeHtml(canonicalUrl)}"
      }
    }
    </script>

    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TDK582NJ9N"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-TDK582NJ9N');
    </script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3293976111230987"
    crossorigin="anonymous"></script>

    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .hint-card { transition: all 0.2s ease; }
        .hint-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08); }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <header class="bg-white shadow-sm border-b">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-3">
                    <a href="/index.html" class="hover:opacity-80 transition-opacity">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-12 w-auto">
                    </a>
                </div>
                <div class="hidden md:flex items-center space-x-8">
                    <a href="/index.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Home</a>
                    <a href="/blog.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Blog</a>
                    <a href="/wordle-hints-today.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Today's Hints</a>
                    <a href="/connections-hints-today.html" class="text-green-600 font-bold transition-colors">Connections</a>
                </div>
            </div>
        </nav>
    </header>

    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article class="bg-white rounded-lg shadow-lg overflow-hidden">
            <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 px-6 sm:px-8 py-8 sm:py-10 text-white">
                <div class="flex flex-wrap items-center text-sm mb-4 opacity-90">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <time datetime="${escapeHtml(data.date)}">${escapeHtml(humanDate)}</time>
                    <span class="mx-3">•</span>
                    <span>Connections #${escapeHtml(data.puzzleNumber)}</span>
                </div>
                <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
                    Connections #${escapeHtml(data.puzzleNumber)}: Hints & Answers
                </h1>
                <p class="text-lg sm:text-xl text-indigo-100 max-w-2xl">
                    Full solution and hints for the daily Connections puzzle.
                </p>
            </div>

            <div class="px-6 sm:px-8 py-8 sm:py-10 space-y-10">
                <section id="words" class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Today’s 16 Words</h2>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        ${wordsHtml}
                    </div>
                </section>

                <section id="hints" class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Hints</h2>
                    <ul class="list-disc pl-5 space-y-2 text-gray-700">
                        ${hintsHtml}
                    </ul>
                </section>

                <section id="answers" class="space-y-4">
                    <h2 class="text-2xl font-bold text-gray-900 border-b pb-2">Answers</h2>
                    <div class="space-y-6">
${groupsHtml}
                    </div>
                </section>
            </div>
        </article>
    </main>

    <footer class="bg-gray-800 text-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
                <div>
                    <div class="flex items-center space-x-3 mb-4">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-10 w-auto">
                    </div>
                    <p class="text-gray-300">The best free online tool to solve Wordle puzzles faster and improve your word game skills.</p>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Quick Links</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/how-to-play.html" class="hover:text-white transition-colors">How to Play Wordle</a></li>
                        <li><a href="/word-lists.html" class="hover:text-white transition-colors">Word Lists</a></li>
                        <li><a href="/tips-tricks.html" class="hover:text-white transition-colors">Tips & Tricks</a></li>
                        <li><a href="/index.html" class="hover:text-white transition-colors">Solver Tool</a></li>
                        <li><a href="/blog.html" class="hover:text-white transition-colors">Blog</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Support</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/faq.html" class="hover:text-white transition-colors">FAQ</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Contact Us</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">About Us</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Feature Request</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Legal</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Privacy Policy</a></li>
                        <li><a href="/terms-of-service.html" class="hover:text-white transition-colors">Terms of Service</a></li>
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Cookie Policy</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">Disclaimer</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-700 mt-8 pt-8 text-center text-gray-300">
                <p>&copy; ${yyyy} <strong>Wordle Solver</strong> - Free AI-Powered Word Game Helper. All rights reserved.</p>
                <p class="text-sm mt-2">Not affiliated with The New York Times or the official Wordle game. Wordle is a trademark of The New York Times Company.</p>
                <p class="text-xs mt-2 text-gray-400">
                    <a href="https://wordlesolver.best" class="hover:text-gray-300">WordleSolver.best</a> |
                    <a href="/privacy-policy.html" class="hover:text-gray-300 ml-2">Privacy</a> |
                    <a href="/terms-of-service.html" class="hover:text-gray-300 ml-2">Terms</a>
                </p>
            </div>
        </div>
    </footer>
</body>
</html>`;
}

function buildArchiveHtml(items) {
  const canonical = 'https://wordlesolver.best/connections-archive';
  const year = new Date().getFullYear();
  const listHtml = items.length
    ? items
        .map((it) => {
          return `<a href="${escapeHtml(it.href)}" class="block p-4 rounded-lg border bg-gray-50 hover:bg-white transition-colors">
                    <div class="flex items-center justify-between">
                        <div class="font-semibold text-gray-900">Connections #${escapeHtml(it.puzzleNumber)}</div>
                        <div class="text-sm text-gray-500">${escapeHtml(it.humanDate)}</div>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">${escapeHtml(it.preview)}</div>
                </a>`;
        })
        .join('\n')
    : '<div class="text-gray-600">No puzzles yet. Add a daily JSON file and run the generator.</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connections Archive | Wordle Solver</title>

    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
    <link rel="manifest" href="/assets/site.webmanifest">

    <meta name="description" content="Browse past NYT Connections hints and answers. Find previous puzzles and learn patterns to improve your solving.">
    <meta name="keywords" content="connections archive, nyt connections archive, connections past answers, connections hints archive">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="Connections Archive">
    <meta property="og:description" content="Browse past NYT Connections hints and answers.">
    <meta property="og:image" content="https://wordlesolver.best/assets/og-image.png">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${canonical}">
    <meta name="twitter:title" content="Connections Archive">
    <meta name="twitter:description" content="Browse past NYT Connections hints and answers.">
    <meta name="twitter:image" content="https://wordlesolver.best/assets/twitter-card.png">

    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TDK582NJ9N"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-TDK582NJ9N');
    </script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3293976111230987"
    crossorigin="anonymous"></script>

    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
    <header class="bg-white shadow-sm border-b">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-3">
                    <a href="/index.html" class="hover:opacity-80 transition-opacity">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-12 w-auto">
                    </a>
                </div>
                <div class="hidden md:flex items-center space-x-8">
                    <a href="/index.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Home</a>
                    <a href="/blog.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Blog</a>
                    <a href="/wordle-hints-today.html" class="text-gray-600 hover:text-green-600 font-medium transition-colors">Today's Hints</a>
                    <a href="/connections-hints-today.html" class="text-green-600 font-bold transition-colors">Connections</a>
                </div>
            </div>
        </nav>
    </header>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div class="text-center mb-10">
            <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Connections Archive</h1>
            <p class="text-gray-600 max-w-2xl mx-auto">
                Browse past puzzles and open the full solution when you need it.
            </p>
        </div>

        <section class="bg-white rounded-lg shadow-lg p-6 sm:p-8">
            <h2 class="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Recent Puzzles</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${listHtml}
            </div>
        </section>
    </main>

    <footer class="bg-gray-800 text-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
                <div>
                    <div class="flex items-center space-x-3 mb-4">
                        <img src="/assets/logo.svg" alt="Wordle Solver Logo" class="h-10 w-auto">
                    </div>
                    <p class="text-gray-300">The best free online tool to solve Wordle puzzles faster and improve your word game skills.</p>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Quick Links</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/how-to-play.html" class="hover:text-white transition-colors">How to Play Wordle</a></li>
                        <li><a href="/word-lists.html" class="hover:text-white transition-colors">Word Lists</a></li>
                        <li><a href="/tips-tricks.html" class="hover:text-white transition-colors">Tips & Tricks</a></li>
                        <li><a href="/index.html" class="hover:text-white transition-colors">Solver Tool</a></li>
                        <li><a href="/blog.html" class="hover:text-white transition-colors">Blog</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Support</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/faq.html" class="hover:text-white transition-colors">FAQ</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Contact Us</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">About Us</a></li>
                        <li><a href="/contact.html" class="hover:text-white transition-colors">Feature Request</a></li>
                    </ul>
                </div>
                <div>
                    <p class="text-lg font-semibold mb-4">Legal</p>
                    <ul class="space-y-2 text-gray-300">
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Privacy Policy</a></li>
                        <li><a href="/terms-of-service.html" class="hover:text-white transition-colors">Terms of Service</a></li>
                        <li><a href="/privacy-policy.html" class="hover:text-white transition-colors">Cookie Policy</a></li>
                        <li><a href="/about.html" class="hover:text-white transition-colors">Disclaimer</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-700 mt-8 pt-8 text-center text-gray-300">
                <p>&copy; ${year} <strong>Wordle Solver</strong> - Free AI-Powered Word Game Helper. All rights reserved.</p>
                <p class="text-sm mt-2">Not affiliated with The New York Times or the official Wordle game. Wordle is a trademark of The New York Times Company.</p>
                <p class="text-xs mt-2 text-gray-400">
                    <a href="https://wordlesolver.best" class="hover:text-gray-300">WordleSolver.best</a> |
                    <a href="/privacy-policy.html" class="hover:text-gray-300 ml-2">Privacy</a> |
                    <a href="/terms-of-service.html" class="hover:text-gray-300 ml-2">Terms</a>
                </p>
            </div>
        </div>
    </footer>
</body>
</html>`;
}

function main() {
  const { jsonPath, dryRun, outDir } = parseArgs(process.argv);
  const absJsonPath = path.resolve(process.cwd(), jsonPath);
  const data = readJson(absJsonPath);
  validateData(data);

  const dataDir = path.resolve(process.cwd(), 'data', 'connections');
  const jsonFiles = listConnectionJsonFiles(dataDir);

  const outRoot = outDir ? path.resolve(process.cwd(), outDir) : process.cwd();

  const dt = parseIsoDate(data.date);
  const dailyFileName = buildDailySlug(dt, data.puzzleNumber);
  const dailyRelHref = `/daily-connections/${dailyFileName}`;
  const dailyOutPath = path.resolve(outRoot, 'daily-connections', dailyFileName);
  const dailyCanonical = `https://wordlesolver.best${dailyRelHref}`;
  const todayOutPath = path.resolve(outRoot, 'connections-hints-today.html');
  const archiveOutPath = path.resolve(outRoot, 'connections-archive.html');

  let previousDailyHref = null;
  const currentJsonName = path.basename(absJsonPath);
  const currentIndex = jsonFiles.findIndex((p) => path.basename(p) === currentJsonName);
  if (currentIndex > 0) {
    const prevData = readJson(jsonFiles[currentIndex - 1]);
    try {
      validateData(prevData);
      const prevDt = parseIsoDate(prevData.date);
      const prevDailyFileName = buildDailySlug(prevDt, prevData.puzzleNumber);
      previousDailyHref = `/daily-connections/${prevDailyFileName}`;
    } catch (_) {
      previousDailyHref = null;
    }
  }

  const todayHtml = buildConnectionsTodayHtml(data, previousDailyHref);
  const dailyHtml = buildConnectionsDailyHtml(data, dailyCanonical, '/connections-hints-today.html', '/connections-archive.html');

  const archiveItems = jsonFiles
    .map((p) => {
      const d = readJson(p);
      try {
        validateData(d);
      } catch (_) {
        return null;
      }
      const ddt = parseIsoDate(d.date);
      const humanDate = `${formatMonthName(ddt)} ${ddt.getUTCDate()}, ${ddt.getUTCFullYear()}`;
      const fileName = buildDailySlug(ddt, d.puzzleNumber);
      const href = `/daily-connections/${fileName}`;
      const preview = Array.isArray(d.words) ? d.words.slice(0, 4).map(normalizeWord).join(', ') : '';
      return { date: d.date, puzzleNumber: d.puzzleNumber, humanDate, href, preview };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 60);

  const archiveHtml = buildArchiveHtml(archiveItems);

  const outputs = [
    { label: 'today', outPath: todayOutPath },
    { label: 'daily', outPath: dailyOutPath },
    { label: 'archive', outPath: archiveOutPath },
  ];

  if (dryRun) {
    process.stdout.write(outputs.map((o) => `${o.label}: ${o.outPath}`).join('\n') + '\n');
    return;
  }

  ensureDir(todayOutPath);
  ensureDir(dailyOutPath);
  ensureDir(archiveOutPath);

  fs.writeFileSync(todayOutPath, todayHtml, 'utf8');
  fs.writeFileSync(dailyOutPath, dailyHtml, 'utf8');
  fs.writeFileSync(archiveOutPath, archiveHtml, 'utf8');

  process.stdout.write(outputs.map((o) => `${o.label}: ${o.outPath}`).join('\n') + '\n');
}

main();

