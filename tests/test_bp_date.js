// [v273] 참석일자/귀가일자 일괄변경 기능 회귀테스트 (jsdom)
// 최신 retreat-site_v*.html에서 관련 코드 블록을 직접 추출해 로드하고, 최소 mock 의존성만
// 주입해 로직을 검증한다. (라인번호에 의존하지 않아 버전이 올라가도 그대로 재사용 가능)
//
// 실행: node test_bp_date.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractRangeFromVarToFunctionEnd } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
// bpStagedArrive 선언부 ~ bpBulkToggleTransport 함수 끝까지: 참석/귀가일자 일괄변경 관련
// 상태변수·함수가 모두 이 구간에 몰려있어 통째로 추출한다.
const codeBlock = extractRangeFromVarToFunctionEnd(fullSrc, 'bpStagedArrive', 'bpBulkToggleTransport');

function freshEnv() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const window = dom.window;
  const document = window.document;

  // ── mock 데이터/의존 함수 ──────────────────────────────
  const retreat = [
    { id: '1', receiptId: 'R1', name: '홍길동', year:'2026', retreatType:'하계', event:'3차',
      parish:'3교구', district:'31구역', group:'청년회',
      arriveDate: '2026-07-20', arriveTransport:'버스', arriveAssignType:'본대',
      leaveDate: '2026-07-23', leaveTransport:'버스', leaveAssignType:'본대' },
    { id: '2', receiptId: 'R2', name: '김철수', year:'2026', retreatType:'하계', event:'3차',
      parish:'3교구', district:'31구역', group:'청년회',
      arriveDate: '', arriveTransport:'자동차', arriveAssignType:'',
      leaveDate: '', leaveTransport:'자동차', leaveAssignType:'' }
  ];

  const apiCalls = [];
  const ctx = {
    document,
    retreat,
    $id: (id) => document.getElementById(id),
    $val: (id) => { const e = document.getElementById(id); return e ? e.value : ''; },
    $set: (id, v) => { const e = document.getElementById(id); if (e) e.value = v; },
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    fmtDate: (v) => {
      if (!v && v !== 0) return '-';
      const s = String(v).trim();
      if (!s || s === '-') return '-';
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      return '-';
    },
    maskName: (n) => n,
    _enrollAddDays: (dateStr, days) => {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return '';
      d.setDate(d.getDate() + days);
      const mm = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
      return d.getFullYear() + '-' + mm + '-' + dd;
    },
    USE_SHEET: () => false, // 시트 미사용 모드 — apiCall 미호출 경로 검증
    apiCall: (payload) => { apiCalls.push(payload); return Promise.resolve({ success: true }); },
    toSheetObj: (r) => r,
    showLoading: () => {},
    showToast: () => {},
    save: () => {},
    updateStats: () => {},
    updateBusUnassignedBadge: () => {},
    PAGE_SIZE: 15, // 블록 내 bpDoSearch→bpRenderTable 실행 경로가 참조(실제 앱에서도 동일 상수)
    _rosterFullArr: {}, _rosterFullLv: {}, // bpBusAssignInfo가 참조
    isJuniorHighBus: undefined,
    busGetTeamKey: (r) => ((r.parish||'미분류') + ' ' + (r.district||'')).trim(), // [v278] bpBusAssignInfo가 참조
  };

  const src = codeBlock;
  const fn = new Function(...Object.keys(ctx), src + `
    return {
      getStagedArriveDate: function(){ return bpStagedArriveDate; },
      getStagedLeaveDate:  function(){ return bpStagedLeaveDate;  },
      getSelectedIds:      function(){ return bpSelectedIds;      },
      bpEditDate: bpEditDate, bpStageDate: bpStageDate, bpCancelDateEdit: bpCancelDateEdit,
      bpRedrawDateBadge: bpRedrawDateBadge, bpDateBadgeStyle: bpDateBadgeStyle,
      bpToggleCheck: bpToggleCheck, bpToggleAll: bpToggleAll, bpRefreshRowBadges: bpRefreshRowBadges,
      bpUpdateBulkBtnLabel: bpUpdateBulkBtnLabel, bpApplyDateChange: bpApplyDateChange,
      bpBulkToggleTransport: bpBulkToggleTransport
    };
  `);
  const mod = fn(...Object.values(ctx));
  return { window, document, retreat, apiCalls, mod };
}

function makeRow(document, idStr) {
  // <tr>은 <table><tbody> 컨텍스트 없이 innerHTML로 삽입하면 파서가 제거하므로 tbody를 통해 삽입
  let tbody = document.getElementById('bp-table-body');
  if (!tbody) {
    const table = document.createElement('table');
    tbody = document.createElement('tbody');
    tbody.id = 'bp-table-body';
    table.appendChild(tbody);
    document.body.appendChild(table);
  }
  tbody.insertAdjacentHTML('beforeend', `
    <tr id="bptr-${idStr}">
      <td><input type="checkbox" class="bp-chk-row" data-id="${idStr}"></td>
      <td id="bp-arrive-date-cell-${idStr}"><span class="bp-date-badge" id="bp-arrive-date-badge-${idStr}"></span></td>
      <td id="bp-leave-date-cell-${idStr}"><span class="bp-date-badge" id="bp-leave-date-badge-${idStr}"></span></td>
    </tr>`);
}

console.log('▶ 테스트1: bpStageDate — 참석일자 스테이징 + 귀가일자 자동 +3일');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpStageDate('1', 'arrive', '2026-07-25');
  assert(mod.getStagedArriveDate()['1'] === '2026-07-25', '참석일자 스테이징 값 저장됨');
  assert(mod.getStagedLeaveDate()['1'] === '2026-07-28', '귀가일자 자동 +3일 스테이징됨 (07-25 → 07-28)');
  assert(document.getElementById('bp-arrive-date-badge-1').textContent === '2026-07-25', '참석일자 배지 표시값 갱신');
  assert(document.getElementById('bp-leave-date-badge-1').textContent === '2026-07-28', '귀가일자 배지 표시값도 자동 갱신');
  assert(mod.getSelectedIds().has('1'), '스테이징된 행이 선택 목록에 자동 포함됨');
  const chk = document.querySelector('#bptr-1 .bp-chk-row');
  assert(chk.checked === true, '체크박스가 자동으로 체크됨');
}

console.log('▶ 테스트2: 귀가일자를 사용자가 직접 수정하면 자동계산 값을 덮어씀');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpStageDate('1', 'arrive', '2026-07-25'); // leave 자동 07-28
  mod.bpStageDate('1', 'leave', '2026-08-01');  // 사용자가 직접 수정
  assert(mod.getStagedLeaveDate()['1'] === '2026-08-01', '사용자가 직접 지정한 귀가일자가 자동계산값을 덮어씀');
}

console.log('▶ 테스트3: bpEditDate — 배지 클릭 시 인라인 date input으로 전환');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpEditDate('1', 'arrive');
  const input = document.getElementById('bp-arrive-date-input-1');
  assert(!!input, '인라인 date input이 생성됨');
  assert(input.type === 'date', 'input type=date');
  assert(input.value === '2026-07-20', '원본 참석일자 값이 입력창에 반영됨');
}

console.log('▶ 테스트4: bpCancelDateEdit — 값 미선택 시 배지로 원복(스테이징 없음)');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpEditDate('1', 'arrive');
  mod.bpCancelDateEdit('1', 'arrive');
  const badge = document.getElementById('bp-arrive-date-badge-1');
  assert(!!badge, '배지로 원복됨');
  assert(badge.textContent === '2026-07-20', '원본 날짜 그대로 표시');
  assert(!mod.getStagedArriveDate().hasOwnProperty('1'), '스테이징되지 않음');
}

console.log('▶ 테스트5: bpToggleCheck 체크 해제 시 날짜 스테이징 폐기');
{
  const { document, mod } = freshEnv();
  makeRow(document, '1');
  mod.bpStageDate('1', 'arrive', '2026-07-25');
  mod.bpToggleCheck('1', false);
  assert(!mod.getStagedArriveDate().hasOwnProperty('1'), '체크 해제 시 참석일자 스테이징 폐기');
  assert(!mod.getStagedLeaveDate().hasOwnProperty('1'), '체크 해제 시 귀가일자(자동계산분) 스테이징도 폐기');
  assert(document.getElementById('bp-arrive-date-badge-1').textContent === '2026-07-20', '배지가 원본값으로 원복');
}

console.log('▶ 테스트6: bpUpdateBulkBtnLabel — 일괄변경 버튼 카운트에 날짜 스테이징 포함');
{
  const { document, mod } = freshEnv();
  const btn = document.createElement('button');
  btn.id = 'bp-btn-bulk';
  document.body.appendChild(btn);
  makeRow(document, '1');
  makeRow(document, '2');
  mod.bpStageDate('1', 'arrive', '2026-07-25');   // id 1: 참석+귀가(자동) 2건 스테이징이나 고유행은 1개
  mod.getStagedLeaveDate()['2'] = '2026-07-30';       // id 2: 별도 귀가일자만 스테이징
  mod.bpUpdateBulkBtnLabel();
  assert(btn.textContent === '🔁 일괄변경 (2)', '스테이징된 고유 행 수(2건) 기준으로 카운트 표시 — 실제:' + btn.textContent);
}

console.log('▶ 테스트7: bpBulkToggleTransport — 참석일자→귀가일자 순서로 저장, USE_SHEET=false 경로');
{
  const { document, retreat, apiCalls, mod } = freshEnv();
  makeRow(document, '1');
  global.confirm = () => true; // Function 생성자로 실행되는 코드 내 confirm 참조 대응
  global.alert = () => {};
  mod.bpStageDate('1', 'arrive', '2026-07-25'); // leave 자동 07-28도 함께 스테이징
  mod.bpBulkToggleTransport().then(() => {
    const r = retreat.find(x => x.id === '1');
    assert(r.arriveDate === '2026-07-25', '참석일자가 실제 retreat 데이터에 반영됨');
    assert(r.leaveDate === '2026-07-28', '귀가일자(자동계산분)도 실제 retreat 데이터에 반영됨');
    assert(apiCalls.length === 0, 'USE_SHEET=false 이므로 apiCall(시트 저장)이 호출되지 않음');
    assert(Object.keys(mod.getStagedArriveDate()).length === 0, '완료 후 참석일자 스테이징 초기화');
    assert(Object.keys(mod.getStagedLeaveDate()).length === 0, '완료 후 귀가일자 스테이징 초기화');
    finish();
  }).catch((e) => { console.error('테스트7 실패(예외):', e); fail++; finish(); });
}

function finish() {
  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

// 테스트7이 비동기라 마지막에 실행되도록 위에서 직접 finish() 호출됨.
// (테스트1~6은 동기 실행이므로 이 시점엔 이미 완료된 상태)
