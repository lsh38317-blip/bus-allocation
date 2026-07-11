#!/bin/bash
# 사용법: ./run_all_tests.sh v272
# retreat-site_vNNN.html이 현재 디렉토리에 있어야 합니다.
set -e
VER="$1"
if [ -z "$VER" ]; then
  echo "사용법: ./run_all_tests.sh vNNN   (예: ./run_all_tests.sh v272)"
  exit 1
fi

SRC="retreat-site_${VER}.html"
if [ ! -f "$SRC" ]; then
  echo "파일을 찾을 수 없습니다: $SRC"
  exit 1
fi

echo "▶ ${VER} 기준 test_only_${VER}.html 생성 중..."
sed \
  -e "s/parish:'1교구', district:'1구역'/parish:'1교구', district:'11구역'/" \
  -e "s/parish:'2교구', district:'2구역'/parish:'2교구', district:'21구역'/" \
  "$SRC" > "test_only_${VER}.html"

python3 -c "
content = open('test_only_${VER}.html', encoding='utf-8').read()
old = \"{id:'parish1', name:'김교구',  pw:'parish1234',role:'parish',   position:'장로',    parish:'1교구', district:'',     regDate:'20260601', regBy:'admin'},\"
new = old + \"\n  {id:'user3',   name:'테스트',  pw:'user3234',  role:'district', position:'집사',    parish:'',     district:'',      regDate:'20260601', regBy:'admin'},\"
if old not in content:
    print('⚠️  경고: 계정 시트 원본 문자열을 찾지 못했습니다. ACCOUNTS 배열이 변경되었을 수 있으니 확인하세요.')
else:
    content = content.replace(old, new)
    open('test_only_${VER}.html','w',encoding='utf-8').write(content)
    print('✅ test_only_${VER}.html 생성 완료')
"

echo "▶ 테스트 파일들의 대상 HTML을 test_only_${VER}.html로 일괄 치환..."
for f in test_*.js; do
  [ "$f" = "run_all_tests.sh" ] && continue
  sed -i.bak "s/test_only_v[0-9]*\.html/test_only_${VER}.html/" "$f" 2>/dev/null || true
  rm -f "${f}.bak"
done

echo ""
echo "▶ 전체 테스트 실행"
TOTAL=0
FAIL_FILES=""
for f in test_*.js; do
  echo "=== $f ==="
  OUT=$(node "$f" 2>/dev/null | tail -2)
  echo "$OUT"
  if echo "$OUT" | grep -q "실패, 0건" || echo "$OUT" | grep -qE "0건 실패"; then
    :
  else
    FAIL_FILES="$FAIL_FILES $f"
  fi
done

echo ""
if [ -z "$FAIL_FILES" ]; then
  echo "✅ 전체 통과"
else
  echo "⚠️  실패 파일:$FAIL_FILES"
fi
