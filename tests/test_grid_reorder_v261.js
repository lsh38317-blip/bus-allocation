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

  // ── 항목1: 버스신청 등록된 접수내역 그리드 헤더 순서 ──
  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));
  const enrollHeaders = Array.from(window.document.querySelectorAll('#panel-enroll .card:nth-of-type(2) thead th')).map(th=>th.textContent);
  const expectedEnroll = ['접수ID','성명','구역','회별','참석일자','참석교통수단','참석배정유형','귀가일자','귀가교통수단','귀가배정유형','연도','수양회종류','회차','교구','구원여부','성별','보호자','연락처'];
  check('E1 버스신청 그리드 헤더 순서', JSON.stringify(enrollHeaders)===JSON.stringify(expectedEnroll), enrollHeaders);

  // ── 항목2: 배정인원현황 그리드 헤더 순서 ──
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  const searchHeaders = Array.from(window.document.querySelectorAll('#panel-search .table-wrap thead th')).map(th=>th.textContent.trim().split(' ')[0]);
  const expectedSearch = ['#','접수ID','성명','구역','회별','참석버스배정','귀가버스배정','회차','구원여부','관리'];
  check('E2 배정인원현황 그리드 헤더 순서', JSON.stringify(searchHeaders)===JSON.stringify(expectedSearch), searchHeaders);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
