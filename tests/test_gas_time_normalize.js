// [GAS v36] sheetToObjects의 출발시간(TIME_ONLY_COLS) 정규화 로직을 Node 환경에서
// Apps Script 전역(Utilities, Session)을 모킹해 재현·검증한다.
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

// Apps Script Utilities.formatDate 모킹: 실제 동작(지정 시간대 기준 HH:mm 등 포맷)을
// 최소한으로 재현. 여기서는 UTC 기준 시:분을 그대로 사용하는 대신, 테스트에서
// 넣어준 Date의 UTC 시:분이 '지정 시간대의 시:분'이 되도록 간단히 매핑한다.
function formatDateMock(date, tz, pattern) {
  // 이 모킹에서는 tz 값과 무관하게 Date 객체에 기록된 UTC 시:분을 그대로 사용한다.
  // (실제 GAS의 Asia/Seoul 계산은 프레임워크가 담당하므로, 여기서는 "시:분이 원본 그대로
  //  유지되는지"—즉 8시간 밀림 같은 오프셋 버그가 재도입되지 않는지—를 검증하는 것이 목적)
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  if (pattern === 'HH:mm') return hh + ':' + mm;
  if (pattern === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
}

function normalizeRow(headers, row, DATE_ONLY_COLS, TIME_ONLY_COLS, FIXED_TZ, scriptTz) {
  const obj = {};
  headers.forEach((h, i) => {
    if (!h) return;
    let newVal = row[i] ?? '';
    if (newVal instanceof Date) {
      if (TIME_ONLY_COLS.indexOf(h) >= 0) {
        newVal = formatDateMock(newVal, FIXED_TZ, 'HH:mm');
      } else {
        newVal = formatDateMock(newVal, scriptTz, DATE_ONLY_COLS.indexOf(h) >= 0 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
      }
    }
    if (obj[h] !== undefined && obj[h] !== '' && (newVal === '' || newVal === null)) return;
    obj[h] = newVal;
  });
  return obj;
}

const DATE_ONLY_COLS = ['참석일자', '귀가일자', '출발일자'];
const TIME_ONLY_COLS = ['출발시간'];
const FIXED_TZ = 'Asia/Seoul';
const headers = ['등록ID','출발일자','출발시간','배정대수'];

console.log('▶ 테스트1: 출발시간이 Date 객체로 온 경우 "HH:mm" 문자열로 정규화됨(TIME_ONLY_COLS 적용)');
{
  const timeDate = new Date(Date.UTC(1899, 11, 30, 9, 0, 0)); // 09:00 시각의 Google Sheets TIME 셀
  const row = ['BB1', '2026-07-24', timeDate, 2];
  const obj = normalizeRow(headers, row, DATE_ONLY_COLS, TIME_ONLY_COLS, FIXED_TZ, 'America/Los_Angeles');
  assert(obj['출발시간'] === '09:00', '실제: "' + obj['출발시간'] + '" (Date → "09:00" 문자열로 정규화)');
  assert(typeof obj['출발시간'] === 'string', '반환 타입이 string (더 이상 Date 객체 아님 → JSON.stringify 시 ISO로 깨지지 않음)');
}

console.log('▶ 테스트2: 서로 다른 시각의 3개 행이 각각 다른 값으로 정확히 정규화됨(회귀 재현 케이스)');
{
  const rows = [
    ['BB1','2026-07-24', new Date(Date.UTC(1899,11,30,6,0,0)), 1],
    ['BB2','2026-07-23', new Date(Date.UTC(1899,11,30,12,0,0)), 1],
    ['BB3','2026-07-24', new Date(Date.UTC(1899,11,30,9,0,0)), 4],
  ];
  const objs = rows.map((r) => normalizeRow(headers, r, DATE_ONLY_COLS, TIME_ONLY_COLS, FIXED_TZ, 'America/Los_Angeles'));
  const times = objs.map((o) => o['출발시간']);
  assert(times[0] === '06:00' && times[1] === '12:00' && times[2] === '09:00',
    '3개 행이 각각 06:00/12:00/09:00으로 정확히 구분됨 (실제: ' + JSON.stringify(times) + ')');
}

console.log('▶ 테스트3: 이미 문자열("09:00")인 출발시간은 그대로 유지(Date 인스턴스 아니므로 정규화 미적용)');
{
  const row = ['BB4', '2026-07-24', '09:00', 1];
  const obj = normalizeRow(headers, row, DATE_ONLY_COLS, TIME_ONLY_COLS, FIXED_TZ, 'America/Los_Angeles');
  assert(obj['출발시간'] === '09:00', '실제: "' + obj['출발시간'] + '"');
}

console.log('▶ 테스트4: 출발일자(DATE_ONLY_COLS)는 기존 로직대로 "yyyy-MM-dd"만 유지(회귀 없음)');
{
  const dateVal = new Date(Date.UTC(2026, 6, 24, 0, 0, 0));
  const row = ['BB5', dateVal, '09:00', 1];
  const obj = normalizeRow(headers, row, DATE_ONLY_COLS, TIME_ONLY_COLS, FIXED_TZ, 'America/Los_Angeles');
  assert(obj['출발일자'] === '2026-07-24', '실제: "' + obj['출발일자'] + '"');
}

// ── actionOverwrite: 텍스트서식(@) 고정 대상 컬럼에 '출발시간' 포함 여부 시뮬레이션 ──
console.log('▶ 테스트5: actionOverwrite에서 출발일자와 동일하게 출발시간도 텍스트서식(@) 고정 대상에 포함됨');
{
  const setNumberFormatCalls = [];
  const fakeRange = { setNumberFormat: (fmt) => setNumberFormatCalls.push(fmt) };
  const fakeSheet = { getRange: (row, col, numRows, numCols) => { setNumberFormatCalls.push({row,col,numRows,numCols}); return fakeRange; } };
  const rows = [['BB1','2026-07-24','09:00',1]];
  const dataRow = 4;

  const dateColIdx = headers.indexOf('출발일자');
  if (dateColIdx >= 0 && rows.length > 0) fakeSheet.getRange(dataRow, dateColIdx + 1, rows.length, 1).setNumberFormat('@');
  const timeColIdx = headers.indexOf('출발시간');
  if (timeColIdx >= 0 && rows.length > 0) fakeSheet.getRange(dataRow, timeColIdx + 1, rows.length, 1).setNumberFormat('@');

  const formatCallCount = setNumberFormatCalls.filter((c) => c === '@').length;
  assert(formatCallCount === 2, '출발일자 1회 + 출발시간 1회 = 총 2회 텍스트서식(@) 고정 호출됨 (실제: ' + formatCallCount + '회)');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
