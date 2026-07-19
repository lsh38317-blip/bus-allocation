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

  // ── 관리자 로그인 ──
  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  // ── 항목1: 관리자는 버스배정현황 정상 접근 가능 ──
  check('A1 관리자는 nav-bus-view 표시됨', $('nav-bus-view').style.display !== 'none');
  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 400));
  check('A2 관리자는 버스배정현황 패널 진입 가능', $('panel-busview').classList.contains('active'));

  // ── 항목2: 메뉴명 변경 확인 ──
  check('B1 사이드바 메뉴명 = 버스신청', $('nav-enroll').textContent.trim().indexOf('버스신청')>=0, $('nav-enroll').textContent);
  check('B2 배정인원등록 문구는 더이상 없음', $('nav-enroll').textContent.indexOf('배정인원등록')===-1);

  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));
  check('B3 상단 타이틀 = 버스신청', $('topbar-title').textContent === '버스신청', $('topbar-title').textContent);
  const cardTitle = window.document.querySelector('#panel-enroll .card-title');
  check('B4 폼 카드 제목 = 버스신청', cardTitle && cardTitle.textContent.indexOf('버스신청')>=0, cardTitle && cardTitle.textContent);

  // ── 항목3: 버튼 위치/이름 확인 ──
  const headerBtns = Array.from(window.document.querySelector('#panel-enroll .card-header').querySelectorAll('button')).map(b=>b.textContent.trim());
  check('C1 헤더엔 수양회접수내역만 있음', headerBtns.length===1 && headerBtns[0].indexOf('수양회접수내역')>=0, headerBtns);

  const contactField = $('enroll-contact');
  const formCard = window.document.querySelector('#panel-enroll .card');
  // 연락처 필드 이후에 초기화/신청 버튼이 위치하는지 DOM 순서로 확인
  const allEls = Array.from(formCard.querySelectorAll('input, button'));
  const contactIdx = allEls.indexOf(contactField);
  const saveBtnIdx = allEls.indexOf($('enroll-save-btn'));
  check('C2 신청버튼이 연락처 필드보다 뒤에 위치', saveBtnIdx > contactIdx, {contactIdx, saveBtnIdx});
  check('C3 신청버튼 텍스트 확인', $('enroll-save-btn').textContent.indexOf('신청')>=0 && $('enroll-save-btn').textContent.indexOf('저장')===-1, $('enroll-save-btn').textContent);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
