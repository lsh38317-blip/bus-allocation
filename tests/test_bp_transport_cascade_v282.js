// [v282] 참석교통수단 클릭 시 귀가교통수단에 동일 값 자동 반영(cascade) 회귀테스트
//
// 실행: node test_bp_transport_cascade_v282.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
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
// bpStagedArrive 선언부 ~ bpBulkToggleTransport 함수 끝까지: bpToggleTransport와 그 의존 함수
// (bpTransBadgeStyle 등)가 모두 이 구간에 포함되어 있어 통째로 추출한다.
const codeBlock = extractRangeFromVarToFunctionEnd(fullSrc, 'bpStagedArrive', 'bpBulkToggleTransport');

function freshEnv() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const window = dom.window;
  const document = window.document;

  const retreat = [
    { id: '1', receiptId: 'R1', arriveTransport: '자동차', arriveAssignType: '', leaveTransport: '자동차', leaveAssignType: '' },
  ];

  const ctx = {
    document,
    retreat,
    $id: (id) => document.getElementById(id),
    esc: (s) => String(s || ''),
  };

  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx), src + '\nreturn { bpStagedArrive, bpStagedLeave, bpStagedArriveAssign, bpStagedLeaveAssign, bpSelectedIds, bpToggleTransport, bpTransBadgeStyle };');
  const mod = fn(...Object.values(ctx));
  return { document, mod };
}

function makeRow(document, idStr) {
  let tbody = document.getElementById('bb-fake-tbody');
  if (!tbody) {
    const table = document.createElement('table');
    tbody = document.createElement('tbody');
    tbody.id = 'bb-fake-tbody';
    table.appendChild(tbody);
    document.body.appendChild(table);
  }
  tbody.insertAdjacentHTML('beforeend', `
    <tr id="bptr-${idStr}">
      <td><input type="checkbox" class="bp-chk-row" data-id="${idStr}"></td>
      <td><span class="bp-trans-badge" id="bp-arrive-badge-${idStr}">자동차</span></td>
      <td><select id="bp-arrive-assign-${idStr}"><option value="">선택</option><option value="본대">본대</option></select></td>
      <td><span class="bp-trans-badge" id="bp-leave-badge-${idStr}">자동차</span></td>
      <td><select id="bp-leave-assign-${idStr}"><option value="">선택</option><option value="본대">본대</option></select></td>
    </tr>`);
}

console.log('▶ 테스트1: 참석교통수단 클릭(자동차→버스) 시 귀가교통수단도 자동으로 "버스"로 스테이징');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpToggleTransport('1', 'arrive');
  assert(mod.bpStagedArrive['1'] === '버스', '참석교통수단이 버스로 스테이징됨');
  assert(mod.bpStagedLeave['1'] === '버스', '귀가교통수단도 동일하게 버스로 자동 스테이징됨 (실제: ' + mod.bpStagedLeave['1'] + ')');
  assert(document.getElementById('bp-leave-badge-1').textContent === '버스', '귀가교통수단 배지 텍스트도 즉시 갱신됨');
}

console.log('▶ 테스트2: 귀가교통수단 배지를 직접 클릭해 수정하면 그 값이 우선(참석 자동값 덮어씀)');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpToggleTransport('1', 'arrive'); // 자동차→버스, 귀가도 버스로 자동 스테이징
  mod.bpToggleTransport('1', 'leave');  // 사용자가 귀가를 직접 클릭 → 버스→자동차로 토글
  assert(mod.bpStagedLeave['1'] === '자동차', '사용자가 직접 클릭한 귀가교통수단 값이 우선 적용됨 (실제: ' + mod.bpStagedLeave['1'] + ')');
  assert(mod.bpStagedArrive['1'] === '버스', '참석교통수단 값은 영향받지 않고 그대로 유지됨(단방향)');
}

console.log('▶ 테스트3: 참석교통수단이 버스→자동차로 바뀌면 귀가배정유형도 함께 잠금+초기화');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpToggleTransport('1', 'arrive'); // 자동차→버스 (귀가도 버스로 동기화, select 활성화)
  const leaveAssignSel = document.getElementById('bp-leave-assign-1');
  assert(leaveAssignSel.disabled === false, '귀가교통수단이 버스가 되면 귀가배정유형 select도 활성화됨');
  mod.bpToggleTransport('1', 'arrive'); // 버스→자동차 (귀가도 자동차로 동기화, select 비활성화+초기화)
  assert(leaveAssignSel.disabled === true, '참석이 자동차로 바뀌면 귀가배정유형 select도 다시 잠김');
  assert(mod.bpStagedLeaveAssign['1'] === '', '귀가배정유형 스테이징 값도 함께 초기화됨');
}

console.log('▶ 테스트4: 귀가교통수단만 단독으로 클릭할 때는 참석 쪽에 영향 없음(기존 동작 회귀 없음)');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpToggleTransport('1', 'leave'); // 귀가만 클릭: 자동차→버스
  assert(mod.bpStagedLeave['1'] === '버스', '귀가교통수단이 버스로 스테이징됨');
  assert(!mod.bpStagedArrive.hasOwnProperty('1'), '참석교통수단은 스테이징되지 않음(영향 없음)');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
