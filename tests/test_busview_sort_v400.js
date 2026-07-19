// [v400] "버스 배정 현황"(busview) 카드 출발일자 표시 + 정렬(_bvwBusSortCompare) 회귀테스트
// 정렬 규칙: ① 출발일자+출발시간 오름차순 → ② (같으면) 배정유형 고정순서
// (선발대→본대(봉사)→본대→중고등부→직장조) → ③ (같으면) 배차 번호 오름차순
//
// 실행: node test_busview_sort_v400.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctionSource, extractVarSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);

const fnsSrc = ['_bvwSortKey', '_bvwAssignTypeRank', '_bvwBusSortCompare']
  .map((n) => extractFunctionSource(fullSrc, n)).join('\n');
const varsSrc = extractVarSource(fullSrc, '_BUS_ASSIGN_TYPE_ORDER');
const mod = new Function(varsSrc + '\n' + fnsSrc + '\nreturn { _bvwBusSortCompare };')();

console.log('▶ 테스트1: 출발일자+시간이 다르면 이른 시간이 먼저 옴');
{
  const a = { assignType: '직장조', departDate: '2026-07-24', departTime: '20:00', rawName: '버스 1호' };
  const b = { assignType: '본대(봉사)', departDate: '2026-07-24', departTime: '06:00', rawName: '버스 1호' };
  const sorted = [a, b].sort(mod._bvwBusSortCompare);
  assert(sorted[0] === b, '06:00(본대(봉사))이 20:00(직장조)보다 먼저 옴');
}

console.log('▶ 테스트2: 날짜+시간이 같고 배정유형이 다르면 고정순서(선발대→본대(봉사)→본대→중고등부→직장조) 적용');
{
  const buses = [
    { assignType: '중고등부', departDate: '2026-07-24', departTime: '09:00', rawName: '버스 1호' },
    { assignType: '본대',   departDate: '2026-07-24', departTime: '09:00', rawName: '버스 1호' },
  ];
  const sorted = buses.slice().sort(mod._bvwBusSortCompare);
  assert(sorted[0].assignType === '본대' && sorted[1].assignType === '중고등부', '본대가 중고등부보다 먼저 옴(고정순서)');
}

console.log('▶ 테스트3: 날짜+시간+배정유형이 모두 같으면 배차 번호 오름차순');
{
  const buses = [
    { assignType: '본대', departDate: '2026-07-24', departTime: '09:00', rawName: '버스 3호' },
    { assignType: '본대', departDate: '2026-07-24', departTime: '09:00', rawName: '버스 1호' },
    { assignType: '본대', departDate: '2026-07-24', departTime: '09:00', rawName: '버스 2호' },
  ];
  const sorted = buses.slice().sort(mod._bvwBusSortCompare);
  assert(sorted.map((b) => b.rawName).join(',') === '버스 1호,버스 2호,버스 3호', '버스 1호→2호→3호 순으로 정렬됨');
}

console.log('▶ 테스트4: 전체 종합 시나리오(스크린샷 재현) — 06:00 본대(봉사) → 09:00 본대(1호,2호) → 09:00 중고등부 → 20:00 직장조');
{
  const buses = [
    { assignType: '본대',     departDate: '2026-07-24', departTime: '09:00', rawName: '버스 1호' },
    { assignType: '중고등부', departDate: '2026-07-24', departTime: '09:00', rawName: '버스 1호' },
    { assignType: '본대(봉사)', departDate: '2026-07-24', departTime: '06:00', rawName: '버스 1호' },
    { assignType: '직장조',   departDate: '2026-07-24', departTime: '20:00', rawName: '버스 1호' },
    { assignType: '본대',     departDate: '2026-07-24', departTime: '09:00', rawName: '버스 2호' },
  ];
  const sorted = buses.slice().sort(mod._bvwBusSortCompare);
  const order = sorted.map((b) => b.assignType + ' ' + b.rawName).join(' | ');
  const expected = '본대(봉사) 버스 1호 | 본대 버스 1호 | 본대 버스 2호 | 중고등부 버스 1호 | 직장조 버스 1호';
  assert(order === expected, '전체 순서가 기대값과 일치함 (실제: ' + order + ')');
}

console.log('▶ 테스트5: bus 객체 생성 시(_busRowsToBuses) departDate 필드가 채워지도록 코드에 반영됨');
{
  const busRowsToBusesSrc = extractFunctionSource(fullSrc, '_busRowsToBuses');
  assert(/departDate:\s*dIsObj\s*\?\s*\(dEntry\.departDate\|\|''\)\s*:\s*''/.test(busRowsToBusesSrc),
    'bus 객체 생성 시 departDate 필드가 dEntry.departDate로부터 채워짐');
}

console.log('▶ 테스트6: _busRenderSummaryList가 카드 목록을 정렬해서 렌더링함(원본 배열 미변경)');
{
  const renderSrc = extractFunctionSource(fullSrc, '_busRenderSummaryList');
  assert(/\.slice\(\)\.sort\(_bvwBusSortCompare\)/.test(renderSrc), 'renderBuses가 원본을 건드리지 않고 복사본을 정렬함');
  assert(/출발일자:/.test(renderSrc), '카드에 "출발일자" 라벨이 렌더링됨');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
