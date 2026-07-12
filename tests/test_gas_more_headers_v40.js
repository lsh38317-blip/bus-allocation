// [GAS v40] 버스배정_참석팀내역/귀가팀내역, 탑승자_참석/귀가 SHEET_HEADERS에 배정유형 추가 검증
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const src = fs.readFileSync('/home/claude/work/gas/수양회관리_AppScript_v40.gs', 'utf-8');

function getHeaders(sheetName) {
  const re = new RegExp("'" + sheetName + "':\\s*\\[([\\s\\S]*?)\\]");
  const m = src.match(re);
  if (!m) throw new Error(sheetName + ' 헤더를 찾을 수 없습니다');
  return eval('[' + m[1] + ']');
}

const cases = [
  { name: '버스배정_참석팀내역', expected: ['NO','년도','수양회종류','행사명','배정유형','교구','구역/팀명','인원수','배정상태','버스','분산배정','비고'] },
  { name: '버스배정_귀가팀내역', expected: ['NO','년도','수양회종류','행사명','배정유형','교구','구역/팀명','인원수','배정상태','버스','분산배정','비고'] },
  { name: '탑승자_참석',         expected: ['NO','년도','수양회종류','행사명','배정유형','접수ID','버스명','상차위치','하차위치','교구','구역','이름','회별','일자','배정호차','성별'] },
  { name: '탑승자_귀가',         expected: ['NO','년도','수양회종류','행사명','배정유형','접수ID','버스명','상차위치','하차위치','교구','구역','이름','회별','일자','배정호차','성별'] },
];

cases.forEach((c) => {
  console.log('▶ 테스트: ' + c.name + ' 헤더에 배정유형이 행사명 뒤에 정확히 삽입됨');
  const headers = getHeaders(c.name);
  assert(JSON.stringify(headers) === JSON.stringify(c.expected), c.name + ' 헤더 전체 일치 (실제: ' + JSON.stringify(headers) + ')');
  assert(headers.indexOf('배정유형') === headers.indexOf('행사명') + 1, c.name + ': 배정유형이 행사명 바로 뒤에 위치');
});

console.log('▶ 테스트: 기존 버스배정_참석요약/귀가요약(v38에서 이미 추가됨) 회귀 없음 재확인');
['버스배정_참석요약','버스배정_귀가요약'].forEach((name) => {
  const headers = getHeaders(name);
  assert(headers.indexOf('배정유형') === 3, name + ': 배정유형 위치(index3) 유지됨');
});

console.log('▶ 테스트: 참석인원명단(v39에서 이미 추가됨) 회귀 없음 재확인');
{
  const headers = getHeaders('참석인원명단');
  assert(headers.length === 26, '참석인원명단 26개 컬럼 유지');
  assert(headers[20] === '참석일자' && headers[23] === '귀가일자', '참석일자/귀가일자 위치 유지됨');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
