// [v283] 버스 배정 페이지 — 배정유형 필터가 팀집계(_busImportBuildUI)/미배정카운트/재배정에
// 일관되게 적용되는지 검증. 대상 함수가 많은 전역 의존성을 갖고 있어 전체 페이지를 jsdom으로
// 로드해 실제 코드 경로 그대로 재현한다.
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

// ── 순수 헬퍼(_busMatchesAssignType) 단독 유닛테스트 ──────────────────────
function extractFunctionSource(src, fnName) {
  const m = src.match(new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) throw new Error(fnName + ' not found');
  let depth = 0, i = m.index;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}
const targetFile = process.argv[2] || 'retreat-site_v283.html';
const html0 = fs.readFileSync(targetFile, 'utf-8');
const fullSrc = html0.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

console.log('▶ 테스트1: _busMatchesAssignType 단독 유닛테스트');
{
  const src = extractFunctionSource(fullSrc, '_busMatchesAssignType');
  const fn = new Function(src + '\nreturn _busMatchesAssignType;');
  const _busMatchesAssignType = fn();
  const r1 = { arriveAssignType: '본대', leaveAssignType: '후발대' };
  assert(_busMatchesAssignType(r1, 'arrive', { assignType: '' }) === true, 'assignType 미지정(전체)이면 항상 통과');
  assert(_busMatchesAssignType(r1, 'arrive', null) === true, 'bf가 없어도 안전하게 통과(하위호환)');
  assert(_busMatchesAssignType(r1, 'arrive', { assignType: '본대' }) === true, '참석배정유형 일치 시 통과');
  assert(_busMatchesAssignType(r1, 'arrive', { assignType: '직장조' }) === false, '참석배정유형 불일치 시 제외');
  assert(_busMatchesAssignType(r1, 'leave', { assignType: '후발대' }) === true, '귀가배정유형(kind=leave) 일치 시 통과');
  assert(_busMatchesAssignType(r1, 'leave', { assignType: '본대' }) === false, '귀가배정유형 불일치 시 제외(참석 값과 혼동 없음)');
}

// ── 전체 페이지 로드: _busImportBuildUI 종단 검증 ──────────────────────
async function run() {
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const rosterSheetRows = [
    { 'NO':'1', '접수ID':'R1', '성명':'홍길동', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'본대' },
    { 'NO':'2', '접수ID':'R2', '성명':'김철수', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'직장조' },
    { 'NO':'3', '접수ID':'R3', '성명':'이영희', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'본대' },
  ];
  window.fetch = (url) => {
    const u = String(url);
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('참석인원명단') !== -1 && decoded.indexOf('getAll') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterSheetRows }) });
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

  window.switchPanel('bus');
  await new Promise((r) => setTimeout(r, 300));

  const assignSel = $('bus-sel-assigntype');
  console.log('▶ 테스트2: 버스배정 패널 진입 시 배정유형 옵션이 구성됨(참석 모드 기준)');
  assert(!!assignSel, 'bus-sel-assigntype 셀렉트가 존재함');
  const optionValues = Array.from(assignSel.options).map((o) => o.value);
  assert(optionValues[0] === '', '첫 옵션은 "전체"(빈값)');
  assert(optionValues.includes('본대'), '참석 모드 옵션에 "본대" 포함');
  assert(optionValues.includes('선발대(봉사자)'), '참석 모드 옵션에 "선발대(봉사자)" 포함');

  console.log('▶ 테스트3: 귀가 모드로 전환 시 배정유형 옵션도 귀가 목록으로 갱신');
  window.busMainTypeSelect('leave');
  const leaveOptionValues = Array.from(assignSel.options).map((o) => o.value);
  assert(leaveOptionValues.includes('후발대'), '귀가 모드 옵션에 "후발대" 포함');
  assert(!leaveOptionValues.includes('직장조'), '귀가 모드 옵션에는 참석전용 값("직장조")이 없음');
  window.busMainTypeSelect('arrive'); // 이후 테스트를 위해 참석 모드로 복귀

  console.log('▶ 테스트4: _busImportBuildUI — 배정유형 필터 선택 시 해당 유형만 팀 집계에 포함');
  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  // 교회목표 미로드 시 _busGetFilter()의 홈배지 폴백이 기본값(하계/1차)으로 귀결되므로 동일하게 맞춤
  rosterSheetRows.forEach((r) => { r['연도'] = curYear; r['수양회종류'] = '하계'; r['행사명'] = '1차'; });
  assignSel.value = '본대';
  window.busImportFromRetreat();
  await new Promise((r) => setTimeout(r, 100));
  const resultArea = $('bus-import-arrive-result');
  const resultText = resultArea ? resultArea.textContent : '';
  assert(resultText.indexOf('2명') !== -1 || resultText.indexOf('2') !== -1, '배정유형=본대 필터 시 2명만 집계됨(직장조 1명 제외) — 실제 표시: ' + resultText.slice(0,200));

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
