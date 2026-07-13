// [v41] 선탑자ID를 버스배정_운전자정보로 이관한 구조개선 회귀테스트
// 검증 대상:
//   1) "배정대수불러오기" 클릭으로 로드된 선탑자가 _busLeaderCache에 반영되고,
//      최초 자동배정(oldBuses가 비어있는 시점) 시에도 팀 소속 기준으로 정확히 승계됨
//   2) 자동배정 결과 저장 시 버스배정_참석요약에는 선탑자ID 컬럼이 더 이상 존재하지 않음
//      (placeholder 행 재발 방지 핵심 확인)
//   3) 패널 진입/탭 전환만으로는 버스배정_기초정보·운전자정보 조회가 발생하지 않음(v286 원칙 유지)
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v300.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const baseInfoRows = [
    { 'NO':'1', '등록ID':'BB1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대(참석자)', '운행방향':'참석', '배정대수':'1' },
  ];
  // 1호 배차에 이미 선탑자(R1=홍길동, 3교구 31구역)가 지정돼 있는 상태로 시작
  const driverRows = [
    { 'NO':'1', '등록ID':'BB1', '배차':'1호', '이름':'', '연락처':'', '차량번호':'', '승차위치':'', '하차위치':'', '선탑자ID':'R1' },
  ];
  const rosterRows = [
    { 'NO':'1', '접수ID':'R1', '성명':'홍길동', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'본대(참석자)', '연도':'2026', '수양회종류':'하계', '행사명':'1차' },
    { 'NO':'2', '접수ID':'R2', '성명':'김철수', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'본대(참석자)', '연도':'2026', '수양회종류':'하계', '행사명':'1차' },
  ];
  const teamRows = [
    { 'NO':'1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대(참석자)', '교구':'3교구', '구역/팀명':'31구역', '인원수':'2', '배정상태':'미배정', '버스':'', '분산배정':'', '비고':'' },
  ];

  let baseInfoFetchCount = 0;
  let summaryPostSent = false;

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      if (body.sheetName === '버스배정_참석요약' || body.sheetName === '버스배정_귀가요약') {
        summaryPostSent = true;
        // [v41] 참석요약 저장행에 선탑자ID 컬럼이 없어야 함(헤더 길이 10, 선탑자ID 포함 시 11)
        if (body.headers) {
          assert(body.headers.indexOf('선탑자ID') === -1, '[v41] 저장 시 전송된 요약시트 헤더에 선탑자ID 컬럼이 없음 (헤더: ' + JSON.stringify(body.headers) + ')');
        }
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('버스배정_기초정보') !== -1) {
      baseInfoFetchCount++;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseInfoRows }) });
    }
    if (decoded.indexOf('버스배정_운전자정보') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: driverRows }) });
    }
    if (decoded.indexOf('참석인원명단') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows }) });
    }
    if (decoded.indexOf('버스배정_참석팀내역') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamRows }) });
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
  await new Promise((r) => setTimeout(r, 500));

  console.log('▶ 테스트1: 패널 진입만으로는 기초정보/운전자정보 조회가 발생하지 않음(v286 원칙 유지)');
  assert(baseInfoFetchCount === 0, '패널 진입만으로는 버스배정_기초정보 조회가 발생하지 않음(실제: ' + baseInfoFetchCount + ')');

  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  baseInfoRows[0]['년도'] = curYear;
  rosterRows.forEach((r) => { r['연도'] = curYear; });
  teamRows.forEach((r) => { r['년도'] = curYear; });
  $('bus-sel-assigntype').value = '본대(참석자)';

  console.log('▶ 테스트2: "배정대수불러오기" 클릭 시에만 조회 발생 + 선탑자 캐시 반영');
  window.busLeaderRender();
  await new Promise((r) => setTimeout(r, 200));
  assert(baseInfoFetchCount === 1, '버튼 클릭으로 정확히 1회 조회됨(실제: ' + baseInfoFetchCount + ')');
  assert(!!$('leader-in-name-1') && $('leader-in-name-1').value === '홍길동', '기존 저장된 선탑자(홍길동)가 입력칸에 프리필됨');

  console.log('▶ 테스트3: 최초 자동배정(oldBuses 비어있음) 시에도 캐시를 통해 선탑자가 팀 기준으로 승계됨');
  // 팀 데이터 로드(참석팀내역 기준) 후 자동배정 실행
  window.busAssignSub = 'arrive';
  await new Promise((resolve) => {
    window.busLoadTeamsFromSheet('arrive', resolve);
  });
  await new Promise((r) => setTimeout(r, 100));

  window.busAutoAssign('arrive');
  await new Promise((r) => setTimeout(r, 150));

  window.busSummarySubTab('arrive');
  await new Promise((r) => setTimeout(r, 50));
  const summaryText = $('bus-summary-content') ? $('bus-summary-content').textContent : '';
  assert(summaryText.indexOf('먼저 버스 배정을 완료해주세요') === -1, '자동배정 결과로 참석버스가 실제로 생성됨(빈 상태 아님)');
  assert(summaryText.indexOf('홍길동') !== -1, '[v41 핵심] 최초 자동배정임에도 _busLeaderCache를 통해 선탑자(홍길동)가 배정현황에 표시됨');

  console.log('▶ 테스트4: 자동배정 결과 저장 시 요약시트에는 선탑자ID 컬럼이 전송되지 않음');
  window.busSaveToSheet('arrive');
  await new Promise((r) => setTimeout(r, 200));
  assert(summaryPostSent === true, '참석요약 저장 요청이 전송됨');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
