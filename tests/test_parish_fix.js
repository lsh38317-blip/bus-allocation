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

  // 교구장(parish1, 1교구) 로그인, 로그인화면에서 구역 12구역 선택
  $('inp-id').value = 'parish1';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '1교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('login-district-sel').value = '12구역';
  $('inp-pw').value = 'parish1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  // ① sessionStorage: district는 비어있고 loginDistrict만 채워져야 함(회귀버그 수정 검증)
  const sess = JSON.parse(window.sessionStorage.getItem('retreat_session')||'{}');
  check('P1 세션 district는 비어있음(교구장은 고정구역 없음)', sess.district === '', sess);
  check('P2 세션 loginDistrict는 선택값 보관', sess.loginDistrict === '12구역', sess);

  // ② 배정인원현황: 구역 기본값 12구역, 잠금 안 됨(수정 가능)
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('P3 배정인원현황 s-district 기본값=12구역', $('s-district').value === '12구역', $('s-district').value);
  check('P4 배정인원현황 s-district 잠금 안됨(자유선택)', $('s-district').disabled === false);
  // 실제로 다른 구역으로 자유롭게 바꿀 수 있는지
  $('s-district').value = '13구역';
  check('P5 다른 구역으로 자유 변경 가능', $('s-district').value === '13구역');

  // ③ [v255] 버스배정현황: 관리자 전용으로 변경되어 교구장은 접근 차단되어야 함
  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 400));
  check('P6 교구장 버스배정현황 접근 차단(nav 숨김)', $('nav-bus-view').style.display === 'none');
  check('P7 교구장 버스배정현황 패널 진입 안됨', !$('panel-busview').classList.contains('active'));

  // ④ 숙소배정현황: 구역 기본값 12구역, 잠금 안 됨
  window.switchPanel('roomview');
  await new Promise(r => setTimeout(r, 400));
  check('P8 숙소배정현황 rv-s-district 기본값=12구역', $('rv-s-district').value === '12구역', $('rv-s-district').value);
  check('P9 숙소배정현황 rv-s-district 잠금 안됨', $('rv-s-district').disabled === false);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
