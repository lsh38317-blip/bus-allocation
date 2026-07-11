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

  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));

  const header = window.document.querySelector('#panel-search .card-header div[style*="display:flex"]');
  const buttons = Array.from(header.querySelectorAll('button')).map(b => b.textContent.trim());
  check('B1 버튼 순서: 등록,초기화,조회', buttons[0].indexOf('등록')>=0 && buttons[1].indexOf('초기화')>=0 && buttons[2].indexOf('조회')>=0, buttons);

  const enrollBtn = Array.from(header.querySelectorAll('button')).find(b => b.textContent.indexOf('등록')>=0);
  check('B2 등록버튼 onclick에 switchPanel(enroll) 포함', enrollBtn.getAttribute('onclick').indexOf("switchPanel('enroll')")>=0);

  // 실제 클릭 시 배정인원등록 패널로 이동하는지
  enrollBtn.click();
  await new Promise(r => setTimeout(r, 300));
  check('B3 클릭 시 배정인원등록 패널 활성화', $('panel-enroll').classList.contains('active'));

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
