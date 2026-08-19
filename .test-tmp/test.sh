#!/usr/bin/env bash
# Systematic API test suite. Run after `next dev` is up on :3000.
set -u
BASE=http://localhost:3000/api/v1
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1 :: ${2:-}"; FAIL=$((FAIL+1)); }
req() { # method path json [cookie]
  local m=$1 p=$2 b=${3:-} c=${4:-}
  if [ -n "$c" ]; then
    curl -s -X "$m" "$BASE$p" -H "Content-Type: application/json" ${b:+-d "$b"} -b "$c"
  else
    curl -s -X "$m" "$BASE$p" -H "Content-Type: application/json" ${b:+-d "$b"}
  fi
}

echo "=== 1. AUTH ==="
# Admin login
ADMIN=$(req POST /admin/login '{"email":"admin@sikshasaathi.in","password":"admin123"}')
AT=$(echo "$ADMIN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -n "$AT" ] && ok "admin login" || bad "admin login" "$ADMIN"
AC="siksha_admin_session=$AT"

# /auth/me admin
ME=$(req GET /auth/me "" "$AC")
echo "$ME" | grep -q '"scope":"dashboard"' && ok "admin me" || bad "admin me" "$ME"

echo "=== 2. ADMIN: create HOD (multi-stream) + faculty (assignments) ==="
HOD=$(req POST /admin/users '{"email":"hod1@i.in","password":"hodpass1","displayName":"HOD One","role":"hod","department":"CSE","hodStreams":["cse","it"],"facultyAssignments":[{"stream":"cse","semester":"1","section":"cse1","subject":"Data Structures & Algorithms"}]}' "$AC")
echo "$HOD" | grep -q '"uid"' && ok "create HOD (cse+it)" || bad "create HOD" "$HOD"

FAC=$(req POST /admin/users '{"email":"fac1@i.in","password":"facpass1","displayName":"Faculty One","role":"faculty","department":"CSE","facultyAssignments":[{"stream":"cse","semester":"1","section":"cse1","subject":"Data Structures & Algorithms"},{"stream":"cse","semester":"2","section":"cse1","subject":"Discrete Mathematics"}]}' "$AC")
echo "$FAC" | grep -q '"uid"' && ok "create faculty (2 assignments)" || bad "create faculty" "$FAC"

# List faculty
LIST=$(req GET /admin/users "" "$AC")
echo "$LIST" | grep -q 'hod_streams' && ok "list faculty has assignments" || bad "list faculty" "$LIST"

echo "=== 3. ADMIN: create student (single) + CSV ==="
S1=$(req POST /students '{"email":"s1@i.in","name":"Student One","roll":"CS21001","stream":"cse","sem":"1","section":"cse1","password":"student123"}' "$AC")
echo "$S1" | grep -q 'created' && ok "create student single" || bad "create student single" "$S1"

CSV=$(req POST /admin/enroll_students '{"csv_data":"email,name,roll,stream,sem,section\ns2@i.in,Student Two,CS21002,cse,1,cse1\ns3@i.in,Student Three,CS21003,ece,1,ece1"}' "$AC")
echo "$CSV" | grep -q '"enrolled":2' && ok "csv enroll 2 students" || bad "csv enroll" "$CSV"

echo "=== 4. STUDENT login + me ==="
SL=$(req POST /student/login '{"email":"s1@i.in","password":"student123"}')
ST=$(echo "$SL" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -n "$ST" ] && ok "student login" || bad "student login" "$SL"
SC="siksha_student_session=$ST"
SME=$(req GET /auth/me "" "$SC")
echo "$SME" | grep -q '"scope":"student"' && ok "student me" || bad "student me" "$SME"

# Student cannot self-register (route removed -> 404)
REG=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/student/register" -H "Content-Type: application/json" -d '{"email":"x@i.in","password":"x"}')
[ "$REG" = "404" ] && ok "register route removed (404)" || bad "register route" "got $REG"

echo "=== 5. PROFILE scope rejection ==="
PRF=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/auth/profile" -H "Content-Type: application/json" -d '{"stream":"ece"}' -b "$SC")
[ "$PRF" = "403" ] && ok "student cannot edit stream (403)" || bad "student stream edit" "got $PRF"

echo "=== 6. CURRICULUM: create stream/sem + sections + subjects, then prune ==="
CUR=$(req POST /admin/curriculum '{"stream":"cse","semester":"1","subjects":[{"name":"Data Structures & Algorithms"},{"name":"Programming in C"}],"sections":[{"name":"cse1"},{"name":"cse2"}]}' "$AC")
echo "$CUR" | grep -q 'updated' && ok "curriculum upsert cse/1" || bad "curriculum upsert" "$CUR"
CG=$(req GET /curriculum "" "$AC")
echo "$CG" | grep -q 'sections' && ok "curriculum GET returns sections" || bad "curriculum GET" "$CG"

echo "=== 7. FILTERS ==="
FL=$(req GET /filters "" "$SC")
echo "$FL" | grep -q 'sections' && ok "filters returns sections+files" || bad "filters" "$FL"

echo "=== 8. SCOPE LEAKAGE (HOD login, view students) ==="
HL=$(req POST /admin/login '{"email":"hod1@i.in","password":"hodpass1"}')
HT=$(echo "$HL" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -n "$HT" ] && ok "HOD login" || bad "HOD login" "$HL"
HC="siksha_admin_session=$HT"
HST=$(req GET /students "" "$HC")
echo "$HST" | grep -q 'cse1' && ok "HOD sees cse students" || bad "HOD students" "$HST"
echo "$HST" | grep -q 'ece1' && bad "HOD LEAK: sees ece students" || ok "HOD does not see ece (no leak)"

echo "=== 9. INGEST (enqueue text) ==="
ING=$(req POST /ingest '{"title":"Test Notes","file_name":"notes.txt","content":"Binary trees are hierarchical data structures. A node has at most two children. The height is the longest path from root to leaf.","stream":"cse","semester":"1","section":"cse1","subject":"Data Structures & Algorithms","mime_type":"text/plain"}' "$AC")
echo "$ING" | grep -q 'processing' && ok "ingest enqueued (202)" || bad "ingest" "$ING"

echo "=== 10. ANALYTICS (admin overview) ==="
OV=$(req GET /analytics/overview "" "$AC")
echo "$OV" | grep -q 'total_queries' && ok "overview" || bad "overview" "$OV"

echo ""
echo "================ RESULTS ================"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "========================================="
