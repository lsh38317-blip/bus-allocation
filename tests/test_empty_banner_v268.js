const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

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

  // ── 관리자 로그인: retreat가 비어있는 상태(오프라인, 로컬캐시도 없음)이므로 배너가 표시되어야 함 ──
  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  window.switchPanel('home');
  await new Promise(r => setTimeout(r, 300));
  check('H1 홈 화면 빈배너 표시됨(관리자)', $('home-empty-banner').style.display === 'flex');
  check('H2 관리자 문구 정확', $('home-empty-msg').textContent === '수양회 참석인원 내역이 없습니다. 참석인원 관리를 확인해주세요', $('home-empty-msg').textContent);

  window.switchPanel('goalstatus');
  await new Promise(r => setTimeout(r, 300));
  check('H3 목표달성현황 빈배너 표시됨(관리자)', $('gs-empty-banner').style.display === 'flex');
  check('H4 관리자 문구 정확(목표달성현황)', $('gs-empty-msg').textContent === '수양회 참석인원 내역이 없습니다. 참석인원 관리를 확인해주세요', $('gs-empty-msg').textContent);

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));

  // ── 구역장 로그인: 비관리자 문구 확인 ──
  $('inp-id').value = 'user1';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '1교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('login-district-sel').value = '11구역';
  $('inp-pw').value = 'user1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  window.switchPanel('home');
  await new Promise(r => setTimeout(r, 300));
  check('H5 홈 화면 빈배너 표시됨(구역장)', $('home-empty-banner').style.display === 'flex');
  check('H6 비관리자 문구 정확', $('home-empty-msg').textContent === '수양회 참석인원 정보가 없습니다.', $('home-empty-msg').textContent);

  window.switchPanel('goalstatus');
  await new Promise(r => setTimeout(r, 300));
  check('H7 목표달성현황 빈배너 표시됨(구역장)', $('gs-empty-banner').style.display === 'flex');
  check('H8 비관리자 문구 정확(목표달성현황)', $('gs-empty-msg').textContent === '수양회 참석인원 정보가 없습니다.', $('gs-empty-msg').textContent);

  // ── 데이터가 있으면 배너 숨겨지는지(로컬캐시 시뮬레이션) ──
  window.localStorage.setItem('retreat_data', JSON.stringify([{name:'홍길동', year:'2026', parish:'1교구', district:'11구역'}]));
  window.loadData();
  await new Promise(r => setTimeout(r, 300));
  window.switchPanel('home');
  await new Promise(r => setTimeout(r, 300));
  check('H9 데이터 있으면 배너 숨겨짐', $('home-empty-banner').style.display === 'none');

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
