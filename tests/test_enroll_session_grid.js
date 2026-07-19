const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const curYear = String(new Date().getFullYear());
  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true, id: '9002' })) });
    }
    if (u.indexOf('sheetName=참석인원명단') >= 0) {
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: [
            {'접수ID':'8000001','성명':'기존인물1','연도':curYear,'수양회종류':'하계','행사명':'1차','교구':'1교구','구역':'11구역'},
            {'접수ID':'8000002','성명':'기존인물2','연도':curYear,'수양회종류':'하계','행사명':'1차','교구':'1교구','구역':'11구역'}
          ]
        })
      });
    }
    if (u.indexOf('action=getAll') >= 0) {
      // 다른 시트(계정목록/교회목표 등) 조회는 빈 성공 응답으로 처리 — 크래시 방지
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
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
  await new Promise(r => setTimeout(r, 600)); // loadData() 완료 대기

  // ── 핵심 검증: 기존 데이터가 로드되어 있어도(=retreat에 기존인물1/2 존재) 그리드는 비어있어야 함 ──
  check('S1 페이지 진입 시 그리드 비어있음(기존데이터 있어도)', $('enroll-list-table-body').innerHTML.trim() === '');
  check('S2 페이지 진입 시 빈 상태 문구 노출', $('enroll-list-empty').style.display !== 'none');
  check('S3 빈 상태 문구가 "저장 후" 안내로 변경됨', $('enroll-list-empty').textContent.indexOf('저장 후')>=0, $('enroll-list-empty').textContent);

  // ── 새로 저장하면 그 건만 그리드에 나타나는지 ──
  $('enroll-year').value = curYear;
  $('enroll-retreat-type').value = '하계';
  $('enroll-event').value = '1차';
  $('enroll-parish').value = '1교구';
  window.enrollParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('enroll-district').value = ($('enroll-district').options[1]||{value:''}).value;
  $('enroll-name').value = '신규저장자';
  window.enrollSave();
  await new Promise(r => setTimeout(r, 400));

  check('S4 저장 후 그리드에 딱 1건만 표시(기존 181건 아님)', $('enroll-list-table-body').querySelectorAll('tr').length === 1, $('enroll-list-table-body').querySelectorAll('tr').length);
  check('S5 표시된 건이 방금 저장한 신규저장자', $('enroll-list-table-body').textContent.indexOf('신규저장자')>=0);
  check('S6 기존인물1/2는 그리드에 나타나지 않음', $('enroll-list-table-body').textContent.indexOf('기존인물')===-1);

  // ── 패널을 벗어났다가 다시 들어와도 세션 내역은 유지되는지 ──
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 200));
  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));
  check('S7 패널 재진입해도 세션 내역 유지(1건)', $('enroll-list-table-body').querySelectorAll('tr').length === 1);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
