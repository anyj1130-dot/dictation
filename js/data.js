/* 학년별 문장 데이터: 필요한 학년 파일(data/g3.js 등)만 불러와서 한곳에 모아요 */
(function (G) {
  'use strict';
  const Data = {
    grades: (G.GRADES || [4]).slice().sort((a, b) => a - b),
    levels: [], all: [], byId: {}, level: {}, types: [],
    loaded: {},
    gradeOf(id) { const m = String(id).match(/^(\d+)-/); return m ? Number(m[1]) : null; },
    load(g) {
      g = Number(g);
      if (this.loaded[g]) return this.loaded[g];
      this.loaded[g] = new Promise((resolve, reject) => {
        const done = () => { this._merge(g); resolve(); };
        if (G.DICT_G && G.DICT_G[g]) return done();
        const sc = document.createElement('script');
        sc.src = 'data/g' + g + '.js?v=' + Date.now();
        sc.onload = () => (G.DICT_G && G.DICT_G[g]) ? done() : reject(new Error(g + '학년 데이터를 읽지 못했어요.'));
        sc.onerror = () => { delete this.loaded[g]; reject(new Error(g + '학년 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
        document.head.appendChild(sc);
      });
      return this.loaded[g];
    },
    loadMany(list) { return Promise.all([...new Set(list.map(Number))].filter(g => this.grades.includes(g)).map(g => this.load(g))); },
    loadAll() { return this.loadMany(this.grades); },
    _merge(g) {
      const D = G.DICT_G[g];
      D.levels.forEach(L => {
        if (this.level[L.key]) return;
        L.grade = L.grade || g;
        L.sentences.forEach(s => { s.level = L.key; this.byId[s.id] = s; this.all.push(s); });
        this.level[L.key] = L;
        this.levels.push(L);
      });
      this.levels.sort((a, b) => (a.grade - b.grade) || a.sem.localeCompare(b.sem) || (a.order - b.order));
      (D.types || []).forEach(t => { if (!this.types.includes(t)) this.types.push(t); });
    }
  };
  G.Data = Data;
})(window);
