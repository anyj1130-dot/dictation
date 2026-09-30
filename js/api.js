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
      if (!db) db = {
        tpw: '1234', config: DEF, classes: ['체험반'],
        students: [{ id: 'S0001', cls: '체험반', no: 1, nick: '체험', pw: '1234', points: 0, last: null }],
        rounds: [], items: []
      };
      return db;
    }
    function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} }
    const day = () => new Date().toLocaleDateString('sv-SE');
    const levelOf = (p, c) => { let n = c.levels[0].name; c.levels.slice().sort((a, b) => a.min - b.min).forEach(l => { if (p >= l.min) n = l.name; }); return n; };
    function stu(db, nick, pw) {
      const s = db.students.find(x => x.nick === String(nick).trim());
      if (!s) throw new Error('등록되지 않은 닉네임이에요. (체험: 닉네임 체험 / 비밀번호 1234)');
      if (s.pw !== String(pw).trim()) throw new Error('비밀번호가 달라요.');
      return s;
    }
    function teacher(db, pw) { if (String(pw) !== db.tpw) throw new Error('교사 비밀번호가 달라요. (체험: 1234)'); }
    const H = {
      login(b, db) { const s = stu(db, b.nick, b.pw); s.last = Date.now(); return { student: { id: s.id, nick: s.nick, cls: s.cls, no: s.no, points: s.points, level: levelOf(s.points, db.config) }, config: db.config }; },
      history(b, db) { const s = stu(db, b.nick, b.pw); return { items: db.items.filter(r => r[1] === s.id).map(r => [r[0], r[2], r[3], r[4], r[5], r[6]]), rounds: db.rounds.filter(r => r[2] === s.id).map(r => [r[0], r[4], r[5], r[6], r[7], r[8]]) }; },
      submit(b, db) {
        const s = stu(db, b.nick, b.pw), P = db.config.points[b.act];
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
        return { gained: s.points - before, points: s.points, capped, levelBefore: levelOf(before, db.config), level: levelOf(s.points, db.config), roundsToday: done + 1, cap: P.cap };
      },
      tInit(b, db) { teacher(db, b.tpw); return { classes: db.classes, students: db.students.map(s => Object.assign({}, s, { level: levelOf(s.points, db.config) })), config: db.config }; },
      tAddClass(b, db) { teacher(db, b.tpw); if (db.classes.includes(b.name)) throw new Error('이미 있는 반이에요.'); db.classes.push(b.name); return {}; },
      tAddStudents(b, db) {
        teacher(db, b.tpw); let n = db.students.length, added = 0; const skipped = [];
        (b.list || []).forEach(x => { if (db.students.some(s => s.nick === x.nick)) { skipped.push(x.nick); return; } n++; added++; db.students.push({ id: 'S' + String(n + 100).padStart(4, '0'), cls: b.cls, no: Number(x.no) || '', nick: x.nick, pw: String(x.pw), points: 0, last: null }); });
        return { added, skipped };
      },
      tUpdateStudent(b, db) { teacher(db, b.tpw); const s = db.students.find(x => x.id === b.id); ['nick', 'pw', 'no'].forEach(k => { if (b[k] !== undefined) s[k] = b[k]; }); if (b.points !== undefined) s.points = Math.max(0, Number(b.points) || 0); return {}; },
      tDeleteStudent(b, db) { teacher(db, b.tpw); db.students = db.students.filter(x => x.id !== b.id); return {}; },
      tDashboard(b, db) {
        teacher(db, b.tpw); const dash = {};
        db.students.filter(s => !b.cls || s.cls === b.cls).forEach(s => dash[s.id] = { types: {}, acts: {}, tests: {}, rounds: 0, lastDay: '' });
        db.rounds.forEach(r => { const d = dash[r[2]]; if (!d) return; d.rounds++; d.acts[r[5]] = (d.acts[r[5]] || 0) + 1; if (r[1] > d.lastDay) d.lastDay = r[1]; if (r[5] === 'test' && r[7]) d.tests[r[4]] = Math.max(d.tests[r[4]] || 0, Math.round(r[6] / r[7] * 100)); });
        db.items.forEach(r => { const d = dash[r[1]]; if (!d) return; const k = r[5] || '기타'; d.types[k] = d.types[k] || [0, 0]; d.types[k][r[6] ? 0 : 1]++; });
        return { dash };
      },
      tSaveConfig(b, db) { teacher(db, b.tpw); db.config = b.config; return { config: db.config }; }
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
