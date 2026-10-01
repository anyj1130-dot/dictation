/* 한글 처리 + 채점 도구 (학생·교사 화면 공용) */
(function (G) {
  'use strict';
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const PUNCT = /[.,?!'"‘’“”]/;

  function dec(ch) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) return null;
    return [CHO[Math.floor(c / 588)], JUNG[Math.floor((c % 588) / 28)], JONG[c % 28]];
  }

  // 따옴표는 곧은 따옴표로 맞춰서 비교 (태블릿 키보드는 ' " 로 입력돼요)
  const nq = (s) => String(s).replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"');

  // 입력 정리: 앞뒤 공백 제거, 연속 공백 하나로, 전각/특수 따옴표 정리
  function clean(s) {
    return String(s || '')
      .replace(/[　 ]/g, ' ')
      .replace(/？/g, '?').replace(/！/g, '!').replace(/，/g, ',').replace(/。/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const nospace = (s) => clean(s).replace(/ /g, '');

  // 문장 → 글자 배열 + 글자 사이 칸 정보 (1: 띄어야 함, 0: 붙여야 함, 2: 둘 다 맞음)
  function layout(sent) {
    const words = sent.text.split(' ');
    const chars = [];
    const gaps = [];      // gaps[i] = chars[i]와 chars[i+1] 사이
    const optJoin = new Set(sent.optJoin || []);
    const optSplit = {};
    (sent.optSplit || []).forEach(([wi, arr]) => { optSplit[wi] = new Set(arr); });
    words.forEach((w, wi) => {
      [...w].forEach((ch, ci) => {
        if (chars.length) {
          if (ci === 0) gaps.push(optJoin.has(wi - 1) ? 2 : 1);
          else gaps.push(optSplit[wi] && optSplit[wi].has(ci) ? 2 : 0);
        }
        chars.push(ch);
      });
    });
    return { chars, gaps };
  }

  // 사용자가 쓴 문장 → 글자 배열 + 칸(띄었으면 1)
  function parseAnswer(ans) {
    const s = clean(ans);
    const chars = [], gaps = [];
    let pendingSpace = false;
    for (const ch of s) {
      if (ch === ' ') { pendingSpace = true; continue; }
      if (chars.length) gaps.push(pendingSpace ? 1 : 0);
      chars.push(ch);
      pendingSpace = false;
    }
    return { chars, gaps };
  }

  // 목표 낱말이 문장 안에서 허용되는 모양들 (보조 용언 붙여쓰기 등)
  function variants(sent, target) {
    const L = layout(sent);
    const flat = L.chars.join('');
    const t = target.replace(/ /g, '');
    const start = flat.indexOf(t);
    const out = new Set([target]);
    if (start < 0) return [...out];
    const opt = [];
    for (let i = start; i < start + t.length - 1; i++) if (L.gaps[i] === 2) opt.push(i);
    const n = Math.min(opt.length, 3);
    for (let mask = 0; mask < (1 << n); mask++) {
      let s = '';
      for (let i = start; i < start + t.length; i++) {
        s += L.chars[i];
        if (i < start + t.length - 1) {
          const g = L.gaps[i];
          const k = opt.indexOf(i);
          const sp = g === 2 ? ((mask >> k) & 1) : g;
          if (sp) s += ' ';
        }
      }
      out.add(s);
    }
    return [...out];
  }

  // LCS로 글자 맞추기 → 틀린 글자 표시용
  function align(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const okA = new Array(n).fill(false), okB = new Array(m).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { okA[i] = okB[j] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    return { okA, okB };
  }

  function whatDiffers(want, got) {
    const a = dec(want), b = dec(got);
    if (!a || !b) return '글자가 달라요';
    const d = [];
    if (a[0] !== b[0]) d.push('첫소리');
    if (a[1] !== b[1]) d.push('모음');
    if (a[2] !== b[2]) d.push('받침');
    if (d.length === 1 && d[0] === '받침') {
      if (a[2] && b[2]) return `받침이 달라요 (${a[2]} → ${b[2]})`;
      if (a[2]) return `받침 ${a[2]}이(가) 빠졌어요`;
      return `받침 ${b[2]}은(는) 없어야 해요`;
    }
    if (d.length === 1 && d[0] === '모음') return `모음이 달라요 (${a[1]} → ${b[1]})`;
    return d.join('·') + '이(가) 달라요';
  }

  /**
   * 문장 채점
   * return { ok, chars:[{ch, bad}], gapErr:[{i, kind}], points:[{p, ok, note}], notes:[], optNotes:[] }
   */
  function grade(sent, answer) {
    answer = nq(answer || '');
    const L0 = layout(sent);
    const L = { chars: L0.chars.map(nq), gaps: L0.gaps };
    const A = parseAnswer(answer);
    const want = L.chars.join(''), got = A.chars.join('');
    const res = { ok: false, sameChars: want === got, answer: clean(answer), gapErr: [], points: [], notes: [], optNotes: [] };
    const ansClean = clean(answer);
    const ansNo = ansClean.replace(/ /g, '');

    // 글자 비교
    const al = align(L.chars, A.chars);
    res.marks = A.chars.map((ch, i) => ({ ch, bad: !al.okB[i], spaceBefore: i > 0 && A.gaps[i - 1] === 1 }));
    res.missing = L.chars.filter((_, i) => !al.okA[i]).join('');

    // 띄어쓰기 비교 (글자가 같을 때만 칸 단위로)
    if (res.sameChars) {
      L.gaps.forEach((g, i) => {
        const s = A.gaps[i];
        if (g === 2) { if (s === 0) res.optNotes.push(i); return; }
        if (g !== s) res.gapErr.push({ i, kind: g === 1 ? 'need' : 'extra' });
      });
      res.gapErr.forEach(e => {
        if (e.kind === 'need') res.marks[e.i + 1].needSpace = true;
        else res.marks[e.i + 1].extraSpace = true;
      });
    }

    // 항목별 판정
    (sent.p || []).forEach(p => {
      const tNo = nq(p.t).replace(/ /g, '');
      let ok = null, note = '';
      if (p.ty === '문장부호') {
        if (ansNo.includes(tNo)) ok = true;
        else if (ansNo.includes(tNo.replace(/[.,?!]+$/, ''))) ok = false;
      } else if (p.ty === '띄어쓰기') {
        const vs = variants(sent, p.t).map(nq);
        if (vs.some(v => ansClean.includes(v))) ok = true;
        else if (ansNo.includes(tNo)) ok = false;
      } else {
        ok = ansNo.includes(tNo);
        if (!ok) {
          const hit = (p.w || []).find(w => nq(w).replace(/ /g, '') !== tNo && ansNo.includes(nq(w).replace(/ /g, '')));
          if (hit) note = `‘${hit}’${/[가-힣]$/.test(hit) && dec(hit.slice(-1))[2] && dec(hit.slice(-1))[2] !== 'ㄹ' ? '으로' : '로'} 썼어요.`;
        }
      }
      if (ok !== null) res.points.push({ p, ok, note });
    });

    res.ok = res.sameChars && res.gapErr.length === 0;
    // 문장부호 빠짐/틀림 (데이터 항목과 상관없이 항상 알려 줌)
    const endP = (sent.text.match(/[.?!]$/) || [])[0];
    const gotP = (ansClean.match(/[.?!]$/) || [])[0];
    const puPointFailed = res.points.some(x => !x.ok && x.p.ty === '문장부호');
    if (!puPointFailed) {
      if (endP && !gotP) res.notes.push(`문장 끝에 ‘${endP}’를 빠뜨렸어요.`);
      else if (endP && gotP && endP !== gotP) res.notes.push(`문장 끝에는 ‘${gotP}’가 아니라 ‘${endP}’를 써요.`);
      else if (!endP && gotP) res.notes.push(`이 문장은 끝에 문장부호가 없어요.`);
      const tq = nq(sent.text);
      const q1 = (tq.match(/'/g) || []).length, a1 = (ansClean.match(/'/g) || []).length;
      const q2 = (tq.match(/"/g) || []).length, a2 = (ansClean.match(/"/g) || []).length;
      if (q1 !== a1) res.notes.push(q1 > a1 ? '작은따옴표(‘ ’)를 빠뜨렸어요. 속으로 한 말이나 강조할 말을 묶어요.' : '작은따옴표가 필요 없어요.');
      if (q2 !== a2) res.notes.push(q2 > a2 ? '큰따옴표(“ ”)를 빠뜨렸어요. 소리 내어 한 말을 묶어요.' : '큰따옴표가 필요 없어요.');
      const wantC = (sent.text.match(/,/g) || []).length, gotC = (ansClean.match(/,/g) || []).length;
      if (wantC !== gotC) res.notes.push(wantC > gotC ? '반점(,)을 빠뜨렸어요.' : '반점(,)이 필요 없어요.');
    }
    if (!res.ok) {
      const failed = res.points.filter(x => !x.ok);
      if (!failed.length) {
        // 데이터에 없는 실수: 글자 단위로 설명
        if (!res.sameChars) {
          const wrongChars = A.chars.map((c, i) => al.okB[i] ? null : c).filter(c => c && !PUNCT.test(c));
          const missChars = L.chars.map((c, i) => al.okA[i] ? null : c).filter(c => c && !PUNCT.test(c));
          if (!wrongChars.length && !missChars.length) { /* 문장부호만 다름 → 위에서 안내 */ }
          else if (wrongChars.length === 1 && missChars.length === 1)
            res.notes.push(`‘${missChars[0]}’${dec(missChars[0]) && dec(missChars[0])[2] ? '을' : '를'} ‘${wrongChars[0]}’${dec(wrongChars[0]) && dec(wrongChars[0])[2] && dec(wrongChars[0])[2] !== 'ㄹ' ? '으로' : '로'} 썼어요. ${whatDiffers(missChars[0], wrongChars[0])}.`);
          else if (missChars.length && !wrongChars.length) res.notes.push(`빠진 글자가 있어요: ‘${missChars.join('')}’`);
          else if (!missChars.length && wrongChars.length) res.notes.push(`필요 없는 글자가 있어요: ‘${wrongChars.join('')}’`);
          else res.notes.push('빨간 글자를 바른 문장과 비교해 보세요.');
        } else if (res.gapErr.length) {
          res.notes.push('띄어쓰기를 다시 확인해 보세요. ∨ 표시는 띄어야 하는 곳, ✕ 표시는 붙여야 하는 곳이에요.');
        }
      }
    }
    return res;
  }

  // 원고지처럼 한 칸에 한 글자
  function gridHTML(text, cols) {
    const s = String(text || '');
    const cells = [];
    for (const ch of s) cells.push(ch === ' ' ? '' : ch);
    const n = Math.max(cols || 0, cells.length + 1);
    let h = '';
    for (let i = 0; i < n; i++) {
      const ch = cells[i] || '';
      const isP = PUNCT.test(ch);
      h += `<span class="gcell${isP ? ' p' : ''}">${esc(ch)}</span>`;
    }
    return h;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 조사 (을/를, 이/가, 으로/로)
  function josa(word, pair) {
    const last = String(word).replace(/[^가-힣]/g, '').slice(-1);
    const d = last ? dec(last) : null;
    const has = d && d[2];
    const map = { '을/를': ['을', '를'], '이/가': ['이', '가'], '은/는': ['은', '는'], '과/와': ['과', '와'], '으로/로': ['으로', '로'] };
    const [a, b] = map[pair];
    if (pair === '으로/로') return word + ((has && d[2] !== 'ㄹ') ? a : b);
    return word + (has ? a : b);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  G.H = { nq, dec, clean, nospace, layout, parseAnswer, variants, grade, gridHTML, esc, josa, shuffle, align };
})(window);
