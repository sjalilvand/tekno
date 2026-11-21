#!/bin/bash
# =====================================================================
# تست دود نسخهٔ ۶.۲۵ — صفحهٔ اطلس رز روی دادهٔ واقعی‌نما (APICode سرریز)
# سناریوی سرور: شهر تبریز با APICode=2165064084 (خارج از Int32) از قبل در
# دیتابیس است؛ اولین باز شدن اطلس باید ensureRoseClinics را بدون خطا کامل کند
# =====================================================================
set -u
cd /home/z/my-project/tekno

PORT=3125
BASE="http://localhost:$PORT"
CK=/tmp/v625-ck.txt
DB=/home/z/my-project/db/custom.db
FAILS=0
say()  { echo "── $*"; }
pass() { echo "  ✔ $*"; }
failx(){ echo "  ✘ $*"; FAILS=$((FAILS+1)); }

rm -f "$CK"

say "۰) ساخت دیتابیس تازه از اسکیمای جدید (BIGINT)"
rm -f "$DB" "$DB-wal" "$DB-shm"
DATABASE_URL="file:$DB" npx prisma db push --skip-generate > /tmp/v625-push.log 2>&1 \
  && pass "prisma db push" || { failx "db push شکست"; tail -5 /tmp/v625-push.log; exit 1; }

say "۱) حساب admin"
DATABASE_URL="file:$DB" npm run seed:admin > /tmp/v625-seed.log 2>&1 \
  && pass "seed:admin" || { failx "seed:admin شکست"; tail -5 /tmp/v625-seed.log; exit 1; }

say "۲) تزریق شهر تبریز با APICode=2165064084 (شبیه‌سازی دیتای درون‌ریزی‌شده)"
node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB || "'"$DB"'");
db.prepare("INSERT INTO Provinces (id, title, API, DetailCode) VALUES (1, ?, 1, 1)").run("آذربایجان شرقی");
db.prepare("INSERT INTO Cities (id, provinceId, title, APICode) VALUES (113, 1, ?, 2165064084)").run("تبریز");
db.close();
' && pass "دیتای سرریز تزریق شد" || failx "تزریق شکست"

say "۳) اجرای سرور standalone"
DATABASE_URL="file:$DB" PORT=$PORT node .next/standalone/server.js > /tmp/v625-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/api/health" 2>/dev/null; then break; fi
  sleep 1
done

say "۴) ورود admin/123456"
LOGIN=$(curl -s -c "$CK" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"123456"}')
echo "$LOGIN" | grep -q '"ok"\|"user"\|"acc"' && pass "ورود موفق" || { failx "ورود ناموفق: $LOGIN"; exit 1; }

say "۵) GET /api/atlas — باید ۳۱ مرکز رز را بدون خطای Int وارد کند"
ATLAS=$(curl -s -b "$CK" "$BASE/api/atlas")
echo "$ATLAS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'items' in d and 'totals' in d, f'کلیدها نیستند: {list(d)[:6]}'
assert not d.get('bankError'), f'bankError: {d[\"bankError\"]}'
assert 'INT column' not in json.dumps(d, ensure_ascii=False), 'خطای Int32 در پاسخ!'
t=d['totals']
assert t['centers']>=31, f'مراکز: {t[\"centers\"]}'
tb=[i for i in d['items'] if 'تبریز' in i['title']]
assert tb and tb[0]['cityTitle']=='تبریز', 'کلینیک تبریز نیست'
print(f\"مراکز: {t['centers']} | استان‌ها: {t['provinces']} | تبریز: {tb[0]['title']}\")
" && pass "اطلس سالم — بدون bankError و بدون خطای Int" || failx "اطلس خراب"

say "۶) GET /api/data-tables/Cities — نمایش جدول برای مدیر (مسیر safeJson)"
DTC=$(curl -s -b "$CK" "$BASE/api/data-tables/City?q=%D8%AA%D8%A8%D8%B1%DB%8C%D8%B2")
echo "$DTC" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=d['rows']
r=[x for x in rows if x.get('title')=='تبریز']
assert r, 'تبریز نیست'
assert r[0]['apiCode']==2165064084, f'apiCode: {r[0][\"apiCode\"]}'
print(f\"apiCode تبریز در JSON: {r[0]['apiCode']} (عدد)\")
" && pass "apiCode به‌صورت عدد JSON برگشت (BigInt→Number)" || failx "data-tables خراب"

say "۷) خلاصهٔ سامانه"
META=$(curl -s -b "$CK" "$BASE/api/meta")
echo "$META" | grep -q '"cities"' && pass "/api/meta هم سالم (select محدود)" || failx "meta خراب"

kill $SRV 2>/dev/null
echo ""
echo "═══ نتیجه: $([ $FAILS -eq 0 ] && echo همهٔ چک‌ها موفق || echo "$FAILS شکست") ═══"
exit $FAILS
