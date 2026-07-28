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

// 1호차/2호차(중고등부) 2개 블록, 매칭 2명 + 미매칭 2명(순수 미등록 1명, 구역표기 불일치 1명) + 동명이인 1명
const SAMPLE_CSV =
  ',,,,,,,,\r\n' +
  ',,,,,,,,\r\n' +
  ',1호차,,,,2호차 (중고등부),,,\r\n' +
  ',"7/24(금), AM 10시 본대(참석자)",,,,"7/24(금), AM 10시 중고등부",,,\r\n' +
  ',기사: 홍길동ㅣ차량번호: 1234,,,,기사: 김철수ㅣ차량번호: 5678,,,\r\n' +
  ',NO,구역,이름,,NO,구역,이름,\r\n' +
  ',1,12,홍길동,,1,23,김철수,\r\n' +
  ',2,99,박없음,,,,,\r\n' +
  ',3,31,이영희,,,,,\r\n' +
  ',4,13,최미아,,,,,\r\n';

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v459.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  // [v447] 참석인원명단의 구역 값은 실제로 "12구역"처럼 접미사가 붙은 형태 — CSV의 "12"(숫자만)와
  // 형식이 달라도 매칭돼야 함(2026-07-27 실사용 중 발견된 "매칭 0건" 버그 재현 케이스)
  const rosterRows = [
    { 'NO':'1', '접수ID':'REC1', '성명':'홍길동', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'1교구', '구역':'12구역' },
    { 'NO':'2', '접수ID':'REC2', '성명':'김철수', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'2교구', '구역':'23구역' },
    { 'NO':'3', '접수ID':'REC3', '성명':'이영희', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'3교구', '구역':'31구역' },
    { 'NO':'4', '접수ID':'REC4', '성명':'이영희', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'3교구', '구역':'31구역' }, // 동명이인
    // [v448] CSV는 "13구역"으로 올라왔지만 실제 등록된 구역은 "19구역"인 경우(2026-07-27 스크린샷 재현:
    // 참석인원명단에는 분명 존재하는데 구역표기 문제로 미매칭 처리되는 케이스)
    { 'NO':'5', '접수ID':'REC5', '성명':'최미아', '연도':'2026', '수양회종류':'하계', '행사명':'3차', '교구':'1교구', '구역':'19구역' },
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
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
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
  assert(!$('bus-upload-dir-badge'), '[v449] 방향 배지는 UI에서 제거됨(CSV 양식 다운로드/파일 선택 버튼만 헤더에 위치)');
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
  assert(b1.entries.length === 4, '1호차 블록 4명 파싱(실제: ' + b1.entries.length + ')');
  assert(b2.entries.length === 1, '2호차 블록 1명 파싱(실제: ' + b2.entries.length + ')');

  console.log('▶ 테스트2: 구역+이름 매칭 (매칭/미매칭/동명이인 구분, [v459] 이름 단일후보 자동확정 포함)');
  const m = window.busUploadMatchRoster(parsed.blocks);
  assert(m.matched.length === 3, '매칭 3명(홍길동/김철수/최미아-이름매칭 자동확정)(실제: ' + m.matched.length + ')');
  assert(m.unmatched.length === 1, '미매칭 1명(박없음, 진짜 미등록)(실제: ' + m.unmatched.length + ')');
  assert(m.ambiguous.length === 1, '동명이인 1명(이영희, 반영대상 제외)(실제: ' + m.ambiguous.length + ')');
  const hong = m.matched.find((x) => x.r.name === '홍길동');
  const kim  = m.matched.find((x) => x.r.name === '김철수');
  const choi = m.matched.find((x) => x.r.name === '최미아');
  assert(hong && hong.r.receiptId === 'REC1', '홍길동 → REC1 매칭');
  assert(kim  && kim.r.receiptId  === 'REC2', '김철수 → REC2 매칭');
  assert(choi && choi.r.receiptId === 'REC5' && choi.matchedByName === true,
    '[v459] 최미아 → CSV 구역(13)과 실제 구역(19구역)이 달라도 이름 단일후보라 자동 매칭 확정됨(matchedByName=true)');

  console.log('▶ 테스트2-1: [v448] 미매칭(진짜 미등록) 진단정보 확인');
  const noCand = m.unmatched.find((x) => x.entry.name === '박없음');
  assert(noCand && (!noCand.nameOnlyCandidates || noCand.nameOnlyCandidates.length === 0),
    '"박없음"(순수 미등록)은 이름 후보도 없음(실제: ' + (noCand && noCand.nameOnlyCandidates ? noCand.nameOnlyCandidates.length : 'undefined') + ')');
  window.busUploadProcessCsv(SAMPLE_CSV); // 미리보기 렌더까지 확인
  const previewHtml = $('bus-upload-preview').innerHTML;
  assert(previewHtml.indexOf('이름매칭 자동확정') !== -1, '미리보기 화면에 "이름매칭 자동확정" 건수 문구가 노출됨');
  assert(previewHtml.indexOf('이름 후보 없음') !== -1, '미리보기 화면에 순수 미등록(이름 후보 없음) 문구가 노출됨');

  console.log('▶ 테스트3: 이름 셀의 "(선탑자N)" 표기 분리');
  const riderParsed = window.busUploadParseCsvWide(
    ',,,,,,,,\r\n,,,,,,,,\r\n,9호차,,,,,,,\r\n,7/24(금) 본대,,,,,,,\r\n,,,,,,,,\r\n,NO,구역,이름,,,,,\r\n,1,,김지환 (선탑자1),,,,,\r\n,2,15,정상인,,,,,\r\n'
  );
  const riderBlock = riderParsed.blocks[0];
  assert(riderBlock.entries[0].isRider === true && riderBlock.entries[0].name === '김지환', '"김지환 (선탑자1)" → 이름=김지환, 선탑자=true');
  assert(riderBlock.entries[1].isRider === false, '"정상인"은 일반 탑승자로 인식');

  console.log('▶ 테스트4: [v459] 확정저장 — 배정유형별로 요약/팀내역/탑승자 시트를 전체 재계산해 덮어씀');
  // SAMPLE_CSV 매칭 결과: 본대(홍길동,최미아) + 중고등부(김철수) → 배정유형 2종, 각 3개 시트 순차 POST
  window.busTab('upload');
  window.busUploadProcessCsv(SAMPLE_CSV);
  $('bus-upload-commit-btn').disabled = false;
  window.busUploadCommit();
  await new Promise((r) => setTimeout(r, 800));

  const overwritePosts = postedBodies.filter((b) => b.mode === 'overwrite');
  const teamPosts    = overwritePosts.filter((b) => b.sheetName === '버스배정_참석팀내역');
  const summaryPosts = overwritePosts.filter((b) => b.sheetName === '버스배정_참석요약');
  const rosterPosts  = overwritePosts.filter((b) => b.sheetName === '탑승자_참석');
  assert(teamPosts.length === 2 && summaryPosts.length === 2 && rosterPosts.length === 2,
    '배정유형 2종(본대/중고등부)마다 팀내역·요약·탑승자 3개 시트가 각각 저장됨(실제: 팀내역'+teamPosts.length+'·요약'+summaryPosts.length+'·탑승자'+rosterPosts.length+')');

  const mainTeamPost = teamPosts.find((b) => b.rows.some((r) => r[4] === '본대'));
  assert(!!mainTeamPost, '본대 배정유형 팀내역 저장 확인됨');
  // 최미아(REC5)는 이름매칭으로 확정됐지만 실제 등록된 구역은 "19구역"(CSV의 "13"과 다름) —
  // busGetTeamKey()는 실제 참석인원명단 값을 기준으로 하므로 홍길동(13구역)과는 별도 팀으로 집계되어야 함
  const gu12Row = mainTeamPost.rows.find((r) => r[4] === '본대' && r[6] === '12구역');
  const gu19Row = mainTeamPost.rows.find((r) => r[4] === '본대' && r[6] === '19구역');
  assert(gu12Row && Number(gu12Row[7]) === 1, '1교구 12구역 팀(홍길동) 인원수 1명(실제: ' + (gu12Row && gu12Row[7]) + ')');
  assert(gu19Row && Number(gu19Row[7]) === 1,
    '[v459] 최미아는 실제 등록구역(19구역) 기준으로 별도 팀 집계됨(실제: ' + (gu19Row && gu19Row[7]) + ')');

  const jhRosterPost = rosterPosts.find((b) => b.rows.some((r) => r[4] === '중고등부'));
  assert(!!jhRosterPost, '중고등부 배정유형 탑승자 저장 확인됨');
  const kimRow = jhRosterPost.rows.find((r) => r[5] === 'REC2');
  assert(kimRow && kimRow[6] === '버스 2호', '김철수(REC2)가 탑승자_참석에 버스 2호로 기록됨');

  const choiRosterPost = rosterPosts.find((b) => b.rows.some((r) => r[5] === 'REC5'));
  assert(!!choiRosterPost, '이름매칭으로 확정된 최미아(REC5)도 탑승자_참석에 정상 반영됨');

  console.log('▶ 테스트5: CSV 양식 다운로드 함수 호출 시 예외 없이 동작(버스 미등록 시 안내 후 중단 포함)');
  let threw = false;
  try { window.busUploadDownloadTemplate(); } catch (e) { threw = true; console.error(e); }
  assert(!threw, 'busUploadDownloadTemplate() 호출이 예외 없이 완료됨');

  console.log('▶ 테스트6: [v449] 상단 참석/귀가 토글과 업로드 방향이 연동됨(배지 UI는 v449에서 제거, busMainType 내부 상태로 검증)');
  window.busTab('upload');
  window.busUploadProcessCsv(SAMPLE_CSV);
  assert($('bus-upload-commit-btn').disabled === false, '하행(참석) 모드에서 CSV 처리 후 확정저장 버튼이 활성화됨');
  window.busMainTypeTab('leave'); // 상단 "🏠 귀가 관리" 토글 클릭과 동일
  assert($('bus-upload-commit-btn').disabled === true,
    '방향 전환 시 이전 방향의 미리보기/상태가 초기화되어 확정저장 버튼이 다시 비활성화됨');
  window.busUploadProcessCsv(SAMPLE_CSV);
  assert($('bus-upload-commit-btn').disabled === false, '귀가 모드에서도 CSV 처리 후 확정저장 버튼이 활성화됨');
  window.busMainTypeTab('arrive'); // 원복
  assert($('bus-upload-commit-btn').disabled === true,
    '토글을 참석으로 되돌리면 이전(귀가) 상태가 초기화되어 확정저장 버튼이 다시 비활성화됨');

  console.log('▶ 테스트7: [v450] 버스 배정/배정 현황 카드에서 "🎒 중고등부" 리본 배지가 제거됨(1명만 섞여도 카드 전체에 뜨던 문제 수정)');
  // 카드 모서리 리본(position:absolute + 🎒 중고등부)만 확인 — 참석버스 데이터 연동 표의
  // "🎒 중고등부" 라벨 셀(_busRenderImportTable, 정상 데이터 표시)은 대상 아님
  assert(!/position:absolute[^>]*>🎒 중고등부/.test(html0), '카드 모서리의 중고등부 리본 배지 패턴이 더 이상 존재하지 않음');

  console.log('──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(1); });
