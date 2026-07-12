#!/usr/bin/env node
/**
 * test_room_save_dedup_v279.js
 *
 * [v279] roomSaveToSheet() — 숙소배정 저장 시 roomData에 다른 회차 데이터가 섞여 있어도
 * (예: roomRestore()가 회차 필터 없이 시트 전체를 로드해둔 상태에서 곧바로 저장하는 경우)
 * 저장 결과에 다른 회차 데이터가 중복 등록되지 않는지 검증한다.
 *
 * 실행: node test_room_save_dedup_v279.js [retreat-site 파일 경로]
 *   - 경로를 생략하면 현재 디렉토리에서 가장 최신 버전의 retreat-site_v*.html 을 자동으로 찾는다.
 *
 * 원리: 대상 HTML 파일의 <script> 안에서 실제 roomSaveToSheet 함수 소스를 그대로 추출해
 * (중괄호 균형 매칭 — 라인번호에 의존하지 않아 향후 버전에서도 재사용 가능) 최소한의
 * Apps/브라우저 전역(fetch, apiCall, showToast 등)만 모킹한 뒤 실제 로직을 그대로 실행한다.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

// ── 대상 HTML 파일 경로 결정 ──────────────────────────────────────────────
function resolveTargetFile() {
  const argPath = process.argv[2];
  if (argPath) return argPath;
  const dir = process.cwd();
  const candidates = fs.readdirSync(dir).filter((f) => /^retreat-site_v\d+\.html$/.test(f));
  if (!candidates.length) {
    console.error('retreat-site_v*.html 파일을 찾을 수 없습니다. 경로를 인자로 지정해 주세요.');
    process.exit(1);
  }
  candidates.sort((a, b) => {
    const na = parseInt(a.match(/_v(\d+)\.html$/)[1], 10);
    const nb = parseInt(b.match(/_v(\d+)\.html$/)[1], 10);
    return nb - na; // 최신(가장 큰 버전) 우선
  });
  return path.join(dir, candidates[0]);
}

// ── 중괄호 균형 매칭으로 "function NAME(...){ ... }" 전체 소스를 추출 ──────────────
function extractFunctionSource(src, fnName) {
  const startMatch = src.match(new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!startMatch) throw new Error(fnName + ' 함수를 대상 파일에서 찾을 수 없습니다.');
  const startIdx = startMatch.index;
  let depth = 0, i = startIdx;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(startIdx, i);
}

const targetFile = resolveTargetFile();
console.log('대상 파일:', targetFile);
const html = fs.readFileSync(targetFile, 'utf-8');
const roomSaveToSheetSrc = extractFunctionSource(html, 'roomSaveToSheet');

// ── 테스트 컨텍스트: roomSaveToSheet가 참조하는 전역을 최소한으로 모킹 ──────────────
function freshCtx(roomDataInit) {
  const domSelects = { year: '2026', type: '하계', event: '1차' };
  const fetchCalls = [];
  // 시트에 이미 존재하는 데이터: 1차(구버전) 1건 + 2차 1건
  const sheetRows = [
    { 'NO': '1', '년도': '2026', '수양회종류': '하계', '행사명': '1차', '접수ID': 'R1old', '건물명': '믿음관', '배정호': '101호', '교구': '3교구', '구역': '31구역', '이름': '구1차사람' },
    { 'NO': '2', '년도': '2026', '수양회종류': '하계', '행사명': '2차', '접수ID': 'R2', '건물명': '소망관', '배정호': '201호', '교구': '1교구', '구역': '11구역', '이름': '2차사람' },
  ];
  const ctx = {
    roomData: roomDataInit,
    USE_SHEET: () => true,
    _getRoomFilter: () => ({ year: domSelects.year, retreatType: domSelects.type, event: domSelects.event }),
    apiCall: () => Promise.resolve({ success: true, data: sheetRows, rows: sheetRows }),
    API_URL: 'https://example.com/exec',
    _gasHeaders: (h) => h,
    fetch: (url, opts) => {
      fetchCalls.push(JSON.parse(opts.body));
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    },
    showLoading: () => {},
    showToast: () => {},
    _clearDirtyBanner: () => {},
  };
  const fn = new Function(...Object.keys(ctx), roomSaveToSheetSrc + '\nreturn roomSaveToSheet;');
  const roomSaveToSheet = fn(...Object.values(ctx));
  return { roomSaveToSheet, fetchCalls };
}

function flush() { return new Promise((r) => setTimeout(r, 0)); }

console.log('▶ 테스트1: roomData에 1차만 있는 정상 케이스 — 회귀 없이 정상 저장');
{
  const roomData = [
    { no: 1, year: '2026', retreatType: '하계', event: '1차', receiptId: 'R1new', building: '믿음관', room: '101호', parish: '3교구', district: '31구역', name: '신1차사람' },
  ];
  const { roomSaveToSheet, fetchCalls } = freshCtx(roomData);
  roomSaveToSheet();
  flush().then(() => {
    const payload = fetchCalls[0];
    const names = payload.rows.map((r) => r[9]);
    assert(names.includes('신1차사람'), '새 1차 데이터가 저장됨');
    assert(names.includes('2차사람'), '기존 2차 데이터가 보존됨');
    assert(names.filter((n) => n === '2차사람').length === 1, '2차 데이터가 중복되지 않음(1건만 존재) — 실제: ' + names.filter((n) => n === '2차사람').length + '건');
    assert(!names.includes('구1차사람'), '기존 1차(구버전) 데이터는 새 1차 데이터로 교체됨(삭제 후 재등록)');
    test2();
  });
}

function test2() {
  console.log('▶ 테스트2: roomData에 1차+2차가 섞여있는 오염 케이스(roomRestore 등으로 무필터 로드된 상황) — 핵심 회귀 재현');
  const roomData = [
    { no: 1, year: '2026', retreatType: '하계', event: '1차', receiptId: 'R1new', building: '믿음관', room: '101호', parish: '3교구', district: '31구역', name: '신1차사람' },
    { no: 2, year: '2026', retreatType: '하계', event: '2차', receiptId: 'R2', building: '소망관', room: '201호', parish: '1교구', district: '11구역', name: '2차사람' }, // roomData에 섞여든 2차
  ];
  const { roomSaveToSheet, fetchCalls } = freshCtx(roomData);
  roomSaveToSheet();
  flush().then(() => {
    const payload = fetchCalls[0];
    const names = payload.rows.map((r) => r[9]);
    const count2cha = names.filter((n) => n === '2차사람').length;
    assert(names.includes('신1차사람'), '새 1차 데이터는 정상 저장됨');
    assert(count2cha === 1, '오염된 roomData에 2차 데이터가 섞여있어도 중복 저장되지 않고 1건만 유지됨(핵심 버그 수정 확인) — 실제: ' + count2cha + '건');
    finish();
  });
}

function finish() {
  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}
