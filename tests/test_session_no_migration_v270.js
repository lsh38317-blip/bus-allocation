const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());
  let lastUpdateBody = null;

  let lastEnrollBody = null;
  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      if (body.sheetName === '참석인원명단') lastEnrollBody = body;
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    }
    if (u.indexOf('sheetName=참석인원명단') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'NO':'1','접수ID':'1001','성명':'홍길동','연도':curYear,'수양회종류':'하계','행사명':'구형행사명값','차수':'3차','교구':'1교구','구역':'11구역'},
        {'NO':'2','접수ID':'1002','성명':'김철수','연도':curYear,'수양회종류':'하계','행사명':'5차','교구':'2교구','구역':'21구역'}
      ]})});
    }
    if (u.indexOf('action=getAll') >= 0) return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[] }) });
    return Promise.reject(new Error('네트워크 비활성(테스트) - '+u.slice(0,60)));
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

  window.loadData();
  await new Promise(r => setTimeout(r, 400));

  // ── 읽기: "차수"가 있으면 차수 우선, 없으면 행사명 폴백 ──
  window.switchPanel('search');
  await new Promise(r => setTimeout(r, 300));
  const bodyText = $('table-body') ? $('table-body').textContent : '';
  check('R1 차수(3차)가 있는 사람은 3차로 표시(행사명값 아님)', bodyText.indexOf('3차')>=0 && bodyText.indexOf('구형행사명값')===-1, bodyText.slice(0,300));
  check('R2 차수 없는 사람은 행사명(5차)으로 폴백 표시', bodyText.indexOf('5차')>=0, bodyText.slice(0,300));

  // ── 쓰기: 인라인 수정 저장 시 "차수" 키로 전송되는지(행사명 아님) ──
  const editBtns = window.document.querySelectorAll('[onclick*="openDetail"]');
  check('W0 상세보기 버튼 존재', editBtns.length > 0);
  // 배정인원등록(버스신청) 폼을 통해 저장 시나리오로 간접 검증
  window.switchPanel('enroll');
  await new Promise(r => setTimeout(r, 300));
  $('enroll-year').value = curYear;
  $('enroll-retreat-type').value = '하계';
  $('enroll-event').value = '7차';
  $('enroll-parish').value = '1교구';
  window.enrollParishChange();
  await new Promise(r => setTimeout(r, 20));
  $('enroll-district').value = ($('enroll-district').options[1]||{value:''}).value;
  $('enroll-name').value = '신규참석자';
  window.enrollSave();
  await new Promise(r => setTimeout(r, 400));
  check('W1 버스신청 저장 요청 전송됨', lastEnrollBody !== null, lastEnrollBody);
  if(lastEnrollBody){
    check('W2 저장 데이터에 "차수" 키 포함, 값=7차', lastEnrollBody.data && lastEnrollBody.data['차수']==='7차', lastEnrollBody.data);
    check('W3 저장 데이터에 "행사명" 키는 없음', !(lastEnrollBody.data && ('행사명' in lastEnrollBody.data)), lastEnrollBody.data && Object.keys(lastEnrollBody.data));
  }

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
