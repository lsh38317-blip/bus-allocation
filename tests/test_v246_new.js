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

  // ── 항목1: 로그인 힌트 문구 ──
  const hintText = window.document.querySelector('.login-hint').textContent;
  check('L1 교구장/구역장 ID:user 문구 포함', hintText.indexOf('교구장/구역장') >= 0 && hintText.indexOf('ID : user') >= 0, hintText.slice(0,200));
  check('L2 안내 문구(볼드) 포함', hintText.indexOf('교구장과 구역장님 로그인시 소속 교구와 구역을 선택하여 로그인 해주세요') >= 0);
  const boldEl = Array.from(window.document.querySelectorAll('.login-hint b')).find(b => b.textContent.indexOf('선택하여 로그인') >= 0);
  check('L3 안내 문구가 <b> 태그로 감싸짐', !!boldEl);

  // ── 항목4: 상단바 전참자 삭제 확인 ──
  check('T1 st-prev 요소 삭제됨', $('st-prev') === null);
  check('T2 st-total-label 요소 존재', $('st-total-label') !== null);

  // 관리자 로그인 → 라벨 = 강서교회 접수현황
  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));
  window.updateStats();
  check('T3 관리자 라벨=강서교회 접수현황', $('st-total-label').textContent === '강서교회 접수현황', $('st-total-label').textContent);

  window.doLogout();
  await new Promise(r => setTimeout(r, 100));

  // 구역장 로그인 → 라벨 = {교구} 접수현황
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
  window.updateStats();
  check('T4 구역장 라벨=1교구 접수현황', $('st-total-label').textContent === '1교구 접수현황', $('st-total-label').textContent);

  // ── 항목2: 배정인원등록 레이아웃 재배치 확인 ──
  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));
  const cardHeader = window.document.querySelector('#panel-enroll .card-header');
  const hasButtonsInHeader = cardHeader && cardHeader.querySelector('#enroll-save-btn') !== null;
  check('U1 [v255] 신청버튼은 card-header 밖(연락처 아래)에 위치', !hasButtonsInHeader);
  const saveBtn = $('enroll-save-btn');
  check('U1b 신청버튼 텍스트가 "신청"으로 변경됨', saveBtn && saveBtn.textContent.indexOf('신청')>=0, saveBtn && saveBtn.textContent);
  const hrCount = window.document.querySelectorAll('#panel-enroll hr').length;
  check('U2 중앙 구분선 1개만 존재(기존 2개→1개로 압축)', hrCount === 1, hrCount);
  // 상단 그룹 필드 존재 확인
  ['enroll-year','enroll-retreat-type','enroll-event','enroll-parish','enroll-district','enroll-name','enroll-group','enroll-salv-code','enroll-gender'].forEach(function(id){
    check('U3-'+id+' 존재', $(id) !== null);
  });
  ['enroll-arrive-date','enroll-leave-date','enroll-arrive-transport','enroll-leave-transport','enroll-arrive-assign-type','enroll-leave-assign-type','enroll-guardian','enroll-contact'].forEach(function(id){
    check('U4-'+id+' 존재', $(id) !== null);
  });

  // ── 항목3: 회차 옵션 — 교회목표 데이터 없는 오프라인 환경에서는 기존 기본값(1~7차) 유지되는지 ──
  check('E1 교회목표 데이터 없으면 기본 회차옵션(1차) 유지', $('enroll-event').options.length >= 7 && $('enroll-event').options[0].value === '1차');
  // 함수 자체가 에러 없이 동작하는지(오프라인이라 _goalRows 비어있음 → 기존 유지 분기)
  let refreshThrew = false;
  try { window.enrollEventOptionsRefresh(); } catch(e) { refreshThrew = true; console.error(e); }
  check('E2 enrollEventOptionsRefresh 정상 실행(에러없음)', !refreshThrew);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
