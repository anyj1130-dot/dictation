/* 교사 화면 */
(function () {
  'use strict';
  const { esc } = window.H;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const ACT_NAME = { study: '보고 쓰기', choice: '빈칸 고르기', spacing: '띄어 쓰기', find: '틀린 곳', sound: '소리→글자', test: '시험', review: '복습' };
  const HIDE_TYPES = new Set(['문장', '잘못 고름']);
  const st = { tpw: '', students: [], config: null, cls: '', tab: 'students', sem: (Data.grades[Data.grades.length - 1] || 4) + '-1' };

  function toast(msg, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2400); }
  // QR 코드 (cdnjs의 qrcodejs를 필요할 때만 불러와요)
  let qrLib = null;
  function drawQr(el, text, size) {
    const go = () => { el.innerHTML = ''; new QRCode(el, { text, width: size, height: size, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); };
    if (window.QRCode) return go();
    if (!qrLib) qrLib = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
    qrLib.then(go, () => { el.innerHTML = '<div class="muted" style="font-size:.85rem">QR을 불러오지 못했어요. 주소를 복사해서 쓰세요.</div>'; });
  }
  const call = (a, d) => API.call(a, Object.assign({ cls: st.cls, tpw: st.tpw }, d || {}));
  const semList = () => Data.grades.flatMap(g => [g + '-1', g + '-2']);
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '—';
  const levelShort = (key) => { const L = Data.levels.find(x => x.key === key); return L ? L.name.replace('기초 다지기 ', '기초') : key; };

  /* 로그인 · 학급 만들기 */
  function showLogin(msg) {
    const noServer = !API.serverUrl();
    $('#main').innerHTML = `<div class="login card">
      <div class="logo-tiles" style="grid-template-columns:repeat(2,40px)"><i style="background:var(--green)">교</i><i style="background:var(--red)">사</i></div><h1>교사 화면</h1>
      <label class="field"><span>학급</span><select id="cls" class="textin"><option value="">불러오는 중…</option></select></label>
      <label class="field"><span>교사 비밀번호</span><input id="tpw" type="password" autocomplete="off"></label>
      <button class="btn" id="go" style="width:100%">들어가기</button>
      <button class="btn ghost" id="newBtn" style="width:100%;margin-top:10px">새 학급 만들기</button>
      ${noServer && !API.isDemo() ? `<div class="msg warn">아직 내 서버(구글 시트)가 연결되지 않았어요. <a href="start.html" style="color:inherit;font-weight:800">처음 시작하는 방법 보기 →</a><br><small>둘러보기만 하려면 체험 모드 (체험반 / 비밀번호 1234 · 학교 코드 1234)</small></div><button class="btn ghost" id="demo" style="width:100%;margin-top:10px">체험 모드</button>` : ''}
      ${API.isDemo() ? `<div class="msg warn" style="margin-top:12px"><b>체험 모드</b> · 학급 <b>체험반</b> · 교사 비밀번호 <b>1234</b><br><small>새 학급을 만들어 볼 때 학교 코드도 <b>1234</b>예요. 기록은 이 기기에만 남아요.</small></div>` : ''}
      <div id="lmsg">${msg ? `<div class="msg bad">${esc(msg)}</div>` : ''}</div></div><div class="credit">문장 출처: 참쌤스쿨 × 모여봐욕 「22개정 차근차근 받아쓰기」 · <a href="https://chamssaem.com/516657" target="_blank" rel="noopener">원본 자료 보기 ↗</a></div>`;
    const fill = (list) => {
      $('#cls').innerHTML = list.length ? '<option value="">학급을 골라요</option>' + list.map(c => `<option ${c === st.cls ? 'selected' : ''}>${esc(c)}</option>`).join('') : '<option value="">아직 학급이 없어요 · 새 학급을 만들어 주세요</option>';
    };
    if (noServer && !API.isDemo()) fill([]);
    else API.call('classes').then(r => fill(r.classes || [])).catch(e => { fill([]); $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; });
    const go = async () => {
      st.cls = $('#cls').value; st.tpw = $('#tpw').value.trim();
      if (!st.cls) { $('#lmsg').innerHTML = '<div class="msg bad">학급을 먼저 골라 주세요.</div>'; return; }
      $('#lmsg').innerHTML = '<div class="spinner"></div>';
      try { await load(); remember(); render(); }
      catch (e) { $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
    };
    $('#go').onclick = go;
    $('#tpw').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) go(); });
    $('#newBtn').onclick = showCreate;
    if ($('#demo')) $('#demo').onclick = () => { API.setDemo(true); showLogin(); };
  }
  function showCreate() {
    $('#main').innerHTML = `<div class="login card">
      <h1 style="margin-bottom:6px">새 학급 만들기</h1>
      <p class="muted" style="margin:0">학교 코드는 앱을 설치한 선생님이 정한 코드예요. (시트 ‘설정’ 탭 B1)</p>
      <label class="field"><span>학교 코드</span><input id="code" type="password" autocomplete="off"></label>
      <label class="field"><span>학급 이름</span><input id="name" placeholder="예: 4학년 2반" autocomplete="off"></label>
      <label class="field"><span>교사 비밀번호 (4글자 이상)</span><input id="npw" type="password" autocomplete="off"></label>
      <label class="field"><span>교사 비밀번호 한 번 더</span><input id="npw2" type="password" autocomplete="off"></label>
      <button class="btn" id="make" style="width:100%">만들기</button>
      <button class="btn ghost" id="cancel" style="width:100%;margin-top:10px">돌아가기</button>
      <div id="lmsg"></div></div>`;
    $('#cancel').onclick = () => showLogin();
    $('#make').onclick = async () => {
      const code = $('#code').value.trim(), name = $('#name').value.trim(), pw = $('#npw').value.trim();
      if (pw !== $('#npw2').value.trim()) { $('#lmsg').innerHTML = '<div class="msg bad">두 비밀번호가 달라요.</div>'; return; }
      $('#lmsg').innerHTML = '<div class="spinner"></div>';
      try {
        await API.call('tCreateClass', { code, name, tpw: pw });
        st.cls = name; st.tpw = pw; st.tab = 'students';
        await load(); remember(); render(); toast('학급을 만들었어요. 이제 학생을 등록해 주세요.', 3000);
      } catch (e) { $('#lmsg').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
    };
  }
  function remember() { try { sessionStorage.setItem('dict_t', JSON.stringify({ cls: st.cls, tpw: st.tpw, server: API.serverUrl() })); } catch (_) {} }
  async function load() {
    await Data.loadAll();
    const r = await call('tInit');
    st.students = r.students; st.config = r.config;
  }

  /* 틀 */
  function render() {
    const tabs = [['students', '학생 관리'], ['progress', '진행 현황'], ['weak', '약점 분석'], ['report', '리포트'], ['points', '설정·QR'], ['audio', '음성 확인']];
    $('#me').innerHTML = `${API.isDemo() ? '<span class="pending">체험 모드</span>' : ''}<span class="rank"><span class="dot">반</span>${esc(st.cls)}</span><a class="linkbtn hide-sm" href="${API.isDemo() ? './?demo' : API.linkFor('')}">학생 화면</a><button class="linkbtn" id="out">나가기</button>`;
    $('#out').onclick = () => { try { sessionStorage.removeItem('dict_t'); } catch (_) {} API.setDemo(false); location.reload(); };
    $('#main').innerHTML = `
      <div class="tabs" style="margin:0">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="tabBody" style="margin-top:14px"></div>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; render(); });
    ({ students: tabStudents, progress: tabProgress, weak: tabWeak, report: tabReport, points: tabPoints, audio: tabAudio })[st.tab]();
  }

  /* 학생 관리 */
  function tabStudents() {
    const list = st.students.slice().sort((a, b) => (a.no || 999) - (b.no || 999));
    $('#tabBody').innerHTML = `
      <div class="card">
        <h3 style="margin:0 0 4px">학생 한꺼번에 등록</h3>
        <p class="muted" style="margin:0 0 8px;font-size:.92rem">한 줄에 한 명씩 <b>번호, 닉네임, 비밀번호</b> (엑셀에서 세 칸을 복사해 붙여 넣어도 돼요)</p>
        <textarea id="bulk" class="textin" rows="4" style="font-size:1rem" placeholder="1, 해님, 1234&#10;2, 달님, 5678"></textarea>
        <div class="row end" style="margin-top:8px"><button class="btn small" id="addStu">등록하기</button></div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3 style="margin:0 0 4px">${esc(st.cls)} · ${list.length}명</h3>
        <p class="muted" style="margin:0 0 8px;font-size:.92rem">번호·닉네임·비밀번호 칸을 바로 고치고 <b>저장</b>을 눌러요.</p>
        ${list.length ? `<div class="stulist">${list.map(s => `<div class="sturow" data-id="${esc(s.id)}">
            <input class="sno" data-f="no" value="${esc(s.no)}" inputmode="numeric" aria-label="번호">
            <input data-f="nick" value="${esc(s.nick)}" aria-label="닉네임" autocomplete="off" spellcheck="false">
            <input data-f="pw" value="${esc(s.pw)}" aria-label="비밀번호" autocomplete="off" spellcheck="false">
            <span class="sinfo">${s.points}점 · ${esc(s.level)} · ${fmtDate(s.last)}</span>
            <span class="sbtn"><button class="btn small" data-save>저장</button><button class="btn ghost small" data-del>삭제</button></span>
          </div>`).join('')}</div>` : '<div class="empty">아직 등록된 학생이 없어요.</div>'}
      </div>`;
    $('#addStu').onclick = async () => {
      const lines = $('#bulk').value.split(/\n/).map(l => l.trim()).filter(Boolean);
      const list2 = lines.map(l => l.split(/\s*[,\t]\s*|\s{2,}/)).map(a => a.length >= 3 ? { no: a[0], nick: a[1], pw: a[2] } : { no: '', nick: a[0], pw: a[1] }).filter(x => x.nick && x.pw);
      if (!list2.length) { toast('번호, 닉네임, 비밀번호 형식으로 써 주세요.'); return; }
      try {
        const r = await call('tAddStudents', { list: list2 });
        await load(); render();
        toast(`${r.added}명 등록${r.skipped && r.skipped.length ? ` · 이미 있는 닉네임 제외: ${r.skipped.join(', ')}` : ''}`, 4000);
      } catch (e) { toast(e.message); }
    };
    $$('[data-save]').forEach(b => b.onclick = async () => {
      const row = b.closest('.sturow'), id = row.dataset.id;
      const v = (f) => $(`[data-f="${f}"]`, row).value.trim();
      if (!v('nick') || !v('pw')) { toast('닉네임과 비밀번호를 비울 수 없어요.'); return; }
      b.disabled = true;
      try { await call('tUpdateStudent', { id, no: v('no'), nick: v('nick'), pw: v('pw') }); await load(); render(); toast('저장했어요.'); }
      catch (e) { toast(e.message); b.disabled = false; }
    });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const id = b.closest('.sturow').dataset.id, s = st.students.find(x => x.id === id);
      if (!confirm(`${s.nick} 학생을 지울까요? (기록은 시트에 남아요)`)) return;
      try { await call('tDeleteStudent', { id }); await load(); render(); } catch (e) { toast(e.message); }
    });
  }

  /* 진행 현황 · 약점 공통 데이터 */
  async function dashboard() {
    $('#tabBody').innerHTML = '<div class="spinner"></div>';
    const r = await call('tDashboard');
    return r.dash;
  }

  async function tabProgress() {
    let dash;
    try { dash = await dashboard(); } catch (e) { $('#tabBody').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; return; }
    const list = st.students.slice().sort((a, b) => (a.no || 999) - (b.no || 999));
    const levels = Data.levels.filter(L => L.sem === st.sem);
    $('#tabBody').innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h3 style="margin:0">학생별 진행 현황</h3>
          <div class="tabs" style="margin:0">${semList().map(s => `<button data-sem="${s}" class="${st.sem === s ? 'on' : ''}">${s.replace('-', '학년 ')}학기</button>`).join('')}</div>
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
    const list = st.students.slice().sort((a, b) => (a.no || 999) - (b.no || 999));
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

  /* ───────── 학생별 리포트 (인쇄) ───────── */
  const TYPE_TIP = {
    '받침': "받침이 뒤 글자로 넘어가 소리 나는 낱말(꽃이, 무릎이)을 '꽃+이'처럼 나누어 말해 보며 써 보게 해 주세요.",
    '겹받침': "'넓다, 밟다, 앉다'처럼 받침이 두 개인 낱말을 모아 소리와 글자를 비교해 보게 해 주세요.",
    '연음': "'얼굴이[얼구리]'처럼 소리 나는 낱말을 '얼굴+이'로 나누어 써 보게 해 주세요.",
    '된소리': "[꺼], [쏘]처럼 세게 소리 나도 글자는 예사소리로 쓰는 낱말을 함께 찾아보면 좋아요.",
    '거센소리': "ㅎ과 만나 [ㅋ·ㅌ·ㅊ·ㅍ]로 소리 나는 낱말(어떻게, 따뜻한)을 소리와 글자로 비교해 보게 해 주세요.",
    '구개음화': "'같이[가치]', '닫혀[다처]'처럼 소리와 글자가 다른 낱말을 따로 모아 익히게 해 주세요.",
    '사이시옷': "'햇살, 빗방울'처럼 두 낱말 사이에 ㅅ이 들어가는 말을 모아 보게 해 주세요.",
    '모음': "'ㅐ/ㅔ', 'ㅚ/ㅙ/ㅞ'처럼 소리가 비슷한 모음을 천천히 또박또박 읽고 쓰게 해 주세요.",
    '띄어쓰기': "문장을 읽을 때 쉬는 곳에서 손뼉을 치며 낱말 단위를 느껴 보게 해 주세요.",
    '문장부호': "문장을 다 쓴 뒤 끝에 온점·물음표·느낌표를 찍었는지 스스로 확인하는 습관을 길러 주세요.",
    '헷갈리는 말': "'반드시/반듯이', '작다/적다'처럼 헷갈리는 낱말을 뜻과 함께 짝지어 익히게 해 주세요.",
    '준말': "'되어→돼', '주어→줘'처럼 줄어든 말을 원래 말로 늘려 보며 확인하게 해 주세요.",
    '소리 나는 대로': "소리 나는 대로 쓰는 실수가 많아요. 낱말을 또박또박 끊어 읽은 뒤 쓰게 해 주세요."
  };
  const noteKey = (id) => 'dict_note|' + st.cls + '|' + id;
  const getNote = (id) => { try { return localStorage.getItem(noteKey(id)) || ''; } catch (_) { return ''; } };
  const setNote = (id, v) => { try { localStorage.setItem(noteKey(id), v); } catch (_) {} };

  async function tabReport() {
    let dash;
    try { dash = await dashboard(); } catch (e) { $('#tabBody').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; return; }
    const list = st.students.slice().sort((a, b) => (a.no || 999) - (b.no || 999));
    $('#tabBody').innerHTML = `
      <div class="card no-print">
        <h3 style="margin:0 0 4px">학생별 학습 리포트</h3>
        <p class="muted" style="margin:0 0 12px;font-size:.92rem">학생을 고르고 ‘리포트 만들기’를 누르면 한 장에 한 명씩 인쇄할 수 있어요. 학부모 상담이나 기록 자료로 쓰세요.</p>
        <div class="row" style="gap:8px;margin-bottom:10px"><button class="btn ghost small" id="rpAll">모두 고르기</button><button class="btn ghost small" id="rpNone">모두 빼기</button></div>
        <div class="rpick">${list.map(s => `<label><input type="checkbox" value="${esc(s.id)}" checked> <span>${esc(s.no || '')}</span> ${esc(s.nick)}</label>`).join('') || '<div class="empty">학생이 없어요.</div>'}</div>
        <div class="row end" style="margin-top:12px;gap:8px"><button class="btn" id="rpMake">리포트 만들기</button></div>
      </div>
      <div id="rpBar" class="row no-print" style="justify-content:space-between;margin:16px 0 10px;display:none">
        <span class="muted" id="rpCount"></span>
        <button class="btn" id="rpPrint">🖨 인쇄하기</button>
      </div>
      <div id="reports"></div>`;
    $('#rpAll').onclick = () => $$('.rpick input').forEach(i => i.checked = true);
    $('#rpNone').onclick = () => $$('.rpick input').forEach(i => i.checked = false);
    $('#rpMake').onclick = () => {
      const ids = $$('.rpick input:checked').map(i => i.value);
      if (!ids.length) { toast('학생을 한 명 이상 골라 주세요.'); return; }
      const picked = list.filter(s => ids.includes(s.id));
      $('#reports').innerHTML = picked.map(s => reportHTML(s, dash[s.id] || {})).join('');
      $('#rpBar').style.display = 'flex';
      $('#rpCount').textContent = `${picked.length}명 · 선생님 한마디 칸은 눌러서 바로 쓸 수 있어요 (이 컴퓨터에 저장돼요).`;
      $$('#reports [data-note]').forEach(el => el.oninput = () => setNote(el.dataset.note, el.innerText));
      $('#rpBar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#rpPrint').onclick = () => { fitReports(); window.print(); };
    window.onbeforeprint = fitReports;
  }

  // 한 장에 들어가도록: A4 인쇄 영역(190×277mm ≈ 718×1047px)보다 길면 그만큼 줄여요
  function fitReports() {
    $$('#reports .report').forEach(r => {
      r.style.removeProperty('--fit');
      const cs = getComputedStyle(r), h = r.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = r.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const pageH = 1040 * (w / 718);   // 화면 너비 기준으로 환산
      r.style.setProperty('--fit', Math.min(1, pageH / h).toFixed(3));
    });
  }
  function reportHTML(s, d) {
    const today = new Date().toLocaleDateString('sv-SE');
    const levels = (st.config.levels || []).slice().sort((a, b) => a.min - b.min);
    let li = 0; levels.forEach((l, k) => { if (s.points >= l.min) li = k; });
    const next = levels[li + 1];
    const days = Object.keys(d.byDay || {}).sort();
    const rate = d.items ? Math.round(d.right / d.items * 100) : null;
    // 유형별
    const types = Object.entries(d.types || {}).filter(([t]) => !HIDE_TYPES.has(t))
      .map(([t, [r, w]]) => ({ t, n: r + w, rate: Math.round(r / (r + w) * 100) })).filter(x => x.n > 0).sort((a, b) => a.rate - b.rate || b.n - a.n);
    const enough = types.filter(x => x.n >= 5);
    const weak = enough.filter(x => x.rate < 80).slice(0, 2);
    const strong = enough.slice().sort((a, b) => b.rate - a.rate || b.n - a.n).filter(x => x.rate >= 90 && !weak.includes(x)).slice(0, 2);
    // 시험
    const sems = [];
    Data.grades.forEach(g => [g + '-1', g + '-2'].forEach(sem => {
      const Ls = Data.levels.filter(L => L.sem === sem);
      if (Ls.some(L => d.tests && d.tests[L.key] !== undefined)) sems.push({ sem, Ls });
    }));
    // 최근 8주 활동 (월요일 시작)
    const mon = (dt) => { const x = new Date(dt); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const weeks = []; const w0 = mon(new Date());
    for (let k = 7; k >= 0; k--) { const a = new Date(w0); a.setDate(a.getDate() - 7 * k); weeks.push({ a, n: 0 }); }
    days.forEach(day => { const t = mon(new Date(day + 'T00:00:00')).getTime(); const w = weeks.find(x => x.a.getTime() === t); if (w) w.n += d.byDay[day]; });
    const wmax = Math.max(1, ...weeks.map(w => w.n));
    const acts = Object.entries(ACT_NAME).map(([k, n]) => `<span>${esc(n)} <b>${(d.acts || {})[k] || 0}</b></span>`).join('');
    // 요약 문장
    let summary;
    if (!d.items || d.items < 10) summary = '아직 기록이 많지 않아요. 조금 더 연습한 뒤에 다시 보면 강점과 약점이 더 또렷하게 보여요.';
    else {
      summary = '';
      if (strong.length) { const last = strong[strong.length - 1].t; summary += `${strong.map(x => `‘${esc(x.t)}’`).join(', ')}${window.H.josa(last, '은/는').slice(last.length)} 정확하게 잘 써요. `; }
      if (weak.length) summary += `${weak.map(x => `‘${esc(x.t)}’`).join(', ')} 유형에서 자주 틀려요.`;
      else summary += '눈에 띄게 약한 유형 없이 고르게 잘하고 있어요.';
    }
    const tips = weak.map(x => TYPE_TIP[x.t]).filter(Boolean);
    return `<section class="report">
      <div class="rp-head">
        <div><div class="rp-title">받아쓰기 학습 리포트</div>
          <div class="rp-sub">${esc(st.cls)} · ${esc(s.no || '')}번 · <b>${esc(s.nick)}</b></div></div>
        <div class="rp-date">출력일 ${today}${days.length ? `<br>기록 ${days[0]} ~ ${days[days.length - 1]}` : ''}</div>
      </div>
      <div class="rp-stats">
        <div><small>등급</small><b>Lv.${li + 1} ${esc(levels[li] ? levels[li].name : '')}</b><span>${s.points}점${next ? ` · 다음 등급까지 ${next.min - s.points}점` : ''}</span></div>
        <div><small>연습한 날</small><b>${days.length}일</b><span>마지막 ${d.lastDay || '—'}</span></div>
        <div><small>활동</small><b>${d.rounds || 0}회</b><span>시험 ${(d.acts || {}).test || 0}회</span></div>
        <div><small>낱말 정답률</small><b>${rate === null ? '—' : rate + '%'}</b><span>${d.items || 0}문항</span></div>
      </div>
      <div class="rp-summary">${summary}</div>
      <div class="rp-grid">
        <div class="rp-box"><h4>유형별 정답률</h4>
          ${types.length ? `<div class="rp-bars">${types.map(x => `<div class="${weak.includes(x) ? 'weak' : ''}"><span>${esc(x.t)}</span><i><em style="width:${x.rate}%"></em></i><b>${x.rate}%</b><small>${x.n}</small></div>`).join('')}</div>
            <p class="rp-note">오른쪽 작은 숫자는 푼 문항 수예요. 문항이 적으면 정답률이 크게 흔들릴 수 있어요.</p>` : '<p class="rp-empty">아직 기록이 없어요.</p>'}
        </div>
        <div class="rp-box"><h4>자주 틀린 낱말</h4>
          ${(d.words || []).length ? `<table class="rp-t"><tr><th>낱말</th><th>유형</th><th>틀림</th><th>최근</th></tr>${d.words.slice(0, 10).map(w => `<tr><td><b>${esc(w[0])}</b></td><td>${esc(w[1])}</td><td>${w[2]}번</td><td>${w[4] ? '<span class="ok">○ 맞힘</span>' : '<span class="bad">× 틀림</span>'}</td></tr>`).join('')}</table>
            <p class="rp-note">‘최근’은 그 낱말을 마지막으로 풀었을 때의 결과예요.</p>` : '<p class="rp-empty">틀린 낱말이 없어요.</p>'}
        </div>
      </div>
      <div class="rp-box rp-tests"><h4>받아쓰기 시험 최고 점수</h4>
        ${sems.length ? sems.map(x => `<div class="rp-sem"><span class="lab">${x.sem.replace('-', '학년 ')}학기</span><div class="cells">${x.Ls.map(L => { const v = d.tests[L.key]; return `<span class="${v === undefined ? 'none' : v === 100 ? 'full' : v < 60 ? 'low' : ''}"><small>${esc(L.name.replace('기초 다지기 ', '기초'))}</small>${v === undefined ? '·' : v}</span>`; }).join('')}</div></div>`).join('') : '<p class="rp-empty">아직 시험을 보지 않았어요.</p>'}
      </div>
      <div class="rp-grid">
        <div class="rp-box"><h4>최근 8주 활동</h4>
          <div class="rp-weeks">${weeks.map(w => `<div><b>${w.n || ''}</b><i style="height:${Math.round(w.n / wmax * 100)}%"></i><small>${w.a.getMonth() + 1}/${w.a.getDate()}</small></div>`).join('')}</div>
          <div class="rp-acts">${acts}</div>
        </div>
        <div class="rp-box rp-tips"><h4>가정에서 이렇게 도와주세요</h4>
          ${tips.length ? `<ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p style="margin:0">${d.items >= 10 ? '지금처럼 매일 조금씩 소리 내어 읽고 써 보게 해 주세요. 틀린 낱말은 앱의 ‘오답 노트’에서 다시 연습할 수 있어요.' : '하루 10분씩 앱에서 연습하도록 격려해 주세요. 기록이 쌓이면 더 자세한 도움말을 드릴 수 있어요.'}</p>`}
        </div>
      </div>
      <div class="rp-box rp-teacher"><h4>선생님 한마디</h4><div class="rp-write" contenteditable="true" data-note="${esc(s.id)}">${esc(getNote(s.id))}</div></div>
      <div class="rp-foot">차근차근 받아쓰기 · 문장 출처: 참쌤스쿨 × 모여봐욕 「22개정 차근차근 받아쓰기」</div>
    </section>`;
  }

  /* 포인트 설정 */
  function tabPoints() {
    const c = JSON.parse(JSON.stringify(st.config));
    const keys = Object.keys(c.points);
    $('#tabBody').innerHTML = `      <div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 4px">학생 접속 주소 · QR 코드</h3>
        <p class="muted" style="margin:0 0 10px;font-size:.92rem">학생들은 이 주소(또는 QR)로 한 번만 들어오면 다음부터 태블릿이 기억해요.</p>
        <div class="qrbox"><div id="qr" class="qr"></div>
          <div style="flex:1;min-width:220px"><input class="textin" id="stuLink" readonly style="font-size:.9rem">
            <div class="row" style="margin-top:8px"><button class="btn small" id="copyLink">주소 복사</button><button class="btn ghost small" id="bigQr">QR 크게 보기</button></div></div></div></div>
<div class="grid g2">
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
        <div id="lvTable">${levelRows(c.levels)}</div>
        <p style="color:var(--muted);font-size:.9rem;margin:8px 0 0">틀려서 점수가 기준 아래로 내려가면 등급도 내려가요.</p>
        <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn ghost small" id="lvDefault">기본 등급표(12단계)로 바꾸기</button><button class="btn" id="save">저장하기</button></div>
      </div></div>
      <div class="card" style="margin-top:14px"><h3 style="margin:0 0 8px">교사 비밀번호 바꾸기</h3>
        <div class="row"><input class="textin" id="newPw" type="password" placeholder="새 비밀번호 (4글자 이상)" style="flex:1;min-width:180px;font-size:1rem"><button class="btn small" id="chPw">바꾸기</button></div></div>`;
    const stuLink = API.isDemo() ? location.origin + location.pathname.replace(/[^/]*$/, '') + '?demo' : API.linkFor('');
    $('#stuLink').value = stuLink;
    drawQr($('#qr'), stuLink, 150);
    $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText(stuLink); toast('주소를 복사했어요.'); } catch (_) { $('#stuLink').select(); document.execCommand('copy'); toast('주소를 복사했어요.'); } };
    $('#bigQr').onclick = () => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="box" style="max-width:560px"><h2 style="margin:0 0 4px">${esc(st.cls)} 받아쓰기</h2><p class="muted" style="margin:0 0 12px">카메라로 찍어서 들어와요</p><div id="qrBig" class="qr" style="margin:0 auto"></div><p style="word-break:break-all;font-size:.85rem;color:var(--muted)">${esc(stuLink)}</p><button class="btn" style="width:100%">닫기</button></div>`;
      document.body.appendChild(m); drawQr($('#qrBig'), stuLink, Math.min(420, window.innerWidth - 80));
      m.querySelector('button').onclick = () => m.remove();
    };
    $('#lvDefault').onclick = () => {
      if (!confirm('등급 기준을 기본 등급표(백성 → 세종대왕, 12단계)로 바꿀까요? ‘저장하기’를 눌러야 적용돼요.')) return;
      c.levels = JSON.parse(JSON.stringify(API.DEFAULT_LEVELS));
      $('#lvTable').innerHTML = levelRows(c.levels);
      toast('바꿨어요. ‘저장하기’를 눌러 주세요.');
    };
    $('#chPw').onclick = async () => {
      const newPw = $('#newPw').value.trim();
      try { await call('tChangeTeacherPw', { newPw }); st.tpw = newPw; remember(); $('#newPw').value = ''; toast('교사 비밀번호를 바꿨어요.'); } catch (e) { toast(e.message); }
    };
    $('#save').onclick = async () => {
      $$('tr[data-k]').forEach(tr => { const k = tr.dataset.k; $$('input', tr).forEach(inp => { c.points[k][inp.dataset.f] = Number(inp.value) || 0; }); c.points[k].cap = Math.max(1, c.points[k].cap); });
      $$('tr[data-l]').forEach(tr => { const i = Number(tr.dataset.l); c.levels[i].name = $('[data-f=name]', tr).value.trim() || c.levels[i].name; c.levels[i].min = i === 0 ? 0 : Number($('[data-f=min]', tr).value) || 0; });
      try { const r = await call('tSaveConfig', { config: c }); st.config = r.config; toast('저장했어요. 학생이 다시 들어오면 적용돼요.'); } catch (e) { toast(e.message); }
    };
  }

  function levelRows(levels) {
    return `<table class="t"><tr><th>레벨</th><th>등급</th><th class="num">필요 점수</th></tr>
      ${levels.map((l, i) => `<tr data-l="${i}"><td class="num" style="color:var(--muted)">${i + 1}</td><td><input data-f="name" value="${esc(l.name)}" style="width:130px"></td><td class="num"><input type="number" data-f="min" value="${l.min}" style="width:90px" ${i === 0 ? 'disabled' : ''}></td></tr>`).join('')}</table>`;
  }

  /* 음성 확인 */
  function tabAudio() {
    const levels = Data.levels.filter(L => L.sem === st.sem);
    levels.forEach(L => Sound.preload(L.key));
    $('#tabBody').innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">음성 확인</h3>
        <div class="tabs" style="margin:0">${semList().map(s => `<button data-sem="${s}" class="${st.sem === s ? 'on' : ''}">${s.replace('-', '학년 ')}학기</button>`).join('')}</div>
      </div>
      <p style="color:var(--muted);margin:6px 0 12px">문장마다 들어 보고 발음이 이상한 문장에 체크해 주세요. 체크한 목록을 복사해서 보내 주시면 고쳐요.</p>
      ${levels.map(L => `<h3 style="margin:16px 0 4px">${esc(L.name)}</h3><ul class="slist">${L.sentences.map(s => `<li>
        <span class="no">${s.no}</span><span class="tx">${esc(s.text)}<br><small style="color:var(--t-sound)">소리: ${esc(s.sound)}</small></span>
        <button class="play" data-p="${s.id}">🔊</button><button class="play" data-ps="${s.id}">🐢</button>
        <label class="toggle"><input type="checkbox" data-bad="${s.id}"> 이상함</label></li>`).join('')}</ul>`).join('')}
      <div class="row end" style="margin-top:12px"><button class="btn" id="copyBad">체크한 문장 복사</button></div></div>`;
    const find = id => Data.levels.flatMap(L => L.sentences).find(s => s.id === id);
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
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('dict_t') || 'null'); } catch (_) {}
    if (saved && saved.cls && (API.isDemo() || saved.server === API.serverUrl())) {
      st.cls = saved.cls; st.tpw = saved.tpw; $('#main').innerHTML = '<div class="spinner"></div>';
      try { await load(); render(); return; } catch (e) { showLogin(e.message); return; }
    }
    showLogin();
  })();
})();
