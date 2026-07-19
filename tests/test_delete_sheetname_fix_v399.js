// [v399] deleteRow()/bpDeleteRow() 삭제 API 호출에 sheetName 누락 버그 및
// 실패 메시지 필드(res.message vs res.error) 버그 수정 회귀테스트
//
// 실행: node test_delete_sheetname_fix_v399.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const deleteRowSrc = extractFunctionSource(fullSrc, 'deleteRow');
const bpDeleteRowSrc = extractFunctionSource(fullSrc, 'bpDeleteRow');

console.log('▶ 테스트1: deleteRow()의 참석인원명단 삭제 호출에 sheetName이 명시됨');
assert(/apiCall\(\{action:'delete',\s*sheetName:'참석인원명단',\s*id:deleteKey\}\)/.test(deleteRowSrc),
  "apiCall 호출에 sheetName:'참석인원명단'이 포함됨");

console.log('▶ 테스트2: bpDeleteRow()의 참석인원명단 삭제 호출에도 sheetName이 명시됨');
assert(/apiCall\(\{action:'delete',\s*sheetName:'참석인원명단',\s*id:deleteKey\}\)/.test(bpDeleteRowSrc),
  "apiCall 호출에 sheetName:'참석인원명단'이 포함됨");

console.log('▶ 테스트3: deleteRow() 실패 메시지가 res.message||res.error 폴백을 사용함(더 이상 res.message 단독 아님)');
assert(/res\.message\s*\|\|\s*res\.error/.test(deleteRowSrc), 'res.message||res.error 폴백 패턴 확인');
assert(!/'삭제 실패: '\+res\.message,'error'\)/.test(deleteRowSrc), "res.message 단독 참조 패턴이 더 이상 없음(실제: 폴백 적용됨)");

console.log('▶ 테스트4: bpDeleteRow() 실패 메시지도 동일하게 폴백 적용됨');
assert(/res\.message\s*\|\|\s*res\.error/.test(bpDeleteRowSrc), 'res.message||res.error 폴백 패턴 확인');
assert(!/'삭제 실패: '\+res\.message,'error'\)/.test(bpDeleteRowSrc), "res.message 단독 참조 패턴이 더 이상 없음(실제: 폴백 적용됨)");

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
