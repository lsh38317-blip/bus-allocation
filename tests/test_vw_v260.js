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

  window.switchPanel('excel');
  await new Promise(r => setTimeout(r, 300));

  const actionEls = Array.from(window.document.querySelector('.vw-actions').children);
  const csvBtnIdx = actionEls.findIndex(el => el.tagName==='BUTTON' && el.textContent.indexOf('등록데이터 CSV')>=0);
  const timeGroupIdx = actionEls.findIndex(el => el.querySelector && el.querySelector('#vwLastProcTime'));
  check('P1 엑셀업로드시간이 등록데이터CSV 버튼보다 뒤에 위치', csvBtnIdx>=0 && timeGroupIdx>=0 && timeGroupIdx > csvBtnIdx, {csvBtnIdx, timeGroupIdx});
  check('P2 엑셀업로드시간이 툴바 맨 마지막', timeGroupIdx === actionEls.length-1, {timeGroupIdx, total: actionEls.length});
  check('P3 vwLastProcTime 요소 정상 존재', $('vwLastProcTime') !== null);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
