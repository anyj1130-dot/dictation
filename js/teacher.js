/* 교사 화면 */
(function () {
  'use strict';
  const D = window.DICT;
  const { esc } = window.H;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const ACT_NAME = { study: '보고 쓰기', choice: '빈칸 고르기', spacing: '띄어 쓰기', find: '틀린 곳', sound: '소리→글자', test: '시험', review: '복습' };
  const HIDE_TYPES = new Set(['문장', '잘못 고름']);
  const st = { tpw: '', classes: [], students: [], config: null, cls: '', tab: 'students', sem: '4-1' };

  function toast(msg, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2400); }
  const call = (a, d) => API.call(a, Object.assign({ tpw: st.tpw }, d || {}));
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '—';
  const levelShort = (key) => { const L = D.levels.find(x => x.key === key); return L ? L.name.replace('기초 다지기 ', '기초') : key; };

  /* 로그인 */
  function showLogin(msg) {
    $('#main').innerHTML = `<div class="login card">
      <div class="logo-tiles" style="grid-template-columns:repeat(2,44px)"><i style="background:var(--green)">교</i><i style="background:var(--red)">사</i></div><h1>교사 화면</h1>
      <label class="field"><span>교사 비밀번호</span><input id="tpw" type="password" autocomplete="off"></label>
      <button class="btn" id="go" style="width:100%">들어가기</button>
      ${!API.serverUrl() ? `<div class="msg warn">서버 주소가 없어요. 체험 모드(비밀번호 1234)로 둘러볼 수 있어요.</div><button class="btn ghost" id="demo" style="width:100%;margin-top:10px">체험 모드</button>` : ''}
      <div id="lmsg">${msg ? `<div class="msg bad">${esc(msg)}</div>` : ''}</div></div>`;
    const go = async () => {
      st.tpw = $('#tpw').value.trim();
      $('#lmsg').innerHTML = '<div class="spinner"></div>';
      try { await load(); try { sessionStorage.setItem('dict_tpw', st.tpw); } catch (_) {} render(); }
      catch (e) { $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
    };
    $('#go').onclick = go;
    $('#tpw').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) go(); });
    if ($('#demo')) $('#demo').onclick = () => { API.setDemo(true); $('#tpw').value = '1234'; go(); };
  }
  async function load() {
    const r = await call('tInit');
    st.classes = r.classes; st.students = r.students; st.config = r.config;
    if (!st.cls || !st.classes.includes(st.cls)) st.cls = st.classes[0] || '';
  }

  /* 틀 */
  function render() {
    const tabs = [['students', '반·학생 관리'], ['progress', '진행 현황'], ['weak', '약점 분석'], ['points', '포인트 설정'], ['audio', '음성 확인']];
    $('#me').innerHTML = `${API.isDemo() ? '<span class="pending">체험 모드</span>' : ''}<a class="linkbtn" href="./">학생 화면</a><button class="linkbtn" id="out">나가기</button>`;
    $('#out').onclick = () => { try { sessionStorage.removeItem('dict_tpw'); } catch (_) {} API.setDemo(false); location.reload(); };
    $('#main').innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <div class="tabs" style="margin:0">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        ${st.tab !== 'points' && st.tab !== 'audio' ? `<label class="row" style="gap:6px">반
          <select id="clsSel" class="textin" style="width:auto;font-size:1rem;padding:8px 12px">${st.classes.map(c => `<option ${c === st.cls ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div id="tabBody" style="margin-top:14px"></div>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; render(); });
    if ($('#clsSel')) $('#clsSel').onchange = e => { st.cls = e.target.value; render(); };
    ({ students: tabStudents, progress: tabProgress, weak: tabWeak, points: tabPoints, audio: tabAudio })[st.tab]();
  }

  /* 반·학생 관리 */
  function tabStudents() {
    const list = st.students.filter(s => s.cls === st.cls).sort((a, b) => (a.no || 99) - (b.no || 99));
    $('#tabBody').innerHTML = `
      <div class="grid g2">
        <div class="card">
          <h3 style="margin:0 0 8px">새 반 만들기</h3>
          <div class="row"><input class="textin" id="newCls" placeholder="예: 4학년 2반" style="flex:1;font-size:1.05rem"><button class="btn small" id="addCls">만들기</button></div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 4px">학생 한꺼번에 등록 ${st.cls ? `<small style="color:var(--muted)">→ ${esc(st.cls)}</small>` : ''}</h3>
          <p style="color:var(--muted);margin:0 0 8px;font-size:.92rem">한 줄에 한 명씩 <b>번호, 닉네임, 비밀번호</b> (엑셀에서 세 칸을 복사해 붙여 넣어도 돼요)</p>
          <textarea id="bulk" class="textin" rows="5" style="font-size:1rem" placeholder="1, 해님, 1234&#10;2, 달님, 5678"></textarea>
          <div class="row end" style="margin-top:8px"><button class="btn small" id="addStu" ${st.cls ? '' : 'disabled'}>등록하기</button></div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3 style="margin:0 0 8px">${esc(st.cls || '반을 먼저 만들어 주세요')} · ${list.length}명</h3>
        ${list.length ? `<div class="tablewrap"><table class="t">
          <tr><th>번호</th><th>닉네임</th><th>비밀번호</th><th class="num">포인트</th><th>등급</th><th>마지막 접속</th><th></th></tr>
          ${list.map(s => `<tr data-id="${esc(s.id)}"><td>${esc(s.no)}</td><td><b>${esc(s.nick)}</b></td><td>${esc(s.pw)}</td><td class="num">${s.points}</td><td>${esc(s.level)}</td><td>${fmtDate(s.last)}</td>
            <td style="white-space:nowrap"><button class="btn ghost small" data-edit>수정</button> <button class="btn ghost small" data-del>삭제</button></td></tr>`).join('')}
        </table></div>` : '<div class="empty">아직 등록된 학생이 없어요.</div>'}
      </div>`;
    $('#addCls').onclick = async () => {
      const name = $('#newCls').value.trim(); if (!name) return;
      try { await call('tAddClass', { name }); st.cls = name; await load(); render(); toast('반을 만들었어요.'); } catch (e) { toast(e.message); }
    };
    $('#addStu').onclick = async () => {
      const lines = $('#bulk').value.split(/\n/).map(l => l.trim()).filter(Boolean);
      const list2 = lines.map(l => l.split(/\s*[,\t]\s*|\s{2,}/)).map(a => a.length >= 3 ? { no: a[0], nick: a[1], pw: a[2] } : { no: '', nick: a[0], pw: a[1] }).filter(x => x.nick && x.pw);
      if (!list2.length) { toast('번호, 닉네임, 비밀번호 형식으로 써 주세요.'); return; }
      try {
        const r = await call('tAddStudents', { cls: st.cls, list: list2 });
        await load(); render();
        toast(`${r.added}명 등록${r.skipped && r.skipped.length ? ` · 이미 있는 닉네임 제외: ${r.skipped.join(', ')}` : ''}`, 4000);
      } catch (e) { toast(e.message); }
    };
    $$('[data-edit]').forEach(b => b.onclick = async () => {
      const id = b.closest('tr').dataset.id, s = st.students.find(x => x.id === id);
      const nick = prompt('닉네임', s.nick); if (nick === null) return;
      const pw = prompt('비밀번호', s.pw); if (pw === null) return;
      const pts = prompt('포인트 (고칠 때만 바꾸세요)', s.points); if (pts === null) return;
      try { await call('tUpdateStudent', { id, nick: nick.trim(), pw: pw.trim(), points: Number(pts) }); await load(); render(); toast('고쳤어요.'); } catch (e) { toast(e.message); }
    });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const id = b.closest('tr').dataset.id, s = st.students.find(x => x.id === id);
      if (!confirm(`${s.nick} 학생을 지울까요? (기록은 시트에 남아요)`)) return;
      try { await call('tDeleteStudent', { id }); await load(); render(); } catch (e) { toast(e.message); }
    });
  }

  /* 진행 현황 · 약점 공통 데이터 */
  async function dashboard() {
    $('#tabBody').innerHTML = '<div class="spinner"></div>';
    const r = await call('tDashboard', { cls: st.cls });
    return r.dash;
  }

  async function tabProgress() {
    let dash;
    try { dash = await dashboard(); } catch (e) { $('#tabBody').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; return; }
    const list = st.students.filter(s => s.cls === st.cls).sort((a, b) => (a.no || 99) - (b.no || 99));
    const levels = D.levels.filter(L => L.sem === st.sem);
    $('#tabBody').innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h3 style="margin:0">학생별 진행 현황</h3>
          <div class="tabs" style="margin:0">${['4-1', '4-2'].map(s => `<button data-sem="${s}" class="${st.sem === s ? 'on' : ''}">${s.replace('-', '학년 ')}학기 시험</button>`).join('')}</div>
        </div>
        ${list.length ? `<div class="tablewrap" style="margin-top:10px"><table class="t">
          <tr><th>번호</th><th>닉네임</th><th class="num">포인트</th><th>등급</th><th class="num">활동</th><th>마지막 활동</th>
            ${levels.map(L => `<th class="num">${esc(levelShort(L.key))}</th>`).join('')}</tr>
          ${list.map(s => {
            const d = dash[s.id] || { tests: {}, rounds: 0, lastDay: '' };
            return `<tr><td>${esc(s.no)}</td><td><b>${esc(s.nick)}</b></td><td class="num">${s.points}</td><td>${esc(s.level)}</td>
              <td class="num">${d.rounds}</td><td>${d.lastDay ? esc(d.lastDay.slice(5).replace('-', '/')) : '—'}</td>
              ${levels.map(L => { const v = d.tests[L.key]; return `<td class="num" style="${v === 100 ? 'color:var(--ok);font-weight:800' : v !== undefined && v < 60 ? 'color:var(--bad);font-weight:700' : ''}">${v === undefined ? '·' : v}</td>`; }).join('')}</tr>`;
          }).join('')}
        </table></div>
        <p style="color:var(--muted);margin:10px 0 0;font-size:.9rem">급수 칸의 숫자는 그 급수 받아쓰기 시험의 최고 점수예요. 초록은 100점, 빨강은 60점 미만.</p>`
        : '<div class="empty">학생이 없어요.</div>'}
      </div>`;
    $$('[data-sem]').forEach(b => b.onclick = () => { st.sem = b.dataset.sem; tabProgress(); });
  }

  async function tabWeak() {
    let dash;
    try { dash = await dashboard(); } catch (e) { $('#tabBody').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; return; }
    const list = st.students.filter(s => s.cls === st.cls).sort((a, b) => (a.no || 99) - (b.no || 99));
    const agg = {};
    list.forEach(s => Object.entries((dash[s.id] || {}).types || {}).forEach(([ty, [r, w]]) => {
      if (HIDE_TYPES.has(ty)) return; agg[ty] = agg[ty] || [0, 0]; agg[ty][0] += r; agg[ty][1] += w;
    }));
    const rows = Object.entries(agg).map(([ty, [r, w]]) => ({ ty, n: r + w, rate: Math.round(r / (r + w) * 100), w })).sort((a, b) => a.rate - b.rate);
    const weakest = (s) => {
      const t = Object.entries((dash[s.id] || {}).types || {}).filter(([ty, [r, w]]) => !HIDE_TYPES.has(ty) && r + w >= 3)
        .map(([ty, [r, w]]) => ({ ty, rate: Math.round(r / (r + w) * 100) })).sort((a, b) => a.rate - b.rate);
      return t.slice(0, 2);
    };
    $('#tabBody').innerHTML = `<div class="grid g2">
      <div class="card"><h3 style="margin:0 0 10px">${esc(st.cls)} 전체 · 유형별 정답률</h3>
        ${rows.length ? `<div class="bars">${rows.map(r => `<div class="barrow"><span style="font-weight:700">${esc(r.ty)}</span>
          <span class="track"><i class="${r.rate >= 80 ? '' : r.rate >= 50 ? 'mid' : 'low'}" style="width:${r.rate}%"></i></span>
          <span class="v">${r.rate}% · 틀림 ${r.w}</span></div>`).join('')}</div>` : '<div class="empty">아직 기록이 없어요.</div>'}
      </div>
      <div class="card"><h3 style="margin:0 0 10px">학생별 약한 유형</h3>
        ${list.length ? `<table class="t"><tr><th>번호</th><th>닉네임</th><th>가장 약한 유형 (정답률)</th></tr>
          ${list.map(s => { const w = weakest(s); return `<tr><td>${esc(s.no)}</td><td>${esc(s.nick)}</td><td>${w.length ? w.map(x => `${esc(x.ty)} <b style="color:${x.rate < 50 ? 'var(--bad)' : x.rate < 80 ? 'var(--warn)' : 'var(--ok)'}">${x.rate}%</b>`).join(' · ') : '<span style="color:var(--muted)">기록 부족</span>'}</td></tr>`; }).join('')}</table>`
          : '<div class="empty">학생이 없어요.</div>'}
        <p style="color:var(--muted);margin:10px 0 0;font-size:.9rem">3문항 이상 푼 유형만 보여 줘요.</p>
      </div></div>`;
  }

  /* 포인트 설정 */
  function tabPoints() {
    const c = JSON.parse(JSON.stringify(st.config));
    const keys = Object.keys(c.points);
    $('#tabBody').innerHTML = `<div class="grid g2">
      <div class="card"><h3 style="margin:0 0 10px">활동별 점수</h3>
        <div class="tablewrap"><table class="t"><tr><th>활동</th><th class="num">맞히면</th><th class="num">틀리면</th><th class="num">끝내면</th><th class="num">하루 횟수</th></tr>
        ${keys.map(k => `<tr data-k="${k}"><td>${esc(c.points[k].name || k)}${k === 'test' ? '<br><small style="color:var(--muted)">100점 보너스</small>' : k === 'review' ? '<br><small style="color:var(--muted)">노트에서 빠지면</small>' : ''}</td>
          <td class="num"><input type="number" data-f="right" value="${c.points[k].right}" style="width:64px"></td>
          <td class="num"><input type="number" data-f="wrong" value="${c.points[k].wrong}" style="width:64px"></td>
          <td class="num">${k === 'test' ? `<input type="number" data-f="perfect" value="${c.points[k].perfect || 0}" style="width:64px">` : k === 'review' ? `<input type="number" data-f="cleared" value="${c.points[k].cleared || 0}" style="width:64px">` : `<input type="number" data-f="finish" value="${c.points[k].finish}" style="width:64px">`}</td>
          <td class="num"><input type="number" data-f="cap" value="${c.points[k].cap}" style="width:64px" min="1"></td></tr>`).join('')}
        </table></div>
        <p style="color:var(--muted);font-size:.9rem;margin:8px 0 0">‘하루 횟수’는 같은 급수·같은 활동에서 하루에 점수를 받을 수 있는 횟수예요. 복습은 급수와 상관없이 하루 횟수예요.</p>
      </div>
      <div class="card"><h3 style="margin:0 0 10px">등급 기준</h3>
        <table class="t"><tr><th>등급</th><th class="num">필요 점수</th></tr>
        ${c.levels.map((l, i) => `<tr data-l="${i}"><td><input data-f="name" value="${esc(l.name)}" style="width:120px"></td><td class="num"><input type="number" data-f="min" value="${l.min}" style="width:90px" ${i === 0 ? 'disabled' : ''}></td></tr>`).join('')}</table>
        <p style="color:var(--muted);font-size:.9rem;margin:8px 0 0">틀려서 점수가 기준 아래로 내려가면 등급도 내려가요.</p>
        <div class="row end" style="margin-top:14px"><button class="btn" id="save">저장하기</button></div>
      </div></div>`;
    $('#save').onclick = async () => {
      $$('tr[data-k]').forEach(tr => { const k = tr.dataset.k; $$('input', tr).forEach(inp => { c.points[k][inp.dataset.f] = Number(inp.value) || 0; }); c.points[k].cap = Math.max(1, c.points[k].cap); });
      $$('tr[data-l]').forEach(tr => { const i = Number(tr.dataset.l); c.levels[i].name = $('[data-f=name]', tr).value.trim() || c.levels[i].name; c.levels[i].min = i === 0 ? 0 : Number($('[data-f=min]', tr).value) || 0; });
      try { const r = await call('tSaveConfig', { config: c }); st.config = r.config; toast('저장했어요. 학생이 다시 들어오면 적용돼요.'); } catch (e) { toast(e.message); }
    };
  }

  /* 음성 확인 */
  function tabAudio() {
    const levels = D.levels.filter(L => L.sem === st.sem);
    $('#tabBody').innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">음성 확인</h3>
        <div class="tabs" style="margin:0">${['4-1', '4-2'].map(s => `<button data-sem="${s}" class="${st.sem === s ? 'on' : ''}">${s.replace('-', '학년 ')}학기</button>`).join('')}</div>
      </div>
      <p style="color:var(--muted);margin:6px 0 12px">문장마다 들어 보고 발음이 이상한 문장에 체크해 주세요. 체크한 목록을 복사해서 보내 주시면 고쳐요.</p>
      ${levels.map(L => `<h3 style="margin:16px 0 4px">${esc(L.name)}</h3><ul class="slist">${L.sentences.map(s => `<li>
        <span class="no">${s.no}</span><span class="tx">${esc(s.text)}<br><small style="color:var(--t-sound)">소리: ${esc(s.sound)}</small></span>
        <button class="play" data-p="${s.id}">🔊</button><button class="play" data-ps="${s.id}">🐢</button>
        <label class="toggle"><input type="checkbox" data-bad="${s.id}"> 이상함</label></li>`).join('')}</ul>`).join('')}
      <div class="row end" style="margin-top:12px"><button class="btn" id="copyBad">체크한 문장 복사</button></div></div>`;
    const find = id => D.levels.flatMap(L => L.sentences).find(s => s.id === id);
    $$('[data-p]').forEach(b => b.onclick = () => Sound.play(find(b.dataset.p)).catch(e => toast(e.message)));
    $$('[data-ps]').forEach(b => b.onclick = () => Sound.play(find(b.dataset.ps), true).catch(e => toast(e.message)));
    $$('[data-sem]').forEach(b => b.onclick = () => { st.sem = b.dataset.sem; tabAudio(); });
    $('#copyBad').onclick = async () => {
      const ids = $$('[data-bad]:checked').map(x => x.dataset.bad);
      const txt = ids.map(id => `${id} ${find(id).text}`).join('\n') || '(체크한 문장 없음)';
      try { await navigator.clipboard.writeText(txt); toast(`${ids.length}문장을 복사했어요.`); } catch (_) { prompt('아래 내용을 복사하세요', txt); }
    };
  }

  /* 시작 */
  (async function start() {
    let saved = '';
    try { saved = sessionStorage.getItem('dict_tpw') || ''; } catch (_) {}
    if (saved) {
      st.tpw = saved; $('#main').innerHTML = '<div class="spinner"></div>';
      try { await load(); render(); return; } catch (e) { showLogin(e.message); return; }
    }
    showLogin();
  })();
})();
