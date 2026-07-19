// [v393] busAssignOptionsHtml('all') 배정유형 스코프 필터링 회귀테스트
// 버스신청(sp)/버스배정인원관리(bp)/상세수정모달(bpile)이 공용으로 쓰는 busAssignOptionsHtml의
// 'all' 컨텍스트가, 행(r) 자신의 배정유형과 동일한 배정유형의 버스만 노출하는지(다른 배정유형이
// 섞여 나오지 않는지) 검증한다.
//
// 실행: node test_bus_assignoptions_scope_v393.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const fnSrc = extractFunctionSource(fullSrc, 'busAssignOptionsHtml');
const sortKeySrc = extractFunctionSource(fullSrc, '_bvwSortKey');

function freshEnv(opts) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const document = dom.window.document;
  if (opts && opts.selType !== undefined) {
    const sel = document.createElement('select');
    sel.id = 'bus-sel-assigntype';
    const opt = document.createElement('option');
    opt.value = opts.selType; opt.selected = true;
    sel.appendChild(opt);
    sel.value = opts.selType;
    document.body.appendChild(sel);
  }

  const retreat = [
    { receiptId: 'R1', arriveTransport: '버스', arriveAssignType: '본대',     leaveTransport: '버스', leaveAssignType: '본대' },
    { receiptId: 'R2', arriveTransport: '버스', arriveAssignType: '본대(봉사)', leaveTransport: '버스', leaveAssignType: '본대(봉사)' },
    { receiptId: 'R3', arriveTransport: '버스', arriveAssignType: '직장조',   leaveTransport: '버스', leaveAssignType: '직장조' },
    { receiptId: 'R4', arriveTransport: '버스', arriveAssignType: '본대',     leaveTransport: '버스', leaveAssignType: '본대' },
  ];
  const _rosterFullArr = { R1: '버스 1호', R2: '버스 1호', R3: '버스 1호', R4: '버스 2호' };
  const _rosterFullLv  = { R1: '버스 1호', R2: '버스 1호', R3: '버스 1호', R4: '버스 2호' };
  const busArriveBuses = (opts && opts.busArriveBuses) || [];
  const busLeaveBuses  = (opts && opts.busLeaveBuses) || [];

  const ctx = {
    _rosterFullArr, _rosterFullLv, retreat, busArriveBuses, busLeaveBuses,
    esc: (s) => String(s == null ? '' : s),
    $id: (id) => document.getElementById(id),
  };
  const fn = new Function(...Object.keys(ctx), sortKeySrc + '\n' + fnSrc + '\nreturn busAssignOptionsHtml;');
  const busAssignOptionsHtml = fn(...Object.values(ctx));
  return { busAssignOptionsHtml, retreat };
}

console.log('▶ 테스트1: "본대" 배정유형 행은 "본대(봉사)"/"직장조" 버스가 옵션에 섞이지 않음');
{
  const { busAssignOptionsHtml, retreat } = freshEnv();
  const html = busAssignOptionsHtml('arrive', '버스 1호', retreat[0], 'all');
  assert(!/본대\(봉사\)/.test(html), '"본대(봉사)" 접두 버스명이 옵션에 없음');
  assert(!/직장조/.test(html), '"직장조" 관련 버스명이 옵션에 없음');
  assert(html.includes('버스 1호') && html.includes('버스 2호'), '같은 "본대" 배정유형의 버스(1호·2호)는 모두 옵션에 포함됨');
}

console.log('▶ 테스트2: "직장조" 배정유형 행은 "본대" 배정유형의 버스(2호)가 옵션에 섞이지 않음');
{
  const { busAssignOptionsHtml, retreat } = freshEnv();
  const html = busAssignOptionsHtml('arrive', '', retreat[2], 'all');
  assert(html.includes('버스 1호'), '직장조 자신의 버스(1호)는 포함됨');
  assert(!html.includes('버스 2호'), '본대 전용 버스(2호)는 포함되지 않음 (실제: ' + html + ')');
}

console.log('▶ 테스트3: 배정유형 선택자(#bus-sel-assigntype)가 없는 화면(예: 버스신청 sp)에서는 등록만 되고 아무도 안 탄 "빈 버스"가 다른 화면 잔존값으로 새지 않음');
{
  // 예: "버스 배정 현황" 조회 화면에서 남은 전역 busArriveBuses(배정유형 접두어 포함)가 있는 상태를 재현
  const { busAssignOptionsHtml, retreat } = freshEnv({
    busArriveBuses: [{ name: '본대(참석자) 버스 1호' }, { name: '선발대 버스 1호' }],
  });
  const html = busAssignOptionsHtml('arrive', '', retreat[0], 'all'); // r1: 본대, #bus-sel-assigntype 없음
  assert(!html.includes('본대(참석자) 버스 1호'), '#bus-sel-assigntype이 없는 화면에서는 전역 busArriveBuses의 잔존값이 섞이지 않음');
  assert(!html.includes('선발대 버스 1호'), '다른 배정유형(선발대) 접두 버스명도 섞이지 않음');
}

console.log('▶ 테스트4: 배정유형 선택자 값이 해당 행과 일치하는 화면(예: 버스배정인원관리 bp)에서는 등록된 빈 버스도 정상 노출됨');
{
  const { busAssignOptionsHtml, retreat } = freshEnv({
    selType: '본대',
    busArriveBuses: [{ name: '버스 3호' }], // 아직 아무도 안 탄 신규 등록 버스
  });
  const html = busAssignOptionsHtml('arrive', '', retreat[0], 'all');
  assert(html.includes('버스 3호'), '선택자 값이 일치하면 빈 버스도 옵션에 포함됨');
}

console.log('▶ 테스트5: 현재 배정값(curVal)은 목록 필터링과 무관하게 항상 옵션에 포함됨(분산배정/데이터 정합성 예외 보호)');
{
  const { busAssignOptionsHtml, retreat } = freshEnv();
  const html = busAssignOptionsHtml('arrive', '외부버스99호', retreat[0], 'all');
  assert(html.includes('외부버스99호'), '현재 값이 후보 목록에 없어도 강제로 포함됨');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
