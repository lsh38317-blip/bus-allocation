const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    if (u.indexOf('sheetName=교회목표') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'연도':curYear,'행사명':'봄맞이특별집회','수양회종류':'하계','등록일':'2026-01-01'},
        {'연도':curYear,'행사명':'은혜의여름집회','수양회종류':'하계','등록일':'2026-02-01'}
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

  window.switchPanel('busbase');
  await new Promise(r => setTimeout(r, 600));

  // ── 항목1: 필드 순서(운행방향 → 배정유형) ──
  const regPanel = $('bbbase-panel-info');
  const selects = Array.from(regPanel.querySelectorAll('select')).map(s=>s.id);
  const dirIdx = selects.indexOf('bb-direction');
  const typeIdx = selects.indexOf('bb-type');
  check('O1 운행방향이 배정유형보다 먼저 나옴', dirIdx>=0 && typeIdx>=0 && dirIdx < typeIdx, {dirIdx, typeIdx});

  // ── 항목2: 운행방향에 따른 배정유형 동적 옵션 ──
  check('O2 초기(참석) 배정유형 옵션', Array.from($('bb-type').options).map(o=>o.value).join(',') === '선발대(총괄,팀장,TFT),선발대(봉사자),본대,직장조,시각선교부,중고등부');

  $('bb-direction').value = '귀가';
  window.bbTypeOptionsRefresh();
  const leaveOpts = Array.from($('bb-type').options).map(o=>o.value);
  check('O3 귀가 선택 시 배정유형=본대,후발대,중고등부', leaveOpts.join(',') === '본대,후발대,중고등부', leaveOpts);
  check('O4 귀가에는 선발대 없음', leaveOpts.indexOf('선발대')===-1);

  $('bb-direction').value = '참석';
  window.bbTypeOptionsRefresh();
  const arriveOpts = Array.from($('bb-type').options).map(o=>o.value);
  check('O5 참석으로 되돌리면 원래 6개 옵션 복원', arriveOpts.join(',') === '선발대(총괄,팀장,TFT),선발대(봉사자),본대,직장조,시각선교부,중고등부', arriveOpts);

  // ── 항목3: 강서교회회차 옵션이 교회목표 행사명으로 교체됨 ──
  const evOpts = Array.from($('bb-event-sel').options).map(o=>o.value);
  check('O6 회차 옵션이 교회목표 행사명으로 교체됨', evOpts.indexOf('봄맞이특별집회')>=0 && evOpts.indexOf('은혜의여름집회')>=0, evOpts);
  check('O7 기존 고정목록(1차 등)은 사라짐', evOpts.indexOf('1차')===-1, evOpts);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
