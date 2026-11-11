#!/bin/bash
# =====================================================================
# تست E2E نسخهٔ ۶.۱۸ — مدیریت جدول‌ها
# سرور standalone → ورود admin → کاتالوگ → CRUD کامل روی جدول‌های جدید
# =====================================================================
set -u
cd /home/z/my-project/tekno

PORT=3111
BASE="http://localhost:$PORT"
CK=/tmp/v618-ck.txt
FAILS=0

say()  { echo "── $*"; }
pass() { echo "  ✔ $*"; }
failx(){ echo "  ✘ $*"; FAILS=$((FAILS+1)); }

# اجرای سرور
DATABASE_URL="file:/home/z/my-project/db/custom.db" PORT=$PORT node .next/standalone/server.js > /tmp/v618-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

# آماده‌سازی سرور
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/api/health" 2>/dev/null; then break; fi
  sleep 1
done

say "ورود admin/123456"
LOGIN=$(curl -s -c "$CK" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"123456"}')
echo "$LOGIN" | grep -q '"ok"\|"user"' && pass "ورود موفق" || { failx "ورود ناموفق: $LOGIN"; }

say "۱) کاتالوگ جدول‌ها"
CAT=$(curl -s -b "$CK" "$BASE/api/data-tables")
TOTAL=$(echo "$CAT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
[ "$TOTAL" -ge 93 ] && pass "تعداد جدول‌ها: $TOTAL (≥93)" || failx "تعداد جدول‌ها: $TOTAL"
for M in EventPersonal FixEndrefer Job EventQuiz ConsultantTeachingExperience CareerCounseling EventChildPsychology ConsultantHistory Disorder ApiState UserMfa InvitePerson CorporateContractNid ConsultScope Expense GroupEventReserve Income NotificationQueue UserPasskey; do
  echo "$CAT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t=[x for x in d['tables'] if x['model']=='$M']
assert t, 'missing $M'
assert t[0]['fields'], 'no fields $M'
print('ok')
" 2>/dev/null && pass "مدل $M با فیلد در کاتالوگ" || failx "مدل $M در کاتالوگ نیست"
done

say "۲) دسترسی بدون ورود → باید رد شود"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/data-tables")
[ "$CODE" = "401" ] && pass "بدون کوکی: 401" || failx "بدون کوکی: $CODE"

say "۳) افزودن رکورد در Disorders"
CREATE=$(curl -s -b "$CK" -X POST "$BASE/api/data-tables/Disorder" -H 'Content-Type: application/json' \
  -d '{"data":{"title":"اختلال اضطراب فراگیر — تست ۶.۱۸","code":"F41.1","category":"اضطراب","description":"ساخت آزمون خودکار"}}')
NID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
[ "$NID" -gt 0 ] && pass "ثبت رکورد جدید: id=$NID" || failx "ثبت ناموفق: $CREATE"

say "۴) ویرایش همان رکورد"
EDIT=$(curl -s -b "$CK" -X PATCH "$BASE/api/data-tables/Disorder" -H 'Content-Type: application/json' \
  -d "{\"id\":$NID,\"data\":{\"title\":\"عنوان ویرایش‌شدهٔ تست ۶.۱۸\",\"isActive\":false}}")
echo "$EDIT" | grep -q "ویرایش‌شده" && pass "ویرایش اعمال شد" || failx "ویرایش ناموفق: $EDIT"

say "۵) جستجو در ردیف‌ها"
SR=$(curl -s -b "$CK" -G "$BASE/api/data-tables/Disorder" --data-urlencode "q=ویرایش‌شده")
CNT=$(echo "$SR" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))")
[ "$CNT" -ge 1 ] && pass "جستجو: $CNT نتیجه" || failx "جستجو نتیجه نداد: $SR"

say "۶) EventPersonal — ثبت/ویرایش (جدول بزرگ legacy)"
EP1=$(curl -s -b "$CK" -X POST "$BASE/api/data-tables/EventPersonal" -H 'Content-Type: application/json' \
  -d '{"data":{"eventId":1,"topic":"ازدواج","description":"شرح جلسهٔ تست"}}')
EPID=$(echo "$EP1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
[ "$EPID" -gt 0 ] && pass "ثبت EventPersonal: id=$EPID" || failx "EventPersonal ثبت نشد: $EP1"
EP2=$(curl -s -b "$CK" -X PATCH "$BASE/api/data-tables/EventPersonal" -H 'Content-Type: application/json' \
  -d "{\"id\":$EPID,\"data\":{\"topic\":\"تحصیلی\"}}")
echo "$EP2" | grep -q "تحصیلی" && pass "ویرایش EventPersonal" || failx "ویرایش EventPersonal: $EP2"

say "۷) گزینه‌های فیلد ارتباطی (options=centerId روی Expense)"
OP=$(curl -s -b "$CK" "$BASE/api/data-tables/Expense?options=centerId")
OC=$(echo "$OP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('options',[])))")
[ "$OC" -ge 0 ] && pass "options=centerId: $OC گزینه" || failx "options خطا داد: $OP"

say "۸) Setting — جدول با کلید متنی (String PK)"
ST=$(curl -s -b "$CK" -X POST "$BASE/api/data-tables/Setting" -H 'Content-Type: application/json' \
  -d '{"data":{"name":"v618_test_key","value":"مقدار آزمون","group":"آزمون"}}')
echo "$ST" | grep -q "v618_test_key" && pass "ثبت Setting با PK متنی" || failx "Setting: $ST"
STD=$(curl -s -o /dev/null -w "%{http_code}" -b "$CK" -X DELETE "$BASE/api/data-tables/Setting?id=v618_test_key")
[ "$STD" = "200" ] && pass "حذف Setting با PK متنی" || failx "حذف Setting: $STD"

say "۹) فیلد حساس پنهان — passwordHash نباید در کاتالوگ باشد"
echo "$CAT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
u=[x for x in d['tables'] if x['model']=='User'][0]
names=[f['name'] for f in u['fields']]
assert 'passwordHash' not in names, 'passwordHash exposed!'
print('ok')
" 2>/dev/null && pass "passwordHash پنهان است" || failx "فیلد حساس لو رفته"

say "۱۰) حذف رکوردهای آزمون"
D1=$(curl -s -o /dev/null -w "%{http_code}" -b "$CK" -X DELETE "$BASE/api/data-tables/Disorder?id=$NID")
[ "$D1" = "200" ] && pass "حذف Disorder id=$NID" || failx "حذف Disorder: $D1"
D2=$(curl -s -o /dev/null -w "%{http_code}" -b "$CK" -X DELETE "$BASE/api/data-tables/EventPersonal?id=$EPID")
[ "$D2" = "200" ] && pass "حذف EventPersonal id=$EPID" || failx "حذف EventPersonal: $D2"

say "۱۱) صفحات سامانه"
HOME=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$HOME" = "200" ] && pass "صفحهٔ اصلی: 200" || failx "صفحهٔ اصلی: $HOME"

echo ""
if [ "$FAILS" -eq 0 ]; then echo "████ همهٔ $(${0##*/}) تست‌ها سبز بودند — نسخهٔ ۶.۱۸ سالم است ████"
else echo "████ $FAILS تست قرمز بود ████"; fi
exit $FAILS
