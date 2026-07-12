// [v278] 참석/귀가버스배정 "미배정" 이상현상 판단(팀단위) + 일괄변경 버튼 카운트 리셋 회귀테스트
//
// 실행: node test_bp_unassign_anomaly.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctions } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const codeBlock = extractFunctions(fullSrc, ['bpBusAssignInfo', 'bpComputeAssignedTeams']);

function freshCtx() {
  const _rosterFullArr = {};
  const _rosterFullLv = {};
  const retreat = [
    { id: '1', receiptId: 'R1', parish: '3교구', district: '31구역', arriveTransport: '버스', leaveTransport: '버스' },
    { id: '2', receiptId: 'R2', parish: '3교구', district: '31구역', arriveTransport: '버스', leaveTransport: '버스' },
    { id: '3', receiptId: 'R3', parish: '4교구', district: '41구역', arriveTransport: '버스', leaveTransport: '자동차' },
  ];
  const busGetTeamKey = (r) => ((r.parish||'미분류') + ' ' + (r.district||'')).trim();
  return { _rosterFullArr, _rosterFullLv, retreat, busGetTeamKey };
}

function buildFns(ctx) {
  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx), src + '\nreturn { bpBusAssignInfo: bpBusAssignInfo, bpComputeAssignedTeams: bpComputeAssignedTeams };');
  return fn(...Object.values(ctx));
}

console.log('▶ 테스트1: 같은 팀(3교구 31구역)에 배정된 사람이 있는데 이 사람만 미배정 → anomaly:true(경고)');
{
  const ctx = freshCtx();
  ctx._rosterFullArr['R1'] = '1호차'; // R1은 배정됨 → 3교구 31구역 팀은 "배정이력 있음"
  // R2는 미배정 상태로 둠 (같은 팀)
  const mod = buildFns(ctx);
  const teams = mod.bpComputeAssignedTeams('arrive');
  const r2 = ctx.retreat.find((r) => r.id === '2');
  const info = mod.bpBusAssignInfo(r2, 'arrive', teams);
  assert(info.status === 'unassigned', '상태는 미배정');
  assert(info.anomaly === true, '같은 팀에 배정이력이 있으므로 anomaly=true (실제: ' + info.anomaly + ')');
}

console.log('▶ 테스트2: 팀(4교구 41구역) 전체가 아직 한 번도 배정된 적 없음 → anomaly:false(정상 대기)');
{
  const ctx = freshCtx();
  ctx._rosterFullArr['R1'] = '1호차'; // 3교구 31구역만 배정이력 있음
  const mod = buildFns(ctx);
  const teams = mod.bpComputeAssignedTeams('arrive');
  const r3 = ctx.retreat.find((r) => r.id === '3');
  const info = mod.bpBusAssignInfo(r3, 'arrive', teams);
  assert(info.status === 'unassigned', '상태는 미배정');
  assert(info.anomaly === false, '팀 전체가 배정 전이므로 anomaly=false (실제: ' + info.anomaly + ')');
}

console.log('▶ 테스트3: 이미 배정된 사람은 anomaly 여부와 무관하게 항상 assigned/anomaly:false');
{
  const ctx = freshCtx();
  ctx._rosterFullArr['R1'] = '1호차';
  const mod = buildFns(ctx);
  const teams = mod.bpComputeAssignedTeams('arrive');
  const r1 = ctx.retreat.find((r) => r.id === '1');
  const info = mod.bpBusAssignInfo(r1, 'arrive', teams);
  assert(info.status === 'assigned' && info.value === '1호차', '배정된 사람은 정상 assigned 상태');
  assert(info.anomaly === false, '배정된 사람은 anomaly=false');
}

console.log('▶ 테스트4: 교통수단이 버스가 아니면(자동차) 항상 "-" 처리, anomaly 계산 대상 아님');
{
  const ctx = freshCtx();
  const mod = buildFns(ctx);
  const teams = mod.bpComputeAssignedTeams('leave');
  const r3 = ctx.retreat.find((r) => r.id === '3'); // leaveTransport: '자동차'
  const info = mod.bpBusAssignInfo(r3, 'leave', teams);
  assert(info.value === '-' && info.status === null && info.anomaly === false, '자동차는 "-"/status null/anomaly false');
}

console.log('▶ 테스트5: assignedTeamsSet 인자를 생략해도(예: 검색필터에서 status만 쓰는 기존 호출부) 안전하게 동작(anomaly=false)');
{
  const ctx = freshCtx();
  const mod = buildFns(ctx);
  const r2 = ctx.retreat.find((r) => r.id === '2');
  const info = mod.bpBusAssignInfo(r2, 'arrive'); // 3번째 인자 없음
  assert(info.status === 'unassigned', '기존 호출부(3번째 인자 생략)도 status는 정상 반환');
  assert(info.anomaly === false, '집합 미전달 시 anomaly는 안전하게 false');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
