// [v392] 버스신청(일괄신청 및 현황) 화면 — 참석/귀가배정버스 콤보박스 스테이징(spStageBus) 회귀테스트
// 버스배정인원관리(bp) 화면의 bpStageBus와 동일한 방식(서버 즉시저장 없이 화면 예약)으로 동작하는지,
// 그리고 구역장/교구장 스코프 가드(spCanEdit)가 배정버스 필드에도 동일하게 적용되는지 검증한다.
//
// 실행: node test_sp_bus_assign_v392.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractRangeFromVarToFunctionEnd } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
// spStagedArrive 선언부 ~ spStageBus 함수 끝까지: spCanEdit/spToggleCheck/spUpdateBulkBtnLabel 등
// spStageBus가 의존하는 함수들이 모두 이 구간 안에 함께 선언돼 있어 통째로 추출한다.
const codeBlock = extractRangeFromVarToFunctionEnd(fullSrc, 'spStagedArrive', 'spStageBus');

function freshEnv(role, scope) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const window = dom.window;
  const document = window.document;

  const retreat = [
    { id: '1', receiptId: 'R1', parish: '1교구', district: '11구역', arriveTransport: '버스', leaveTransport: '버스' },
  ];

  const currentUser = { role: role || 'admin', parish: scope && scope.parish, district: scope && scope.district };

  const toasts = [];
  const ctx = {
    document,
    retreat,
    currentUser,
    $id: (id) => document.getElementById(id),
    esc: (s) => String(s == null ? '' : s),
    showToast: (msg) => { toasts.push(msg); },
  };

  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx),
    src + '\nreturn { spStagedArriveBus, spStagedLeaveBus, spSelectedIds, spCanEdit, spStageBus, spUpdateBulkBtnLabel };');
  const mod = fn(...Object.values(ctx));
  return { document, mod, toasts, retreat };
}

function makeRow(document, idStr) {
  let tbody = document.getElementById('sp-fake-tbody');
  if (!tbody) {
    const table = document.createElement('table');
    tbody = document.createElement('tbody');
    tbody.id = 'sp-fake-tbody';
    table.appendChild(tbody);
    document.body.appendChild(table);
  }
  tbody.insertAdjacentHTML('beforeend', `
    <tr id="sptr-${idStr}">
      <td><input type="checkbox" class="sp-chk-row" data-id="${idStr}"></td>
      <td><select id="sp-arrive-bus-${idStr}"><option value="">미배정</option><option value="버스 1호">버스 1호</option></select></td>
      <td><select id="sp-leave-bus-${idStr}"><option value="">미배정</option><option value="버스 1호">버스 1호</option></select></td>
      <td id="sp-btn-bulk-holder"><button id="sp-btn-bulk">🔁 일괄변경</button></td>
    </tr>`);
}

console.log('▶ 테스트1: 관리자가 참석배정버스 콤보를 변경하면 스테이징(예약)만 되고 즉시저장되지 않음');
{
  const { document, mod } = freshEnv('admin');
  makeRow(document, '1');
  mod.spStageBus('1', 'arrive', '버스 1호');
  assert(mod.spStagedArriveBus['1'] === '버스 1호', '참석배정버스 값이 스테이징 객체에 예약됨');
  assert(mod.spSelectedIds.has('1'), '해당 행이 선택셋에 자동 포함됨');
  assert(document.getElementById('sptr-1').querySelector('.sp-chk-row').checked === true, '체크박스가 자동 체크됨');
}

console.log('▶ 테스트2: 스테이징된 배정버스 select는 예약중 표시(주황 점선 테두리)로 스타일이 바뀜');
{
  const { document, mod } = freshEnv('admin');
  makeRow(document, '1');
  mod.spStageBus('1', 'leave', '버스 1호');
  const sel = document.getElementById('sp-leave-bus-1');
  // jsdom의 CSSOM은 hex(#8a5a00)를 rgb(138, 90, 0)로 정규화해 반환하므로 rgb 표현으로 비교
  assert(sel.style.borderColor === 'rgb(138, 90, 0)', '귀가배정버스 select 테두리색이 예약중 색상(#8a5a00)으로 변경됨 (실제: ' + sel.style.borderColor + ')');
  assert(sel.style.borderStyle === 'dashed', '귀가배정버스 select 테두리가 점선으로 변경됨');
}

console.log('▶ 테스트3: 참석/귀가배정버스는 서로 독립적으로 스테이징됨(한쪽 변경이 다른쪽에 영향 없음)');
{
  const { mod } = freshEnv('admin');
  mod.spStageBus('1', 'arrive', '버스 1호');
  assert(mod.spStagedArriveBus['1'] === '버스 1호', '참석배정버스만 스테이징됨');
  assert(!mod.spStagedLeaveBus.hasOwnProperty('1'), '귀가배정버스는 영향받지 않음(스테이징 안 됨)');
}

console.log('▶ 테스트4: 일괄변경 버튼 라벨이 배정버스 스테이징 건수를 포함해 갱신됨');
{
  const { document, mod } = freshEnv('admin');
  makeRow(document, '1');
  mod.spStageBus('1', 'arrive', '버스 1호');
  assert(document.getElementById('sp-btn-bulk').textContent.indexOf('(1)') >= 0,
    '스테이징 1건이 버튼 라벨(건수)에 반영됨 (실제: ' + document.getElementById('sp-btn-bulk').textContent + ')');
}

console.log('▶ 테스트5: 구역장이 본인 소속 밖(다른 구역) 배정버스를 변경 시도하면 차단되고 토스트 안내됨');
{
  const { mod, toasts } = freshEnv('district', { parish: '1교구', district: '12구역' }); // r은 11구역 소속 → 범위 밖
  mod.spStageBus('1', 'arrive', '버스 1호');
  assert(!mod.spStagedArriveBus.hasOwnProperty('1'), '범위 밖 행은 스테이징되지 않음');
  assert(toasts.some((t) => t.indexOf('본인 소속 범위 밖') >= 0), '범위 밖 안내 토스트가 표시됨');
}

console.log('▶ 테스트6: 구역장이 본인 소속 구역의 배정버스는 정상적으로 변경 가능');
{
  const { mod } = freshEnv('district', { parish: '1교구', district: '11구역' }); // r과 동일 소속
  mod.spStageBus('1', 'leave', '버스 1호');
  assert(mod.spStagedLeaveBus['1'] === '버스 1호', '본인 소속 구역은 정상적으로 배정버스 스테이징됨');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
