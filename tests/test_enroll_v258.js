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

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));

  // ── 항목1: 필드 배치 순서 확인(DOM 순서) ──
  const formCard = window.document.querySelector('#panel-enroll .card');
  const fieldIds = Array.from(formCard.querySelectorAll('input, select')).map(el => el.id).filter(id => id.indexOf('enroll-arrive-date')>=0 || id.indexOf('enroll-arrive-transport')>=0 || id.indexOf('enroll-arrive-assign-type')>=0 || id.indexOf('enroll-leave-date')>=0 || id.indexOf('enroll-leave-transport')>=0 || id.indexOf('enroll-leave-assign-type')>=0 || id.indexOf('enroll-guardian')>=0 || id.indexOf('enroll-contact')>=0);
  const expected = ['enroll-arrive-date','enroll-arrive-transport','enroll-arrive-assign-type','enroll-leave-date','enroll-leave-transport','enroll-leave-assign-type','enroll-guardian','enroll-contact'];
  check('L1 필드 순서: 참석3종→귀가3종→보호자/연락처', JSON.stringify(fieldIds)===JSON.stringify(expected), fieldIds);

  // ── 항목2: 배정유형 옵션 확인 ──
  const arriveOpts = Array.from($('enroll-arrive-assign-type').options).map(o=>o.value).filter(v=>v);
  check('L2 참석배정유형 옵션(신규 6개)', arriveOpts.join(',')==='선발대(총괄,팀장,TFT),선발대(봉사자),본대,직장조,시각선교부,중고등부', arriveOpts);

  const leaveOpts = Array.from($('enroll-leave-assign-type').options).map(o=>o.value).filter(v=>v);
  check('L3 귀가배정유형 옵션=본대,후발대,중고등부', leaveOpts.join(',')==='본대,후발대,중고등부', leaveOpts);
  check('L4 귀가배정유형에 선발대 없음', leaveOpts.indexOf('선발대')===-1);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
