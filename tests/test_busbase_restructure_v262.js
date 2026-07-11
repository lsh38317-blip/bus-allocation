const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    if (u.indexOf('sheetName=참석인원명단') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'접수ID':'1001','성명':'홍길동','연도':curYear,'수양회종류':'하계','행사명':'1차','교구':'1교구','구역':'11구역'}
      ]})});
    }
    if (u.indexOf('action=getAll') >= 0) return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[] }) });
    return Promise.reject(new Error('네트워크 비활성(테스트) - '+u.slice(0,60)));
  };
  window.console.error = () => {};
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  await new Promise(r => setTimeout(r, 300));
  const $ = (id) => window.document.getElementById(id);
  const results = [];
  function check(label, cond, extra) { results.push({label, pass: !!cond, extra}); }

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  // ── 항목4: 버스 배정 페이지에 버스배정인원관리 탭 없음 ──
  window.switchPanel('bus');
  await new Promise(r => setTimeout(r, 600));
  check('T1 bus-tab-people 버튼 없음', $('bus-tab-people') === null);
  check('T2 bus-panel-people 요소 없음', $('bus-panel-people') === null);
  const busTabBtns = Array.from(window.document.querySelectorAll('#panel-bus button[id^="bus-tab-"]')).map(b=>b.id);
  check('T3 남은 탭: 구역관리/버스배정/선탑자/배정현황만', JSON.stringify(busTabBtns)===JSON.stringify(['bus-tab-teams','bus-tab-assign','bus-tab-leader','bus-tab-summary']), busTabBtns);

  // ── 항목3: busbase 페이지에 2개 탭 존재, 기본은 정보 탭 ──
  window.switchPanel('busbase');
  await new Promise(r => setTimeout(r, 600));
  check('T4 버스배정기초정보 탭 버튼 존재', $('bbbase-tab-info') !== null);
  check('T5 버스배정인원관리 탭 버튼 존재', $('bbbase-tab-people') !== null);
  check('T6 기본 진입 시 정보탭 보임', $('bbbase-panel-info').style.display !== 'none');
  check('T7 기본 진입 시 인원관리탭 숨김', $('bbbase-panel-people').style.display === 'none');

  // ── 항목1: 연도/회차/종류가 컴팩트 스타일(작은 select)로 상단에 위치, 등록폼과 분리 ──
  const topBar = $('bbbase-tab-info').parentElement;
  check('T8 연도/회차/종류가 탭 버튼과 같은 상단 바에 위치', topBar.contains($('bb-year-sel')) && topBar.contains($('bb-event-sel')) && topBar.contains($('bb-season-sel')));
  check('T9 연도 select가 버스배정 페이지와 동일한 컴팩트 스타일(height:32px)', $('bb-year-sel').getAttribute('style').indexOf('height:32px')>=0, $('bb-year-sel').getAttribute('style'));

  // ── 항목2: 좌(조회)-우(등록) 배치 ──
  const infoGrid = window.document.querySelector('#bbbase-panel-info > div');
  const gridCols = window.getComputedStyle ? infoGrid.style.gridTemplateColumns : '';
  check('T10 정보탭 내부가 grid(좌우 배치) 스타일', infoGrid.getAttribute('style').indexOf('grid-template-columns:1fr 1fr')>=0, infoGrid.getAttribute('style'));
  const leftCard = infoGrid.children[0], rightCard = infoGrid.children[1];
  check('T11 왼쪽 카드에 등록 폼(bb-direction 등) 포함', leftCard.querySelector('#bb-direction') !== null && leftCard.querySelector('#bb-save-btn') !== null);
  check('T12 오른쪽 카드에 조회 그리드(bb-list-table-body) 포함', rightCard.querySelector('#bb-list-table-body') !== null);

  // ── 버스배정인원관리 탭 클릭 시 정상 동작(조회 등) ──
  window.bbMainTab('people');
  await new Promise(r => setTimeout(r, 400));
  check('T13 people 탭 클릭 시 정보탭 숨겨짐', $('bbbase-panel-info').style.display === 'none');
  check('T14 people 탭 클릭 시 인원관리탭 보임', $('bbbase-panel-people').style.display !== 'none');
  check('T15 people 탭에 검색결과 렌더됨(홍길동)', $('bp-table-body').textContent.indexOf('홍길동')>=0, $('bp-table-body').textContent.slice(0,50));

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
