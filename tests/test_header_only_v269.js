const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('네트워크 비활성(테스트 환경)'));
  window.console.error = () => {};
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  await new Promise(r => setTimeout(r, 300));
  const $ = (id) => window.document.getElementById(id);
  const results = [];
  function check(label, cond, extra) { results.push({label, pass: !!cond, extra}); }

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  // ── 데이터 없음(0건) 상태: 홈 화면 그리드는 헤더만, 바디는 비어있어야 함 ──
  window.switchPanel('home');
  await new Promise(r => setTimeout(r, 300));
  check('N1 빈배너 표시됨', $('home-empty-banner').style.display === 'flex');
  const t1 = $('home-table1').querySelector('table');
  check('N2 표1: thead 존재', t1 && t1.querySelector('thead') !== null);
  check('N3 표1: tbody가 비어있음(데이터 행 없음)', t1 && t1.querySelector('tbody').children.length === 0, t1 && t1.querySelector('tbody').innerHTML);
  const t2 = $('home-table2').querySelector('table');
  check('N4 표2: tbody가 비어있음', t2 && t2.querySelector('tbody').children.length === 0);

  window.switchPanel('goalstatus');
  await new Promise(r => setTimeout(r, 300));
  check('N5 목표달성현황 빈배너 표시됨', $('gs-empty-banner').style.display === 'flex');
  const gt = $('gs-table').querySelector('table');
  check('N6 목표달성현황: tbody가 비어있음(총계 행도 없음)', gt && gt.querySelector('tbody').children.length === 0, gt && gt.querySelector('tbody').innerHTML.slice(0,100));
  check('N7 목표달성현황: thead는 정상 존재', gt && gt.querySelector('thead').textContent.indexOf('구역')>=0);

  // ── 데이터가 있으면 정상적으로 행이 표시되는지(회귀 확인) ──
  window.localStorage.setItem('retreat_data', JSON.stringify([
    {name:'홍길동', year:'2026', parish:'1교구', district:'11구역', group:'봉사회', salvCode:''}
  ]));
  window.loadData();
  await new Promise(r => setTimeout(r, 300));
  window.switchPanel('home');
  await new Promise(r => setTimeout(r, 300));
  const t1b = $('home-table1').querySelector('table');
  check('N8 데이터 있으면 표1 tbody에 행 생김', t1b && t1b.querySelector('tbody').children.length > 0, t1b && t1b.querySelector('tbody').children.length);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
