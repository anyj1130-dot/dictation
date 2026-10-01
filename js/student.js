/* 학생 화면 */
(function () {
  'use strict';
  const D = window.DICT;
  const { esc, grade, gridHTML, nospace, clean, shuffle, layout, variants, josa } = window.H;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const main = () => $('#main');

  const ACTS = [
    { key: 'study', n: 1, name: '유의점 보고 받아쓰기', desc: '헷갈리는 곳을 살펴보고 직접 써 봐요' },
    { key: 'choice', n: 2, name: '빈칸에 알맞은 낱말 고르기', desc: '바른 낱말을 골라요' },
    { key: 'spacing', n: 3, name: '띄어 쓰기', desc: '붙어 있는 문장에 ∨ 표시를 해요' },
    { key: 'find', n: 4, name: '틀린 곳 찾기', desc: '문장 속 틀린 낱말을 찾아요' },
    { key: 'sound', n: 5, name: '소리를 바른 글자로', desc: '[소리]를 바른 글자로 바꿔 써요' },
    { key: 'test', n: 6, name: '듣고 받아쓰기 시험', desc: '10문장을 듣고 써요 · 100점 도전' }
  ];
  const ACT_NAME = Object.fromEntries(ACTS.map(a => [a.key, a.name]).concat([['review', '오답 노트 복습']]));
  const RANK_SHORT = { '백성': '백성', '선비': '선비', '정승': '정승', '영의정': '영의정', '세종대왕': '세종\n대왕' };

  const ALL = D.levels.flatMap(L => L.sentences.map(s => Object.assign(s, { level: L.key })));
  const BY_ID = Object.fromEntries(ALL.map(s => [s.id, s]));
  const LEVEL = Object.fromEntries(D.levels.map(L => [L.key, L]));
  const pointOf = (sid, t) => { const s = BY_ID[sid]; return s && s.p.find(p => p.t === t); };

  const state = { student: null, config: null, hist: { items: [], rounds: [] }, sem: '4-1', creds: null };

  /* ───────── 도움 함수 ───────── */
  function typeClass(ty) {
    if (ty === '소리 나는 대로') return 'ty-sound';
    if (ty === '받침' || ty === '겹받침') return 'ty-batchim';
    if (ty === '모음') return 'ty-vowel';
    if (ty === '띄어쓰기') return 'ty-space';
    if (ty === '문장부호') return 'ty-punct';
    if (ty === '헷갈리는 말' || ty === '준말') return 'ty-word';
    return 'ty-change';
  }
  function toast(msg, ms) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200);
  }
  function show(html) { Sound.stop(); main().innerHTML = html; window.scrollTo(0, 0); }
  function title(t, backFn, sub) {
    return `<div class="screen-title">${backFn ? '<button class="back" data-back aria-label="뒤로">←</button>' : ''}<h1>${t}</h1></div>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  }
  function bindBack(fn) { const b = $('[data-back]'); if (b) b.onclick = fn; }
  function spaceMark(s) { return esc(s).replace(/ /g, '<span class="spc">∨</span>'); }
  function enterKey(input, fn) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); fn(); } });
  }
  function levelInfo(points) {
    const L = (state.config.levels || []).slice().sort((a, b) => a.min - b.min);
    let i = 0; L.forEach((l, k) => { if (points >= l.min) i = k; });
    const cur = L[i], next = L[i + 1];
    const pct = next ? Math.round((points - cur.min) / (next.min - cur.min) * 100) : 100;
    return { cur, next, pct };
  }
  function rankBadge(name, cls) { return `<div class="${cls || 'rankbig'}">${esc(RANK_SHORT[name] || name).replace('\n', '<br>')}</div>`; }

  /* ───────── 저장 (실패 시 대기열) ───────── */
  const PKEY = 'dict_pending';
  function pending() { try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch (_) { return []; } }
  function setPending(a) { try { localStorage.setItem(PKEY, JSON.stringify(a)); } catch (_) {} renderTop(); }
  async function flushPending() {
    const q = pending(); if (!q.length || !state.creds) return;
    const rest = [];
    for (const r of q) {
      if (r.nick !== state.creds.nick || (r.cls || '') !== (state.creds.cls || '') || (r.server || '') !== API.serverUrl()) { rest.push(r); continue; }
      try { const res = await API.call('submit', Object.assign({}, state.creds, r.body)); state.student.points = res.points; state.student.level = res.level; }
      catch (e) { rest.push(r); if (e.network) break; }
    }
    setPending(rest);
  }
  async function submit(act, level, items, extra) {
    const now = Date.now();
    items.forEach(i => state.hist.items.push([now, act, i.sid, i.t, i.ty, i.ok ? 1 : 0]));
    const counted = items.filter(i => i.c !== false);
    const body = Object.assign({ act, level, items, finished: true }, extra || {});
    try {
      const res = await API.call('submit', Object.assign({}, state.creds, body));
      state.hist.rounds.push([now, level, act, counted.filter(i => i.ok).length, counted.length, res.gained]);
      const before = state.student.level;
      state.student.points = res.points; state.student.level = res.level;
      renderTop();
      flushPending();
      return Object.assign(res, { levelBefore: before });
    } catch (e) {
      if (e.network) {
        state.hist.rounds.push([now, level, act, counted.filter(i => i.ok).length, counted.length, 0]);
        const q = pending(); q.push({ server: API.serverUrl(), cls: state.creds.cls, nick: state.creds.nick, body }); setPending(q);
        return { pending: true, gained: 0 };
      }
      toast(e.message, 3500);
      return { error: e.message, gained: 0 };
    }
  }

  /* ───────── 상단 막대 ───────── */
  function renderTop() {
    const box = $('#me');
    if (!state.student) { box.innerHTML = ''; return; }
    const p = pending().length;
    box.innerHTML = `${p ? `<span class="pending" title="인터넷이 연결되면 저장돼요">저장 대기 ${p}</span>` : ''}
      <span class="rank"><span class="dot">${esc(state.student.level[0])}</span>${esc(state.student.nick)} · ${esc(state.student.level)}</span>
      <span class="pts">${state.student.points}점</span>
      <button class="linkbtn" id="logout">나가기</button>`;
    $('#logout').onclick = logout;
  }
  function logout() {
    if (!confirm('나갈까요? 다음에 닉네임과 비밀번호로 다시 들어와요.')) return;
    try { localStorage.removeItem('dict_login'); } catch (_) {}
    API.setDemo(false);
    state.student = null; state.creds = null; renderTop(); showLogin();
  }

  /* ───────── 로그인 ───────── */
  let lastCls = '';
  try { lastCls = localStorage.getItem('dict_cls') || ''; } catch (_) {}
  function showLogin(msg) {
    const noServer = !API.serverUrl();
    show(`<div class="login card">
      <div class="logo-tiles" style="grid-template-columns:repeat(4,40px)"><i style="background:var(--blue)">받</i><i style="background:var(--green)">아</i><i style="background:var(--red)">쓰</i><i style="background:var(--blue)">기</i></div>
      <h1>차근차근 받아쓰기</h1>
      <p class="muted" style="margin:0">4학년 · 한 급씩 차근차근</p>
      <label class="field"><span>학급</span><select id="cls" class="textin"><option value="">불러오는 중…</option></select></label>
      <label class="field"><span>닉네임</span><input id="nick" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>비밀번호</span><input id="pw" type="password" autocomplete="off"></label>
      <button class="btn" id="go" style="width:100%">들어가기</button>
      ${noServer && !API.isDemo() ? `<div class="msg warn">선생님께 받은 <b>링크나 QR 코드</b>로 들어와 주세요. 그냥 둘러보려면 체험 모드를 눌러요.</div>
        <button class="btn ghost" id="demo" style="width:100%;margin-top:10px">체험 모드로 둘러보기</button>` : ''}
      <div id="lmsg">${msg ? `<div class="msg bad">${esc(msg)}</div>` : ''}</div>
      <a class="teacherlink" href="${API.isDemo() ? 'teacher.html?demo' : API.linkFor('teacher.html')}">선생님이신가요? <b>교사 화면으로 →</b></a>
    </div><div class="credit">문장 출처: 참쌤스쿨 × 모여봐욕 「22개정 차근차근 받아쓰기」 · <a href="https://chamssaem.com/516657" target="_blank" rel="noopener">원본 자료 보기 ↗</a></div>`);
    const fill = (list) => {
      $('#cls').innerHTML = list.length
        ? `<option value="">학급을 골라요</option>` + list.map(c => `<option ${c === lastCls ? 'selected' : ''}>${esc(c)}</option>`).join('')
        : '<option value="">아직 학급이 없어요</option>';
    };
    if (noServer && !API.isDemo()) fill([]);
    else API.call('classes').then(r => fill(r.classes || [])).catch(e => { fill([]); $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; });
    const go = async () => {
      const cls = $('#cls').value, nick = $('#nick').value.trim(), pw = $('#pw').value.trim();
      if (!cls) { $('#lmsg').innerHTML = '<div class="msg bad">학급을 먼저 골라 주세요.</div>'; return; }
      if (!nick || !pw) { $('#lmsg').innerHTML = '<div class="msg bad">닉네임과 비밀번호를 모두 써 주세요.</div>'; return; }
      $('#go').disabled = true; $('#lmsg').innerHTML = '<div class="spinner"></div>';
      try { await doLogin(cls, nick, pw); }
      catch (e) { $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; $('#go').disabled = false; }
    };
    $('#go').onclick = go;
    enterKey($('#pw'), go);
    if ($('#demo')) $('#demo').onclick = async () => { API.setDemo(true); await doLogin('체험반', '체험', '1234'); toast('체험 모드예요. 기록은 이 기기에만 남아요.', 3000); };
  }
  async function doLogin(cls, nick, pw) {
    const r = await API.call('login', { cls, nick, pw });
    state.student = r.student; state.config = r.config; state.creds = { cls, nick, pw };
    try { localStorage.setItem('dict_login', JSON.stringify({ cls, nick, pw, demo: API.isDemo(), server: API.isDemo() ? '' : API.serverUrl() })); localStorage.setItem('dict_cls', cls); lastCls = cls; } catch (_) {}
    try { const h = await API.call('history', { cls, nick, pw }); state.hist = { items: h.items || [], rounds: h.rounds || [] }; } catch (_) {}
    const lastSem = (state.hist.rounds.slice(-1)[0] || [])[1];
    if (lastSem && LEVEL[lastSem]) state.sem = LEVEL[lastSem].sem;
    renderTop(); flushPending(); showHome();
  }

  /* ───────── 기록 계산 ───────── */
  function doneActs(levelKey) {
    const set = new Set();
    state.hist.rounds.forEach(r => { if (r[1] === levelKey) set.add(r[2]); });
    return set;
  }
  function bestTest(levelKey) {
    let b = null;
    state.hist.rounds.forEach(r => { if (r[1] === levelKey && r[2] === 'test' && r[4]) b = Math.max(b || 0, Math.round(r[3] / r[4] * 100)); });
    return b;
  }
  // 오답 노트: 틀린 항목은 들어가고, 그 뒤 두 번 연속 맞히면 빠져요
  function wrongNote(extraItems) {
    const map = new Map();
    const rows = state.hist.items.concat(extraItems || []).slice().sort((a, b) => a[0] - b[0]);
    rows.forEach(([ts, act, sid, t, ty, ok]) => {
      if (!sid || !t || ty === '문장' || ty === '잘못 고름') return;
      if (!pointOf(sid, t)) return;
      const k = sid + '|' + t;
      let e = map.get(k);
      if (!e) { e = { sid, t, ty, inNote: false, streak: 0, wrongs: 0, last: 0 }; map.set(k, e); }
      e.last = ts;
      if (!ok) { e.inNote = true; e.streak = 0; e.wrongs++; }
      else if (e.inNote) { e.streak++; if (e.streak >= 2) { e.inNote = false; e.streak = 0; } }
    });
    return [...map.values()].filter(e => e.inNote).sort((a, b) => b.wrongs - a.wrongs || b.last - a.last);
  }
  function typeStats() {
    const m = {};
    state.hist.items.forEach(([, , sid, t, ty, ok]) => {
      if (!ty || ty === '문장' || ty === '잘못 고름') return;
      m[ty] = m[ty] || { right: 0, wrong: 0 };
      ok ? m[ty].right++ : m[ty].wrong++;
    });
    return m;
  }

  /* ───────── 홈 ───────── */
  function showHome() {
    const s = state.student, li = levelInfo(s.points);
    const note = wrongNote();
    const levels = D.levels.filter(L => L.sem === state.sem);
    show(`
      <div class="card hello">
        ${rankBadge(li.cur.name)}
        <div style="flex:1;min-width:220px">
          <div class="big" style="font-size:1.25rem;font-weight:800">${esc(s.nick)}, 반가워요!</div>
          <div style="color:var(--muted)">지금 <b style="color:var(--ink)">${esc(li.cur.name)}</b> · ${s.points}점
            ${li.next ? ` · <b>${esc(li.next.name)}</b>까지 ${li.next.min - s.points}점` : ' · 최고 등급이에요!'}</div>
          <div class="progress"><i style="width:${li.pct}%"></i></div>
        </div>
      </div>
      <div class="grid g3" style="margin-top:14px">
        <button class="side" id="goNote"><span class="ic">📒</span><b>오답 노트</b><small>${note.length ? `다시 볼 낱말 ${note.length}개` : '아직 비어 있어요'}</small></button>
        <button class="side" id="goWeak"><span class="ic">🎯</span><b>약점 연습</b><small>자주 틀리는 유형을 연습해요</small></button>
        <button class="side" id="goStats"><span class="ic">📊</span><b>내 기록</b><small>유형별 정답률 · 시험 점수</small></button>
      </div>
      <div class="tabs" role="tablist">
        <button data-sem="4-1" class="${state.sem === '4-1' ? 'on' : ''}">4학년 1학기</button>
        <button data-sem="4-2" class="${state.sem === '4-2' ? 'on' : ''}">4학년 2학기</button>
      </div>
      <p class="sub" style="margin:0 0 12px">선생님이 알려 준 이번 주 급수를 골라요.</p>
      <div class="grid g4">
        ${levels.map(L => {
          const d = doneActs(L.key), b = bestTest(L.key);
          return `<button class="lvcard" data-lv="${L.key}">
            ${b !== null ? `<span class="best">시험 <b>${b}</b>점</span>` : ''}
            <span class="nm">${esc(L.name)}</span>
            <span class="pv" style="color:var(--muted);font-size:.85rem">${esc(L.sentences[0].text)} …</span>
            <span class="stamps">${ACTS.map(a => `<i class="stamp ${d.has(a.key) ? 'on' : ''}" title="${esc(a.name)}"></i>`).join('')}</span>
          </button>`;
        }).join('')}
      </div><div class="credit">문장 출처: 참쌤스쿨 × 모여봐욕 「22개정 차근차근 받아쓰기」 · <a href="https://chamssaem.com/516657" target="_blank" rel="noopener">원본 자료 보기 ↗</a> · <a href="${API.isDemo() ? 'teacher.html?demo' : API.linkFor('teacher.html')}">교사 화면</a></div>`);
    $$('[data-sem]').forEach(b => b.onclick = () => { state.sem = b.dataset.sem; showHome(); });
    $$('[data-lv]').forEach(b => b.onclick = () => showLevel(b.dataset.lv));
    $('#goNote').onclick = showNote;
    $('#goWeak').onclick = showWeak;
    $('#goStats').onclick = showStats;
  }

  /* ───────── 급수 화면 ───────── */
  function showLevel(key) {
    Sound.preload(key);
    const L = LEVEL[key], d = doneActs(key);
    show(`${title(`${L.sem.replace('-', '학년 ')}학기 · ${esc(L.name)}`, true)}
      <div class="grid g2">
        <div class="grid acts" style="gap:10px">
          ${ACTS.map(a => `<button class="act ${d.has(a.key) ? 'done' : ''} ${a.key === 'test' ? 'test' : ''}" data-act="${a.key}">
            <span class="n">${d.has(a.key) ? '✓' : a.n}</span>
            <span><span class="t">${a.name}</span><br><span class="d">${a.desc}</span></span></button>`).join('')}
        </div>
        <div class="card">
          <h3 style="margin:0 0 6px">이번 급수 문장</h3>
          <ul class="slist">${L.sentences.map(s => `<li><span class="no">${s.no}</span><span class="tx">${esc(s.text)}</span><button class="play" data-play="${s.id}" aria-label="듣기">🔊</button></li>`).join('')}</ul>
        </div>
      </div>`);
    bindBack(showHome);
    $$('[data-play]').forEach(b => b.onclick = () => Sound.play(BY_ID[b.dataset.play]).catch(e => toast(e.message)));
    $$('[data-act]').forEach(b => b.onclick = () => RUN[b.dataset.act](key));
  }

  function stepbar(i, n) {
    return `<div class="stepbar"><button class="back" data-back aria-label="그만하기">✕</button><div class="bar"><i style="width:${Math.round(i / n * 100)}%"></i></div><span class="cnt">${Math.min(i + 1, n)} / ${n}</span></div>`;
  }
  function quitTo(levelKey) {
    return () => { if (confirm('그만할까요? 지금까지 한 것은 점수에 들어가지 않아요.')) levelKey ? showLevel(levelKey) : showHome(); };
  }

  /* ───────── 결과 화면 + 등급 변화 ───────── */
  function showResult(o) {
    const r = o.res || {};
    let gainTxt = '';
    if (r.pending) gainTxt = '인터넷이 연결되면 점수가 저장돼요.';
    else if (r.error) gainTxt = '저장하지 못했어요: ' + r.error;
    else if (r.capped) gainTxt = `오늘 이 활동 점수는 ${r.cap}번까지예요. 연습은 계속할 수 있어요!`;
    else gainTxt = (r.gained >= 0 ? '+' : '') + r.gained + '점';
    show(`<div class="stage">
      <div class="card result">
        ${o.big || ''}
        <h1 style="margin:6px 0">${o.title}</h1>
        <p style="font-size:1.2rem;margin:4px 0">${o.line || ''}</p>
        <p class="gain">${esc(gainTxt)}</p>
        <div class="row center" style="margin-top:12px">
          <button class="btn ghost" id="again">한 번 더</button>
          <button class="btn" id="toLevel">${o.levelKey ? '급수로 돌아가기' : '처음으로'}</button>
        </div>
      </div>
      ${o.details ? `<div class="card" style="margin-top:14px">${o.details}</div>` : ''}
    </div>`);
    $('#again').onclick = o.again;
    $('#toLevel').onclick = () => o.levelKey ? showLevel(o.levelKey) : showHome();
    if (r.level && r.levelBefore && r.level !== r.levelBefore) rankModal(r.levelBefore, r.level);
  }
  function rankModal(before, after) {
    const order = (state.config.levels || []).map(l => l.name);
    const up = order.indexOf(after) > order.indexOf(before);
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box">${rankBadge(after, 'rankbig' + (up ? '' : ' down'))}
      <h2 style="margin:4px 0">${up ? `${esc(josa(after, '이/가'))} 되었어요!` : `${esc(josa(after, '으로/로'))} 내려왔어요`}</h2>
      <p style="color:var(--muted)">${up ? '차근차근 연습한 덕분이에요. 다음 등급에도 도전해요!' : '틀린 낱말을 오답 노트에서 다시 연습하면 금방 올라갈 수 있어요.'}</p>
      <button class="btn" style="width:100%">좋아요</button></div>`;
    document.body.appendChild(m);
    m.querySelector('button').onclick = () => m.remove();
  }

  /* ───────── 문장 강조 표시 (유의점) ───────── */
  function spansOf(s) {
    const out = [];
    s.p.forEach((p, idx) => {
      if (p.ty === '문장부호') return;
      const i = s.text.indexOf(p.t);
      if (i >= 0) out.push({ idx, start: i, end: i + p.t.length, p });
    });
    return out;
  }
  function highlighted(s) {
    const spans = spansOf(s);
    const cover = [...s.text].map((_, i) => spans.filter(x => i >= x.start && i < x.end));
    let h = '', i = 0;
    while (i < s.text.length) {
      const cv = cover[i]; const key = cv.map(x => x.idx).join(',');
      let j = i + 1;
      while (j < s.text.length && cover[j].map(x => x.idx).join(',') === key) j++;
      const seg = s.text.slice(i, j);
      if (cv.length && seg.trim()) {
        const main = cv.slice().sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        h += `<span class="hl ${typeClass(main.p.ty)}" data-pts="${key}">${esc(seg)}</span>`;
      } else h += esc(seg);
      i = j;
    }
    return h;
  }
  function tipHTML(s, idxs) {
    return idxs.map(k => {
      const p = s.p[k];
      const wr = (p.w || []).filter(w => w !== p.s).slice(0, 3);
      return `<div class="tip">
        <span class="chip ${typeClass(p.ty)}">${esc(p.ty)}</span>
        <div class="tg" style="margin-top:6px">${spaceMark(p.t)}</div>
        ${p.s && p.ty !== '띄어쓰기' && p.ty !== '문장부호' ? `<div>소리: <span class="snd">[${esc(p.s)}]</span></div>` : ''}
        <div style="margin-top:4px">${esc(p.r)}</div>
        ${wr.length ? `<div style="margin-top:6px;font-size:.95rem">이렇게 쓰지 않아요: ${wr.map(w => `<span class="wr">${spaceMark(w)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ───────── 채점 결과 표시 ───────── */
  function feedbackHTML(s, g, opts) {
    opts = opts || {};
    if (g.ok) {
      const extra = g.optNotes.length ? `<p style="margin:6px 0 0">붙여 쓴 곳도 맞아요. 다만 띄어 쓰는 것이 원칙이에요.</p>` : '';
      return `<div class="fb ok"><h3>${opts.okTitle || '정답이에요! 👏'}</h3>${extra}</div>`;
    }
    const line = g.marks.map(m => {
      const cls = [m.bad ? 'bad' : '', m.needSpace ? 'need' : '', m.extraSpace ? 'extra' : ''].join(' ').trim();
      return (m.spaceBefore ? ' ' : '') + (cls ? `<span class="${cls}">${esc(m.ch)}</span>` : esc(m.ch));
    }).join('');
    const failed = g.points.filter(x => !x.ok);
    const reasons = failed.map(x => `<li><b>${spaceMark(x.p.t)}</b> — ${x.note ? esc(x.note) + ' ' : ''}${esc(x.p.r)}</li>`)
      .concat(g.notes.map(n => `<li>${esc(n)}</li>`));
    return `<div class="fb bad">${opts.badTitle === '' ? '' : `<h3>${opts.badTitle || '아쉬워요, 다시 살펴봐요'}</h3>`}
      <div style="font-size:.9rem;color:var(--muted)">내가 쓴 문장</div>
      <div class="answerline">${line || '(빈칸)'}</div>
      <div style="font-size:.9rem;color:var(--muted)">바른 문장</div>
      <div class="correctline">${esc(s.text)}</div>
      ${reasons.length ? `<ul>${reasons.join('')}</ul>` : ''}</div>`;
  }
  function itemsFromGrade(s, g) {
    return [{ sid: s.id, t: s.text, ty: '문장', ok: g.ok }]
      .concat(g.points.map(x => ({ sid: s.id, t: x.p.t, ty: x.p.ty, ok: x.ok, c: false })));
  }
  function writeBox(id, placeholder) {
    return `<div class="write">
      <input class="textin" id="${id}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" lang="ko" placeholder="${placeholder || '여기에 써요'}">
      <div class="grid10" id="${id}Grid"></div></div>`;
  }
  function bindGrid(id, cols) {
    const inp = $('#' + id), g = $('#' + id + 'Grid');
    const upd = () => { g.innerHTML = gridHTML(inp.value, cols); };
    inp.addEventListener('input', upd); upd();
    setTimeout(() => { inp.focus(); }, 60);
    return inp;
  }
  const colsFor = (s) => Math.min(Math.max(s.text.length + 1, 10), 18);

  /* ───────── 1. 유의점 보고 받아쓰기 ───────── */
  function runStudy(levelKey) {
    const L = LEVEL[levelKey], list = L.sentences, items = [];
    let i = 0, right = 0;
    const step = () => { if (i >= list.length) return finish(); view(false); };
    const view = (soundOn) => {
      const s = list[i];
      const types = [...new Set(s.p.filter(p => p.ty !== '문장부호').map(p => p.ty))];
      show(`<div class="stage">${stepbar(i, list.length)}
        <div class="card">
          <p class="q">밑줄 친 곳을 눌러 왜 틀리기 쉬운지 살펴봐요.</p>
          <div class="sentence" id="sent">${highlighted(s)}</div>
          <div class="soundline ${soundOn ? '' : 'hidden'}" id="sline">${esc(s.sound)}</div>
          <div class="row" style="margin-top:10px">
            <button class="play" id="p1">🔊 듣기</button><button class="play" id="p2">🐢 천천히</button>
            <label class="toggle"><input type="checkbox" id="sndTog" ${soundOn ? 'checked' : ''}> 소리 나는 대로 보기</label>
          </div>
          <div class="row" style="margin-top:10px;gap:6px">${types.map(t => `<span class="chip ${typeClass(t)}">${esc(t)}</span>`).join('')}</div>
          <div id="tips"><div class="tip" style="color:var(--muted)">👆 문장에서 색깔 밑줄을 눌러 보세요.</div></div>
          <div class="row end" style="margin-top:14px"><button class="btn indigo" id="toWrite">다 봤어요, 써 볼게요 ✍️</button></div>
        </div></div>`);
      bindBack(quitTo(levelKey));
      $('#p1').onclick = () => Sound.play(s).catch(e => toast(e.message));
      $('#p2').onclick = () => Sound.play(s, true).catch(e => toast(e.message));
      $('#sndTog').onchange = e => $('#sline').classList.toggle('hidden', !e.target.checked);
      $$('.hl').forEach(h => h.onclick = () => {
        $$('.hl').forEach(x => x.classList.remove('on')); h.classList.add('on');
        $('#tips').innerHTML = tipHTML(s, h.dataset.pts.split(',').map(Number));
      });
      $('#toWrite').onclick = () => write(false);
    };
    const write = (retry) => {
      const s = list[i];
      show(`<div class="stage">${stepbar(i, list.length)}
        <div class="card">
          <p class="q">${retry ? '다시 한 번 써 봐요.' : '문장을 가렸어요. 기억해서 써 봐요!'}</p>
          <div class="sentence hidden-sentence">${esc(s.text)}</div>
          ${writeBox('ans')}
          <div class="row" style="justify-content:space-between;margin-top:10px">
            <div class="row"><button class="play" id="p1">🔊 듣기</button>${retry ? '' : '<button class="btn ghost small" id="peek">다시 보기</button>'}</div>
            <button class="btn" id="check">확인</button>
          </div>
          <div id="fb"></div>
        </div></div>`);
      bindBack(quitTo(levelKey));
      const inp = bindGrid('ans', colsFor(s));
      $('#p1').onclick = () => Sound.play(s).catch(e => toast(e.message));
      if ($('#peek')) $('#peek').onclick = () => view(false);
      const check = () => {
        if (!inp.value.trim()) { toast('먼저 써 보세요.'); return; }
        const g = grade(s, inp.value);
        if (!retry) { items.push(...itemsFromGrade(s, g)); if (g.ok) right++; }
        inp.disabled = true; $('#check').remove();
        $('#fb').innerHTML = feedbackHTML(s, g) + `<div class="row end" style="margin-top:12px">
          ${g.ok ? '' : '<button class="btn ghost" id="retry">다시 써 보기</button>'}
          <button class="btn" id="next">${i + 1 < list.length ? '다음 문장 →' : '결과 보기'}</button></div>`;
        if ($('#retry')) $('#retry').onclick = () => write(true);
        $('#next').onclick = () => { i++; step(); };
        $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      $('#check').onclick = check;
      enterKey(inp, () => $('#check') && check());
    };
    const finish = async () => {
      show('<div class="spinner"></div>');
      const res = await submit('study', levelKey, items);
      showResult({ title: '유의점 보고 받아쓰기 끝!', line: `10문장 중 <b>${right}</b>문장을 한 번에 맞혔어요.`, res, levelKey, again: () => runStudy(levelKey) });
    };
    step();
  }

  /* ───────── 2. 빈칸 고르기 ───────── */
  function choicePool(s, allowSpacing) {
    return s.p.filter(p => {
      if (!allowSpacing && (p.ty === '띄어쓰기' || p.ty === '문장부호')) return false;
      if (s.text.indexOf(p.t) < 0) return false;
      return choicesFor(p, allowSpacing).length >= 2;
    });
  }
  function choicesFor(p, allowSpacing) {
    const tNo = nospace(p.t);
    const opts = [p.t];
    (p.w || []).forEach(w => {
      if (opts.includes(w)) return;
      if (!allowSpacing && (nospace(w) === tNo || nospace(w).replace(/[.,?!]/g, '') === tNo.replace(/[.,?!]/g, ''))) return;
      opts.push(w);
    });
    return opts.slice(0, 4);
  }
  function blankSentence(s, p) {
    const i = s.text.indexOf(p.t);
    return esc(s.text.slice(0, i)) + `<span class="blank" id="blank">?</span>` + esc(s.text.slice(i + p.t.length));
  }
  function mcQuiz(o) {
    // o: {questions:[{s,p}], act, levelKey, title, again, allowSpacing, onDone}
    const qs = o.questions, items = [];
    let i = 0, right = 0;
    const step = () => {
      if (i >= qs.length) return o.onDone(items, right);
      const { s, p } = qs[i];
      const opts = shuffle(choicesFor(p, o.allowSpacing));
      show(`<div class="stage">${stepbar(i, qs.length)}
        <div class="card">
          <p class="q">${o.prompt || '빈칸에 알맞은 낱말을 골라요.'}</p>
          <div class="sentence mid">${blankSentence(s, p)}</div>
          <div class="opts">${opts.map((w, k) => `<button class="opt" data-k="${k}">${spaceMark(w)}</button>`).join('')}</div>
          <div id="fb"></div>
        </div></div>`);
      bindBack(quitTo(o.levelKey));
      $$('.opt').forEach(b => b.onclick = () => {
        const pick = opts[Number(b.dataset.k)], ok = pick === p.t;
        $$('.opt').forEach(x => { x.disabled = true; if (opts[Number(x.dataset.k)] === p.t) x.classList.add('ok'); });
        if (!ok) b.classList.add('bad'); else right++;
        items.push({ sid: s.id, t: p.t, ty: p.ty, ok });
        $('#blank').innerHTML = spaceMark(p.t);
        $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><h3>${ok ? '정답! 🎉' : '앗, 바른 답은 ‘' + esc(p.t) + '’예요'}</h3>
          <div>${p.s ? `소리는 <b>[${esc(p.s)}]</b>이지만 ` : ''}${esc(p.r)}</div></div>
          <div class="row end" style="margin-top:12px"><button class="btn" id="next">${i + 1 < qs.length ? '다음 →' : '결과 보기'}</button></div>`;
        $('#next').onclick = () => { i++; step(); };
        $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    };
    step();
  }
  function runChoice(levelKey) {
    const L = LEVEL[levelKey];
    const questions = [];
    L.sentences.forEach(s => { const pool = choicePool(s, false); if (pool.length) questions.push({ s, p: shuffle(pool)[0] }); });
    // 10문제가 안 되면 두 번째 항목으로 채움
    shuffle(L.sentences).forEach(s => {
      if (questions.length >= 10) return;
      const used = new Set(questions.filter(q => q.s === s).map(q => q.p.t));
      const more = choicePool(s, false).filter(p => !used.has(p.t));
      if (more.length) questions.push({ s, p: more[0] });
    });
    mcQuiz({
      questions, act: 'choice', levelKey,
      onDone: async (items, right) => {
        show('<div class="spinner"></div>');
        const res = await submit('choice', levelKey, items);
        showResult({ title: '빈칸 고르기 끝!', line: `${items.length}문제 중 <b>${right}</b>문제를 맞혔어요.`, res, levelKey, again: () => runChoice(levelKey) });
      }
    });
  }

  /* ───────── 3. 띄어 쓰기 ───────── */
  function runSpacing(levelKey) {
    const list = LEVEL[levelKey].sentences, items = [];
    let i = 0, right = 0;
    const step = () => {
      if (i >= list.length) return finish();
      const s = list[i], Lo = layout(s);
      const on = new Array(Lo.gaps.length).fill(0);
      const render = () => {
        let h = '';
        Lo.chars.forEach((c, k) => {
          h += `<span class="tile">${esc(c)}</span>`;
          if (k < Lo.gaps.length && !/[.,?!]/.test(Lo.chars[k + 1])) h += `<button class="gap ${on[k] ? 'on' : ''}" data-g="${k}" aria-label="띄우기"></button>`;
        });
        return h;
      };
      show(`<div class="stage">${stepbar(i, list.length)}
        <div class="card">
          <p class="q">띄어 써야 할 곳을 눌러 ∨ 표시를 해요. 다시 누르면 지워져요.</p>
          <div class="tiles" id="tiles">${render()}</div>
          <div class="row" style="justify-content:space-between;margin-top:12px">
            <button class="play" id="p1">🔊 듣기</button>
            <button class="btn" id="check">확인</button>
          </div>
          <div id="fb"></div>
        </div></div>`);
      bindBack(quitTo(levelKey));
      $('#p1').onclick = () => Sound.play(s).catch(e => toast(e.message));
      const bindGaps = () => $$('.gap').forEach(b => b.onclick = () => { const k = Number(b.dataset.g); on[k] = on[k] ? 0 : 1; b.classList.toggle('on', !!on[k]); });
      bindGaps();
      $('#check').onclick = () => {
        const errs = [], optDiff = [];
        Lo.gaps.forEach((g, k) => {
          if (g === 2) { if (!on[k]) optDiff.push(k); return; }
          if (g !== on[k]) errs.push(k);
        });
        const ok = errs.length === 0;
        if (ok) right++;
        // 표시
        $$('.gap').forEach(b => {
          const k = Number(b.dataset.g); b.disabled = true;
          if (errs.includes(k)) b.className = 'gap ' + (Lo.gaps[k] === 1 ? 'miss' : 'on wrong');
          else if (Lo.gaps[k] === 2 && !on[k]) b.className = 'gap optok';
        });
        // 띄어쓰기 항목별 판정
        const flat = Lo.chars.join('');
        const spPts = s.p.filter(p => p.ty === '띄어쓰기');
        const failed = [];
        spPts.forEach(p => {
          const st = flat.indexOf(nospace(p.t));
          if (st < 0) return;
          const bad = errs.some(k => k >= st - 1 && k < st + nospace(p.t).length);
          items.push({ sid: s.id, t: p.t, ty: p.ty, ok: !bad, c: false });
          if (bad) failed.push(p);
        });
        items.push({ sid: s.id, t: s.text, ty: '문장', ok });
        const optMsg = optDiff.length ? `<p style="margin:6px 0 0">연한 ∨ 자리는 붙여 써도 맞아요. 하지만 띄어 쓰는 것이 원칙이에요.</p>` : '';
        const reasons = failed.map(p => `<li><b>${spaceMark(p.t)}</b> — ${esc(p.r)}</li>`);
        $('#fb').innerHTML = (ok
          ? `<div class="fb ok"><h3>정답이에요! 👏</h3>${optMsg}</div>`
          : `<div class="fb bad"><h3>아쉬워요</h3><div>빨간 ∨는 띄어야 하는 곳, ✕는 붙여야 하는 곳이에요.</div>
             <div class="correctline" style="margin-top:6px">${esc(s.text)}</div>${reasons.length ? `<ul>${reasons.join('')}</ul>` : ''}${optMsg}</div>`)
          + `<div class="row end" style="margin-top:12px"><button class="btn" id="next">${i + 1 < list.length ? '다음 문장 →' : '결과 보기'}</button></div>`;
        $('#check').remove();
        $('#next').onclick = () => { i++; step(); };
        $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    };
    const finish = async () => {
      show('<div class="spinner"></div>');
      const res = await submit('spacing', levelKey, items);
      showResult({ title: '띄어 쓰기 끝!', line: `10문장 중 <b>${right}</b>문장을 바르게 띄어 썼어요.`, res, levelKey, again: () => runSpacing(levelKey) });
    };
    step();
  }

  /* ───────── 4. 틀린 곳 찾기 ───────── */
  function makeWrongSentence(s) {
    const cands = shuffle(s.p.filter(p => p.ty !== '문장부호' && s.text.indexOf(p.t) >= 0 && (p.w || []).some(w => w !== p.t)));
    const picks = [];
    const want = cands.length >= 2 && Math.random() < 0.45 ? 2 : 1;
    for (const p of cands) {
      if (picks.length >= want) break;
      const st = s.text.indexOf(p.t), en = st + p.t.length;
      if (picks.some(x => !(en <= x.st || st >= x.en))) continue;
      const ws = shuffle(p.w.filter(w => w !== p.t));
      // 앞 글자와 섞였을 때 원래와 같아지는 경우 제외
      picks.push({ p, st, en, w: ws[0] });
    }
    picks.sort((a, b) => b.st - a.st);
    let text = s.text;
    picks.forEach(x => { text = text.slice(0, x.st) + x.w + text.slice(x.en); });
    // 새 문장에서의 위치
    picks.sort((a, b) => a.st - b.st);
    let shift = 0;
    picks.forEach(x => { x.nst = x.st + shift; x.nen = x.nst + x.w.length; shift += x.w.length - (x.en - x.st); });
    // 어절 조각
    const words = []; let pos = 0;
    text.split(' ').forEach(w => { words.push({ w, st: pos, en: pos + w.length }); pos += w.length + 1; });
    words.forEach(wd => { wd.errs = picks.filter(x => !(wd.en <= x.nst || wd.st >= x.nen)); });
    return { text, picks, words };
  }
  function runFind(levelKey) {
    const list = LEVEL[levelKey].sentences, items = [];
    let i = 0, found = 0, total = 0;
    const step = () => {
      if (i >= list.length) return finish();
      const s = list[i], W = makeWrongSentence(s);
      if (!W.picks.length) { i++; return step(); }
      const sel = new Set();
      show(`<div class="stage">${stepbar(i, list.length)}
        <div class="card">
          <p class="q">이 문장에는 틀린 곳이 <b style="color:var(--seal)">${W.picks.length}군데</b> 있어요. 틀린 낱말을 눌러요.</p>
          <div class="words">${W.words.map((wd, k) => `<button class="word" data-w="${k}">${esc(wd.w)}</button>`).join('')}</div>
          <div class="row end"><button class="btn" id="check">다 찾았어요</button></div>
          <div id="fb"></div>
        </div></div>`);
      bindBack(quitTo(levelKey));
      $$('.word').forEach(b => b.onclick = () => { const k = Number(b.dataset.w); sel.has(k) ? sel.delete(k) : sel.add(k); b.classList.toggle('sel', sel.has(k)); });
      $('#check').onclick = () => {
        const hit = new Set();
        let falseN = 0;
        W.words.forEach((wd, k) => {
          const b = $(`[data-w="${k}"]`); b.disabled = true; b.classList.remove('sel');
          if (sel.has(k) && wd.errs.length) { wd.errs.forEach(e => hit.add(e)); b.classList.add('hit'); }
          else if (sel.has(k)) { falseN++; b.classList.add('false'); items.push({ sid: s.id, t: wd.w, ty: '잘못 고름', ok: false }); }
          else if (wd.errs.length) b.classList.add('miss');
        });
        W.picks.forEach(x => { const ok = hit.has(x); total++; if (ok) found++; items.push({ sid: s.id, t: x.p.t, ty: x.p.ty, ok }); });
        const allOk = hit.size === W.picks.length && falseN === 0;
        $('#fb').innerHTML = `<div class="fb ${allOk ? 'ok' : 'bad'}"><h3>${allOk ? '모두 찾았어요! 🔍' : `${W.picks.length}군데 중 ${hit.size}군데를 찾았어요`}</h3>
          <ul>${W.picks.map(x => `<li>${hit.has(x) ? '✅' : '❌'} <span style="text-decoration:line-through">${spaceMark(x.w)}</span> → <b>${spaceMark(x.p.t)}</b> — ${esc(x.p.r)}</li>`).join('')}</ul>
          ${falseN ? `<div style="margin-top:6px">줄 그은 낱말은 맞게 쓴 낱말이었어요.</div>` : ''}
          <div class="correctline" style="margin-top:8px">${esc(s.text)}</div></div>
          <div class="row end" style="margin-top:12px"><button class="btn" id="next">${i + 1 < list.length ? '다음 문장 →' : '결과 보기'}</button></div>`;
        $('#check').remove();
        $('#next').onclick = () => { i++; step(); };
        $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    };
    const finish = async () => {
      show('<div class="spinner"></div>');
      const res = await submit('find', levelKey, items);
      showResult({ title: '틀린 곳 찾기 끝!', line: `틀린 곳 ${total}군데 중 <b>${found}</b>군데를 찾았어요.`, res, levelKey, again: () => runFind(levelKey) });
    };
    step();
  }

  /* ───────── 5. 소리 → 바른 글자 ───────── */
  function runSound(levelKey) {
    const list = LEVEL[levelKey].sentences, items = [];
    const qs = [];
    list.forEach(s => {
      const c = s.p.filter(p => p.s && p.s !== p.t && p.ty !== '띄어쓰기' && p.ty !== '문장부호' && s.text.indexOf(p.t) >= 0 && !p.t.includes(' '));
      if (c.length) qs.push({ s, p: shuffle(c)[0] });
    });
    let i = 0, right = 0;
    const step = () => {
      if (i >= qs.length) return finish();
      const { s, p } = qs[i];
      const at = s.text.indexOf(p.t);
      show(`<div class="stage">${stepbar(i, qs.length)}
        <div class="card">
          <p class="q">주황색 [소리]를 바른 글자로 바꿔 써요.</p>
          <div class="sentence mid">${esc(s.text.slice(0, at))}<span class="sndbox">[${esc(p.s)}]</span>${esc(s.text.slice(at + p.t.length))}</div>
          ${writeBox("ans", "바른 글자로 써요")}
          <div class="row end" style="margin-top:10px"><button class="btn" id="check">확인</button></div>
          <div id="fb"></div>
        </div></div>`);
      bindBack(quitTo(levelKey));
      const inp = bindGrid('ans', Math.max(p.t.length + 2, 8));
      const check = () => {
        const v = inp.value.trim();
        if (!v) { toast('먼저 써 보세요.'); return; }
        const ok = nospace(v).replace(/[.,?!]/g, '') === nospace(p.t).replace(/[.,?!]/g, '');
        if (ok) right++;
        items.push({ sid: s.id, t: p.t, ty: p.ty, ok });
        inp.disabled = true; $('#check').remove();
        $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><h3>${ok ? '정답이에요! 👏' : `바른 글자는 ‘${esc(p.t)}’예요`}</h3>
          <div>${esc(p.r)}</div></div>
          <div class="row end" style="margin-top:12px"><button class="btn" id="next">${i + 1 < qs.length ? '다음 →' : '결과 보기'}</button></div>`;
        $('#next').onclick = () => { i++; step(); };
        $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      $('#check').onclick = check;
      enterKey(inp, () => $('#check') && check());
    };
    const finish = async () => {
      show('<div class="spinner"></div>');
      const res = await submit('sound', levelKey, items);
      showResult({ title: '소리를 바른 글자로 끝!', line: `${qs.length}문제 중 <b>${right}</b>문제를 맞혔어요.`, res, levelKey, again: () => runSound(levelKey) });
    };
    step();
  }

  /* ───────── 6. 듣고 받아쓰기 시험 ───────── */
  const MAX_PLAYS = 3;
  function runTest(levelKey) {
    const L = LEVEL[levelKey], list = L.sentences;
    const answers = new Array(list.length).fill('');
    let i = 0;
    const step = () => {
      const s = list[i];
      let plays = 0;
      show(`<div class="stage">${stepbar(i, list.length)}
        <div class="card">
          <div class="row" style="justify-content:space-between"><span class="testnum">${i + 1}.</span><span class="plays" id="plays" aria-label="남은 듣기 횟수">${'<i class="heart"></i>'.repeat(MAX_PLAYS)}</span></div>
          <p class="q">잘 듣고 받아써요. 하트 하나에 한 번 들을 수 있어요. 다시 들을 땐 천천히 들어도 돼요.</p>
          <div class="listen"><button class="btn indigo" id="p1">🔊 듣기</button><button class="btn ghost" id="p2">🐢 천천히</button></div>
          ${writeBox('ans')}
          <div class="row end" style="margin-top:10px">
            <button class="btn" id="next">${i + 1 < list.length ? '다음 문장 →' : '다 썼어요, 채점하기'}</button></div>
        </div></div>`);
      bindBack(() => { if (confirm('시험을 그만할까요? 점수는 저장되지 않아요.')) showLevel(levelKey); });
      const inp = bindGrid('ans', colsFor(s));
      inp.value = answers[i]; inp.dispatchEvent(new Event('input'));
      const hearts = () => $$('#plays .heart').forEach((h, k) => h.classList.toggle('off', k >= MAX_PLAYS - plays));
      const doPlay = (slow) => {
        if (plays >= MAX_PLAYS) { toast('듣기를 다 썼어요.'); return; }
        plays++;
        hearts();
        if (plays >= MAX_PLAYS) { $('#p1').disabled = true; $('#p2').disabled = true; }
        Sound.play(s, slow).catch(e => { plays--; $('#p1').disabled = false; $('#p2').disabled = false; hearts(); toast(e.message, 3000); });
      };
      $('#p1').onclick = () => doPlay(false);
      $('#p2').onclick = () => doPlay(true);
      const next = () => {
        answers[i] = inp.value;
        if (!inp.value.trim() && !confirm('아직 안 썼어요. 그래도 넘어갈까요?')) return;
        i++;
        if (i < list.length) step(); else finish();
      };
      $('#next').onclick = next;
      enterKey(inp, next);
    };
    const finish = async () => {
      show('<div class="spinner"></div>');
      const items = [];
      const graded = list.map((s, k) => { const g = grade(s, answers[k]); items.push(...itemsFromGrade(s, g)); return g; });
      const n = graded.filter(g => g.ok).length;
      const res = await submit('test', levelKey, items);
      const details = `<h3 style="margin:0 0 6px">채점 결과</h3><ul class="reslist">${list.map((s, k) => {
        const g = graded[k];
        return `<li><span class="mark ${g.ok ? 'o' : 'x'}">${g.ok ? '○' : '✕'} ${k + 1}.</span>${g.ok ? esc(s.text) : feedbackHTML(s, g, { badTitle: '' })}</li>`;
      }).join('')}</ul>`;
      showResult({
        big: `<div class="scoreball">${n * 10}점</div>`,
        title: n === list.length ? '100점! 정말 대단해요 🎉' : '받아쓰기 시험 끝!',
        line: `10문장 중 <b>${n}</b>문장을 맞혔어요. 틀린 낱말은 오답 노트에 들어갔어요.`,
        res, levelKey, details, again: () => runTest(levelKey)
      });
    };
    step();
  }

  /* ───────── 오답 노트 · 복습 ───────── */
  function showNote() {
    const note = wrongNote();
    const byType = {};
    note.forEach(e => { (byType[e.ty] = byType[e.ty] || []).push(e); });
    show(`${title('📒 오답 노트', true, '틀린 낱말이 모여 있어요. 복습에서 두 번 연속 맞히면 노트에서 빠져요.')}
      ${note.length ? `<div class="row" style="margin-bottom:14px"><button class="btn" id="rv">복습 시작 (${Math.min(10, note.length)}문제)</button></div>
      <div class="grid g2">${Object.entries(byType).sort((a, b) => b[1].length - a[1].length).map(([ty, es]) => `
        <div class="card"><div class="row" style="justify-content:space-between"><span class="chip ${typeClass(ty)}">${esc(ty)}</span><span style="color:var(--muted)">${es.length}개</span></div>
        <ul class="slist">${es.slice(0, 12).map(e => { const p = pointOf(e.sid, e.t); return `<li><span class="tx"><b>${spaceMark(e.t)}</b> <span style="color:var(--muted);font-size:.9rem">${esc(BY_ID[e.sid].text)}</span></span><span style="color:var(--bad);font-size:.85rem">${e.wrongs}번 틀림</span></li>`; }).join('')}</ul>
        ${es.length > 12 ? `<p style="color:var(--muted);margin:6px 0 0">외 ${es.length - 12}개</p>` : ''}</div>`).join('')}</div>`
        : `<div class="card empty">아직 오답 노트가 비어 있어요. 급수 활동을 하면 틀린 낱말이 여기에 모여요.</div>`}`);
    bindBack(showHome);
    if ($('#rv')) $('#rv').onclick = () => runReview(note.slice(0, 10).map(e => ({ s: BY_ID[e.sid], p: pointOf(e.sid, e.t) })), '오답 노트 복습');
  }
  function runReview(qs, name, backFn) {
    qs = qs.filter(q => q.s && q.p && choicesFor(q.p, true).length >= 2 && q.s.text.indexOf(q.p.t) >= 0);
    if (!qs.length) { toast('연습할 문제가 없어요.'); return; }
    const before = new Set(wrongNote().map(e => e.sid + '|' + e.t));
    mcQuiz({
      questions: shuffle(qs), act: 'review', levelKey: null, allowSpacing: true,
      prompt: '빈칸에 들어갈 바른 모양을 골라요. (∨는 띄어 쓴 곳)',
      onDone: async (items, right) => {
        const now = Date.now();
        const after = new Set(wrongNote(items.map(i => [now, 'review', i.sid, i.t, i.ty, i.ok ? 1 : 0])).map(e => e.sid + '|' + e.t));
        const cleared = [...before].filter(k => !after.has(k)).length;
        show('<div class="spinner"></div>');
        const res = await submit('review', 'review', items, { cleared });
        showResult({ title: `${name} 끝!`, line: `${items.length}문제 중 <b>${right}</b>문제를 맞혔어요.${cleared ? ` 오답 노트에서 <b>${cleared}</b>개가 빠졌어요!` : ''}`, res, levelKey: null, again: backFn || showNote });
      }
    });
  }

  /* ───────── 약점 연습 ───────── */
  function showWeak() {
    const st = typeStats(), note = wrongNote();
    const types = D.types.filter(t => t !== '문장부호');
    const rows = types.map(ty => {
      const x = st[ty] || { right: 0, wrong: 0 };
      const n = x.right + x.wrong;
      const inNote = note.filter(e => e.ty === ty).length;
      return { ty, n, rate: n ? Math.round(x.right / n * 100) : null, inNote };
    }).sort((a, b) => (b.inNote - a.inNote) || ((a.rate ?? 101) - (b.rate ?? 101)));
    show(`${title('🎯 약점 연습', true, '내가 자주 틀리는 유형부터 보여 줘요. 유형을 골라 10문제를 연습해요.')}
      <div class="grid g3">${rows.map(r => `<button class="side" data-ty="${esc(r.ty)}">
        <span class="chip ${typeClass(r.ty)}">${esc(r.ty)}</span>
        <b style="margin-top:4px">${r.rate === null ? '아직 기록 없음' : `정답률 ${r.rate}%`}</b>
        <small>${r.inNote ? `오답 노트 ${r.inNote}개` : '오답 노트 없음'}</small></button>`).join('')}</div>`);
    bindBack(showHome);
    $$('[data-ty]').forEach(b => b.onclick = () => practiceType(b.dataset.ty));
  }
  function practiceType(ty) {
    const note = wrongNote().filter(e => e.ty === ty).map(e => ({ s: BY_ID[e.sid], p: pointOf(e.sid, e.t) }));
    const semLevels = new Set(D.levels.filter(L => L.sem === state.sem).map(L => L.key));
    const extra = shuffle(ALL.filter(s => semLevels.has(s.level)).flatMap(s => s.p.filter(p => p.ty === ty).map(p => ({ s, p }))));
    const qs = note.slice(0, 10);
    const seen = new Set(qs.map(q => q.s.id + '|' + q.p.t));
    for (const q of extra) { if (qs.length >= 10) break; const k = q.s.id + '|' + q.p.t; if (!seen.has(k) && choicesFor(q.p, true).length >= 2) { seen.add(k); qs.push(q); } }
    runReview(qs, `${ty} 연습`, showWeak);
  }

  /* ───────── 내 기록 ───────── */
  function showStats() {
    const st = typeStats(), s = state.student, li = levelInfo(s.points);
    const rows = Object.entries(st).map(([ty, x]) => ({ ty, n: x.right + x.wrong, rate: Math.round(x.right / (x.right + x.wrong) * 100) }))
      .sort((a, b) => a.rate - b.rate);
    const tests = D.levels.map(L => ({ L, b: bestTest(L.key) })).filter(x => x.b !== null);
    const acts = {};
    state.hist.rounds.forEach(r => { acts[r[2]] = (acts[r[2]] || 0) + 1; });
    show(`${title('📊 내 기록', true)}
      <div class="grid g2">
        <div class="card"><h3 style="margin:0 0 10px">유형별 정답률</h3>
          ${rows.length ? `<div class="bars">${rows.map(r => `<div class="barrow"><span class="chip ${typeClass(r.ty)}">${esc(r.ty)}</span>
            <span class="track"><i class="${r.rate >= 80 ? '' : r.rate >= 50 ? 'mid' : 'low'}" style="width:${r.rate}%"></i></span>
            <span class="v">${r.rate}% · ${r.n}문항</span></div>`).join('')}</div>
            <p style="color:var(--muted);margin:12px 0 0">빨간 막대가 나의 약점이에요. ‘약점 연습’에서 연습해 봐요.</p>`
            : '<div class="empty">아직 기록이 없어요.</div>'}
        </div>
        <div class="grid" style="gap:14px">
          <div class="card"><h3 style="margin:0 0 6px">등급</h3>
            <div style="font-size:1.1rem"><b>${esc(li.cur.name)}</b> · ${s.points}점</div>
            <div class="progress"><i style="width:${li.pct}%"></i></div>
            <div style="color:var(--muted);margin-top:6px">${(state.config.levels || []).map(l => `${esc(l.name)} ${l.min}`).join(' → ')}</div></div>
          <div class="card"><h3 style="margin:0 0 6px">급수별 시험 최고 점수</h3>
            ${tests.length ? `<table class="t">${tests.map(x => `<tr><td>${x.L.sem.replace('-', '-')} ${esc(x.L.name)}</td><td class="num"><b>${x.b}</b>점</td></tr>`).join('')}</table>` : '<div class="empty">아직 시험을 보지 않았어요.</div>'}</div>
          <div class="card"><h3 style="margin:0 0 6px">활동한 횟수</h3>
            <table class="t">${Object.keys(ACT_NAME).map(k => `<tr><td>${esc(ACT_NAME[k])}</td><td class="num">${acts[k] || 0}번</td></tr>`).join('')}</table></div>
        </div>
      </div>`);
    bindBack(showHome);
  }

  const RUN = { study: runStudy, choice: runChoice, spacing: runSpacing, find: runFind, sound: runSound, test: runTest };

  /* ───────── 시작 ───────── */
  async function start() {
    $('#brand').onclick = () => { if (state.student) showHome(); };
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('dict_login') || 'null'); } catch (_) {}
    if (saved && saved.nick && saved.cls && (saved.demo || saved.server === API.serverUrl())) {
      if (saved.demo) API.setDemo(true);
      show('<div class="spinner"></div>');
      try { await doLogin(saved.cls, saved.nick, saved.pw); return; }
      catch (e) { if (!e.network) { try { localStorage.removeItem('dict_login'); } catch (_) {} } showLogin(e.message); return; }
    }
    showLogin();
  }
  window.addEventListener('online', flushPending);
  start();
})();
