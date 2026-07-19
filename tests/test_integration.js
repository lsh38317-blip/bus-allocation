const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const { window } = dom;
  // 네트워크 비활성 환경 — GAS 호출은 항상 실패 처리(앱 코드의 기존 catch 경로로 정상 처리됨)
  window.fetch = () => Promise.reject(new Error('네트워크 비활성(테스트 환경)'));

  // crypto.subtle 미지원 환경 대비 - 실패해도 catch로 평문비교 폴백되므로 OK
  // 콘솔 에러 캡처
  window.console.error = (...args) => { /* swallow during boot noise if needed */ console.error('[page]', ...args); };

  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  // DOMContentLoaded 리스너들이 처리될 시간 확보
  await new Promise(r => setTimeout(r, 300));

  const $ = (id) => window.document.getElementById(id);
  const results = [];
  function check(label, cond, extra) {
    results.push({ label, pass: !!cond, extra });
  }

  // ── 테스트 1: 구역장(user1, 1교구/11구역) 정상 로그인 → 자료검색 필터 고정 확인 ──
  $('inp-id').value = 'user1';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '1교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('login-district-sel').value = '11구역'; // 기본계정 데이터의 district 값 그대로 사용(11~15 목록에는 없지만 계정 매칭용)
  $('inp-pw').value = 'user1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  check('T1-1 로그인 성공(앱 화면 표시)', $('app-page').style.display === 'block');

  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T1-2 s-parish=1교구', $('s-parish').value === '1교구', $('s-parish').value);
  check('T1-3 s-parish 잠김(구역장)', $('s-parish').disabled === true);
  check('T1-4 s-district=11구역', $('s-district').value === '11구역', $('s-district').value);
  check('T1-5 s-district 잠김(구역장)', $('s-district').disabled === true);

  // 다른 패널 갔다가 재진입 시에도 s-district 유지되는지(기존 버그: 패널 재진입시 district 미재설정)
  window.switchPanel('home', true);
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T1-6 재진입 후 s-district 유지', $('s-district').value === '11구역', $('s-district').value);

  // ── 테스트 2: [v255] 버스배정현황은 관리자 전용으로 변경 — 구역장은 접근 차단되어야 함 ──
  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 400));
  check('T2-1 구역장은 버스배정현황 접근 차단(nav 숨김)', $('nav-bus-view').style.display === 'none');
  check('T2-2 구역장은 버스배정현황 패널 진입 안됨', !$('panel-busview').classList.contains('active'));

  // ── 테스트 3: 숙소배정현황 화면 교구/구역 콤보 확인 ──
  window.switchPanel('roomview');
  await new Promise(r => setTimeout(r, 400));
  check('T3-1 rv-s-parish=1교구', $('rv-s-parish').value === '1교구', $('rv-s-parish').value);
  check('T3-2 rv-s-parish 잠김(구역장)', $('rv-s-parish').disabled === true);
  check('T3-3 rv-s-district=11구역', $('rv-s-district').value === '11구역', $('rv-s-district').value);
  check('T3-4 rv-s-district 잠김(구역장)', $('rv-s-district').disabled === true);

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));

  // ── 테스트 6 (핵심 버그 수정 검증): 계정 데이터(교구/구역)가 완전히 비어있는
  //    구역장 계정 로그인 → 차단되지 않고, 로그인화면에서 선택한 교구/구역이 그대로 반영되는지 ──
  $('inp-id').value = 'user3';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '3교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('login-district-sel').value = '31구역';
  $('inp-pw').value = 'user3234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));
  check('T6-1 계정데이터 없어도 로그인 차단되지 않음', $('app-page').style.display === 'block');

  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T6-2 로그인 선택값(3교구)이 s-parish에 반영', $('s-parish').value === '3교구', $('s-parish').value);
  check('T6-3 로그인 선택값(31구역)이 s-district에 반영', $('s-district').value === '31구역', $('s-district').value);
  check('T6-4 구역장이므로 잠김 처리도 정상 적용', $('s-parish').disabled === true && $('s-district').disabled === true);

  // ── 테스트 7: sessionStorage에도 로그인 선택값이 저장되는지 (새로고침 복원의 전제조건) ──
  const savedSession = JSON.parse(window.sessionStorage.getItem('retreat_session') || '{}');
  check('T7-1 sessionStorage에 선택한 교구 저장됨', savedSession.parish === '3교구', savedSession);
  check('T7-2 sessionStorage에 선택한 구역 저장됨', savedSession.district === '31구역', savedSession);

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));

  // ── 테스트 8: ACCOUNTS 원본 오염 방지 검증 — user3로 다른 교구를 선택해 재로그인해도
  //    정상 동작해야 함 (직전 로그인 값이 원본 계정 데이터에 영구 반영되면 안 됨) ──
  $('inp-id').value = 'user3';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '4교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('login-district-sel').value = '41구역';
  $('inp-pw').value = 'user3234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));
  check('T8-1 재로그인(다른 교구 선택) 성공 — 원본 미오염 확인', $('app-page').style.display === 'block');
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T8-2 새 선택값(4교구)으로 정상 반영', $('s-parish').value === '4교구', $('s-parish').value);

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));


  $('inp-id').value = 'parish1';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('login-parish-sel').value = '1교구';
  window.onLoginParishChange();
  await new Promise(r => setTimeout(r, 20));
  // 교구장 계정은 district가 ''이므로 로그인화면에서 구역을 아무거나 선택해도 이중검증 통과(acc.district가 falsy)
  const distOpts = Array.from($('login-district-sel').options).map(o=>o.value).filter(v=>v && v!=='전체');
  $('login-district-sel').value = distOpts[0];
  $('inp-pw').value = 'parish1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));
  check('T4-1 교구장 로그인 성공', $('app-page').style.display === 'block');

  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T4-2 교구장 s-parish=1교구(기본값)', $('s-parish').value === '1교구', $('s-parish').value);
  check('T4-3 교구장 s-parish 잠금 안됨(자유선택 정책)', $('s-parish').disabled === false);
  check('T4-4 교구장 s-district 잠금 안됨(구역 자유)', $('s-district').disabled === false);

  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 400));
  check('T4-5 교구장도 버스배정현황 접근 차단(nav 숨김)', $('nav-bus-view').style.display === 'none');

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));

  // ── 테스트 5: 관리자 로그인 → 모든 select 자유, 기본값 강제 없음 ──
  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));
  check('T5-1 관리자 로그인 성공', $('app-page').style.display === 'block');

  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  check('T5-2 관리자 s-parish 잠금없음', $('s-parish').disabled === false);
  check('T5-3 관리자는 값이 강제되지 않고 직접 초기화 가능', (function(){
    window.clearSearch();
    return $('s-parish').value === '';
  })());

  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 400));
  check('T5-4 관리자 bv-s-parish 잠금없음', $('bv-s-parish').disabled === false);
  check('T5-5 관리자 bv-s-district 잠금없음', $('bv-s-district').disabled === false);

  window.switchPanel('roomview');
  await new Promise(r => setTimeout(r, 400));
  check('T5-6 관리자 rv-s-parish 잠금없음', $('rv-s-parish').disabled === false);

  // 결과 출력
  let fail = 0;
  results.forEach(r => {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.label + (r.extra !== undefined ? ' (got: ' + JSON.stringify(r.extra) + ')' : ''));
    if (!r.pass) fail++;
  });
  console.log('\n총 ' + results.length + '건 중 ' + (results.length - fail) + '건 통과, ' + fail + '건 실패');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });
