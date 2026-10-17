/* EXAM Planner — plain JavaScript, no build step.
   Study plan data lives in plan-data.js. Your edits, test results and settings
   are stored in this browser's localStorage (use Back up to keep a copy). */
(function () {
  'use strict';

  var PLAN = window.EXAM_PLAN;
  var KEY_EDITS = 'exam-planner-edits-v1';
  var KEY_GT = 'exam-planner-gt-v1';
  var KEY_META = 'exam-planner-meta-v1';

  /* ---------- storage (falls back to memory if localStorage is blocked) ---------- */
  var mem = {};
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return key in mem ? mem[key] : fallback;
    }
  }
  function save(key, value) {
    mem[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* ---------- dates ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pd(s) { return new Date(s + 'T12:00:00'); }
  function addDays(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
  function diffDays(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
  function fmt(s, opts) { return pd(s).toLocaleDateString('en-US', opts); }
  var LONG = { weekday: 'long', month: 'long', day: 'numeric' };
  var SHORT = { day: 'numeric', month: 'short' };
  var FULL = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

  /* ---------- tiny helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    down: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
    up: '<path d="M12 15V3m0 0-4 4m4-4 4 4M4 21h16"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>'
  };
  function ic(name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  /* ---------- build the day-by-day plan (same rules as the original planner) ---------- */
  var EXAM_DATE = PLAN.exam.date;
  var TESTS = PLAN.tests.slice().sort(function (a, b) { return a.number - b.number; });

  function testTasks(t) {
    return [
      { id: 'test-focus', text: 'Grand Test ' + t.number + ': ' + t.label, done: false, kind: 'task' },
      { id: 'test-review', text: t.focus, done: false, kind: 'task' },
      { id: 'test-target', text: 'Target · ' + t.target, done: false, kind: 'task' }
    ];
  }
  function practiceTasks(subjects) {
    var out = [];
    subjects.forEach(function (b, i) {
      out.push({ id: 'ibq-' + i, text: 'IBQ · ' + b.ibq, done: false, kind: 'task' });
      out.push({ id: 'mcq-' + i, text: 'MCQ · ' + b.mcq, done: false, kind: 'task' });
    });
    return out;
  }
  function buildDays() {
    var testByDate = {};
    TESTS.forEach(function (t) { testByDate[t.date] = t; });
    var blocks = PLAN.blocks;
    var start = blocks.reduce(function (m, b) { return b.start < m ? b.start : m; }, EXAM_DATE);
    var days = {};
    var carry = [];
    for (var c = start; c <= EXAM_DATE; c = addDays(c, 1)) {
      var t = testByDate[c];
      var current = blocks.filter(function (b) { return b.start <= c && b.end >= c; });
      if (t) {
        // Study planned for a Grand Test day is carried to the days after it.
        carry = carry.concat(current.map(function (b) { return Object.assign({}, b, { carried: true }); }));
        days[c] = { date: c, subjects: [], test: t, topics: [], tasks: testTasks(t) };
      } else {
        var overdue = carry.filter(function (b) { return b.end < c; });
        carry = carry.filter(function (b) { return b.end >= c; });
        var subjects = current.concat(overdue);
        days[c] = subjects.length
          ? {
              date: c, subjects: subjects,
              topics: subjects.reduce(function (a, b) { return a.concat(b.topics); }, []),
              tasks: practiceTasks(subjects)
            }
          : { date: c, subjects: [], topics: [], tasks: [] };
      }
    }
    days[EXAM_DATE] = { date: EXAM_DATE, subjects: [], exam: PLAN.exam, topics: [], tasks: [] };
    return days;
  }
  var DAYS = buildDays();
  var DATES = Object.keys(DAYS).sort();
  var PLAN_START = DATES[0];

  /* ---------- state ---------- */
  var S = {
    edits: load(KEY_EDITS, {}),
    gt: load(KEY_GT, {}),
    meta: load(KEY_META, {}),
    today: ds(new Date()),
    selected: null,
    month: null,
    tab: 'plan',
    installEvent: null
  };
  if (!S.edits || typeof S.edits !== 'object') S.edits = {};
  if (!S.gt || typeof S.gt !== 'object') S.gt = {};
  if (!S.meta || typeof S.meta !== 'object') S.meta = {};

  function clampToPlan(d) { return d < PLAN_START ? PLAN_START : d > EXAM_DATE ? EXAM_DATE : d; }
  (function initSelection() {
    var q = new URLSearchParams(location.search).get('date');
    S.selected = q && DAYS[q] ? q : clampToPlan(S.today);
    S.month = pd(S.selected);
    S.month.setDate(1);
  })();

  function saveEdits() { save(KEY_EDITS, S.edits); }
  function saveGT() { save(KEY_GT, S.gt); }
  function saveMeta() { save(KEY_META, S.meta); }

  /* ---------- day model ---------- */
  function eff(date) {
    var base = DAYS[date];
    if (!base) return null;
    var e = S.edits[date];
    return e ? Object.assign({}, base, { topics: e.topics, tasks: e.tasks }) : base;
  }
  function topicDone(day, i) {
    return day.tasks.some(function (t) { return t.id === 'topic-' + i && t.done; });
  }
  function practiceOf(day) { return day.tasks.filter(function (t) { return t.kind === 'task'; }); }
  function counts(day) {
    var done = 0;
    day.topics.forEach(function (_, i) { if (topicDone(day, i)) done++; });
    var pr = practiceOf(day);
    pr.forEach(function (t) { if (t.done) done++; });
    return { done: done, total: day.topics.length + pr.length };
  }
  function hasWork(day) { return !!(day && (day.subjects.length || day.test || day.exam)); }
  function commit(date, topics, tasks) {
    S.edits[date] = { topics: topics, tasks: tasks };
    saveEdits();
  }

  /* editing operations */
  function toggleTopic(date, i) {
    var d = eff(date);
    var tasks = d.tasks.slice();
    var idx = tasks.findIndex(function (t) { return t.id === 'topic-' + i; });
    if (idx >= 0) tasks[idx] = Object.assign({}, tasks[idx], { done: !tasks[idx].done });
    else tasks.push({ id: 'topic-' + i, text: d.topics[i], done: true, kind: 'topic' });
    commit(date, d.topics.slice(), tasks);
  }
  function editTopic(date, i, text) {
    var d = eff(date);
    var topics = d.topics.slice();
    topics[i] = text;
    var tasks = d.tasks.map(function (t) { return t.id === 'topic-' + i ? Object.assign({}, t, { text: text }) : t; });
    commit(date, topics, tasks);
  }
  function rebuildTopicTasks(day, topics, flags) {
    var practice = practiceOf(day);
    return practice.concat(topics.map(function (t, k) {
      return { id: 'topic-' + k, text: t, done: !!flags[k], kind: 'topic' };
    }));
  }
  function removeTopic(date, i) {
    var d = eff(date);
    var flags = d.topics.map(function (_, k) { return topicDone(d, k); });
    var topics = d.topics.slice();
    topics.splice(i, 1);
    flags.splice(i, 1);
    commit(date, topics, rebuildTopicTasks(d, topics, flags));
  }
  function addTopic(date, text) {
    var d = eff(date);
    var flags = d.topics.map(function (_, k) { return topicDone(d, k); });
    var topics = d.topics.concat([text]);
    flags.push(false);
    commit(date, topics, rebuildTopicTasks(d, topics, flags));
  }
  function mapTask(date, id, fn) {
    var d = eff(date);
    commit(date, d.topics.slice(), d.tasks.map(function (t) { return t.id === id ? fn(t) : t; }));
  }
  function removeTask(date, id) {
    var d = eff(date);
    commit(date, d.topics.slice(), d.tasks.filter(function (t) { return t.id !== id; }));
  }
  function addTask(date, text) {
    var d = eff(date);
    commit(date, d.topics.slice(), d.tasks.concat([{ id: 'custom-' + Date.now(), text: text, done: false, kind: 'task' }]));
  }

  /* ---------- progress maths ---------- */
  function isOpenDay(date) { var d = DAYS[date]; return d && !d.test && !d.exam; }
  function nextOpenDate() {
    for (var c = clampToPlan(S.today); c < EXAM_DATE; c = addDays(c, 1)) {
      if (isOpenDay(c) && c >= S.today) return c;
    }
    return null;
  }
  function stats() {
    var overall = { done: 0, total: 0 }, due = { done: 0, total: 0 };
    var missed = [], completeDays = 0;
    var subjects = {}, phases = {};
    DATES.forEach(function (date) {
      var d = eff(date), c = counts(d);
      overall.done += c.done; overall.total += c.total;
      if (date <= S.today) { due.done += c.done; due.total += c.total; }
      if (c.total > 0 && c.done === c.total) completeDays++;
      if (date < S.today && c.total > 0 && c.done < c.total) missed.push({ date: date, done: c.done, total: c.total, day: d });
      if (c.total > 0 && d.subjects.length) {
        var r = c.done / c.total, w = 1 / d.subjects.length;
        d.subjects.forEach(function (b) {
          var k = b.phase + '|' + b.title;
          var s = subjects[k] || (subjects[k] = { phase: b.phase, title: b.title, done: 0, total: 0 });
          s.done += r * w; s.total += w;
          var p = phases[b.phase] || (phases[b.phase] = { phase: b.phase, done: 0, total: 0, from: date, to: date });
          p.done += r * w; p.total += w;
          if (date < p.from) p.from = date;
          if (date > p.to) p.to = date;
        });
      }
    });
    // streak: consecutive finished study days, counting back from today
    var streak = 0;
    for (var i = DATES.length - 1; i >= 0; i--) {
      var date2 = DATES[i];
      if (date2 > S.today) continue;
      var c2 = counts(eff(date2));
      if (c2.total === 0) continue;
      if (c2.done === c2.total) streak++;
      else if (date2 === S.today) continue;
      else break;
    }
    return { overall: overall, due: due, missed: missed, completeDays: completeDays, streak: streak, subjects: subjects, phases: phases };
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  /* ---------- rendering: header ---------- */
  function renderHeader() {
    $('#hero-eyebrow').textContent = 'Your study desk · ' + fmt(S.today, LONG);
    var n = Math.max(0, diffDays(S.today, EXAM_DATE));
    $('#countdown').innerHTML = ic('cal', 14) + ' ' + (n === 0 && S.today === EXAM_DATE ? 'Exam day' : n + (n === 1 ? ' day' : ' days') + ' until the exam');
  }

  /* ---------- rendering: today ---------- */
  function topicLine(date, i, text, done) {
    return '<button type="button" class="topic-line ' + (done ? 'done' : '') + '" data-act="toggle-topic" data-date="' + date +
      '" data-i="' + i + '" aria-pressed="' + done + '"><span class="check ' + (done ? 'checked' : '') + '">' +
      (done ? ic('check', 12) : '') + '</span><span>' + esc(text) + '</span></button>';
  }
  function taskLine(date, t) {
    return '<button type="button" class="topic-line ' + (t.done ? 'done' : '') + '" data-act="toggle-task" data-date="' + date +
      '" data-id="' + esc(t.id) + '" aria-pressed="' + t.done + '"><span class="check ' + (t.done ? 'checked' : '') + '">' +
      (t.done ? ic('check', 12) : '') + '</span><span>' + esc(t.text) + '</span></button>';
  }
  function renderToday() {
    var el = $('#today');
    var t = S.today, d = eff(t);
    var head = function (sub, chip) {
      return '<div class="today-title-row"><div><div class="eyebrow">Today’s page</div><h2>' + fmt(t, LONG) +
        '</h2><div class="today-sub">' + sub + '</div></div><span class="phase-chip">' + chip + '</span></div>';
    };
    if (!d) {
      var before = t < PLAN_START;
      el.innerHTML = head(before ? 'Your plan begins on ' + fmt(PLAN_START, FULL) + '.' : 'The plan has finished.', before ? 'Not started' : 'Finished') +
        '<div class="study-list"><div class="empty-note">' + (before
          ? 'Use the calendar to preview upcoming days — you can already edit any date.'
          : 'The exam date has passed. You can still review the calendar and your Grand Test log.') + '</div></div>';
      return;
    }
    var c = counts(d);
    var sub = d.exam ? 'Exam day. Give yourself room to focus.' : d.test ? 'Mock day. Trust your preparation.' :
      d.subjects.length ? 'A clear plan for a focused session.' : 'A little progress is still progress.';
    var chip = d.exam ? 'EXAM' : d.test ? 'GT ' + d.test.number : d.subjects.length ? 'Phase ' + d.subjects[0].phase : 'Open day';
    var body = '';
    if (d.exam) {
      body = '<div class="study-item"><div class="study-rail"></div><div><h3>' + esc(PLAN.exam.title) + '</h3><div class="study-meta">' +
        fmt(d.exam.date, FULL) + '</div><div class="study-meta">' + esc(PLAN.exam.note || '') + '</div></div></div>';
    } else if (d.test) {
      body = '<div class="study-item"><div class="study-rail"></div><div style="flex:1"><h3>Grand Test ' + d.test.number + ' · ' + esc(d.test.label) +
        '</h3><div class="study-meta">' + esc(d.test.focus) + '</div><div class="study-foot"><span>TARGET  ' + esc(d.test.target) +
        '</span><span>PHASE  ' + d.test.phase + '</span></div><div class="today-topics">' + practiceOf(d).map(function (x) { return taskLine(t, x); }).join('') + '</div></div></div>';
    } else if (d.subjects.length) {
      var perSubject = d.subjects.reduce(function (a, b) { return a + b.topics.length; }, 0) === d.topics.length;
      var offset = 0;
      body = d.subjects.map(function (b, si) {
        var count = perSubject ? b.topics.length : d.topics.length;
        var from = perSubject ? offset : 0;
        offset += b.topics.length;
        if (!perSubject && si > 0) return '';
        var lines = '';
        for (var i = from; i < from + count; i++) lines += topicLine(t, i, d.topics[i], topicDone(d, i));
        var title = perSubject ? b.title : d.subjects.map(function (x) { return x.title; }).join(' + ');
        return '<div class="study-item"><div class="study-rail"></div><div style="flex:1"><h3>' + esc(title) +
          (b.carried && perSubject ? ' <span class="mini-label">· carried</span>' : '') + '</h3><div class="today-topics">' + lines + '</div>' +
          (perSubject ? '<div class="study-foot"><span>IBQ  ' + esc(b.ibq) + '</span><span>MCQ  ' + esc(b.mcq) + '</span></div>' : '') + '</div></div>';
      }).join('');
      if (!d.topics.length) body = '<div class="empty-note">All topics were removed from today. Add some in the editor below.</div>';
    } else {
      body = '<div class="empty-note">No source assignment falls on today. Use the calendar to preview upcoming study dates, or add your own topics below.</div>';
    }
    var progress = c.total
      ? '<div class="progress-line"><div class="bar"><i style="width:' + pct(c.done, c.total) + '%"></i></div><span>' + c.done + ' / ' + c.total + ' done</span></div>'
      : '';
    var edit = S.selected !== t ? '<div><button class="link-btn" data-act="goto-today">Edit today’s plan</button></div>' : '';
    el.innerHTML = head(sub, chip) + '<div class="study-list">' + body + '</div>' + progress + edit;
  }

  /* ---------- rendering: calendar ---------- */
  function renderCalendar() {
    var m = S.month;
    var first = new Date(m.getFullYear(), m.getMonth(), 1);
    var start = new Date(first);
    start.setDate(1 - first.getDay());
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start);
      d.setDate(start.getDate() + i);
      var s = ds(d), day = DAYS[s], ed = day ? eff(s) : null;
      var work = hasWork(day);
      var cls = ['day-button'];
      if (d.getMonth() !== m.getMonth()) cls.push('outside');
      if (s === S.today) cls.push('today');
      if (s === S.selected) cls.push('selected');
      if (work) {
        cls.push('has-work');
        var c = counts(ed);
        if (c.total > 0 && c.done === c.total) cls.push('done');
        else if (c.total > 0 && s < S.today) cls.push('missed');
      }
      var ev = day && day.test ? 'grand-test' : day && day.exam ? 'exam' : work ? 'study' : 'none';
      var label = fmt(s, { weekday: 'long', month: 'long', day: 'numeric' }) +
        (ev === 'grand-test' ? ', Grand Test day' : ev === 'exam' ? ', exam day' : work ? ', study assignment' : '');
      cells += '<button class="' + cls.join(' ') + '" data-act="sel-date" data-date="' + s + '" data-event="' + ev +
        '" aria-label="' + label + '" aria-pressed="' + (s === S.selected) + '">' + d.getDate() + '</button>';
    }
    $('#calendar').innerHTML =
      '<div><div class="calendar-head"><div><div class="eyebrow">Your month at a glance</div><h2>' +
      m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</h2></div><div class="month-controls">' +
      '<button class="icon-btn" data-act="month-prev" aria-label="Previous month">' + ic('left') + '</button>' +
      '<button class="icon-btn" data-act="month-next" aria-label="Next month">' + ic('right') + '</button></div></div>' +
      '<div class="calendar-grid">' + ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(function (w) { return '<div class="weekday">' + w + '</div>'; }).join('') + cells + '</div></div>' +
      '<div class="cal-legend"><span><i class="legend-dot"></i>Study</span><span><i class="legend-dot test-dot"></i>Grand Test</span>' +
      '<span><i class="legend-dot exam-dot"></i>Exam</span><span><i class="legend-dot done-dot"></i>Finished</span>' +
      '<span><i class="legend-dot missed-dot"></i>Unfinished</span></div>';
  }

  /* ---------- rendering: editor ---------- */
  function renderEditor() {
    var date = S.selected, d = eff(date);
    var c = counts(d);
    var h = '<div class="section-head"><div><div class="eyebrow">Selected day · editable plan</div><h2>' + fmt(date, LONG) +
      '</h2></div><span class="selected-date">' + pd(date).getFullYear() + '</span></div>';
    if (d.test) {
      h += '<div class="exam-card" style="margin-bottom:14px;background:#f8eee4;border-color:#eddfcf"><div class="eyebrow">Grand Test ' + d.test.number + ' · Phase ' + d.test.phase +
        '</div><div class="exam-date" style="font-size:18px">' + esc(d.test.label) + '</div><div class="exam-count">' + esc(d.test.focus) + ' · target ' + esc(d.test.target) + '</div></div>';
    }
    if (d.exam) {
      h += '<div class="exam-card" style="margin-bottom:14px"><div class="eyebrow">Examination day</div><div class="exam-date" style="font-size:18px">' + esc(PLAN.exam.title) +
        '</div><div class="exam-count">' + fmt(d.exam.date, FULL) + ' · no subject schedule</div></div>';
    }
    if (d.subjects.length) {
      h += '<div class="study-meta" style="margin-bottom:10px">Scheduled: ' + d.subjects.map(function (b) { return esc(b.title); }).join(' · ') +
        (d.subjects.some(function (b) { return b.carried; }) ? ' · includes carried study' : '') + '</div>';
    }
    if (c.total) h += '<div class="day-count">' + c.done + ' of ' + c.total + ' items complete</div>';

    if (d.test || d.exam) {
      h += '<div class="empty-note">' + (d.test ? 'This date is reserved for the Grand Test only. Edit the test tasks below.' : 'This date is reserved for the exam.') + '</div>';
    } else {
      h += '<label class="editor-label">Topics to cover</label>';
      if (d.topics.length) {
        h += '<div class="task-list">' + d.topics.map(function (t, i) {
          var done = topicDone(d, i);
          return '<div class="task-row"><button class="check ' + (done ? 'checked' : '') + '" data-act="toggle-topic" data-date="' + date + '" data-i="' + i +
            '" aria-label="Mark topic ' + (i + 1) + ' complete" aria-pressed="' + done + '">' + (done ? ic('check', 12) : '') + '</button>' +
            '<input class="text-input task-copy ' + (done ? 'done' : '') + '" aria-label="Edit topic ' + (i + 1) + '" value="' + esc(t) +
            '" data-field="topic" data-date="' + date + '" data-i="' + i + '">' +
            '<button class="task-remove" data-act="remove-topic" data-date="' + date + '" data-i="' + i + '" aria-label="Remove topic ' + (i + 1) + '">' + ic('trash', 14) + '</button></div>';
        }).join('') + '</div>';
      } else {
        h += '<div class="empty-note">No topics are planned for this date. Add a topic to shape the day.</div>';
      }
      h += '<form class="add-row" data-form="add-topic" data-date="' + date + '"><input class="text-input" name="text" placeholder="Add a topic…" aria-label="New topic" autocomplete="off">' +
        '<button class="quiet-btn" type="submit">' + ic('plus', 14) + ' Topic</button></form>';
    }

    h += '<div class="task-type">Practice tasks</div>';
    var pr = practiceOf(d);
    if (pr.length) {
      h += '<div class="task-list">' + pr.map(function (t) {
        return '<div class="task-row"><button class="check ' + (t.done ? 'checked' : '') + '" data-act="toggle-task" data-date="' + date + '" data-id="' + esc(t.id) +
          '" aria-label="Mark ' + esc(t.text) + ' complete" aria-pressed="' + t.done + '">' + (t.done ? ic('check', 12) : '') + '</button>' +
          '<input class="text-input task-copy ' + (t.done ? 'done' : '') + '" aria-label="Edit practice task" value="' + esc(t.text) +
          '" data-field="task" data-date="' + date + '" data-id="' + esc(t.id) + '">' +
          '<button class="task-remove" data-act="remove-task" data-date="' + date + '" data-id="' + esc(t.id) + '" aria-label="Remove practice task">' + ic('trash', 14) + '</button></div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="empty-note">No practice tasks yet. Add one when you know what you want to work on.</div>';
    }
    h += '<form class="add-row" data-form="add-task" data-date="' + date + '"><input class="text-input" name="text" placeholder="Add a task…" aria-label="New practice task" autocomplete="off">' +
      '<button class="quiet-btn" type="submit">' + ic('plus', 14) + ' Task</button></form>';

    h += '<div class="editor-actions">';
    if (S.edits[date]) h += '<button class="quiet-btn" data-act="reset-day" data-date="' + date + '">' + ic('undo', 14) + ' Reset this day to the original plan</button>';
    if (date !== S.today) h += '<button class="quiet-btn" data-act="goto-today">' + ic('cal', 14) + ' Jump to today</button>';
    h += '</div>';
    $('#editor').innerHTML = h;
  }

  /* ---------- rendering: side cards ---------- */
  function backupAge() {
    if (!S.meta.lastBackup) return null;
    return Math.floor((Date.now() - new Date(S.meta.lastBackup).getTime()) / 864e5);
  }
  function backupStatus() {
    var hasData = Object.keys(S.edits).length || Object.keys(S.gt).length;
    var age = backupAge();
    if (age === null) {
      return hasData
        ? '<div class="warn-note">You have not backed up yet. Your plan only lives in this browser — download a backup file.</div>'
        : '<div class="ok-note">Nothing to back up yet. Your edits and test results will appear here.</div>';
    }
    var when = age <= 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago';
    return age > 7 && hasData
      ? '<div class="warn-note">Last backup was ' + when + '. Download a fresh one so you don’t lose recent progress.</div>'
      : '<div class="ok-note">Last backup: ' + when + '.</div>';
  }
  function renderSide() {
    var n = Math.max(0, diffDays(S.today, EXAM_DATE));
    var sd = eff(S.selected), sc = counts(sd);
    var reminder = S.meta.reminderTime || '08:00';
    var h = '';
    h += '<section class="exam-card"><div class="eyebrow">Mark the horizon</div><div class="exam-date">' + fmt(EXAM_DATE, { day: 'numeric', month: 'short', year: 'numeric' }) +
      '</div><div class="exam-count">EXAM · ' + fmt(EXAM_DATE, { weekday: 'long' }) + ' · ' + n + ' days to go</div></section>';
    h += '<div class="eyebrow" style="padding:0 3px">' + ic('check', 12) + ' ' + sc.done + ' of ' + sc.total + ' selected-day tasks complete</div>';

    h += '<section class="paper mini-card"><div class="eyebrow">Keep your rhythm</div><h3 class="panel-title">Daily reminders</h3>' +
      '<p>Download a calendar file and open it in Google Calendar, Apple Calendar or Outlook. Each study day gets an alert with its topics at the time you choose.</p>' +
      '<div class="time-row"><label for="reminder-time">Alert time</label><input class="time-input" id="reminder-time" type="time" value="' + esc(reminder) + '" data-field="reminder-time"></div>' +
      '<div class="btn-row"><button class="primary-btn" data-act="export-ics">' + ic('cal', 14) + ' Add to calendar (.ics)</button></div>' +
      '<p style="font-size:10px">Includes today onward. If you change the plan later, download it again — events update instead of duplicating.</p></section>';

    h += '<section class="paper mini-card"><div class="eyebrow">Keep your data safe</div><h3 class="panel-title">Back up &amp; restore</h3>' +
      '<p>Everything is stored in this browser only. A backup file lets you move to a new phone or recover after clearing site data.</p>' + backupStatus() +
      '<div class="btn-row"><button class="primary-btn" data-act="export-json">' + ic('down', 14) + ' Back up</button>' +
      '<button class="quiet-btn" data-act="import-json">' + ic('up', 14) + ' Restore</button></div>' +
      '<details><summary>Moving from the old Replit version?</summary><p style="margin-top:8px">Open the old site, press F12, paste <code>copy(localStorage.getItem("inicet-planner-edits-v1"))</code> in the Console, then paste the result here.</p>' +
      '<textarea class="text-input" id="paste-old" placeholder="Paste old data here"></textarea><div class="btn-row"><button class="quiet-btn" data-act="import-paste">Import pasted data</button></div></details></section>';

    if (S.installEvent) {
      h += '<section class="paper mini-card"><div class="eyebrow">Use it like an app</div><h3 class="panel-title">Install on this device</h3><p>Opens full-screen and works offline.</p>' +
        '<div class="btn-row"><button class="primary-btn" data-act="install">Install app</button></div></section>';
    }
    $('#side').innerHTML = h;
  }

  /* ---------- rendering: progress ---------- */
  function renderProgress() {
    var st = stats();
    var overall = pct(st.overall.done, st.overall.total), due = pct(st.due.done, st.due.total);
    var n = Math.max(0, diffDays(S.today, EXAM_DATE));
    var h = '<div class="tiles">' +
      tile('Overall', overall + '%', st.overall.done + ' of ' + st.overall.total + ' items') +
      tile('Due so far', st.due.total ? due + '%' : '—', st.due.total ? st.due.done + ' of ' + st.due.total + ' items up to today' : 'Plan has not started') +
      tile('Streak', st.streak + (st.streak === 1 ? ' day' : ' days'), 'Consecutive finished days') +
      tile('Unfinished', String(st.missed.length), st.missed.length === 1 ? 'past day to catch up' : 'past days to catch up') + '</div>';

    h += '<div class="two-col"><section class="paper card-pad"><div class="eyebrow">Coverage</div><h2>Progress by subject</h2>';
    var phaseKeys = Object.keys(st.phases).sort();
    if (!phaseKeys.length) h += '<div class="empty-note">Tick off topics and tasks to see progress here.</div>';
    phaseKeys.forEach(function (pk, idx) {
      var p = st.phases[pk];
      h += '<div class="phase-group" ' + (idx === 0 ? 'style="margin-top:0"' : '') + '><h3>Phase ' + p.phase + ' <small>' + fmt(p.from, SHORT) + ' – ' + fmt(p.to, SHORT) + ' · ' + pct(p.done, p.total) + '%</small></h3>';
      var subs = Object.keys(st.subjects).map(function (k) { return st.subjects[k]; }).filter(function (s) { return String(s.phase) === pk; });
      subs.forEach(function (s) {
        var v = pct(s.done, s.total);
        h += '<div class="bar-row"><span>' + esc(s.title) + '</span><div class="bar"><i style="width:' + v + '%"></i></div><b>' + v + '%</b></div>';
      });
      h += '</div>';
    });
    h += '</section>';

    h += '<section class="paper card-pad"><div class="eyebrow">Catch up</div><h2>Unfinished days</h2>';
    if (!st.missed.length) {
      h += '<div class="empty-note">Nothing left behind. Every past day is finished.</div>';
    } else {
      var target = nextOpenDate();
      h += '<div class="stack">' + st.missed.slice().reverse().slice(0, 30).map(function (m) {
        var left = m.total - m.done;
        var title = m.day.test ? 'Grand Test ' + m.day.test.number : m.day.subjects.map(function (b) { return b.title; }).join(' + ') || 'Open day';
        return '<div class="missed-item"><div class="top"><strong>' + esc(title) + '</strong><small>' + left + ' left</small></div>' +
          '<div class="study-meta">' + fmt(m.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + m.done + ' of ' + m.total + ' done</div><div class="acts">' +
          '<button class="quiet-btn" data-act="open-day" data-date="' + m.date + '">Open</button>' +
          (target && !m.day.test ? '<button class="quiet-btn" data-act="move-day" data-date="' + m.date + '">' + ic('arrow', 13) + ' Move to ' + (target === S.today ? 'today' : fmt(target, SHORT)) + '</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';
      if (st.missed.length > 30) h += '<p class="study-meta" style="margin-top:10px">Showing the 30 most recent.</p>';
      if (target && st.missed.some(function (m) { return !m.day.test; })) {
        h += '<div class="editor-actions"><button class="primary-btn" data-act="move-all">Move all unfinished topics to ' + (target === S.today ? 'today' : fmt(target, SHORT)) + '</button></div>';
      }
    }
    h += '</section></div>';
    $('#view-progress').innerHTML = h;
  }
  function tile(label, num, sub) {
    return '<div class="paper tile"><div class="eyebrow">' + label + '</div><div class="num">' + num + '</div><div class="sub">' + sub + '</div></div>';
  }

  function moveUndone(from, to) {
    var f = eff(from), t = eff(to);
    if (!f || !t || from === to) return 0;
    var keepTopics = [], keepFlags = [], moveTopics = [];
    f.topics.forEach(function (x, i) {
      if (topicDone(f, i)) { keepTopics.push(x); keepFlags.push(true); } else moveTopics.push(x);
    });
    var pr = practiceOf(f);
    var movePr = pr.filter(function (x) { return !x.done; });
    var keepPr = pr.filter(function (x) { return x.done; });
    if (!moveTopics.length && !movePr.length) return 0;
    var fromTasks = keepPr.concat(keepTopics.map(function (x, k) { return { id: 'topic-' + k, text: x, done: true, kind: 'topic' }; }));
    commit(from, keepTopics, fromTasks);
    var tFlags = t.topics.map(function (_, k) { return topicDone(t, k); });
    var newTopics = t.topics.concat(moveTopics);
    moveTopics.forEach(function () { tFlags.push(false); });
    var toPr = practiceOf(t).concat(movePr.map(function (x, k) {
      return { id: 'moved-' + Date.now() + '-' + k, text: x.text, done: false, kind: 'task' };
    }));
    var toTasks = toPr.concat(newTopics.map(function (x, k) { return { id: 'topic-' + k, text: x, done: !!tFlags[k], kind: 'topic' }; }));
    commit(to, newTopics, toTasks);
    return moveTopics.length + movePr.length;
  }

  /* ---------- rendering: grand tests ---------- */
  function gtPct(g) {
    if (!g) return null;
    var score = parseFloat(g.score), out = parseFloat(g.outOf || S.meta.outOf);
    if (!isFinite(score) || !isFinite(out) || out <= 0) return null;
    return Math.max(0, Math.min(100, (score / out) * 100));
  }
  function gtStatus(t) {
    var p = gtPct(S.gt[t.number]);
    if (p !== null) return { cls: 'logged', text: 'Logged · ' + Math.round(p) + '%' };
    if (t.date <= S.today) return { cls: 'due', text: t.date === S.today ? 'Today' : 'Add result' };
    var n = diffDays(S.today, t.date);
    return { cls: '', text: 'In ' + n + (n === 1 ? ' day' : ' days') };
  }
  var gtOpen = {};
  function renderTests() {
    var next = TESTS.find(function (t) { return t.date >= S.today && gtPct(S.gt[t.number]) === null; });
    var dueUnlogged = TESTS.filter(function (t) { return t.date <= S.today && gtPct(S.gt[t.number]) === null; });
    var h = '<div class="two-col"><div class="gt-list" id="gt-list">';
    TESTS.forEach(function (t) {
      var g = S.gt[t.number] || {};
      var st = gtStatus(t);
      var open = gtOpen[t.number] || (next && next.number === t.number) || (dueUnlogged.length && dueUnlogged[dueUnlogged.length - 1].number === t.number);
      h += '<details class="gt-item" data-n="' + t.number + '"' + (open ? ' open' : '') + '><summary><span class="gt-num">' + t.number +
        '</span><span><div class="t">' + esc(t.label) + '</div><div class="d">' + fmt(t.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() +
        ' · PHASE ' + t.phase + '</div></span><span class="chip ' + st.cls + '" id="gt-chip-' + t.number + '">' + st.text + '</span></summary>' +
        '<div class="gt-body"><div class="meta">' + esc(t.focus) + ' · target <b>' + esc(t.target) + '</b></div>' +
        '<div class="field-grid"><label>Score<input class="text-input" inputmode="decimal" data-gt="score" data-n="' + t.number + '" value="' + esc(g.score || '') + '" placeholder="e.g. 520"></label>' +
        '<label>Out of<input class="text-input" inputmode="decimal" data-gt="outOf" data-n="' + t.number + '" value="' + esc(g.outOf || '') + '" placeholder="' + esc(S.meta.outOf || 'e.g. 800') + '"></label>' +
        '<label>Rank / percentile<input class="text-input" data-gt="rank" data-n="' + t.number + '" value="' + esc(g.rank || '') + '" placeholder="optional"></label></div>' +
        '<label class="full">Weak areas (comma separated)<input class="text-input" data-gt="weak" data-n="' + t.number + '" value="' + esc(g.weak || '') + '" placeholder="e.g. ECG, Pharmacology, Biostatistics"></label>' +
        '<label class="full">Notes<textarea class="text-input" data-gt="notes" data-n="' + t.number + '" placeholder="Mistakes, time management, what to change next time">' + esc(g.notes || '') + '</textarea></label>' +
        '</div></details>';
    });
    h += '</div><aside class="stack" id="gt-side"></aside></div>';
    $('#view-tests').innerHTML = h;
    renderGTSide();
  }
  function weakAreas() {
    var map = {};
    TESTS.forEach(function (t) {
      var g = S.gt[t.number];
      if (!g || !g.weak) return;
      var seen = {};
      g.weak.split(/[,;\n]/).forEach(function (w) {
        var label = w.trim();
        if (!label) return;
        var key = label.toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        (map[key] || (map[key] = { label: label, n: 0 })).n++;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label); });
  }
  function chartSVG(points) {
    var W = 560, H = 230, L = 34, R = 14, T = 14, B = 28;
    var n = TESTS.length;
    var x = function (num) { return L + ((num - 1) / (n - 1)) * (W - L - R); };
    var y = function (p) { return T + (1 - p / 100) * (H - T - B); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grand Test score trend">';
    [0, 25, 50, 75, 100].forEach(function (g) {
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#e6e0d3" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y(g) + 3) + '" text-anchor="end">' + g + '</text>';
    });
    TESTS.forEach(function (t) {
      if (t.number % 2 === 1 || n < 10) svg += '<text x="' + x(t.number) + '" y="' + (H - 8) + '" text-anchor="middle">' + t.number + '</text>';
    });
    if (points.length > 1) {
      svg += '<polyline fill="none" stroke="#3f775f" stroke-width="2.2" stroke-linejoin="round" points="' +
        points.map(function (p) { return x(p.n).toFixed(1) + ',' + y(p.p).toFixed(1); }).join(' ') + '"/>';
    }
    points.forEach(function (p) {
      svg += '<circle cx="' + x(p.n).toFixed(1) + '" cy="' + y(p.p).toFixed(1) + '" r="4.5" fill="#fcfaf4" stroke="#285644" stroke-width="2"><title>GT ' + p.n + ': ' + Math.round(p.p) + '%</title></circle>';
    });
    return svg + '</svg>';
  }
  function renderGTSide() {
    var el = $('#gt-side');
    if (!el) return;
    var pts = [];
    TESTS.forEach(function (t) { var p = gtPct(S.gt[t.number]); if (p !== null) pts.push({ n: t.number, p: p }); });
    var h = '<section class="paper card-pad"><div class="eyebrow">Trend</div><h2>Score by Grand Test</h2>';
    h += pts.length ? '<div class="chart-wrap">' + chartSVG(pts) + '</div>' : '<div class="empty-note">Add a score (and “out of”) to a test to draw your trend line.</div>';
    if (pts.length) {
      var avg = pts.reduce(function (a, p) { return a + p.p; }, 0) / pts.length;
      var best = pts.reduce(function (a, p) { return p.p > a.p ? p : a; });
      var last = pts[pts.length - 1];
      var delta = pts.length > 1 ? last.p - pts[pts.length - 2].p : null;
      h += '<div style="margin-top:14px"><div class="kv"><span>Tests logged</span><b>' + pts.length + ' of ' + TESTS.length + '</b></div>' +
        '<div class="kv"><span>Average</span><b>' + avg.toFixed(1) + '%</b></div>' +
        '<div class="kv"><span>Best</span><b>' + best.p.toFixed(1) + '% (GT ' + best.n + ')</b></div>' +
        '<div class="kv"><span>Latest</span><b>' + last.p.toFixed(1) + '%' + (delta === null ? '' : ' (' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + ')') + '</b></div></div>';
    }
    h += '</section><section class="paper card-pad"><div class="eyebrow">Patterns</div><h2>Recurring weak areas</h2>';
    var weak = weakAreas();
    h += weak.length
      ? '<div class="tag-list">' + weak.slice(0, 14).map(function (w) { return '<span class="tag">' + esc(w.label) + '<b>×' + w.n + '</b></span>'; }).join('') + '</div>'
      : '<div class="empty-note">List weak areas on each test. Topics that keep coming back will show up here.</div>';
    h += '</section>';
    el.innerHTML = h;
  }
  function updateGTChip(n) {
    var t = TESTS.find(function (x) { return x.number === n; });
    var chip = $('#gt-chip-' + n);
    if (!t || !chip) return;
    var st = gtStatus(t);
    chip.className = 'chip ' + st.cls;
    chip.textContent = st.text;
  }

  /* ---------- tabs ---------- */
  var TABS = ['plan', 'progress', 'tests'];
  function showTab(name, skipHash) {
    if (TABS.indexOf(name) < 0) name = 'plan';
    S.tab = name;
    TABS.forEach(function (t) {
      $('#view-' + t).hidden = t !== name;
      var b = $('#tab-' + t);
      b.setAttribute('aria-selected', String(t === name));
      b.tabIndex = t === name ? 0 : -1;
    });
    if (name === 'progress') renderProgress();
    if (name === 'tests') renderTests();
    if (!skipHash) history.replaceState(null, '', name === 'plan' ? location.pathname + location.search : '#' + name);
  }

  function renderAll() {
    renderHeader();
    renderToday();
    renderCalendar();
    renderEditor();
    renderSide();
    if (S.tab === 'progress') renderProgress();
    if (S.tab === 'tests') renderTests();
  }
  // After typing in a field we refresh everything except the editor so focus isn't lost.
  function renderLight() {
    renderToday();
    renderCalendar();
    renderSide();
    var count = $('#editor .day-count');
    if (count) { var c = counts(eff(S.selected)); count.textContent = c.done + ' of ' + c.total + ' items complete'; }
  }

  /* ---------- downloads ---------- */
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function exportBackup() {
    var payload = {
      app: 'exam-planner', version: 1, exported: new Date().toISOString(),
      edits: S.edits, gt: S.gt, settings: { reminderTime: S.meta.reminderTime || '08:00', outOf: S.meta.outOf || '' }
    };
    download('exam-planner-backup-' + S.today + '.json', 'application/json', JSON.stringify(payload, null, 2));
    S.meta.lastBackup = new Date().toISOString();
    saveMeta();
    renderSide();
    toast('Backup downloaded. Keep the file somewhere safe (Drive, email, WhatsApp).');
  }
  function cleanEdits(obj) {
    var out = {}, n = 0;
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !DAYS[k] || !v || !Array.isArray(v.topics) || !Array.isArray(v.tasks)) return;
      out[k] = {
        topics: v.topics.map(String),
        tasks: v.tasks.filter(function (t) { return t && typeof t.id === 'string'; })
          .map(function (t) { return { id: t.id, text: String(t.text || ''), done: !!t.done, kind: t.kind === 'topic' ? 'topic' : 'task' }; })
      };
      n++;
    });
    return { data: out, count: n };
  }
  function cleanGT(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      var g = obj[k];
      if (!/^\d+$/.test(k) || !g || typeof g !== 'object') return;
      out[k] = {};
      ['score', 'outOf', 'rank', 'weak', 'notes'].forEach(function (f) { if (g[f] != null) out[k][f] = String(g[f]); });
    });
    return out;
  }
  function importText(text, fromPaste) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { toast('That does not look like valid backup data.'); return; }
    if (obj && obj.app === 'exam-planner') {
      var e = cleanEdits(obj.edits), g = cleanGT(obj.gt);
      if (!window.confirm('Replace the plan edits and test results in this browser with the backup (' + e.count + ' edited days, ' + Object.keys(g).length + ' test results)?')) return;
      S.edits = e.data; S.gt = g;
      if (obj.settings) {
        if (obj.settings.reminderTime) S.meta.reminderTime = String(obj.settings.reminderTime);
        if (obj.settings.outOf != null) S.meta.outOf = String(obj.settings.outOf);
      }
      saveEdits(); saveGT(); saveMeta();
      renderAll();
      toast('Backup restored.');
    } else {
      // old format: { "2026-10-16": { topics: [...], tasks: [...] }, ... }
      var c = cleanEdits(obj);
      if (!c.count) { toast(fromPaste ? 'No planner days found in the pasted data.' : 'That file is not an EXAM Planner backup.'); return; }
      Object.assign(S.edits, c.data);
      saveEdits();
      renderAll();
      toast('Imported ' + c.count + ' edited days.');
    }
  }

  /* calendar (.ics) */
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) {
    var out = [], bytes = 0, cur = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], len = unescape(encodeURIComponent(ch)).length;
      if (bytes + len > 72) { out.push(cur); cur = ' ' + ch; bytes = 1 + len; } else { cur += ch; bytes += len; }
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function exportICS() {
    var time = S.meta.reminderTime || '08:00';
    var hh = parseInt(time.split(':')[0], 10), mm = parseInt(time.split(':')[1], 10);
    if (!isFinite(hh) || !isFinite(mm)) { hh = 8; mm = 0; }
    var end = new Date(2000, 0, 1, hh, mm + 30);
    var endStr = pad(end.getHours()) + pad(end.getMinutes()) + '00';
    var startStr = pad(hh) + pad(mm) + '00';
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EXAM Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:EXAM Planner'];
    var count = 0;
    DATES.forEach(function (date) {
      if (date < S.today) return;
      var d = eff(date);
      if (!hasWork(d)) return;
      var title, desc = [];
      if (d.exam) { title = PLAN.exam.title; desc.push(PLAN.exam.note || ''); }
      else if (d.test) {
        title = 'Grand Test ' + d.test.number + ' – ' + d.test.label;
        desc.push(d.test.focus, 'Target: ' + d.test.target);
      } else {
        title = 'Study: ' + d.subjects.map(function (b) { return b.title; }).join(' + ');
        d.topics.forEach(function (t) { desc.push('• ' + t); });
        practiceOf(d).forEach(function (t) { desc.push('– ' + t.text); });
      }
      var day = date.replace(/-/g, '');
      var ev = ['BEGIN:VEVENT', 'UID:' + date + '@exam-planner', 'DTSTAMP:' + stamp, 'DTSTART:' + day + 'T' + startStr, 'DTEND:' + day + 'T' + endStr,
        'SUMMARY:' + icsEscape(title), 'DESCRIPTION:' + icsEscape(desc.join('\n')),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title), 'TRIGGER:PT0S', 'END:VALARM'];
      if (d.test || d.exam) ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Tomorrow: ' + title), 'TRIGGER:-P1D', 'END:VALARM');
      ev.push('END:VEVENT');
      lines = lines.concat(ev);
      count++;
    });
    lines.push('END:VCALENDAR');
    if (!count) { toast('There are no upcoming study days to add.'); return; }
    download('exam-planner-reminders.ics', 'text/calendar', lines.map(icsFold).join('\r\n') + '\r\n');
    toast(count + ' days exported. Open the downloaded file to add them to your calendar.');
  }

  /* printable timetable (use "Save as PDF" in the print dialog) */
  function buildPrint() {
    var h = '<h1>EXAM 2027 · Study timetable</h1><div class="sub">Personal study desk · printed ' +
      new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>';
    var month = '';
    DATES.forEach(function (date) {
      var d = eff(date);
      if (!hasWork(d)) return;
      var m = pd(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (m !== month) { month = m; h += '<h2>' + m + '</h2>'; }
      var title = d.exam ? PLAN.exam.title : d.test ? 'Grand Test ' + d.test.number + ' · ' + d.test.label : d.subjects.map(function (b) { return b.title; }).join(' · ');
      var items = [];
      if (d.test) items.push('<li>Focus: ' + esc(d.test.focus) + ' — Target: ' + esc(d.test.target) + '</li>');
      d.topics.forEach(function (t, i) { items.push('<li>' + (topicDone(d, i) ? '☑' : '☐') + ' ' + esc(t) + '</li>'); });
      practiceOf(d).forEach(function (t) { items.push('<li>' + (t.done ? '☑' : '☐') + ' ' + esc(t.text) + '</li>'); });
      h += '<div class="day ' + (d.test ? 'test' : d.exam ? 'exam' : '') + '"><b>' + esc(title) + '</b><small>' +
        fmt(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + '</small>' + (items.length ? '<ul>' + items.join('') + '</ul>' : '') + '</div>';
    });
    $('#print-root').innerHTML = h;
  }

  /* ---------- events ---------- */
  function selectDate(date, scroll) {
    S.selected = date;
    var m = pd(date); m.setDate(1);
    S.month = m;
    renderCalendar(); renderEditor(); renderSide(); renderToday();
    if (scroll && window.matchMedia('(max-width:1020px)').matches) {
      $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function after() { renderAll(); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act, date = el.dataset.date, i = el.dataset.i != null ? parseInt(el.dataset.i, 10) : null, id = el.dataset.id;
    switch (act) {
      case 'tab': showTab(el.dataset.tab); break;
      case 'sel-date': selectDate(date, true); break;
      case 'month-prev': S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCalendar(); break;
      case 'month-next': S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCalendar(); break;
      case 'goto-today': selectDate(clampToPlan(S.today), false); break;
      case 'toggle-topic': toggleTopic(date, i); after(); break;
      case 'remove-topic': removeTopic(date, i); after(); break;
      case 'toggle-task': mapTask(date, id, function (t) { return Object.assign({}, t, { done: !t.done }); }); after(); break;
      case 'remove-task': removeTask(date, id); after(); break;
      case 'reset-day':
        if (window.confirm('Reset ' + fmt(date, LONG) + ' to the original plan? Your edits and ticks for this day will be lost.')) {
          delete S.edits[date]; saveEdits(); after();
        }
        break;
      case 'open-day': showTab('plan'); selectDate(date, true); window.scrollTo({ top: 0 }); break;
      case 'move-day': {
        var target = nextOpenDate(), n = target ? moveUndone(date, target) : 0;
        after(); toast(n ? 'Moved ' + n + (n === 1 ? ' item' : ' items') + ' to ' + (target === S.today ? 'today' : fmt(target, SHORT)) + '.' : 'Nothing to move.');
        break;
      }
      case 'move-all': {
        var tg = nextOpenDate(), total = 0;
        if (tg) stats().missed.forEach(function (m) { if (!m.day.test) total += moveUndone(m.date, tg); });
        after(); toast(total ? 'Moved ' + total + ' items to ' + (tg === S.today ? 'today' : fmt(tg, SHORT)) + '.' : 'Nothing to move.');
        break;
      }
      case 'export-json': exportBackup(); break;
      case 'import-json': $('#file-input').click(); break;
      case 'import-paste': importText(($('#paste-old') || {}).value || '', true); break;
      case 'export-ics': exportICS(); break;
      case 'print': buildPrint(); window.print(); break;
      case 'install':
        if (S.installEvent) { S.installEvent.prompt(); S.installEvent = null; renderSide(); }
        break;
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var input = form.elements.text, text = input.value.trim();
    if (!text) return;
    var date = form.dataset.date;
    if (form.dataset.form === 'add-topic') addTopic(date, text); else addTask(date, text);
    after();
    var again = $('#editor form[data-form="' + form.dataset.form + '"] input');
    if (again) again.focus();
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    var f = el.dataset && el.dataset.field;
    if (f === 'topic') { editTopic(el.dataset.date, parseInt(el.dataset.i, 10), el.value); renderLight(); }
    else if (f === 'task') { mapTask(el.dataset.date, el.dataset.id, function (t) { return Object.assign({}, t, { text: el.value }); }); }
    else if (f === 'reminder-time') { S.meta.reminderTime = el.value || '08:00'; saveMeta(); }
    else if (el.dataset && el.dataset.gt) {
      var n = parseInt(el.dataset.n, 10), key = el.dataset.gt;
      var g = S.gt[n] || (S.gt[n] = {});
      g[key] = el.value;
      if (key === 'outOf' && el.value.trim()) S.meta.outOf = el.value.trim();
      if (key === 'outOf') saveMeta();
      saveGT();
      updateGTChip(n);
      renderGTSide();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'file-input') {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { importText(String(reader.result), false); e.target.value = ''; };
      reader.readAsText(file);
    }
  });

  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.classList && d.classList.contains('gt-item')) gtOpen[d.dataset.n] = d.open;
  }, true);

  // keyboard: arrow keys move between tabs
  $('.tabs').addEventListener('keydown', function (e) {
    var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!k) return;
    var next = TABS[(TABS.indexOf(S.tab) + k + TABS.length) % TABS.length];
    showTab(next);
    $('#tab-' + next).focus();
  });

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvent = e; renderSide(); });
  window.addEventListener('appinstalled', function () { S.installEvent = null; renderSide(); toast('Installed. Open EXAM Planner from your home screen.'); });
  window.addEventListener('hashchange', function () { showTab(location.hash.slice(1), true); });

  // keep "today" fresh when the page stays open overnight
  function checkToday() {
    var t = ds(new Date());
    if (t !== S.today) {
      var followed = S.selected === S.today;
      S.today = t;
      if (followed) S.selected = clampToPlan(t);
      renderAll();
    }
  }
  setInterval(checkToday, 30000);
  window.addEventListener('focus', checkToday);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkToday(); });

  /* ---------- start ---------- */
  renderAll();
  showTab(location.hash.slice(1) || 'plan', true);

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
