// test-helpers.js — 회귀테스트 공용 헬퍼
// GitHub tests 폴더의 모든 테스트가 이 모듈을 통해 "최신 retreat-site_v*.html"(또는 지정 파일)에서
// 실제 함수 소스를 직접 추출해 실행한다. 라인번호에 의존하지 않아(중괄호 균형 매칭) 버전이 올라가도
// 그대로 재사용 가능하다.
const fs = require('fs');
const path = require('path');

// 대상 파일 경로 결정: CLI 인자로 넘기면 그 파일을, 생략하면 현재 디렉토리에서 패턴에 맞는
// 가장 최신 버전(파일명 끝 _vN 기준 최댓값) 파일을 자동으로 찾는다.
function resolveTargetFile(argIndex, pattern) {
  const argPath = process.argv[argIndex];
  if (argPath) return argPath;
  const dir = process.cwd();
  const re = new RegExp(pattern);
  const candidates = fs.readdirSync(dir).filter((f) => re.test(f));
  if (!candidates.length) {
    console.error(pattern + ' 에 맞는 파일을 찾을 수 없습니다. 경로를 인자로 지정해 주세요.');
    process.exit(1);
  }
  candidates.sort((a, b) => {
    const na = parseInt(a.match(/_v(\d+)\./)[1], 10);
    const nb = parseInt(b.match(/_v(\d+)\./)[1], 10);
    return nb - na; // 최신(가장 큰 버전) 우선
  });
  return path.join(dir, candidates[0]);
}

function resolveLatestHtml(argIndex) {
  return resolveTargetFile(argIndex, '^retreat-site_v\\d+\\.html$');
}

function resolveLatestGas(argIndex) {
  return resolveTargetFile(argIndex, '^수양회관리_AppScript_v\\d+\\.gs$');
}

// 중괄호 균형 매칭으로 "function NAME(...){ ... }" 전체 소스를 추출.
function extractFunctionSource(src, fnName) {
  const m = src.match(new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) throw new Error(fnName + ' 함수를 대상 파일에서 찾을 수 없습니다.');
  const startIdx = m.index;
  let depth = 0, i = startIdx;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(startIdx, i);
}

// "var NAME = ..." 형태의 최상위 변수 선언 전체를 추출(세미콜론까지, 단순 리터럴/배열 전용).
function extractVarSource(src, varName) {
  const m = src.match(new RegExp('var\\s+' + varName + '\\s*='));
  if (!m) throw new Error(varName + ' 변수를 대상 파일에서 찾을 수 없습니다.');
  const startIdx = m.index;
  const endIdx = src.indexOf(';', startIdx);
  if (endIdx === -1) throw new Error(varName + ' 선언의 끝(;)을 찾을 수 없습니다.');
  return src.slice(startIdx, endIdx + 1);
}

// HTML 파일의 <script> 태그 내부 전체 소스(단일 대형 IIFE 스크립트 기준)를 반환.
function readHtmlScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(htmlPath + ' 에서 <script> 블록을 찾을 수 없습니다.');
  return m[1];
}

// 여러 함수를 한 번에 추출해 "함수명 → 소스" 맵으로 반환(선언 순서 무관하게 이어붙일 때 사용).
function extractFunctions(src, names) {
  return names.map((n) => extractFunctionSource(src, n)).join('\n');
}

// "var START_NAME = ..." 선언 시작 지점부터 "function END_FN_NAME(){...}"의 끝까지,
// 파일 내 연속된(원본 순서 그대로인) 코드 블록을 통째로 추출한다. 여러 함수가 서로 얽혀있어
// 개별 추출이 번거로운 경우(같은 섹션 안에서 서로를 참조하는 함수 묶음) 사용.
function extractRangeFromVarToFunctionEnd(src, startVarName, endFnName) {
  const startMatch = src.match(new RegExp('var\\s+' + startVarName + '\\s*='));
  if (!startMatch) throw new Error(startVarName + ' 시작 지점을 찾을 수 없습니다.');
  const endFnSrc = extractFunctionSource(src, endFnName);
  const endIdx = src.indexOf(endFnSrc) + endFnSrc.length;
  if (endIdx <= startMatch.index) throw new Error('시작/끝 지점이 올바르지 않습니다: ' + startVarName + ' → ' + endFnName);
  return src.slice(startMatch.index, endIdx);
}

module.exports = {
  resolveTargetFile,
  resolveLatestHtml,
  resolveLatestGas,
  extractFunctionSource,
  extractVarSource,
  readHtmlScript,
  extractFunctions,
  extractRangeFromVarToFunctionEnd,
};
