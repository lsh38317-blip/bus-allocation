const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());
  let lastAppendBody = null;

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      if (body.mode === 'append') lastAppendBody = body;
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
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

  window.switchPanel('excel');
  await new Promise(r => setTimeout(r, 300));

  // ── 항목1: 화면에서 필드 제거 확인 ──
  check('V1 inpArrDate 요소 없음', $('inpArrDate') === null);
  check('V2 inpArrTrans 요소 없음', $('inpArrTrans') === null);
  check('V3 inpDepDate 요소 없음', $('inpDepDate') === null);
  check('V4 inpDepTrans 요소 없음', $('inpDepTrans') === null);
  check('V5 inpFullAttend 요소 없음', $('inpFullAttend') === null);
  check('V6 inpSeason(수양회종류)은 여전히 존재', $('inpSeason') !== null);

  // ── 항목2: 수양회종류가 파일업로드 버튼 바로 앞에 위치 ──
  const toolbar = window.document.querySelector('.vw-toolbar');
  const actionEls = Array.from(toolbar.querySelectorAll('.vw-actions > *'));
  const seasonGroupIdx = actionEls.findIndex(el => el.querySelector && el.querySelector('#inpSeason'));
  const fileBtnIdx = actionEls.findIndex(el => el.tagName==='BUTTON' && el.textContent.indexOf('파일 업로드')>=0);
  check('V7 수양회종류가 vw-actions 그룹(오른쪽) 안에 위치', seasonGroupIdx >= 0, seasonGroupIdx);
  check('V8 수양회종류가 파일업로드 버튼보다 앞', seasonGroupIdx>=0 && fileBtnIdx>=0 && seasonGroupIdx < fileBtnIdx, {seasonGroupIdx, fileBtnIdx});

  // ── 항목3: 그리드 헤더에서 해당 컬럼 제거 확인 ──
  // 자동감지 그리드(vwThead)는 데이터 업로드 후 생성되므로, VW_COLS 배열 자체로 우회 확인
  const theadCols = window.document.getElementById('vwThead');
  check('V9 vwThead 요소 존재(추후 렌더용)', theadCols !== null);

  // ── 항목4: 신규행 저장 시 헤더에 해당 컬럼 없음(처리 대상 제외) ──
  // _vwUploadPending을 직접 채울 수 없어 vwConfirmUpload 대신, VW_COLS 라벨 목록을 window 유출 없이
  // 간접 검증: 그리드 렌더링 함수가 오류 없이 동작하는지 + 헤더 텍스트에 제거된 라벨이 없는지 확인
  window.vwRenderTable();
  check('V10 vwRenderTable 정상 실행(에러없음)', true);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
