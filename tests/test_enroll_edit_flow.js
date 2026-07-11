const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  let lastPostBody = null;
  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      lastPostBody = JSON.parse(opts.body);
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

  // 1) 신규 등록
  $('enroll-year').value = String(new Date().getFullYear());
  $('enroll-retreat-type').value = '하계';
  $('enroll-event').value = '1차';
  $('enroll-parish').value = '1교구';
  window.enrollParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('enroll-district').value = ($('enroll-district').options[1]||{value:''}).value;
  $('enroll-name').value = '홍길동';
  window.enrollSave();
  await new Promise(r => setTimeout(r, 400));
  check('F1 신규 저장 성공(action=add)', lastPostBody && lastPostBody.action === 'add', lastPostBody);

  // 2) 폼 초기화(수정모드 아님 상태로 리셋) 후, 그리드 행 클릭
  window.enrollFormReset();
  check('F2 초기화 후 성명 필드 비어있음', $('enroll-name').value === '');

  const row = window.document.querySelector('#enroll-list-table-body tr');
  row.dispatchEvent(new window.window.Event('click', {bubbles:true}));
  await new Promise(r => setTimeout(r, 300));

  check('F3 행 클릭 후 폼에 성명 로딩됨', $('enroll-name').value === '홍길동', $('enroll-name').value);
  check('F4 행 클릭 후 연도 로딩됨', $('enroll-year').value === String(new Date().getFullYear()));

  // 3) 값 일부 수정 후 저장 → update로 처리되는지
  $('enroll-guardian').value = '김보호자';
  window.enrollSave();
  await new Promise(r => setTimeout(r, 400));
  check('F5 재저장 시 action=update로 처리됨(수정)', lastPostBody && lastPostBody.action === 'update', lastPostBody);
  check('F6 그리드 행 개수 여전히 1개(신규추가 아닌 수정 확인)', $('enroll-list-table-body').querySelectorAll('tr').length === 1);
  check('F7 그리드에 수정된 보호자 값 반영', $('enroll-list-table-body').textContent.indexOf('김보호자') >= 0);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
