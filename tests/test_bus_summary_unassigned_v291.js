// [v291] 버스배정_참석요약/귀가요약에서 배정팀수/탑승인원/팀목록이 모두 null인 행을
// "자동배정 전" 상태로 인식하는지 검증 — 헬퍼 함수 단위테스트 + 조회(hasAny) 종단테스트
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);

// ===================== 테스트1~3: 헬퍼/파싱 단위테스트 =====================
{
  const src = [
    extractFunctionSource(fullSrc, '_busSummaryRowIsUnassigned'),
    extractFunctionSource(fullSrc, '_busRowsToBuses'),
  ].join('\n');
  const ctx = {
    busUid: (() => { let n = 0; return () => 'uid' + (n++); })(),
    _busParseParish: (name) => {
      const m = String(name || '').match(/^(\S+교구)\s*(\S*)$/);
      return m ? { parish: m[1], district: m[2] } : { parish: '', district: name };
    },
  };
  const fn = new Function(...Object.keys(ctx), src + '\nreturn { _busSummaryRowIsUnassigned, _busRowsToBuses };');
  const mod = fn(...Object.values(ctx));

  console.log('▶ 테스트1: _busSummaryRowIsUnassigned — 배정팀수/탑승인원/팀목록 모두 null이면 true');
  assert(mod._busSummaryRowIsUnassigned({ '배정팀수':'', '탑승인원':'', '팀 목록':'' }) === true, '3개 필드 모두 빈 문자열 → true');
  assert(mod._busSummaryRowIsUnassigned({}) === true, '3개 필드 모두 undefined(키 자체 없음) → true');
  assert(mod._busSummaryRowIsUnassigned({ '배정팀수':'2', '탑승인원':'', '팀 목록':'' }) === false, '배정팀수만 있어도 false(자동배정 데이터로 인정)');
  assert(mod._busSummaryRowIsUnassigned({ '배정팀수':'', '탑승인원':'25', '팀 목록':'' }) === false, '탑승인원만 있어도 false');
  assert(mod._busSummaryRowIsUnassigned({ '배정팀수':'', '탑승인원':'', '팀 목록':'1교구 11구역 4명' }) === false, '팀목록만 있어도 false');

  console.log('▶ 테스트2: _busRowsToBuses — 배정대수만 설정된 placeholder 행(1호,2호)은 autoAssigned=false');
  const placeholderRows = [
    { '버스명':'1호', '배정팀수':'', '탑승인원':'', '팀 목록':'' },
    { '버스명':'2호', '배정팀수':'', '탑승인원':'', '팀 목록':'' },
  ];
  const r1 = mod._busRowsToBuses(placeholderRows);
  assert(r1.buses.length === 2, '버스 2대(1호,2호) 파싱됨');
  assert(r1.buses.every((b) => b.autoAssigned === false), '두 버스 모두 autoAssigned=false(자동배정 전으로 인식) — 실제: ' + JSON.stringify(r1.buses.map((b)=>b.autoAssigned)));
  assert(r1.teams.length === 0, '팀목록이 없으므로 teams는 빈 배열');

  console.log('▶ 테스트3: _busRowsToBuses — 실제 자동배정 데이터가 있는 행은 autoAssigned=true');
  const realRows = [
    { '버스명':'1호', '배정팀수':'2', '탑승인원':'25', '팀 목록':'3교구 31구역 25명' },
    { '버스명':'2호', '배정팀수':'', '탑승인원':'', '팀 목록':'' }, // 2호는 아직 빈 버스
  ];
  const r2 = mod._busRowsToBuses(realRows);
  const bus1 = r2.buses.find((b) => b.name === '1호');
  const bus2 = r2.buses.find((b) => b.name === '2호');
  assert(bus1.autoAssigned === true, '1호는 실제 배정데이터가 있어 autoAssigned=true');
  assert(bus2.autoAssigned === false, '2호는 여전히 placeholder라 autoAssigned=false');
  assert(bus1.slots.length === 1, '1호의 팀 슬롯이 정상 파싱됨');
}

// ===================== 테스트4: 조회(hasAny) 종단테스트 =====================
async function run() {
  const dom = new JSDOM(fs.readFileSync(targetFile, 'utf-8'), { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const summaryRows = [
    { 'NO':'1','년도':'2026','수양회종류':'하계','행사명':'1차','버스명':'1호','상차위치':'','하차위치':'','배정팀수':'','탑승인원':'','정원':'44','팀 목록':'','선탑자ID':'' },
    { 'NO':'2','년도':'2026','수양회종류':'하계','행사명':'1차','버스명':'2호','상차위치':'','하차위치':'','배정팀수':'','탑승인원':'','정원':'44','팀 목록':'','선탑자ID':'' },
  ];
  let toastMessages = [];
  window.fetch = (url) => {
    const decoded = decodeURIComponent(String(url));
    if (decoded.indexOf('버스배정_참석요약') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: summaryRows }) });
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

  // showToast를 가로채 실제 메시지 캡처 (switchPanel 이후 앱 내부 함수이므로 window 노출된 것만 확인 가능한 범위 내에서 부작용 관찰)
  window.switchPanel('bus');
  await new Promise((r) => setTimeout(r, 500));

  console.log('▶ 테스트4: 조회 시 배정대수만 설정된(placeholder) 요약 데이터는 "배정 완료"로 오인되지 않음');
  // busArriveBuses는 IIFE 내부 변수라 직접 접근 불가하므로, 화면에 렌더된 버스 카드(1호/2호)가
  // 빈 상태(0명)로 표시되는지로 간접 검증한다.
  const bodyText = window.document.body.textContent;
  assert(bodyText.indexOf('1호') !== -1, '1호 버스 카드가 렌더됨(placeholder도 화면에는 정상 표시)');
  assert(bodyText.indexOf('팀을 드래그하여 배정') !== -1 || bodyText.indexOf('0/44') !== -1, '빈 버스로 정상 표시됨(자동배정 결과처럼 인원이 채워져 보이지 않음)');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
