// [v280] ① bbEventOptionsRefresh 콜백 순서 보장 ② 상세팝업 안내문구가 그리드헤더보다 먼저 렌더되는지 검증
//
// 실행: node test_bb_event_map_modal_order.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, extractFunctionSource } = require('./test-helpers.js');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const html = fs.readFileSync(targetFile, 'utf-8');
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
const fullSrc = scriptMatch[1];

// ===================== 테스트1: bbEventOptionsRefresh 콜백 순서 보장 =====================
console.log('▶ 테스트1: bbEventOptionsRefresh(cb) — 교회목표 로드 전이면 로드 완료 후에만 cb 호출');
{
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<select id="bb-year-sel"><option value="2026" selected>2026</option></select>' +
    '<select id="bb-season-sel"><option value="하계" selected>하계</option></select>' +
    '<select id="bb-event-sel"><option value="3차" selected>3차</option></select>' +
    '</body></html>');
  const document = dom.window.document;
  const callLog = [];
  var goalState = { loaded: false, loading: false };
  const _goalRows = [
    { year: '2026', retreatType: '하계', eventName: '1차' },
    { year: '2026', retreatType: '하계', eventName: '2차' },
  ];
  const ctx = {
    document,
    $id: (id) => document.getElementById(id),
    esc: (s) => String(s || ''),
    USE_SHEET: () => true,
    goalState,
    _goalRows,
    _goalFetchFromSheet: (cb) => {
      callLog.push('goalFetchStart');
      setTimeout(() => { goalState.loaded = true; callLog.push('goalFetchDone'); cb(); }, 10);
    },
  };
  // 원본 함수 소스 내 `_goalLoaded`/`_goalLoading` 참조를 테스트 상태 객체(goalState) 프로퍼티로 치환
  // (원시값 매개변수는 함수 내부에서의 재할당이 테스트 쪽으로 반영되지 않으므로, 객체 참조로 공유)
  const patchedSrc = extractFunctionSource(fullSrc, 'bbEventOptionsRefresh')
    .replace(/_goalLoaded/g, 'goalState.loaded')
    .replace(/_goalLoading/g, 'goalState.loading');
  const fn = new Function(...Object.keys(ctx), patchedSrc + '\nreturn bbEventOptionsRefresh;');
  const bbEventOptionsRefresh = fn(...Object.values(ctx));

  bbEventOptionsRefresh(function(){ callLog.push('afterMapping'); });
  assert(callLog[0] === 'goalFetchStart', '교회목표 미로드 상태에서는 fetch부터 시작함');
  assert(callLog.indexOf('afterMapping') === -1, 'fetch 완료 전에는 콜백이 아직 호출되지 않음(동기 시점 기준)');

  setTimeout(() => {
    assert(callLog.indexOf('goalFetchDone') < callLog.indexOf('afterMapping'), '교회목표 로드 완료 이후에 콜백이 호출됨 (실제 순서: ' + JSON.stringify(callLog) + ')');
    const evSel = document.getElementById('bb-event-sel');
    assert(evSel.value === '3차' || evSel.value === '1차', '옵션이 갱신되어 유효한 값으로 세팅됨(실제: ' + evSel.value + ')');
    runTest2();
  }, 30);
}

// ===================== 테스트2: 상세팝업 안내문구가 그리드헤더보다 먼저 표시 =====================
function runTest2() {
  console.log('▶ 테스트2: 상세팝업 — 안내문구(bb-driver-modal-info)가 표(그리드헤더) 앞에 위치');
  const dom = new JSDOM(fs.readFileSync(targetFile, 'utf-8'));
  const document = dom.window.document;
  const infoEl = document.getElementById('bb-driver-modal-info');
  const tableWrap = infoEl ? infoEl.nextElementSibling : null;
  assert(!!infoEl, 'bb-driver-modal-info 영역이 모달 HTML에 존재함');
  assert(tableWrap && tableWrap.classList.contains('table-wrap'), 'bb-driver-modal-info 바로 다음에 표(table-wrap)가 옴(안내문구가 헤더보다 먼저)');

  console.log('▶ 테스트3: _bbRenderDriverModal — 안내문구는 info 영역에, tbody에는 운전자 행만 렌더');
  const src = extractFunctionSource(fullSrc, '_bbRenderDriverModal');
  const ctx = {
    document,
    $id: (id) => document.getElementById(id),
    esc: (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    bbFormatPhone: (v) => v,
    bbNormalizeBaeLabel: (v) => { var s=String(v||'').trim(); return /^\d+$/.test(s) ? s+'호' : s; },
    _bbDriverRows: [
      { '등록ID':'BB1', '배차':'1', '이름':'홍길동', '연락처':'01000000000', '승차위치':'교회당앞', '하차위치':'소망관' },
    ],
  };
  const fn = new Function(...Object.keys(ctx), src + '\nreturn _bbRenderDriverModal;');
  const _bbRenderDriverModal = fn(...Object.values(ctx));

  _bbRenderDriverModal([{ '등록ID':'BB1', '배정유형':'선발대(봉사자)', '운행방향':'참석', '출발일자':'2026-07-24', '출발시간':'06:00', '배정대수':'2' }], '운전자/승하차정보');

  const info = document.getElementById('bb-driver-modal-info');
  const tbody = document.getElementById('bb-driver-modal-body');
  assert(info.textContent.indexOf('선발대(봉사자)') !== -1, '안내문구가 info 영역에 렌더됨');
  assert(tbody.querySelectorAll('tr').length === 1, 'tbody에는 안내문구 행 없이 운전자 행만 존재(1건)');
  assert(tbody.textContent.indexOf('선발대(봉사자)') === -1, 'tbody 안에는 더 이상 안내문구 텍스트가 섞이지 않음');
  assert(tbody.textContent.indexOf('홍길동') !== -1, '운전자 정보(이름)는 정상적으로 tbody에 표시됨');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}
