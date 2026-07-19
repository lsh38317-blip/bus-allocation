const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  let lastAppendBody = null;
  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      lastAppendBody = JSON.parse(opts.body);
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    }
    if (u.indexOf('action=getAll') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[] }) });
    }
    return Promise.reject(new Error('네트워크 비활성(테스트 환경) - '+u.slice(0,60)));
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

  window.switchPanel('excel');
  await new Promise(r => setTimeout(r, 300));

  // ── 실제 CSV 업로드 흐름으로 검증 (vwFileInput에 File 주입 + change 이벤트) ──
  const csvContent = '\uFEFF성명,연도,수양회종류,참석차수,교구/구역\n홍길동,2026,하계,3,1교구 11구역\n김철수,2026,하계,5차,2교구 22구역\n';
  const file = new window.File([csvContent], 'test.csv', { type: 'text/csv' });
  const fileInput = $('vwFileInput');
  Object.defineProperty(fileInput, 'files', { value: [file], writable: false, configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));

  const theadArr = $('vwThead') ? Array.from($('vwThead').children).map(th=>th.textContent.trim()) : [];
  check('E5 행사명 컬럼은 그리드에서 숨김', theadArr.indexOf('행사명') === -1, theadArr);
  check('E5b 차수 컬럼은 그리드에 보임', theadArr.indexOf('차수') >= 0, theadArr);
  const idxSession = theadArr.indexOf('차수'), idxDistrict = theadArr.indexOf('교구');
  check('E5c 차수가 교구 바로 앞에 위치', idxSession>=0 && idxDistrict===idxSession+1, {idxSession, idxDistrict});

  const tbodyText = $('vwTbody') ? $('vwTbody').textContent : '';
  check('E6 CSV 업로드/파싱 정상 동작(성명 표시됨)', tbodyText.indexOf('홍길동')>=0 || tbodyText.indexOf('김철수')>=0, tbodyText.slice(0,200));
  check('E6b 화면에 차수값(3차/5차)이 표시됨', tbodyText.indexOf('3차')>=0 && tbodyText.indexOf('5차')>=0, tbodyText.slice(0,200));

  // ── 처리(저장) 시 실제 전송 페이로드에서 행사명/차수가 올바르게 분리 저장되는지 확인 ──
  window.vwSaveToSheet();
  await new Promise(r => setTimeout(r, 500));
  check('E8 처리 후 전송된 행 존재', lastAppendBody !== null, lastAppendBody);
  if(lastAppendBody){
    const eventColIdx   = lastAppendBody.headers.indexOf('행사명');
    const sessionColIdx = lastAppendBody.headers.indexOf('차수');
    check('E9 헤더에 행사명·차수 컬럼 모두 포함', eventColIdx >= 0 && sessionColIdx >= 0, lastAppendBody.headers);
    const eventValues   = lastAppendBody.rows.map(r => r[eventColIdx]);
    const sessionValues = lastAppendBody.rows.map(r => r[sessionColIdx]);
    check('E10 참석차수=3 → 차수 컬럼에 "3차"로 저장됨', sessionValues.indexOf('3차')>=0, sessionValues);
    check('E11 참석차수=5차 → 차수 컬럼에 그대로 "5차" 저장됨(중복 안됨)', sessionValues.indexOf('5차')>=0, sessionValues);
    check('E12 행사명 컬럼은 빈값(CSV에 행사명 컬럼 없었음, 차수와 분리됨)', eventValues.every(v=>v===''), eventValues);
  }

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
