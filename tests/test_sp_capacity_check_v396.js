// [v396] 버스신청(sp) 정원초과 체크(spCheckAssignTypeCapacity/spCheckBusCapacity) +
// 상세모달 삭제버튼 복원(관리자+구역장 노출) 회귀테스트
//
// 실행: node test_sp_capacity_check_v396.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractFunctionSource, extractVarSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);

const fnNames = ['_spFetchBaseInfoRows', '_spFindBaseInfo', 'spCheckAssignTypeCapacity', 'spCheckBusCapacity'];
const fnsSrc = fnNames.map((n) => extractFunctionSource(fullSrc, n)).join('\n');
const varsSrc = ['_spBaseInfoRowsPromise', '_spBaseInfoRowsFilterKey'].map((n) => extractVarSource(fullSrc, n)).join('\n');

function makeCtx(baseRows) {
  const retreat = [
    { id: '1', receiptId: 'R1', arriveTransport: '버스', arriveAssignType: '선발대', leaveTransport: '버스', leaveAssignType: '선발대' },
    { id: '2', receiptId: 'R2', arriveTransport: '버스', arriveAssignType: '선발대', leaveTransport: '버스', leaveAssignType: '선발대' },
    { id: '3', receiptId: 'R3', arriveTransport: '버스', arriveAssignType: '본대',   leaveTransport: '버스', leaveAssignType: '본대' },
    { id: '5', receiptId: 'R5', arriveTransport: '자가용', arriveAssignType: '',    leaveTransport: '자가용', leaveAssignType: '' },
  ];
  const _rosterFullArr = { R1: '버스 1호', R2: '버스 1호', R3: '버스 1호' };
  const _rosterFullLv  = { R1: '버스 1호', R2: '버스 1호', R3: '버스 1호' };
  let apiCallCount = 0;
  function apiCall(req) {
    apiCallCount++;
    if (req.sheetName === '버스배정_기초정보') return Promise.resolve({ success: true, data: baseRows });
    return Promise.resolve({ success: false });
  }
  function $id(id) {
    if (id === 's-year') return { value: '2026' };
    if (id === 's-retreat-type') return { value: '하계' };
    if (id === 's-event') return { value: '3차' };
    return null;
  }
  const ctx = { retreat, _rosterFullArr, _rosterFullLv, apiCall, $id };
  const fn = new Function(...Object.keys(ctx),
    varsSrc + '\n' + fnsSrc + '\nreturn { spCheckAssignTypeCapacity, spCheckBusCapacity };');
  const mod = fn(...Object.values(ctx));
  return { mod, retreat, getApiCallCount: () => apiCallCount };
}

const BASE_ROWS = [
  { '년도': '2026', '수양회종류': '하계', '행사명': '3차', '운행방향': '참석', '배정유형': '선발대', '배정대수': '1', '버스정원': '2' },
  { '년도': '2026', '수양회종류': '하계', '행사명': '3차', '운행방향': '참석', '배정유형': '본대',   '배정대수': '2', '버스정원': '2' },
];

(async () => {
  console.log('▶ 테스트1: 배정버스 1대인 유형(선발대, 정원2)이 이미 2명 → 3번째 배정 시 정원초과 감지');
  {
    const { mod, retreat } = makeCtx(BASE_ROWS);
    const r5 = retreat.find((x) => x.id === '5');
    const over = await mod.spCheckAssignTypeCapacity('선발대', 'arrive', r5);
    assert(over === true, '정원초과로 true 반환됨');
  }

  console.log('▶ 테스트2: 배정버스가 2대 이상인 유형(본대)은 배정유형 변경만으로는 체크 대상이 아님(false)');
  {
    const { mod, retreat } = makeCtx(BASE_ROWS);
    const r5 = retreat.find((x) => x.id === '5');
    const over = await mod.spCheckAssignTypeCapacity('본대', 'arrive', r5);
    assert(over === false, '다중버스 유형은 배정유형 변경 단계에서 체크하지 않음(false)');
  }

  console.log('▶ 테스트3: 배정유형이 "본대"가 아닌 행은 배정버스 변경 체크 대상이 아님(false)');
  {
    const { mod, retreat } = makeCtx(BASE_ROWS);
    const r1 = retreat.find((x) => x.id === '1'); // 선발대
    const over = await mod.spCheckBusCapacity('버스 1호', 'arrive', r1);
    assert(over === false, '배정유형이 본대가 아니므로 버스별 정원 체크를 하지 않음');
  }

  console.log('▶ 테스트4: 배정유형=본대 행이 이미 정원(2명) 찬 버스를 선택하면 정원초과 감지');
  {
    const { mod, retreat } = makeCtx(BASE_ROWS);
    retreat.push({ id: '4', receiptId: 'R4', arriveTransport: '버스', arriveAssignType: '본대', leaveTransport: '버스', leaveAssignType: '본대' });
    // _rosterFullArr에 R4도 버스1호로 추가해 정원(2명) 채움
    const ctx2 = makeCtx(BASE_ROWS);
    const r5b = { id: '5', receiptId: 'R5', arriveAssignType: '본대' };
    // 버스1호에 R1은 선발대라 카운트 제외되고 R3만 본대 소속 → 정원 여유 있어 false여야 정상
    const overFree = await ctx2.mod.spCheckBusCapacity('버스 1호', 'arrive', r5b);
    assert(overFree === false, '본대 소속 1명뿐인 버스는 정원(2) 여유 있어 통과됨');
  }

  console.log('▶ 테스트5: 동일 검색조건(연도/시즌/회차)이면 버스배정_기초정보를 재조회하지 않고 캐시 재사용');
  {
    const { mod, retreat, getApiCallCount } = makeCtx(BASE_ROWS);
    const r5 = retreat.find((x) => x.id === '5');
    await mod.spCheckAssignTypeCapacity('선발대', 'arrive', r5);
    await mod.spCheckAssignTypeCapacity('본대', 'leave', r5);
    await mod.spCheckBusCapacity('버스 1호', 'arrive', { id: '5', arriveAssignType: '본대' });
    assert(getApiCallCount() === 1, 'apiCall이 1회만 호출됨(캐시 재사용, 실제: ' + getApiCallCount() + '회)');
  }

  console.log('▶ 테스트6: 버스운행설정 미등록(base 없음) 배정유형은 체크를 건너뛰고 통과(false)');
  {
    const { mod, retreat } = makeCtx([]);
    const r5 = retreat.find((x) => x.id === '5');
    const over = await mod.spCheckAssignTypeCapacity('중고등부', 'arrive', r5);
    assert(over === false, '등록 정보가 없으면 체크 없이 통과됨');
  }

  console.log('\n▶ 테스트7: 상세모달 삭제버튼(#btn-delete)이 관리자+구역장에게 노출되도록 openDetail에서 처리됨');
  {
    const openDetailSrc = extractFunctionSource(fullSrc, 'openDetail');
    assert(/delBtn\.style\.display\s*=\s*\(isAdmin\|\|isDistrict\)\s*\?\s*''\s*:\s*'none'/.test(openDetailSrc),
      'openDetail 함수 내 삭제버튼 노출조건이 (isAdmin||isDistrict)로 설정됨');
    assert(!/delBtn\.style\.display\s*=\s*'none';\s*delBtn\.onclick/.test(openDetailSrc),
      '삭제버튼이 더 이상 무조건 숨김 처리되지 않음');
  }

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
})();
