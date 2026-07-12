// [v277] 출발시간 시트 응답 정규화(bbNormalizeTimeFromSheet) 회귀테스트
//
// 실행: node test_bb_time_sheet_normalize.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const src = extractFunctionSource(fullSrc, 'bbNormalizeTimeFromSheet');
const fn = new Function(src + '\nreturn { bbNormalizeTimeFromSheet: bbNormalizeTimeFromSheet };');
const mod = fn();

console.log('▶ 테스트1: 정상 "HH:MM" 문자열은 그대로 통과');
assert(mod.bbNormalizeTimeFromSheet('09:00') === '09:00', '실제: ' + mod.bbNormalizeTimeFromSheet('09:00'));
assert(mod.bbNormalizeTimeFromSheet('18:30') === '18:30', '실제: ' + mod.bbNormalizeTimeFromSheet('18:30'));

console.log('▶ 테스트2: "H:MM"(한자리 시) 문자열은 0패딩');
assert(mod.bbNormalizeTimeFromSheet('9:00') === '09:00', '실제: ' + mod.bbNormalizeTimeFromSheet('9:00'));

console.log('▶ 테스트3: ISO 문자열("1899-12-30T14:00:00.000Z")에서 시:분만 정확히 추출 — 실제 재현 케이스');
assert(mod.bbNormalizeTimeFromSheet('1899-12-30T14:00:00.000Z') === '14:00', '실제: ' + mod.bbNormalizeTimeFromSheet('1899-12-30T14:00:00.000Z'));
assert(mod.bbNormalizeTimeFromSheet('1899-12-30T20:00:00.000Z') === '20:00', '실제: ' + mod.bbNormalizeTimeFromSheet('1899-12-30T20:00:00.000Z'));
assert(mod.bbNormalizeTimeFromSheet('1899-12-30T17:00:00.000Z') === '17:00', '실제: ' + mod.bbNormalizeTimeFromSheet('1899-12-30T17:00:00.000Z'));

console.log('▶ 테스트4: 서로 다른 행의 서로 다른 ISO 값이 더 이상 동일한 값으로 뭉개지지 않음 (핵심 회귀 포인트)');
const results = ['1899-12-30T14:00:00.000Z','1899-12-30T20:00:00.000Z','1899-12-30T17:00:00.000Z'].map(mod.bbNormalizeTimeFromSheet);
assert(new Set(results).size === 3, '3개 행이 서로 다른 값(' + JSON.stringify(results) + ')으로 정확히 구분됨');

console.log('▶ 테스트5: 빈값/알수없는 형식은 안전하게 빈 문자열 처리');
assert(mod.bbNormalizeTimeFromSheet('') === '', '빈 입력 → 빈 값');
assert(mod.bbNormalizeTimeFromSheet(null) === '', 'null → 빈 값');
assert(mod.bbNormalizeTimeFromSheet('garbage') === '', '알 수 없는 형식 → 빈 값(무효값을 그럴듯하게 보여주지 않음)');

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
