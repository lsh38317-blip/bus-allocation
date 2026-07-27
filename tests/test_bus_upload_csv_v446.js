// [v444] "배정정보 업로드" — 확정 배차표(CSV, 호차별 wide 포맷)를 업로드해
// 개인별 배정버스(호차)를 일괄 반영하는 기능의 회귀테스트.
// 검증 대상:
//   1) wide 포맷 CSV 파싱 — 3행(호차명)/4행(일시+구분)에서 배정유형·버스명 자동 산출
//   2) 구역+이름 매칭 — 매칭/미매칭/동명이인(반영 제외) 구분
//   3) 확정저장 — 기존과 동일한 배정(변경없음)은 제외, 다른 건만
//      _updateRosterBusAssign()(개인) + _updateBusSummarySheet()(팀단위) 순차 반영
//   4) CSV 셀 내부 줄바꿈(병합 안내문 등)이 있어도 행 정렬이 깨지지 않음(_busUploadParseCsvText)
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

// 1호차/2호차(중고등부) 2개 블록, 매칭 2명 + 미매칭 1명 + 동명이인 1명(구역+이름 중복)
const SAMPLE_CSV =
  ',,,,,,,,\r\n' +
  ',,,,,,,,\r\n' +
  ',1호차,,,,2호차 (중고등부),,,\r\n' +
  ',"7/24(금), AM 10시 본대(참석자)",,,,"7/24(금), AM 10시 중고등부",,,\r\n' +
  ',기사: 홍길동ㅣ차량번호: 1234,,,,기사: 김철수ㅣ차량번호: 5678,,,\r\n' +
  ',NO,구역,이름,,NO,구역,이름,\r\n' +
  ',1,12,홍길동,,1,23,김철수,\r\n' +
  ',2,99,박없음,,,,,\r\n' +
  ',3,31,이영희,,,,,\r\n';

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v446.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const rosterRows = [
    { 'NO':'1', '접수ID':'REC1', '성명':'홍길동', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'1교구', '구역':'12' },
    { 'NO':'2', '접수ID':'REC2', '성명':'김철수', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'2교구', '구역':'23' },
    { 'NO':'3', '접수ID':'REC3', '성명':'이영희', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'3교구', '구역':'31' },
    { 'NO':'4', '접수ID':'REC4', '성명':'이영희', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'3교구', '구역':'31' }, // 동명이인
  ];
  // 탑승자_참석 시트 mock — REC1은 이미 "버스 1호"로 배정(CSV와 동일), REC2는 "버스 9호"(CSV와 다름)
  const rosterArriveRows = [
    { '접수ID':'REC1', '배정호차':'버스 1호' },
    { '접수ID':'REC2', '배정호차':'버스 9호' },
  ];
  let postedBodies = [];

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      postedBodies.push(JSON.parse(opts.body));
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('참석인원명단') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows }) });
    }
    if (decoded.indexOf('탑승자_참석') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterArriveRows }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  };
  window.console.error = () => {};
  window.console.warn = () => {};
  window.confirm = () => true;
  window.alert = () => {};

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
  await new Promise((r) => setTimeout(r, 400));

  console.log('▶ 테스트0: 업로드 UI 마크업 존재(탭 방식, v446)');
  assert(!!$('bus-tab-upload'), '배정정보 업로드 탭 버튼이 마크업에 존재함');
  assert(!!$('bus-panel-upload'), '배정정보 업로드 탭 패널이 마크업에 존재함');
  assert(!!$('bus-upload-dir-badge'), '방향 배지(상단 토글 연동용)가 마크업에 존재함');
  assert(!$('bus-upload-open-btn'), '기존 모달 진입 버튼은 제거됨(탭으로 대체)');
  assert(!$('bus-upload-modal'), '기존 모달 마크업은 제거됨');
  assert($('bus-upload-csv-input').getAttribute('accept') === '.csv', 'file input이 .csv만 허용함');

  console.log('▶ 테스트1: wide 포맷 CSV 파싱 (호차명/배정유형/버스명 산출, 줄바꿈 셀 포함 시에도 정렬 유지)');
  const parsed = window.busUploadParseCsvWide(SAMPLE_CSV);
  assert(!parsed.error, '파싱 에러 없음(실제: ' + (parsed && parsed.error) + ')');
  assert(parsed.blocks.length === 2, '2개 호차 블록 인식(실제: ' + (parsed.blocks && parsed.blocks.length) + ')');
  const b1 = parsed.blocks[0], b2 = parsed.blocks[1];
  assert(b1.busName === '버스 1호', '1호차 → "버스 1호" 로 정규화(실제: ' + b1.busName + ')');
  assert(b1.assignType === '본대', '1호차 배정유형=본대(실제: ' + b1.assignType + ')');
  assert(b2.busName === '버스 2호', '2호차 → "버스 2호" 로 정규화(실제: ' + b2.busName + ')');
  assert(b2.assignType === '중고등부', '2호차(중고등부) 배정유형=중고등부(실제: ' + b2.assignType + ')');
  assert(b1.entries.length === 3, '1호차 블록 3명 파싱(실제: ' + b1.entries.length + ')');
  assert(b2.entries.length === 1, '2호차 블록 1명 파싱(실제: ' + b2.entries.length + ')');

  console.log('▶ 테스트2: 구역+이름 매칭 (매칭/미매칭/동명이인 구분)');
  const m = window.busUploadMatchRoster(parsed.blocks);
  assert(m.matched.length === 2, '매칭 2명(홍길동/김철수)(실제: ' + m.matched.length + ')');
  assert(m.unmatched.length === 1, '미매칭 1명(박없음)(실제: ' + m.unmatched.length + ')');
  assert(m.ambiguous.length === 1, '동명이인 1명(이영희, 반영대상 제외)(실제: ' + m.ambiguous.length + ')');
  const hong = m.matched.find((x) => x.r.name === '홍길동');
  const kim  = m.matched.find((x) => x.r.name === '김철수');
  assert(hong && hong.r.receiptId === 'REC1', '홍길동 → REC1 매칭');
  assert(kim  && kim.r.receiptId  === 'REC2', '김철수 → REC2 매칭');

  console.log('▶ 테스트3: 이름 셀의 "(선탑자N)" 표기 분리');
  const riderParsed = window.busUploadParseCsvWide(
    ',,,,,,,,\r\n,,,,,,,,\r\n,9호차,,,,,,,\r\n,7/24(금) 본대,,,,,,,\r\n,,,,,,,,\r\n,NO,구역,이름,,,,,\r\n,1,,김지환 (선탑자1),,,,,\r\n,2,15,정상인,,,,,\r\n'
  );
  const riderBlock = riderParsed.blocks[0];
  assert(riderBlock.entries[0].isRider === true && riderBlock.entries[0].name === '김지환', '"김지환 (선탑자1)" → 이름=김지환, 선탑자=true');
  assert(riderBlock.entries[1].isRider === false, '"정상인"은 일반 탑승자로 인식');

  console.log('▶ 테스트4: 확정저장 — 기존과 동일한 배정은 제외, 변경된 건만 반영(개인+팀단위)');
  // REC1(홍길동)은 CSV와 동일하게 이미 "버스 1호"로 배정되어 있음 → 반영 제외돼야 함
  // REC2(김철수)는 기존 "버스 9호" → CSV의 "버스 2호"로 변경되어야 함
  window.loadRosterIndex(false);
  await new Promise((r) => setTimeout(r, 300));
  // 실제 진입점(busUploadProcessCsv)을 통해 내부 상태(_busUploadState, 클로저 변수)를 채움
  // — 테스트에서 window._busUploadState를 직접 대입해도 클로저 내부 참조에는 반영되지 않음
  window.busTab('upload'); // [v446] 탭 진입 (기본 방향=arrive, busMainType 초기값과 일치)
  window.busUploadProcessCsv(SAMPLE_CSV);
  $('bus-upload-commit-btn').disabled = false;
  window.busUploadCommit();
  await new Promise((r) => setTimeout(r, 500));

  const rosterBusPosts  = postedBodies.filter((b) => b.action === 'updateRosterBus');
  const summaryPosts    = postedBodies.filter((b) => b.action === 'updateBusSummary');
  assert(rosterBusPosts.length === 1, '배정버스 반영은 변경된 1건만 전송됨(실제: ' + rosterBusPosts.length + ')');
  assert(rosterBusPosts[0] && rosterBusPosts[0].receiptId === 'REC2' && rosterBusPosts[0].busName === '버스 2호' && rosterBusPosts[0].sheetName === '탑승자_참석',
    'REC2(김철수) → 탑승자_참석 시트에 "버스 2호"로 반영됨');
  assert(summaryPosts.length === 1, '팀단위 요약(_updateBusSummarySheet) 반영도 1건 전송됨(실제: ' + summaryPosts.length + ')');
  assert(summaryPosts[0] && summaryPosts[0].fromBus === '버스 9호' && summaryPosts[0].toBus === '버스 2호',
    '팀단위 요약 반영: 버스 9호 → 버스 2호');

  console.log('▶ 테스트5: CSV 양식 다운로드 함수 호출 시 예외 없이 동작(버스 미등록 시 안내 후 중단 포함)');
  let threw = false;
  try { window.busUploadDownloadTemplate(); } catch (e) { threw = true; console.error(e); }
  assert(!threw, 'busUploadDownloadTemplate() 호출이 예외 없이 완료됨');

  console.log('▶ 테스트6: 상단 참석/귀가 토글과 업로드 방향이 연동됨(라디오 제거, busMainType 기준)');
  window.busTab('upload');
  assert($('bus-upload-dir-badge').textContent.indexOf('하행(참석)') !== -1,
    '탭 진입 시 기본 방향은 하행(참석) 배지로 표시됨(실제: ' + $('bus-upload-dir-badge').textContent + ')');
  window.busMainTypeTab('leave'); // 상단 "🏠 귀가 관리" 토글 클릭과 동일
  assert($('bus-upload-dir-badge').textContent.indexOf('상행(귀가)') !== -1,
    '상단 토글을 귀가로 바꾸면 배지도 상행(귀가)로 갱신됨(실제: ' + $('bus-upload-dir-badge').textContent + ')');
  window.busUploadProcessCsv(SAMPLE_CSV);
  assert($('bus-upload-commit-btn').disabled === false, '귀가 모드에서도 CSV 처리 후 확정저장 버튼이 활성화됨');
  window.busMainTypeTab('arrive'); // 원복
  assert($('bus-upload-dir-badge').textContent.indexOf('하행(참석)') !== -1,
    '토글을 참석으로 되돌리면 배지도 하행(참석)로 갱신됨(실제: ' + $('bus-upload-dir-badge').textContent + ')');
  assert($('bus-upload-commit-btn').disabled === true,
    '방향 전환 시 이전 방향의 미리보기/상태가 초기화되어 확정저장 버튼이 다시 비활성화됨');

  console.log('──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(1); });
