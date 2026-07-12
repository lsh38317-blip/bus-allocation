// [v275] 버스배정기초정보 저장(bbSave) 성공 시 "입력데이터 초기화 → 조회" 순서 실행 검증
//
// 실행: node test_bbsave_order.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractVarSource, extractFunctions } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const codeBlock = [
  extractVarSource(fullSrc, '_bbRows'),
  extractVarSource(fullSrc, '_bbDriverRows'),
  extractVarSource(fullSrc, '_bbEditingId'),
  extractFunctions(fullSrc, ['bbGenId', 'bbFormatTime', 'bbNormalizeTimeForSave', 'bbFormatPhone', 'bbCollectFormDrivers', '_bbBuildSheetPayloads', 'bbSave']),
].join('\n');

function freshEnv() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <select id="bb-year-sel"><option value="2026" selected>2026</option></select>
    <select id="bb-event-sel"><option value="3차" selected>3차</option></select>
    <select id="bb-season-sel"><option value="하계" selected>하계</option></select>
    <select id="bb-type"><option value="본대" selected>본대</option></select>
    <select id="bb-direction"><option value="참석" selected>참석</option></select>
    <input id="bb-date" value="2026-07-20">
    <input id="bb-time" value="0900">
    <input id="bb-count" value="2">
    <table><tbody id="bb-driver-table-body"></tbody></table>
  </body></html>`);
  const document = dom.window.document;

  const callLog = []; // 호출 순서 기록용

  const ctx = {
    document,
    $id: (id) => document.getElementById(id),
    currentUser: { name: 'admin' },
    today: () => '20260711',
    USE_SHEET: () => true,
    apiCall: (payload) => { callLog.push('apiCall:' + payload.action + ':' + payload.sheetName); return Promise.resolve({ success: true }); },
    showLoading: () => {},
    showToast: (msg) => { callLog.push('toast:' + msg); },
    // bbFormReset/bbSearchClick — 이번 변경의 핵심 대상이므로 실제 로직 대신
    // "호출 여부·순서"만 기록하는 spy로 대체 (각 함수 자체 로직은 v274/기존 테스트에서 별도 검증됨)
    bbFormReset: () => { callLog.push('bbFormReset'); },
    bbSearchClick: () => { callLog.push('bbSearchClick'); },
  };

  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx), src + '\nreturn { bbSave: bbSave, get callLog(){ return callLog; } };');
  const mod = fn(...Object.values(ctx));
  return { document, mod, callLog };
}

function flushPromises() {
  // apiCall mock이 Promise.resolve()로 즉시 이행되므로, 매크로태스크 한 틱 대기하면
  // bbSave 내부의 Promise.all(...).then(...).catch(...).finally(...) 체인이 모두 처리된다.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

console.log('▶ 테스트1: 신규등록 저장 성공 시 bbFormReset → bbSearchClick 순서로 호출');
{
  const { mod, callLog } = freshEnv();
  mod.bbSave(); // bbSave는 Promise를 반환하지 않는 fire-and-forget 구조 — 내부 체인 완료를 별도 대기
  flushPromises().then(() => {
    const idxReset  = callLog.indexOf('bbFormReset');
    const idxSearch = callLog.indexOf('bbSearchClick');
    assert(idxReset !== -1, 'bbFormReset 호출됨');
    assert(idxSearch !== -1, 'bbSearchClick 호출됨');
    assert(idxReset < idxSearch, 'bbFormReset이 bbSearchClick보다 먼저 호출됨 (호출로그: ' + JSON.stringify(callLog) + ')');
    test2();
  });
}

function test2() {
  console.log('▶ 테스트2: apiCall 저장(overwrite) 완료 이후에 bbFormReset이 호출됨 (저장 성공 콜백 내부 실행 확인)');
  const { mod, callLog } = freshEnv();
  mod.bbSave();
  flushPromises().then(() => {
    const idxApiBase = callLog.indexOf('apiCall:overwrite:버스배정_기초정보');
    const idxReset    = callLog.indexOf('bbFormReset');
    assert(idxApiBase !== -1, '시트 저장(overwrite) apiCall이 호출됨');
    assert(idxApiBase < idxReset, '시트 저장 완료 이후에 bbFormReset이 호출됨');
    finish();
  });
}

function finish() {
  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}
