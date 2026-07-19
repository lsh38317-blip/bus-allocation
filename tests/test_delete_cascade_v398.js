// [v398] 참석자 삭제 확인창(_deleteConfirmMsg) + 버스배정 캐스케이드 정리(_deleteBusRosterCascade)
// 회귀테스트 — deleteRow(sp)/bpDeleteRow(bp) 공용 유틸 검증
//
// 실행: node test_delete_cascade_v398.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const fnsSrc = ['_deleteConfirmMsg', '_deleteBusRosterCascade', 'busGetTeamKey']
  .map((n) => extractFunctionSource(fullSrc, n)).join('\n');

function freshMod() {
  const apiCalls = [];
  const summaryCalls = [];
  function apiCall(req) { apiCalls.push(req); return Promise.resolve({ success: true }); }
  function _updateBusSummarySheet(type, teamKey, fromBus, toBus) {
    summaryCalls.push({ type, teamKey, fromBus, toBus });
    return Promise.resolve({ success: true });
  }
  function USE_SHEET() { return true; }
  function maskName(n) { return n; }
  function isJuniorHighBus() { return false; }
  const _rosterFullArr = { R1: '버스 1호' };
  const _rosterFullLv  = { R1: '버스 2호' };
  const ctx = { apiCall, _updateBusSummarySheet, USE_SHEET, maskName, isJuniorHighBus, _rosterFullArr, _rosterFullLv };
  const fn = new Function(...Object.keys(ctx), fnsSrc + '\nreturn { _deleteConfirmMsg, _deleteBusRosterCascade };');
  const mod = fn(...Object.values(ctx));
  return { mod, apiCalls, summaryCalls };
}

console.log('▶ 테스트1: 확인창 문구에 교구/구역/이름이 포함됨');
{
  const { mod } = freshMod();
  const msg = mod._deleteConfirmMsg({ parish: '1교구', district: '11구역', name: '홍길동' });
  assert(msg.includes('1교구') && msg.includes('11구역') && msg.includes('홍길동'), '교구/구역/이름이 문구에 모두 포함됨');
  assert(msg.includes('되돌릴 수 없습니다'), '되돌릴 수 없다는 경고 문구 포함');
}

console.log('▶ 테스트2: target이 없어도(null) 에러 없이 일반 확인 문구를 반환');
{
  const { mod } = freshMod();
  const msg = mod._deleteConfirmMsg(null);
  assert(typeof msg === 'string' && msg.includes('삭제'), '일반 문구가 정상 반환됨');
}

(async () => {

console.log('▶ 테스트3: 참석/귀가 모두 버스 배정자 삭제 시 두 시트 모두 삭제 API 호출 + 요약시트 2건 갱신');
{
  const { mod, apiCalls, summaryCalls } = freshMod();
  const r = { receiptId: 'R1', arriveTransport: '버스', leaveTransport: '버스' };
  await mod._deleteBusRosterCascade(r);
  assert(apiCalls.some((c) => c.sheetName === '탑승자_참석'), '탑승자_참석 시트 삭제 요청됨');
  assert(apiCalls.some((c) => c.sheetName === '탑승자_귀가'), '탑승자_귀가 시트 삭제 요청됨');
  assert(summaryCalls.some((c) => c.type === 'arrive' && c.fromBus === '버스 1호' && c.toBus === '(미배정)'), '참석요약 카운트 차감 호출됨(버스 1호→미배정)');
  assert(summaryCalls.some((c) => c.type === 'leave' && c.fromBus === '버스 2호' && c.toBus === '(미배정)'), '귀가요약 카운트 차감 호출됨(버스 2호→미배정)');
}

console.log('▶ 테스트4: 교통수단이 버스가 아닌 사람은 캐스케이드 호출이 전혀 발생하지 않음');
{
  const { mod, apiCalls, summaryCalls } = freshMod();
  const r = { receiptId: 'R2', arriveTransport: '자가용', leaveTransport: '자가용' };
  await mod._deleteBusRosterCascade(r);
  assert(apiCalls.length === 0, '탑승자 시트 삭제 API가 호출되지 않음');
  assert(summaryCalls.length === 0, '요약시트 갱신도 호출되지 않음');
}

console.log('▶ 테스트5: receiptId가 없는 행은 캐스케이드를 즉시 종료(안전 가드)');
{
  const { mod, apiCalls, summaryCalls } = freshMod();
  const r = { arriveTransport: '버스', leaveTransport: '버스' }; // receiptId 없음
  await mod._deleteBusRosterCascade(r);
  assert(apiCalls.length === 0 && summaryCalls.length === 0, 'receiptId 없으면 아무 호출도 하지 않음');
}

console.log('▶ 테스트6: deleteRow/bpDeleteRow 함수 본문에 confirm(_deleteConfirmMsg(...)) 가드가 포함됨');
{
  const deleteRowSrc = extractFunctionSource(fullSrc, 'deleteRow');
  const bpDeleteRowSrc = extractFunctionSource(fullSrc, 'bpDeleteRow');
  assert(/confirm\(_deleteConfirmMsg\(target\)\)/.test(deleteRowSrc), 'deleteRow()에 확인창 가드가 포함됨');
  assert(/_deleteBusRosterCascade\(target\)/.test(deleteRowSrc), 'deleteRow()가 캐스케이드 함수를 호출함');
  assert(/confirm\(_deleteConfirmMsg\(target\)\)/.test(bpDeleteRowSrc), 'bpDeleteRow()에 확인창 가드가 포함됨');
  assert(/_deleteBusRosterCascade\(target\)/.test(bpDeleteRowSrc), 'bpDeleteRow()가 캐스케이드 함수를 호출함');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);

})();
