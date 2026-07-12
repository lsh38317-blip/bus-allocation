// [v276] 출발시간 자릿수별 범위검증 마스킹(bbFormatTime) + 저장 정규화(bbNormalizeTimeForSave) 회귀테스트
//
// 실행: node test_bb_time_mask.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctions } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const src = extractFunctions(fullSrc, ['bbFormatTime', 'bbNormalizeTimeForSave']);
const fn = new Function(src + '\nreturn { bbFormatTime: bbFormatTime, bbNormalizeTimeForSave: bbNormalizeTimeForSave };');
const mod = fn();

// 실제 타이핑을 재현: 문자열의 각 글자를 오브젝트 value에 이어붙이며 매번 bbFormatTime을 재호출
function typeSequence(chars) {
  let value = '';
  chars.forEach((ch) => { value = mod.bbFormatTime(value + ch); });
  return value;
}

console.log('▶ 테스트1: "1200"을 한 글자씩 입력 → 12:00 (정상 케이스 회귀 확인)');
assert(typeSequence(['1','2','0','0']) === '12:00', '실제: ' + typeSequence(['1','2','0','0']));

console.log('▶ 테스트2: "0900"을 한 글자씩 입력 → 09:00');
assert(typeSequence(['0','9','0','0']) === '09:00', '실제: ' + typeSequence(['0','9','0','0']));

console.log('▶ 테스트3: "2359"(최대 유효시각) 입력 → 23:59');
assert(typeSequence(['2','3','5','9']) === '23:59', '실제: ' + typeSequence(['2','3','5','9']));

console.log('▶ 테스트4: 시 십의자리에 3~9 입력 시 거부(시는 0~2만 허용)');
assert(mod.bbFormatTime('9') === '', '시작 자리 "9" 입력이 무시됨 (실제: "' + mod.bbFormatTime('9') + '")');
assert(mod.bbFormatTime('3') === '', '시작 자리 "3" 입력이 무시됨 (실제: "' + mod.bbFormatTime('3') + '")');

console.log('▶ 테스트5: 시 십의자리=2일 때 일의자리는 0~3만 허용(24~29시 차단)');
assert(mod.bbFormatTime('24') === '2', '"24" 입력 시 두번째 숫자 4가 거부되어 "2"만 남음 (실제: "' + mod.bbFormatTime('24') + '")');
assert(mod.bbFormatTime('23') === '23', '"23"은 정상 허용 (실제: "' + mod.bbFormatTime('23') + '")');

console.log('▶ 테스트6: 분 십의자리에 6~9 입력 시 거부(분은 0~59만 허용) — 문제가 됐던 "18:99" 케이스');
assert(mod.bbFormatTime('1899') === '18', '"1899" 입력 시 분 십의자리 9가 거부되어 "18"만 남음 (실제: "' + mod.bbFormatTime('1899') + '")');
assert(mod.bbFormatTime('1899').indexOf(':') === -1 || /^\d{2}:[0-5]\d$/.test(mod.bbFormatTime('1899')), '결과값이 존재한다면 반드시 00:00~23:59 형식이어야 함');

console.log('▶ 테스트7: 기존에 잘못 저장된 값("18:99")을 수정폼에서 불러오면 자동 정제됨');
assert(mod.bbFormatTime('18:99') === '18', '기존 잘못된 값 로드 시 "18"로 정제(재입력 유도) (실제: "' + mod.bbFormatTime('18:99') + '")');

console.log('▶ 테스트8: bbNormalizeTimeForSave — 화면표시값과 저장값이 항상 동일 규칙(WYSIWYG)');
assert(mod.bbNormalizeTimeForSave('1200') === '12:00', '완전입력 저장값 = 12:00');
assert(mod.bbNormalizeTimeForSave('09') === '09:00', '시만 입력된 경우 분은 00으로 채워 저장 (실제: "' + mod.bbNormalizeTimeForSave('09') + '")');
assert(mod.bbNormalizeTimeForSave('') === '', '빈 입력은 빈 값으로 저장(선택 입력 유지)');
assert(mod.bbNormalizeTimeForSave('1899') === '18:00', '무효 자릿수가 섞인 입력도 유효 자릿수만 반영해 저장 (실제: "' + mod.bbNormalizeTimeForSave('1899') + '")');

console.log('▶ 테스트9: 화면표시(bbFormatTime)와 저장값(bbNormalizeTimeForSave)의 시/분 부분이 항상 일치');
['1200','0930','2359','18','09','2400','1899'].forEach((seq) => {
  const disp = mod.bbFormatTime(seq);
  const saved = mod.bbNormalizeTimeForSave(seq);
  const dispHHMM = disp.indexOf(':')>=0 ? disp : (disp ? disp.padStart(2,'0')+':00' : '');
  assert(dispHHMM === saved, `입력 "${seq}" → 화면표시 기준값(${dispHHMM}) = 저장값(${saved})`);
});

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
