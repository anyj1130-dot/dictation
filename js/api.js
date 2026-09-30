/* 서버 연결 + 체험 모드 + 음성 재생 (학생·교사 공용) */
(function (G) {
  'use strict';

  const okUrl = (u) => /^https:\/\/script\.google\.com\/.+\/exec$/.test(String(u || '').trim());

  function serverUrl() {
    try { if (typeof API_URL === 'string' && okUrl(API_URL)) return API_URL.trim(); } catch (_) {}
    return '';
  }
  function isDemo() {
    try { return /[?&]demo\b/.test(location.search) || sessionStorage.getItem('demo') === '1'; } catch (_) { return false; }
  }
  function setDemo(on) { try { on ? sessionStorage.setItem('demo', '1') : sessionStorage.removeItem('demo'); } catch (_) {} }

  async function call(action, data) {
    const body = Object.assign({ action }, data || {});
    if (isDemo() || !serverUrl()) {
      if (!isDemo()) throw new Error('서버 주소(config.js)가 아직 없어요. 선생님께 알려 주세요.');
      return Mock.handle(body);
    }
    let res;
    try {
      res = await fetch(serverUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    } catch (e) {
      const err = new Error('인터넷 연결을 확인해 주세요.'); err.network = true; throw err;
    }
    let j;
    try { j = await res.json(); } catch (e) { const err = new Error('서버 응답을 읽지 못했어요. 잠시 뒤 다시 해 보세요.'); err.network = true; throw err; }
    if (!j.ok) throw new Error(j.error || '알 수 없는 오류');
    return j;
  }

  /* ───────── 체험 모드: 이 기기 안에서만 도는 가짜 서버 ───────── */
  const Mock = (function () {
    const KEY = 'dict_demo_db';
    const DEF = {
      points: {
        study: { name: '유의점 보고 쓰기', right: 1, wrong: 0, finish: 3, cap: 3 },
        choice: { name: '빈칸 고르기', right: 2, wrong: -1, finish: 3, cap: 3 },
        spacing: { name: '띄어 쓰기', right: 2, wrong: -1, finish: 3, cap: 3 },
        find: { name: '틀린 곳 찾기', right: 3, wrong: -1, finish: 3, cap: 3 },
        sound: { name: '소리→바른 글자', right: 3, wrong: -1, finish: 3, cap: 3 },
        test: { name: '받아쓰기 시험', right: 5, wrong: 0, finish: 0, perfect: 20, cap: 1 },
        review: { name: '오답 노트 복습', right: 3, wrong: 0, finish: 0, cleared: 2, cap: 5 }
      },
      levels: [{ name: '백성', min: 0 }, { name: '선비', min: 200 }, { name: '정승', min: 800 }, { name: '영의정', min: 1800 }, { name: '세종대왕', min: 3000 }]
    };
    function load() {
      let db = null;
      try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
      if (!db || !db.v2) db = {
        v2: true, code: '1234',
        classes: [{ name: '체험반', pw: '1234', config: null }],
        students: [{ id: 'S0001', cls: '체험반', no: 1, nick: '체험', pw: '1234', points: 0, last: null }],
        rounds: [], items: []
      };
      return db;
    }
    function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} }
    const day = () => new Date().toLocaleDateString('sv-SE');
    const S = (v) => String(v === undefined || v === null ? '' : v).trim();
    const levelOf = (p, c) => { let n = c.levels[0].name; c.levels.slice().sort((a, b) => a.min - b.min).forEach(l => { if (p >= l.min) n = l.name; }); return n; };
    function cls(db, name) { const c = db.classes.find(x => x.name === S(name)); if (!c) throw new Error('학급을 찾지 못했어요.'); return c; }
    const cfgOf = (c) => c.config || DEF;
    function stu(db, b) {
      if (!S(b.cls)) throw new Error('학급을 골라 주세요.');
      const s = db.students.find(x => x.cls === S(b.cls) && x.nick === S(b.nick));
      if (!s) throw new Error('이 학급에 없는 닉네임이에요. (체험: 체험반 / 체험 / 1234)');
      if (s.pw !== S(b.pw)) throw new Error('비밀번호가 달라요.');
      return s;
    }
    function teacher(db, b) { const c = cls(db, b.cls); if (S(b.tpw) !== c.pw) throw new Error('교사 비밀번호가 달라요. (체험: 1234)'); return c; }
    const H = {
      classes(b, db) { return { classes: db.classes.map(c => c.name) }; },
      login(b, db) { const s = stu(db, b); s.last = Date.now(); const cfg = cfgOf(cls(db, s.cls)); return { student: { id: s.id, nick: s.nick, cls: s.cls, no: s.no, points: s.points, level: levelOf(s.points, cfg) }, config: cfg }; },
      history(b, db) { const s = stu(db, b); return { items: db.items.filter(r => r[1] === s.id).map(r => [r[0], r[2], r[3], r[4], r[5], r[6]]), rounds: db.rounds.filter(r => r[2] === s.id).map(r => [r[0], r[4], r[5], r[6], r[7], r[8]]) }; },
      submit(b, db) {
        const s = stu(db, b), cfg = cfgOf(cls(db, s.cls)), P = cfg.points[b.act];
        const items = b.items || [];
        const counted = items.filter(i => i.c !== false);
        const right = counted.filter(i => i.ok).length, wrong = counted.length - right;
        const done = db.rounds.filter(r => r[2] === s.id && r[1] === day() && r[5] === b.act && (b.act === 'review' || r[4] === b.level)).length;
        const capped = done >= P.cap;
        let delta = 0;
        if (!capped) {
          delta = right * P.right + wrong * P.wrong + (b.finished ? P.finish : 0);
          if (b.act === 'test' && counted.length && !wrong) delta += P.perfect || 0;
          if (b.act === 'review') delta += (b.cleared || 0) * (P.cleared || 0);
        }
        const before = s.points; s.points = Math.max(0, before + delta);
        const now = Date.now();
        db.rounds.push([now, day(), s.id, s.cls, b.level, b.act, right, counted.length, s.points - before]);
        items.forEach(i => db.items.push([now, s.id, b.act, i.sid, i.t, i.ty, i.ok ? 1 : 0]));
        return { gained: s.points - before, points: s.points, capped, levelBefore: levelOf(before, cfg), level: levelOf(s.points, cfg), roundsToday: done + 1, cap: P.cap };
      },
      tCreateClass(b, db) {
        if (S(b.code) !== db.code) throw new Error('학교 코드가 달라요. (체험: 1234)');
        if (!S(b.name)) throw new Error('학급 이름을 적어 주세요.');
        if (S(b.tpw).length < 4) throw new Error('교사 비밀번호는 4글자 이상으로 정해 주세요.');
        if (db.classes.some(c => c.name === S(b.name))) throw new Error('이미 있는 학급 이름이에요.');
        db.classes.push({ name: S(b.name), pw: S(b.tpw), config: null }); return { cls: S(b.name) };
      },
      tInit(b, db) { const c = teacher(db, b), cfg = cfgOf(c); return { cls: c.name, students: db.students.filter(s => s.cls === c.name).map(s => Object.assign({}, s, { level: levelOf(s.points, cfg) })), config: cfg }; },
      tAddStudents(b, db) {
        const c = teacher(db, b); let added = 0; const skipped = [];
        (b.list || []).forEach(x => { if (db.students.some(s => s.cls === c.name && s.nick === S(x.nick))) { skipped.push(x.nick); return; } added++; db.students.push({ id: 'S' + String(db.students.length + 101).padStart(5, '0'), cls: c.name, no: Number(x.no) || '', nick: S(x.nick), pw: S(x.pw), points: 0, last: null }); });
        return { added, skipped };
      },
      tUpdateStudent(b, db) {
        const c = teacher(db, b); const s = db.students.find(x => x.id === b.id && x.cls === c.name); if (!s) throw new Error('이 학급의 학생이 아니에요.');
        if (b.nick !== undefined) { if (!S(b.nick)) throw new Error('닉네임을 비울 수 없어요.'); if (db.students.some(x => x !== s && x.cls === c.name && x.nick === S(b.nick))) throw new Error('이 학급에 이미 있는 닉네임이에요.'); s.nick = S(b.nick); }
        if (b.pw !== undefined) { if (!S(b.pw)) throw new Error('비밀번호를 비울 수 없어요.'); s.pw = S(b.pw); }
        if (b.no !== undefined) s.no = Number(b.no) || '';
        if (b.points !== undefined) s.points = Math.max(0, Number(b.points) || 0);
        return {};
      },
      tDeleteStudent(b, db) { const c = teacher(db, b); db.students = db.students.filter(x => !(x.id === b.id && x.cls === c.name)); return {}; },
      tChangeTeacherPw(b, db) { const c = teacher(db, b); if (S(b.newPw).length < 4) throw new Error('새 비밀번호는 4글자 이상으로 정해 주세요.'); c.pw = S(b.newPw); return {}; },
      tDashboard(b, db) {
        const c = teacher(db, b); const dash = {};
        db.students.filter(s => s.cls === c.name).forEach(s => dash[s.id] = { types: {}, acts: {}, tests: {}, rounds: 0, lastDay: '' });
        db.rounds.forEach(r => { const d = dash[r[2]]; if (!d) return; d.rounds++; d.acts[r[5]] = (d.acts[r[5]] || 0) + 1; if (r[1] > d.lastDay) d.lastDay = r[1]; if (r[5] === 'test' && r[7]) d.tests[r[4]] = Math.max(d.tests[r[4]] || 0, Math.round(r[6] / r[7] * 100)); });
        db.items.forEach(r => { const d = dash[r[1]]; if (!d) return; const k = r[5] || '기타'; d.types[k] = d.types[k] || [0, 0]; d.types[k][r[6] ? 0 : 1]++; });
        return { dash };
      },
      tSaveConfig(b, db) { const c = teacher(db, b); c.config = b.config; return { config: c.config }; }
    };
    return {
      handle(body) {
        return new Promise((resolve, reject) => setTimeout(() => {
          const db = load();
          try { const r = H[body.action](body, db); save(db); resolve(Object.assign({ ok: true }, JSON.parse(JSON.stringify(r)))); }
          catch (e) { reject(e); }
        }, 150));
      },
      reset() { try { localStorage.removeItem(KEY); } catch (_) {} }
    };
  })();

  /* ───────── 음성 ───────── */
  const Audio2 = (function () {
    let cur = null;
    function stop() {
      if (cur) { try { cur.pause(); } catch (_) {} cur = null; }
      try { if ('speechSynthesis' in G) speechSynthesis.cancel(); } catch (_) {}
    }
    function tts(text, slow) {
      return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in G)) return reject(new Error('no-tts'));
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR';
        u.rate = slow ? 0.6 : 0.85;
        const ko = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang));
        if (ko) u.voice = ko;
        u.onend = () => resolve('tts');
        u.onerror = () => reject(new Error('tts-error'));
        speechSynthesis.speak(u);
      });
    }
    // 음성 파일(audio/문장ID.mp3, 천천히: 문장ID_slow.mp3)을 먼저 쓰고, 없으면 기기 음성으로 읽음
    function play(sent, slow) {
      stop();
      return new Promise((resolve, reject) => {
        const a = new Audio('audio/' + sent.id + (slow ? '_slow' : '') + '.mp3');
        cur = a;
        let fellBack = false;
        const fallback = () => {
          if (fellBack) return; fellBack = true;
          tts(sent.tts || sent.text, slow).then(resolve, () => reject(new Error('음성을 재생하지 못했어요. 태블릿 소리를 확인해 주세요.')));
        };
        a.onended = () => resolve('file');
        a.onerror = fallback;
        const p = a.play();
        if (p && p.catch) p.catch(err => { if (err && err.name === 'NotAllowedError') reject(new Error('화면을 한 번 누른 뒤 다시 들어 보세요.')); else fallback(); });
      });
    }
    return { play, stop };
  })();

  G.API = { call, serverUrl, isDemo, setDemo, resetDemo: () => Mock.reset() };
  G.Sound = Audio2;
})(window);
