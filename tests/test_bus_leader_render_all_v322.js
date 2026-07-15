// [v322] "전체배정대수불러오기" 검증:
//   1) 상단 배정유형 콤보 선택과 무관하게, 등록된 모든 배정유형(선발대/본대(봉사)/직장조)이
//      그룹으로 한 화면에 모두 표시됨
//   2) 저장 시 채워진 슬롯만 처리하고, 비어있는 슬롯은 조용히 건너뜀(에러 아님)
//   3) 콤보를 바꿔도 전체보기 화면이 유지됨(재조회/리셋 없음)
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v322.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const baseRows = [
    { 'NO':'1', '등록ID':'REG-SEON',    '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'선발대',     '운행방향':'참석', '출발일자':'2026-07-23', '출발시간':'13:00', '배정대수':'1' },
    { 'NO':'2', '등록ID':'REG-BONDAE',  '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대(봉사)', '운행방향':'참석', '출발일자':'2026-07-24', '출발시간':'06:00', '배정대수':'2' },
    { 'NO':'3', '등록ID':'REG-JIKJANG', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'직장조',     '운행방향':'참석', '출발일자':'2026-07-24', '출발시간':'20:00', '배정대수':'1' },
  ];
  const driverRows = [];
  const retreatRows = [
    { '접수ID':'R100', '성명':'홍길동', '연도':'2026', '수양회종류':'하계', '차수':'1차',
      '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'선발대' },
  ];

  var overwriteCalls = [];

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      let body = {};
      try { body = JSON.parse(opts.body); } catch (e) {}
      if (body.mode === 'overwrite') overwriteCalls.push(body);
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows }) });
    if (decoded.indexOf('버스배정_운전자정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: driverRows }) });
    if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: retreatRows }) });
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  };
  window.console.error = () => {};
  window.console.warn = () => {};

  await new Promise((resolve) => { if (window.document.readyState === 'complete') resolve(); else window.addEventListener('load', resolve); });
  await new Promise((r) => setTimeout(r, 300));

  const $ = (id) => window.document.getElementById(id);

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise((r) => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise((r) => setTimeout(r, 400));

  window.switchPanel('bus');
  await new Promise((r) => setTimeout(r, 500));

  const curEvent = $('bus-sel-event') ? $('bus-sel-event').value : '1차';
  baseRows.forEach((r) => { r['행사명'] = curEvent; });
  retreatRows.forEach((r) => { r['차수'] = curEvent; });

  $('bus-sel-assigntype').value = '선발대';
  $('bus-sel-assigntype').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));

  console.log('▶ 테스트: 전체배정대수불러오기 — 모든 배정유형이 그룹으로 표시됨');
  window.busLeaderRenderAll();
  await new Promise((r) => setTimeout(r, 500));

  const html = ($('bus-leader-list') || {}).innerHTML || '';
  assert(html.indexOf('선발대') !== -1, '"선발대" 그룹이 표시됨');
  assert(html.indexOf('본대(봉사)') !== -1, '"본대(봉사)" 그룹이 표시됨');
  assert(html.indexOf('직장조') !== -1, '"직장조" 그룹이 표시됨');

  console.log('▶ 테스트: 콤보를 바꿔도 전체보기 화면이 유지됨');
  $('bus-sel-assigntype').value = '본대(봉사)';
  $('bus-sel-assigntype').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const htmlAfter = ($('bus-leader-list') || {}).innerHTML || '';
  assert(htmlAfter.indexOf('선발대') !== -1 && htmlAfter.indexOf('직장조') !== -1,
    '배정유형 콤보 변경 후에도 전체보기 화면(모든 그룹)이 그대로 유지됨');

  console.log('▶ 테스트: 저장 시 채워진 슬롯만 처리, 빈 슬롯은 건너뜀');
  // 선발대 그룹(gi=0)의 유일한 슬롯만 채우고, 본대(봉사)/직장조는 비워둠
  function setVal(id, val) { const el = $(id); if (el) el.value = val; }
  setVal('leader-in-parish-0-1', '3교구');
  window.busLeaderParishChange(0, 1);
  await new Promise((r) => setTimeout(r, 20));
  setVal('leader-in-district-0-1', '31구역');
  setVal('leader-in-name-0-1', '홍길동');

  window.busLeaderSaveDispatch();
  await new Promise((r) => setTimeout(r, 800));

  const drvCall = overwriteCalls.find((c) => c.sheetName === '버스배정_운전자정보');
  assert(!!drvCall, '운전자정보 overwrite 호출이 발생함(선발대 슬롯이 채워졌으므로)');
  if (drvCall) {
    const hdr = drvCall.headers;
    const idIdx = hdr.indexOf('등록ID'), leaderIdx = hdr.indexOf('선탑자ID');
    const seonRow = drvCall.rows.find((row) => row[idIdx] === 'REG-SEON');
    assert(!!seonRow && seonRow[leaderIdx], '선발대(채워진 슬롯)는 선탑자ID가 저장됨');
  }
  // 본대(봉사)/직장조는 비어있었으므로 별도 overwrite 호출이 없어야 함(스킵)
  const bondaeCallCount = overwriteCalls.filter((c) => c.sheetName === '버스배정_운전자정보').length;
  assert(bondaeCallCount === 1, '채워진 그룹(선발대) 1건만 저장 호출됨 — 빈 그룹은 API 호출 자체가 발생하지 않음');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
