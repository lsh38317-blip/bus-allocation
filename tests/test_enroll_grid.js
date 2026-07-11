const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      // enrollSave()의 add 요청 성공 응답 모의
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true, id: '9001' })) });
    }
    return Promise.reject(new Error('네트워크 비활성(테스트 환경) - ' + u.slice(0,60)));
  };
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

  // ── 그리드 마크업 존재 확인 ──
  check('G1 그리드 tbody 존재', $('enroll-list-table-body') !== null);
  check('G2 빈 상태 문구 요소 존재', $('enroll-list-empty') !== null);
  check('G3 등록 내역 없을 때 빈 상태 노출', $('enroll-list-empty').style.display !== 'none');
  check('G4 tbody 비어있음(초기)', $('enroll-list-table-body').innerHTML.trim() === '');

  // ── 폼 채우고 저장 → 그리드에 즉시 반영되는지 ──
  $('enroll-year').value = String(new Date().getFullYear());
  $('enroll-retreat-type').value = '하계';
  $('enroll-event').value = '1차';
  $('enroll-parish').value = '1교구';
  window.enrollParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('enroll-district').value = ($('enroll-district').options[1]||{value:''}).value;
  $('enroll-name').value = '테스트등록자';
  window.enrollSave();
  await new Promise(r => setTimeout(r, 400));

  check('G5 저장 후 그리드에 행 추가됨', $('enroll-list-table-body').querySelectorAll('tr').length === 1, $('enroll-list-table-body').innerHTML.slice(0,200));
  check('G6 저장된 성명이 그리드에 표시됨', $('enroll-list-table-body').textContent.indexOf('테스트등록자') >= 0);
  check('G7 저장 후 빈 상태 문구 숨김', $('enroll-list-empty').style.display === 'none');
  check('G8 삭제 버튼(관리컬럼)은 없음', $('enroll-list-table-body').innerHTML.indexOf('enrollDeleteRow')===-1);
  const rowEl = window.document.querySelector('#enroll-list-table-body tr');
  check('G8b 행 자체에 클릭 이벤트(enrollEditRow) 연결됨', rowEl && rowEl.getAttribute('onclick') && rowEl.getAttribute('onclick').indexOf('enrollEditRow')>=0);
  const receiptTd = window.document.querySelector('#enroll-list-table-body tr td');
  check('G9 접수ID 컬럼 hidden 처리', receiptTd && receiptTd.getAttribute('style')==='display:none;', receiptTd && receiptTd.outerHTML);
  const headerFirstTh = window.document.querySelector('#panel-enroll .card:nth-of-type(2) thead th');
  check('G10 헤더 접수ID도 hidden 처리', headerFirstTh && headerFirstTh.style.display === 'none');
  const visibleHeaders = Array.from(window.document.querySelectorAll('#panel-enroll .card:nth-of-type(2) thead th')).map(th=>th.textContent);
  check('G11 헤더에 폼 전체 항목(17개) 포함', visibleHeaders.length === 18 && visibleHeaders.indexOf('연락처')>=0 && visibleHeaders.indexOf('참석배정유형')>=0, visibleHeaders);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
