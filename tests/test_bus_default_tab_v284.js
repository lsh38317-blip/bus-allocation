// [v284] 버스 배정 페이지 진입 시 기본 활성 탭이 "선탑자 지정"인지 검증(전체 페이지 로드 방식)
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v284.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
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
  await new Promise((r) => setTimeout(r, 300));

  console.log('▶ 테스트1: 버스 배정 진입 시 선탑자 지정 탭이 기본 활성화됨');
  const leaderPanel = $('bus-panel-leader');
  const teamsPanel  = $('bus-panel-teams');
  const leaderBtn   = $('bus-tab-leader');
  const teamsBtn    = $('bus-tab-teams');

  assert(leaderPanel.style.display !== 'none', '선탑자 지정 패널이 표시됨(display!=none)');
  assert(teamsPanel.style.display === 'none', '구역관리 패널은 숨겨짐');
  assert(leaderBtn.className.indexOf('btn-navy') !== -1, '선탑자 지정 버튼이 활성(navy) 스타일');
  assert(teamsBtn.className.indexOf('btn-navy') === -1, '구역관리 버튼은 비활성 스타일');

  console.log('▶ 테스트2: 구역관리 탭을 수동 클릭하면 정상적으로 전환됨(기존 기능 회귀 없음)');
  window.busTab('teams');
  await new Promise((r) => setTimeout(r, 50));
  assert($('bus-panel-teams').style.display !== 'none', '구역관리 클릭 시 구역관리 패널 표시');
  assert($('bus-panel-leader').style.display === 'none', '구역관리 클릭 시 선탑자 지정 패널은 숨겨짐');
  assert($('bus-tab-teams').className.indexOf('btn-navy') !== -1, '구역관리 버튼이 활성 스타일로 전환됨');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
