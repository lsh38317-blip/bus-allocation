// [v281] ① 배차 "N호" 형식 ② 차량번호 컬럼 ③ 1행 승하차위치 입력시 아래 빈 행 자동복사 회귀테스트
//
// 실행: node test_bb_driver_grid_v281.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractFunctions } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const codeBlock = extractFunctions(fullSrc, ['bbNormalizeBaeLabel', 'bbDriverRowHtml', 'bbDriverFillDown', 'bbDriverAddRow', 'bbCollectFormDrivers']);

function freshEnv() {
  const dom = new JSDOM('<!doctype html><html><body><table><tbody id="bb-driver-table-body"></tbody></table><input id="bb-count"></body></html>');
  const document = dom.window.document;
  const ctx = {
    document,
    $id: (id) => document.getElementById(id),
    esc: (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    bbFormatPhone: (v) => v,
  };
  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx), src + '\nreturn { bbNormalizeBaeLabel, bbDriverRowHtml, bbDriverFillDown, bbDriverAddRow, bbCollectFormDrivers };');
  const mod = fn(...Object.values(ctx));
  return { document, mod };
}

console.log('▶ 테스트1: bbNormalizeBaeLabel — 숫자만 있으면 "호" 자동 부착, 이미 붙어있으면 중복 부착 안 함');
{
  const { mod } = freshEnv();
  assert(mod.bbNormalizeBaeLabel('1') === '1호', '숫자 "1" → "1호"');
  assert(mod.bbNormalizeBaeLabel('12') === '12호', '숫자 "12" → "12호"');
  assert(mod.bbNormalizeBaeLabel('1호') === '1호', '이미 "1호"면 그대로(중복 부착 없음)');
  assert(mod.bbNormalizeBaeLabel('') === '', '빈 값은 빈 값 유지');
  assert(mod.bbNormalizeBaeLabel('A조') === 'A조', '숫자가 아닌 자유 텍스트는 그대로 유지');
}

console.log('▶ 테스트2: bbDriverAddRow — 신규 행 기본 배차값이 "N호" 형식으로 생성됨');
{
  const { document, mod } = freshEnv();
  mod.bbDriverAddRow();
  mod.bbDriverAddRow();
  const baeInputs = document.querySelectorAll('.bb-drv-bae');
  assert(baeInputs[0].value === '1호', '1번째 행 배차 기본값 = "1호" (실제: ' + baeInputs[0].value + ')');
  assert(baeInputs[1].value === '2호', '2번째 행 배차 기본값 = "2호" (실제: ' + baeInputs[1].value + ')');
}

console.log('▶ 테스트3: 차량번호 컬럼 — 인풋 필드 존재 및 값 렌더링');
{
  const { document, mod } = freshEnv();
  document.getElementById('bb-driver-table-body').insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('1', '홍길동', '01000000000', '12가3456', '교회당앞', '소망관'));
  const vehicleInput = document.querySelector('.bb-drv-vehicle');
  assert(!!vehicleInput, '차량번호 인풋(.bb-drv-vehicle)이 렌더됨');
  assert(vehicleInput.value === '12가3456', '차량번호 값이 정상 표시됨 (실제: ' + vehicleInput.value + ')');
}

console.log('▶ 테스트4: bbCollectFormDrivers — 차량번호 필드가 수집 결과에 포함됨');
{
  const { document, mod } = freshEnv();
  document.getElementById('bb-driver-table-body').insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('1', '홍길동', '01000000000', '12가3456', '교회당앞', '소망관'));
  const collected = mod.bbCollectFormDrivers();
  assert(collected.length === 1, '1건 수집됨');
  assert(collected[0].vehicle === '12가3456', '차량번호가 수집 결과에 포함됨 (실제: ' + collected[0].vehicle + ')');
}

console.log('▶ 테스트5: bbDriverFillDown — 1행 입력 시 아래 빈 행에만 자동 복사(값 있는 행은 보존)');
{
  const { document, mod } = freshEnv();
  const tbody = document.getElementById('bb-driver-table-body');
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('1', '', '', '', '', ''));
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('2', '', '', '', '', ''));
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('3', '', '', '', '', '기존하차값')); // 3행은 이미 값 있음
  const rows = tbody.querySelectorAll('tr');
  const row1Board = rows[0].querySelector('.bb-drv-board');
  const row1Alight = rows[0].querySelector('.bb-drv-alight');
  row1Board.value = '교회당앞';
  mod.bbDriverFillDown(row1Board, 'board');
  row1Alight.value = '소망관';
  mod.bbDriverFillDown(row1Alight, 'alight');

  assert(rows[1].querySelector('.bb-drv-board').value === '교회당앞', '2행(빈 행) 승차위치가 자동 복사됨');
  assert(rows[2].querySelector('.bb-drv-board').value === '교회당앞', '3행(빈 행) 승차위치가 자동 복사됨');
  assert(rows[1].querySelector('.bb-drv-alight').value === '소망관', '2행(빈 행) 하차위치가 자동 복사됨');
  assert(rows[2].querySelector('.bb-drv-alight').value === '기존하차값', '3행은 이미 값이 있어 하차위치가 덮어써지지 않음(보존)');
}

console.log('▶ 테스트6: bbDriverFillDown — 2행 이하에서 입력해도 하위 전파되지 않음(1행 전용 동작)');
{
  const { document, mod } = freshEnv();
  const tbody = document.getElementById('bb-driver-table-body');
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('1', '', '', '', '', ''));
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('2', '', '', '', '', ''));
  tbody.insertAdjacentHTML('beforeend', mod.bbDriverRowHtml('3', '', '', '', '', ''));
  const rows = tbody.querySelectorAll('tr');
  const row2Board = rows[1].querySelector('.bb-drv-board');
  row2Board.value = '2행값';
  mod.bbDriverFillDown(row2Board, 'board');
  assert(rows[2].querySelector('.bb-drv-board').value === '', '2행에서 입력해도 3행에는 전파되지 않음(1행 전용)');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
