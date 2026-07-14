// [v315] 버스배정_참석팀내역 시트에 과거(수정 전) 저장된 오염 데이터 — 중고등부 팀 행인데
// 배정유형 컬럼에 "본대(봉사)" 같은 다른 값이 찍혀있는 경우 — 를 로드할 때도 팀명 기준으로
// 한 번 더 걸러내는 방어 로직 회귀테스트.
// 검증 대상:
//   1) [핵심] 시트의 중고등부 행이 배정유형="본대(봉사)"로 잘못 저장돼 있어도,
//      "본대(봉사)"로 조회 시 팀 목록/미배정 팀에 나타나지 않음
//   2) [핵심] 반대로 "중고등부"로 조회하면 정상적으로 나타남(오탐 없이 포함)
//   3) 정상 저장된(배정유형 일치하는) 일반 팀은 기존처럼 정상 조회됨
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v315.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  // 시트에 이미 저장된 팀내역 — 중고등부 행이 "본대(봉사)"로 잘못 태깅되어 있는 오염 데이터 재현
  const teamRows = [
    { 'NO':'1','년도':'2026','수양회종류':'하계','행사명':'1차','배정유형':'본대(봉사)','교구':'중고등부','구역/팀명':'중고등부','인원수':'28','배정상태':'미배정','버스':'','분산배정':'','비고':'' },
    { 'NO':'2','년도':'2026','수양회종류':'하계','행사명':'1차','배정유형':'본대(봉사)','교구':'1교구','구역/팀명':'15구역','인원수':'16','배정상태':'미배정','버스':'','분산배정':'','비고':'' },
  ];
  let teamFetchCount = 0;

  window.fetch = (url, opts) => {
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(String(url));
    if (decoded.indexOf('버스배정_참석팀내역') !== -1) {
      teamFetchCount++;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamRows }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  };
  window.console.error = () => {};
  window.console.warn = () => {};

  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  await new Promise((r) => setTimeout(r, 300));

  const $ = (id) => window.document.getElementById(id);
  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise((r) => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise((r) => setTimeout(r, 300));

  window.switchPanel('bus');
  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  teamRows.forEach((r) => { r['년도'] = curYear; });
  $('bus-sel-assigntype').value = '본대(봉사)'; // 실제 사용자 흐름: 진입 직후 배정유형 선택
  await new Promise((r) => setTimeout(r, 500));
  window.busTab('assign');
  await new Promise((r) => setTimeout(r, 300));

  console.log('▶ 테스트1: [핵심] "본대(봉사)"로 조회해도 오염된 중고등부 행이 팀 목록에 나타나지 않음');
  const listText = ($('bus-teams-arrive-list') || {}).textContent || '';
  assert(listText.indexOf('중고등부') === -1, '[핵심] "본대(봉사)" 조회 결과에 중고등부가 섞이지 않음(실제: ' + listText.slice(0, 100) + ')');
  assert(listText.indexOf('15구역') !== -1, '정상 저장된 "1교구 15구역"은 그대로 조회됨');

  console.log('▶ 테스트2: [핵심] "중고등부"로 바꿔 조회하면 정상적으로 포함됨');
  $('bus-sel-assigntype').value = '중고등부';
  window.busAssignSubTab('arrive');
  await new Promise((r) => setTimeout(r, 200));
  window._busLoadOneTeamSheet('arrive', function(){});
  await new Promise((r) => setTimeout(r, 300));
  const listText2 = ($('bus-teams-arrive-list') || {}).textContent || '';
  assert(listText2.indexOf('중고등부') !== -1, '"중고등부" 조회 시 정상 포함됨(실제: ' + listText2.slice(0, 100) + ')');
  assert(listText2.indexOf('15구역') === -1, '"중고등부" 조회 시 일반팀(1교구 15구역)은 제외됨(실제: ' + listText2.slice(0, 100) + ')');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
