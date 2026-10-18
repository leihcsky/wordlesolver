/**
 * Shared Krillion UI helpers: load snapshots, filter/sort, copy, analytics.
 */
(function (global) {
  'use strict';

  var PAGE_SIZE = 40;

  function track(action, params) {
    try {
      if (typeof gtag === 'function') {
        var safe = params || {};
        gtag('event', action, {
          event_category: 'krillion',
          event_label: safe.label || undefined,
          value: typeof safe.value === 'number' ? safe.value : undefined,
        });
      }
    } catch (_) {
      /* ignore */
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tierBadgeClass(tier) {
    switch (String(tier || '').toLowerCase()) {
      case 'krillion':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'deepcut':
        return 'bg-violet-100 text-violet-900 border-violet-300';
      case 'rare':
        return 'bg-sky-100 text-sky-900 border-sky-300';
      case 'schooler':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'plankton':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function flattenAnswers(day) {
    if (!day || !Array.isArray(day.prompts)) return [];
    var rows = [];
    day.prompts.forEach(function (prompt) {
      (prompt.answers || []).forEach(function (answer) {
        rows.push({
          prompt_id: prompt.prompt_id,
          prompt_text: prompt.prompt_text,
          answer_text: answer.answer_text,
          tier: answer.tier,
          score: answer.score,
          quip: answer.quip || null,
          popularity: typeof answer.popularity === 'number' ? answer.popularity : null,
        });
      });
    });
    return rows;
  }

  function uniqueTiers(rows) {
    var set = {};
    rows.forEach(function (r) {
      if (r.tier) set[r.tier] = true;
    });
    return Object.keys(set).sort();
  }

  function applyFilters(rows, state) {
    var q = (state.search || '').trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.promptId && r.prompt_id !== state.promptId) return false;
      if (state.tier && r.tier !== state.tier) return false;
      if (q && r.answer_text.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var sort = state.sort || 'score_desc';
    out.sort(function (a, b) {
      if (sort === 'score_desc') {
        if (b.score !== a.score) return b.score - a.score;
        return a.answer_text.localeCompare(b.answer_text);
      }
      if (sort === 'pop_asc') {
        var ap = a.popularity == null ? Number.POSITIVE_INFINITY : a.popularity;
        var bp = b.popularity == null ? Number.POSITIVE_INFINITY : b.popularity;
        if (ap !== bp) return ap - bp;
        return b.score - a.score;
      }
      if (sort === 'pop_desc') {
        var ap2 = a.popularity == null ? -1 : a.popularity;
        var bp2 = b.popularity == null ? -1 : b.popularity;
        if (bp2 !== ap2) return bp2 - ap2;
        return b.score - a.score;
      }
      return 0;
    });
    return out;
  }

  function statusLabel(status) {
    if (status === 'published') return "Today's answers are live";
    if (status === 'pending') return "Waiting for today's answers to unlock";
    return "Couldn't load today's answers";
  }

  function statusTone(status) {
    if (status === 'published') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    if (status === 'pending') return 'border-amber-300 bg-amber-50 text-amber-900';
    return 'border-red-300 bg-red-50 text-red-900';
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(iso);
    }
  }

  async function loadJson(url) {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function renderAnswerRow(row, opts) {
    opts = opts || {};
    var popHtml =
      row.popularity != null
        ? '<span class="text-xs text-gray-600">Popularity ' + escapeHtml(String(row.popularity)) + '</span>'
        : opts.popularityAvailable === false
          ? '<span class="text-xs text-gray-400">Popularity unavailable</span>'
          : '<span class="text-xs text-gray-400">Popularity —</span>';

    var quipHtml = row.quip
      ? '<p class="mt-1 text-sm text-gray-600">' + escapeHtml(row.quip) + '</p>'
      : '';

    var promptHtml = opts.showPrompt
      ? '<p class="text-xs text-gray-500 mb-1">' + escapeHtml(row.prompt_text) + '</p>'
      : '';

    return (
      '<article class="border border-gray-200 rounded-xl bg-white p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">' +
      '<div class="min-w-0 flex-1">' +
      promptHtml +
      '<div class="flex flex-wrap items-center gap-2">' +
      '<h3 class="text-base sm:text-lg font-semibold text-gray-900 break-words">' +
      escapeHtml(row.answer_text) +
      '</h3>' +
      '<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ' +
      tierBadgeClass(row.tier) +
      '">' +
      escapeHtml(row.tier) +
      '</span>' +
      '<span class="text-sm font-medium text-gray-800">Score ' +
      escapeHtml(String(row.score)) +
      '</span>' +
      popHtml +
      '</div>' +
      quipHtml +
      '</div>' +
      '<button type="button" class="krillion-copy shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2" data-answer="' +
      escapeHtml(row.answer_text) +
      '" aria-label="Copy answer ' +
      escapeHtml(row.answer_text) +
      '">Copy</button>' +
      '</article>'
    );
  }

  function bindCopyButtons(root) {
    if (!root) return;
    root.querySelectorAll('.krillion-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-answer') || '';
        copyText(text)
          .then(function () {
            var prev = btn.textContent;
            btn.textContent = 'Copied';
            btn.setAttribute('aria-live', 'polite');
            track('krillion_copy_answer', { label: 'copy' });
            setTimeout(function () {
              btn.textContent = prev || 'Copy';
            }, 1500);
          })
          .catch(function () {
            btn.textContent = 'Failed';
            setTimeout(function () {
              btn.textContent = 'Copy';
            }, 1500);
          });
      });
    });
  }

  function tierDisplayName(tier) {
    switch (String(tier || '').toLowerCase()) {
      case 'krillion':
        return 'One in a Krillion';
      case 'deepcut':
        return 'Deep Cut';
      case 'rare':
        return 'Rare';
      case 'schooler':
        return 'Schooler';
      case 'plankton':
        return 'Plankton';
      default:
        return tier || 'Other';
    }
  }

  /**
   * Group answers by score (high → low). Same score keeps original order.
   */
  function groupAnswersByScore(answers) {
    var map = {};
    (answers || []).forEach(function (a) {
      var key = String(a.score);
      if (!map[key]) {
        map[key] = { score: a.score, tier: a.tier, answers: [] };
      }
      map[key].answers.push(a);
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
  }

  function renderCompactAnswer(answer) {
    var quip = answer.quip
      ? '<span class="block text-sm text-gray-500 mt-0.5">' + escapeHtml(answer.quip) + '</span>'
      : '';
    var pop =
      typeof answer.popularity === 'number'
        ? '<span class="text-xs text-gray-400 shrink-0">pop ' + escapeHtml(String(answer.popularity)) + '</span>'
        : '';
    return (
      '<li class="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">' +
      '<div class="min-w-0">' +
      '<span class="font-medium text-gray-900">' +
      escapeHtml(answer.answer_text) +
      '</span>' +
      quip +
      '</div>' +
      '<div class="flex items-center gap-2 shrink-0">' +
      pop +
      '<button type="button" class="krillion-copy text-xs font-medium text-green-700 hover:text-green-800 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-green-600" data-answer="' +
      escapeHtml(answer.answer_text) +
      '" aria-label="Copy answer ' +
      escapeHtml(answer.answer_text) +
      '">Copy</button>' +
      '</div></li>'
    );
  }

  var PROMPT_PALETTE = [
    { pill: 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200', bar: 'bg-amber-50 border-amber-200', accent: 'text-amber-800', ring: 'border-l-amber-400' },
    { pill: 'bg-sky-100 text-sky-950 border-sky-300 hover:bg-sky-200', bar: 'bg-sky-50 border-sky-200', accent: 'text-sky-800', ring: 'border-l-sky-400' },
    { pill: 'bg-violet-100 text-violet-950 border-violet-300 hover:bg-violet-200', bar: 'bg-violet-50 border-violet-200', accent: 'text-violet-800', ring: 'border-l-violet-400' },
    { pill: 'bg-emerald-100 text-emerald-950 border-emerald-300 hover:bg-emerald-200', bar: 'bg-emerald-50 border-emerald-200', accent: 'text-emerald-800', ring: 'border-l-emerald-400' },
    { pill: 'bg-rose-100 text-rose-950 border-rose-300 hover:bg-rose-200', bar: 'bg-rose-50 border-rose-200', accent: 'text-rose-800', ring: 'border-l-rose-400' },
    { pill: 'bg-orange-100 text-orange-950 border-orange-300 hover:bg-orange-200', bar: 'bg-orange-50 border-orange-200', accent: 'text-orange-800', ring: 'border-l-orange-400' },
    { pill: 'bg-teal-100 text-teal-950 border-teal-300 hover:bg-teal-200', bar: 'bg-teal-50 border-teal-200', accent: 'text-teal-800', ring: 'border-l-teal-400' },
  ];

  var ANSWER_SCROLL_MAX = 'max-h-72'; /* ~18rem; keeps score headers in view while browsing long lists */

  function renderScoreGroup(group, index) {
    var label = tierDisplayName(group.tier);
    var count = group.answers.length;
    return (
      '<div class="krillion-score-group rounded-xl border border-gray-200 bg-white overflow-hidden" data-score-index="' +
      index +
      '">' +
      '<div class="flex flex-wrap items-center gap-2 px-4 py-3 bg-gray-50/80 border-b border-gray-100">' +
      '<span class="text-lg font-bold text-gray-900 tabular-nums">' +
      escapeHtml(String(group.score)) +
      ' pts</span>' +
      '<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ' +
      tierBadgeClass(group.tier) +
      '">' +
      escapeHtml(label) +
      '</span>' +
      '<span class="text-sm text-gray-500">' +
      count +
      (count === 1 ? ' answer' : ' answers') +
      '</span>' +
      '<button type="button" class="ml-auto text-sm font-semibold text-green-700 hover:text-green-800 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-green-600" data-toggle-answers aria-expanded="false">' +
      'Show answers</button>' +
      '</div>' +
      '<div class="hidden border-t border-gray-100" data-answer-panel>' +
      '<div class="' +
      ANSWER_SCROLL_MAX +
      ' overflow-y-auto overscroll-contain px-4 py-1" data-answer-host data-rendered="0"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function fillScoreAnswers(host, group) {
    if (!host || host.getAttribute('data-rendered') === '1') return;
    host.setAttribute('data-rendered', '1');
    var list = document.createElement('ul');
    list.className = 'list-none pl-0';
    host.appendChild(list);
    var CHUNK = 120;
    var i = 0;
    function paintChunk() {
      var end = Math.min(i + CHUNK, group.answers.length);
      var startLen = list.children.length;
      var html = '';
      for (; i < end; i += 1) html += renderCompactAnswer(group.answers[i]);
      list.insertAdjacentHTML('beforeend', html);
      for (var c = startLen; c < list.children.length; c += 1) {
        bindCopyButtons(list.children[c]);
      }
      if (i < group.answers.length) {
        window.requestAnimationFrame(paintChunk);
      }
    }
    paintChunk();
  }

  function bindScoreGroups(body, groups) {
    body.querySelectorAll('.krillion-score-group').forEach(function (scoreEl) {
      var idx = parseInt(scoreEl.getAttribute('data-score-index'), 10);
      var group = groups[idx];
      var btn = scoreEl.querySelector('[data-toggle-answers]');
      var panel = scoreEl.querySelector('[data-answer-panel]');
      var host = scoreEl.querySelector('[data-answer-host]');
      if (!btn || !panel || !group) return;
      btn.addEventListener('click', function () {
        var open = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Hide answers' : 'Show answers';
        if (open) fillScoreAnswers(host, group);
      });
    });
  }

  /**
   * Main browse UI: each prompt is always open with score rows visible;
   * only answer lists under each score toggle.
   */
  function renderPromptBrowser(day, root) {
    if (!root || !day) return;
    var prompts = day.prompts || [];

    var jump =
      '<nav class="mb-8" aria-label="Jump to prompt">' +
      '<p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Jump to a prompt</p>' +
      '<div class="grid gap-3 sm:grid-cols-2">' +
      prompts
        .map(function (p, i) {
          var colors = PROMPT_PALETTE[i % PROMPT_PALETTE.length];
          return (
            '<a href="#prompt-' +
            escapeHtml(p.prompt_id) +
            '" class="flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-semibold leading-snug shadow-sm transition-colors ' +
            colors.pill +
            '">' +
            '<span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-sm font-bold">' +
            (i + 1) +
            '</span>' +
            '<span class="min-w-0 break-words">' +
            escapeHtml(p.prompt_text) +
            '</span></a>'
          );
        })
        .join('') +
      '</div></nav>';

    var sections = prompts
      .map(function (p, i) {
        var n = p.answers ? p.answers.length : 0;
        var colors = PROMPT_PALETTE[i % PROMPT_PALETTE.length];
        var groups = groupAnswersByScore(p.answers || []);
        var scoreHtml = groups
          .map(function (g, idx) {
            return renderScoreGroup(g, idx);
          })
          .join('');

        return (
          '<section id="prompt-' +
          escapeHtml(p.prompt_id) +
          '" class="krillion-prompt rounded-2xl border-2 shadow-sm scroll-mt-20 overflow-hidden ' +
          colors.bar +
          '" data-prompt-id="' +
          escapeHtml(p.prompt_id) +
          '">' +
          '<header class="px-4 sm:px-5 py-4 border-l-4 ' +
          colors.ring +
          '">' +
          '<p class="text-xs font-bold uppercase tracking-wide ' +
          colors.accent +
          '">Prompt ' +
          (i + 1) +
          ' of ' +
          prompts.length +
          ' · ' +
          n +
          ' answers</p>' +
          '<h3 class="mt-1 text-base sm:text-lg font-semibold text-gray-900 leading-snug">' +
          escapeHtml(p.prompt_text) +
          '</h3>' +
          '</header>' +
          '<div class="px-4 sm:px-5 pb-5 pt-3 space-y-2 bg-white/80 border-t border-gray-200/80" data-prompt-body>' +
          scoreHtml +
          '</div>' +
          '</section>'
        );
      })
      .join('');

    root.innerHTML =
      jump + '<div class="space-y-6" id="krillionPromptStack">' + sections + '</div>';

    root.querySelectorAll('.krillion-prompt').forEach(function (section) {
      var promptId = section.getAttribute('data-prompt-id');
      var prompt = prompts.find(function (p) {
        return p.prompt_id === promptId;
      });
      if (!prompt) return;
      var groups = groupAnswersByScore(prompt.answers || []);
      var body = section.querySelector('[data-prompt-body]');
      bindScoreGroups(body, groups);
    });
  }

  function createFinderController(config) {
    var day = config.day;
    var els = config.els;
    var requireAction = config.requireAction !== false;
    var activated = !requireAction;
    var allRows = flattenAnswers(day);
    var state = {
      promptId: '',
      tier: '',
      search: '',
      sort: 'score_desc',
      page: 1,
    };

    function fillSelects() {
      if (els.prompt) {
        var opts = ['<option value="">All prompts</option>'];
        (day.prompts || []).forEach(function (p) {
          opts.push(
            '<option value="' +
              escapeHtml(p.prompt_id) +
              '">' +
              escapeHtml(p.prompt_text) +
              '</option>'
          );
        });
        els.prompt.innerHTML = opts.join('');
      }
      if (els.tier) {
        var tiers = uniqueTiers(allRows);
        var tops = ['<option value="">All tiers</option>'];
        tiers.forEach(function (t) {
          tops.push('<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>');
        });
        els.tier.innerHTML = tops.join('');
      }
    }

    function isActive() {
      return (
        activated ||
        Boolean(state.promptId) ||
        Boolean(state.tier) ||
        Boolean((state.search || '').trim()) ||
        state.sort === 'pop_asc' ||
        state.sort === 'pop_desc'
      );
    }

    function renderIdle() {
      if (els.meta) els.meta.textContent = '';
      if (els.pager) els.pager.innerHTML = '';
      if (els.list) {
        els.list.innerHTML =
          '<div class="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-600" role="status">' +
          '<p class="font-medium">Search or filter to find answers</p>' +
          '<p class="text-sm mt-1">Or use “Show rarest answers” to sort by popularity (lowest first).</p>' +
          '</div>';
      }
    }

    function render() {
      if (!isActive()) {
        renderIdle();
        return;
      }
      activated = true;
      var filtered = applyFilters(allRows, state);
      var total = filtered.length;
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.page > pages) state.page = pages;
      var start = (state.page - 1) * PAGE_SIZE;
      var pageRows = filtered.slice(start, start + PAGE_SIZE);

      if (els.meta) {
        els.meta.textContent =
          'Showing ' +
          (total === 0 ? 0 : start + 1) +
          '–' +
          Math.min(start + PAGE_SIZE, total) +
          ' of ' +
          total;
      }

      if (els.list) {
        if (total === 0) {
          els.list.innerHTML =
            '<div class="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600" role="status">' +
            '<p class="font-medium">No matching answers</p>' +
            '<p class="text-sm mt-1">Clear your search or hit Reset filters to start over.</p>' +
            '</div>';
        } else {
          els.list.innerHTML = pageRows
            .map(function (r) {
              return renderAnswerRow(r, {
                showPrompt: !state.promptId,
                popularityAvailable: day.popularity_available,
              });
            })
            .join('');
          bindCopyButtons(els.list);
        }
      }

      if (els.pager) {
        els.pager.innerHTML =
          '<button type="button" class="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40" data-page-action="prev" ' +
          (state.page <= 1 ? 'disabled' : '') +
          '>Previous</button>' +
          '<span class="text-sm text-gray-600 px-2">Page ' +
          state.page +
          ' of ' +
          pages +
          '</span>' +
          '<button type="button" class="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40" data-page-action="next" ' +
          (state.page >= pages ? 'disabled' : '') +
          '>Next</button>';
      }
    }

    function reset() {
      state.promptId = '';
      state.tier = '';
      state.search = '';
      state.sort = 'score_desc';
      state.page = 1;
      activated = !requireAction;
      if (els.prompt) els.prompt.value = '';
      if (els.tier) els.tier.value = '';
      if (els.search) els.search.value = '';
      if (els.sort) els.sort.value = 'score_desc';
      render();
    }

    function rarestPreset() {
      activated = true;
      state.sort = 'pop_asc';
      state.page = 1;
      if (els.sort) els.sort.value = 'pop_asc';
      track('krillion_rarest_preset', { label: 'rarest' });
      render();
    }

    fillSelects();

    if (els.prompt) {
      els.prompt.addEventListener('change', function () {
        state.promptId = els.prompt.value;
        state.page = 1;
        render();
      });
    }
    if (els.tier) {
      els.tier.addEventListener('change', function () {
        state.tier = els.tier.value;
        state.page = 1;
        track('krillion_tier_filter', { label: state.tier || 'all' });
        render();
      });
    }
    if (els.search) {
      var searchTimer = null;
      els.search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.search = els.search.value;
          state.page = 1;
          render();
        }, 200);
      });
    }
    if (els.sort) {
      els.sort.addEventListener('change', function () {
        state.sort = els.sort.value;
        state.page = 1;
        render();
      });
    }
    if (els.rarest) els.rarest.addEventListener('click', rarestPreset);
    if (els.reset) els.reset.addEventListener('click', reset);
    if (els.pager) {
      els.pager.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-page-action');
        if (action === 'prev' && state.page > 1) state.page -= 1;
        if (action === 'next') state.page += 1;
        render();
      });
    }

    render();
    return { reset: reset, rarestPreset: rarestPreset, render: render };
  }

  global.KrillionUI = {
    PAGE_SIZE: PAGE_SIZE,
    track: track,
    escapeHtml: escapeHtml,
    flattenAnswers: flattenAnswers,
    applyFilters: applyFilters,
    groupAnswersByScore: groupAnswersByScore,
    statusLabel: statusLabel,
    statusTone: statusTone,
    formatWhen: formatWhen,
    loadJson: loadJson,
    renderAnswerRow: renderAnswerRow,
    bindCopyButtons: bindCopyButtons,
    renderPromptBrowser: renderPromptBrowser,
    createFinderController: createFinderController,
    tierBadgeClass: tierBadgeClass,
    tierDisplayName: tierDisplayName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
