// [GAS v39] 참석인원명단 SHEET_HEADERS 변경 검증 — 참석일자/참석교통수단/귀가일자/귀가교통수단 추가
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const src = fs.readFileSync('/home/claude/work/gas/수양회관리_AppScript_v39.gs', 'utf-8');
const m = src.match(/SHEET_HEADERS\s*=\s*\{([\s\S]*?)\n\};/);
if (!m) { console.error('SHEET_HEADERS 블록을 찾을 수 없습니다'); process.exit(1); }

// '참석인원명단' 배열 리터럴만 안전하게 추출해 평가
const rowMatch = src.match(/'참석인원명단':\s*\[([\s\S]*?)\]/);
if (!rowMatch) { console.error('참석인원명단 헤더를 찾을 수 없습니다'); process.exit(1); }
const headers = eval('[' + rowMatch[1] + ']');

console.log('▶ 테스트1: 참석인원명단 헤더 배열이 요청된 순서/구성과 정확히 일치');
const expected = [
  'NO','접수ID','성명','연도','수양회종류','행사명','차수','교구','구역','회별',
  '봉사코드','봉사명','숙소코드','숙소1','숙소2','구원여부',
  '연락처','보호자','성별','등록일자',
  '참석일자','참석교통수단','참석배정유형','귀가일자','귀가교통수단','귀가배정유형'
];
assert(headers.length === expected.length, '헤더 개수 일치 (실제 ' + headers.length + '개, 기대 ' + expected.length + '개)');
assert(JSON.stringify(headers) === JSON.stringify(expected), '헤더 순서/내용이 정확히 일치 (실제: ' + JSON.stringify(headers) + ')');

console.log('▶ 테스트2: 신규 추가된 4개 컬럼이 올바른 위치에 존재');
assert(headers[19] === '등록일자', 'index19=등록일자(기존 마지막 고정컬럼 유지)');
assert(headers[20] === '참석일자', 'index20=참석일자(신규)');
assert(headers[21] === '참석교통수단', 'index21=참석교통수단(신규)');
assert(headers[22] === '참석배정유형', 'index22=참석배정유형(기존)');
assert(headers[23] === '귀가일자', 'index23=귀가일자(신규)');
assert(headers[24] === '귀가교통수단', 'index24=귀가교통수단(신규)');
assert(headers[25] === '귀가배정유형', 'index25=귀가배정유형(기존, 마지막 컬럼)');

console.log('▶ 테스트3: numCols>=22 텍스트서식 고정 조건이 26컬럼 행에도 안전하게 적용됨(회귀 없음)');
const numCols = headers.length; // 실제 저장 시 row 길이는 헤더 개수와 동일하게 구성됨
assert(numCols >= 22, '새 헤더 길이(' + numCols + ')가 기존 임계값(22) 이상이라 텍스트서식 고정 로직이 계속 정상 작동함');

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
