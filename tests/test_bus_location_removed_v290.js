// [v290] 참석버스 위치/귀가버스 위치 입력항목 및 관련 기능(busSaveLocationOnly,
// _busFillLocationInputs) 제거 검증 — 전체 페이지 로드로 런타임 에러 없이 정상 동작하는지 확인
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { resolveLatestHtml } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = resolveLatestHtml(2);
  console.log('대상 파일:', targetFile);
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const jsErrors = [];
  window.addEventListener('error', (e) => jsErrors.push(e.error ? e.error.message : String(e)));
  window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  window.console.error = (...args) => { jsErrors.push(args.join(' ')); };
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
  await new Promise((r) => setTimeout(r, 400));

  console.log('▶ 테스트1: 참석/귀가버스 위치 입력창이 더 이상 존재하지 않음');
  assert(!$('bus-arrive-board'), 'bus-arrive-board 인풋이 존재하지 않음');
  assert(!$('bus-arrive-alight'), 'bus-arrive-alight 인풋이 존재하지 않음');
  assert(!$('bus-leave-board'), 'bus-leave-board 인풋이 존재하지 않음');
  assert(!$('bus-leave-alight'), 'bus-leave-alight 인풋이 존재하지 않음');
  assert(!$('bus-loc-arrive'), 'bus-loc-arrive 카드가 존재하지 않음');
  assert(!$('bus-loc-leave'), 'bus-loc-leave 카드가 존재하지 않음');

  console.log('▶ 테스트2: "위치 저장" 버튼이 더 이상 존재하지 않음(HTML 텍스트 기준)');
  const panelHtml = ($('bus-panel-assign') || window.document.body).innerHTML;
  assert(panelHtml.indexOf('위치 저장') === -1, '"위치 저장" 문구가 마크업에 없음');
  assert(panelHtml.indexOf('참석버스 위치') === -1, '"참석버스 위치" 문구가 마크업에 없음');
  assert(panelHtml.indexOf('귀가버스 위치') === -1, '"귀가버스 위치" 문구가 마크업에 없음');

  console.log('▶ 테스트3: busSaveLocationOnly/_busFillLocationInputs가 window에 노출되지 않음(내부 함수 완전 제거)');
  assert(typeof window.busSaveLocationOnly === 'undefined', 'busSaveLocationOnly가 더 이상 노출되지 않음');

  console.log('▶ 테스트4: 버스대수/정원 설정(busSaveMeta)은 정상 동작(회귀 없음)');
  const cntInput = $('bus-count-input');
  assert(!!cntInput, 'bus-count-input은 그대로 존재함(버스대수 설정 기능 유지)');
  if (cntInput) {
    cntInput.value = '7';
    window.busSaveMeta();
  }
  assert(!jsErrors.length, '패널 진입·탭 전환·busSaveMeta 실행 중 JS 에러 없음' + (jsErrors.length ? ' (실제 에러: ' + jsErrors.slice(0,3).join(' | ') + ')' : ''));

  console.log('▶ 테스트5: 버스 배정 탭 전환(참석↔귀가) 시에도 에러 없이 정상 동작');
  window.busAssignSubTab('leave');
  await new Promise((r) => setTimeout(r, 100));
  window.busAssignSubTab('arrive');
  await new Promise((r) => setTimeout(r, 100));
  assert(!jsErrors.length, '탭 전환 중 JS 에러 없음' + (jsErrors.length ? ' (실제 에러: ' + jsErrors.slice(0,3).join(' | ') + ')' : ''));

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
