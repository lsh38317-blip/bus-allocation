const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    if (u.indexOf('sheetName=참석인원명단') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'NO':'1','접수ID':'1001','성명':'홍길동','연도':curYear,'수양회종류':'하계','차수':'3차','교구':'1교구','구역':'11구역','참석교통수단':'버스','귀가교통수단':'버스'}
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

  window.switchPanel('busbase');
  await new Promise(r => setTimeout(r, 600));
  $('bb-event-sel').value = '3차';
  window.bbMainTab('people');
  await new Promise(r => setTimeout(r, 500));

  const arriveSel = window.document.getElementById('bp-arrive-assign-1');
  const leaveSel  = window.document.getElementById('bp-leave-assign-1');
  check('BP1 참석배정유형 select 존재', arriveSel !== null);
  check('BP2 귀가배정유형 select 존재', leaveSel !== null);
  if(arriveSel){
    const arriveOpts = Array.from(arriveSel.options).map(o=>o.value).filter(v=>v);
    check('BP3 bp 참석배정유형 옵션=busbase와 동일(6개)', arriveOpts.join(',')==='선발대(총괄,팀장,TFT),선발대(봉사자),본대,직장조,시각선교부,중고등부', arriveOpts);
  }
  if(leaveSel){
    const leaveOpts = Array.from(leaveSel.options).map(o=>o.value).filter(v=>v);
    check('BP4 bp 귀가배정유형 옵션=busbase와 동일(3개)', leaveOpts.join(',')==='본대,후발대,중고등부', leaveOpts);
  }

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
