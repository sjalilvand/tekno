#!/bin/bash
# =====================================================================
# تست E2E نسخهٔ ۶.۱۹ — ارجاعات سها با همهٔ آیتم‌ها
# سرور standalone → ورود admin → همهٔ ستون‌ها + فیلترها + ویرایش + پیگیری
# =====================================================================
set -u
cd /home/z/my-project/tekno

PORT=3112
BASE="http://localhost:$PORT"
CK=/tmp/v619-ck.txt
FAILS=0

say()  { echo "── $*"; }
pass() { echo "  ✔ $*"; }
failx(){ echo "  ✘ $*"; FAILS=$((FAILS+1)); }

# اجرای سرور
DATABASE_URL="file:/home/z/my-project/db/custom.db" PORT=$PORT node .next/standalone/server.js > /tmp/v619-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

# آماده‌سازی سرور
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/api/health" 2>/dev/null; then break; fi
  sleep 1
done

say "ورود admin/123456"
LOGIN=$(curl -s -c "$CK" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"123456"}')
echo "$LOGIN" | grep -q '"ok"\|"user"' && pass "ورود موفق" || { failx "ورود ناموفق: $LOGIN"; exit 1; }

say "۱) همهٔ آیتم‌های رکورد در پاسخ API"
LIST=$(curl -s -b "$CK" "$BASE/api/referrals?pageSize=20")
echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=d['referrs']
assert len(rows)>0, 'هیچ ارجاعی در دیتابیس نیست'
need=['id','refId','userId','userName','userNid','userMobile','provinceId','cityId','centerId','provinceTitle','cityTitle','centerTitle','serviceId','service','description','isReferr','acceptorId','acceptorName','sessionsCount','status','creationDate','followUps']
r=rows[0]
missing=[k for k in need if k not in r]
assert not missing, f'فیلدهای جا افتاده: {missing}'
print(f\"تعداد کل: {d['total']} | رکورد اول: {r['userName']} | استان: {r['provinceTitle']} | خدمت: {r['service']['name']}\")
" && pass "همهٔ ۲۲ فیلد در پاسخ هست" || failx "فیلدها ناقص"

say "۲) نام استان/شهر/مرکز/پذیرنده خالی نیستند (نمونه‌های دارای مرکز)"
echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in d['referrs'] if r['centerId']]
assert rows, 'هیچ رکوردی مرکز ندارد'
r=rows[0]
assert r['provinceTitle'] and r['provinceTitle']!='None', 'provinceTitle خالی'
assert r['centerTitle'], 'centerTitle خالی'
print(f\"مرکز: {r['centerTitle']} | استان: {r['provinceTitle']} | شهر: {r['cityTitle']} | پذیرنده: {r['acceptorName']}\")
" && pass "نام‌های مرتبط کامل" || failx "نام‌های مرتبط ناقص"

# رکورد تستی: اولین رکورد دارای مرکز + شهرِ همان استان از متا
RID=$(echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in d['referrs'] if r['centerId']]
print(rows[0]['id'])
")
ORIG=$(echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in d['referrs'] if r['centerId']]
r=rows[0]
print(r['sessionsCount'], '|', r['status'])
")
META=$(curl -s -b "$CK" "$BASE/api/meta")
CTID=$(echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in d['referrs'] if r['centerId']]
print(rows[0]['centerId'])
")
PID=$(echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=[r for r in d['referrs'] if r['centerId']]
print(rows[0]['provinceId'])
")
CID=$(echo "$META" | python3 -c "
import sys,json
d=json.load(sys.stdin)
cid=[c['id'] for c in d['cities'] if c['provinceId']==$PID]
print(cid[0] if cid else 1)
")

say "۳) فیلتر وضعیت"
ST=$(echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d['statusAgg'][0]['status'] if d['statusAgg'] else 'در انتظار')
")
F1=$(curl -s -b "$CK" "$BASE/api/referrals?status=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote('$ST'))")")
echo "$F1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert all(r['status']=='$ST' for r in d['referrs']), 'وضعیت فیلتر نشده'
print(f\"فیلتر '$ST': {d['total']} رکورد\")
" && pass "فیلتر وضعیت کار می‌کند" || failx "فیلتر وضعیت"

say "۴) فیلتر استان"
F2=$(curl -s -b "$CK" "$BASE/api/referrals?provinceId=$PID")
echo "$F2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['total']>0 and all(r['provinceId']==$PID for r in d['referrs']), 'فیلتر استان خراب'
print(f\"استان $PID: {d['total']} رکورد\")
" && pass "فیلتر استان" || failx "فیلتر استان"

say "۵) فیلتر شهر + مرکز (شهرِ رکورد تستی با edit ست می‌شود؛ seed شهر ندارد)"
SETCITY=$(curl -s -b "$CK" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' \
  -d "{\"id\":$RID,\"action\":\"edit\",\"cityId\":$CID}")
echo "$SETCITY" | grep -q 'ok\|cityId' && pass "شهر رکورد $RID = $CID" || failx "ست کردن شهر: $SETCITY"
F3=$(curl -s -b "$CK" "$BASE/api/referrals?cityId=$CID")
echo "$F3" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['total']>0 and all(r['cityId']==$CID for r in d['referrs']), 'فیلتر شهر خراب'
print(f\"شهر $CID: {d['total']} رکورد\")
" && pass "فیلتر شهر" || failx "فیلتر شهر"
F4=$(curl -s -b "$CK" "$BASE/api/referrals?centerId=$CTID")
echo "$F4" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['total']>0 and all(r['centerId']==$CTID for r in d['referrs']), 'فیلتر مرکز خراب'
print(f\"مرکز $CTID: {d['total']} رکورد\")
" && pass "فیلتر مرکز" || failx "فیلتر مرکز"

say "۶) فیلتر بازهٔ تاریخ"
F5=$(curl -s -b "$CK" "$BASE/api/referrals?from=2020-01-01&to=2030-12-31")
T_ALL=$(echo "$F5" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
F6=$(curl -s -b "$CK" "$BASE/api/referrals?from=2035-01-01&to=2035-12-31")
T_ZERO=$(echo "$F6" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
[ "$T_ALL" -gt 0 ] && [ "$T_ZERO" = "0" ] && pass "بازهٔ تاریخ: کل=$T_ALL، آینده=$T_ZERO" || failx "بازهٔ تاریخ: کل=$T_ALL آینده=$T_ZERO"

say "۷) ویرایش کامل رکورد (action=edit)"
EDIT=$(curl -s -b "$CK" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' \
  -d "{\"id\":$RID,\"action\":\"edit\",\"status\":\"ارجاع‌شده\",\"sessionsCount\":7,\"description\":\"توضیحات ویرایش‌شدهٔ تست ۶.۱۹\"}")
echo "$EDIT" | grep -q '"ok"\|"sessionsCount"' && pass "PATCH edit پاسخ موفق" || failx "PATCH edit: $EDIT"
AFTER=$(curl -s -b "$CK" "$BASE/api/referrals?pageSize=100")
echo "$AFTER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=[x for x in d['referrs'] if x['id']==$RID][0]
assert r['status']=='ارجاع‌شده', f\"وضعیت: {r['status']}\"
assert r['sessionsCount']==7, f\"جلسات: {r['sessionsCount']}\"
assert 'تست ۶.۱۹' in (r['description'] or ''), 'توضیحات ذخیره نشده'
print('وضعیت:', r['status'], '| جلسات:', r['sessionsCount'])
" && pass "تغییرات در دیتابیس ثبت شد" || failx "ویرایش ذخیره نشد"

say "۸) پیگیری + تاریخچه در پاسخ"
curl -s -b "$CK" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' \
  -d "{\"id\":$RID,\"action\":\"followup\",\"comment\":\"پیگیری تست ۶.۱۹ — تماس با مراجع\"}" > /dev/null
FU2=$(curl -s -b "$CK" "$BASE/api/referrals?pageSize=100")
echo "$FU2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=[x for x in d['referrs'] if x['id']==$RID][0]
fus=r['followUps']
assert any('تست ۶.۱۹' in f['comment'] for f in fus), 'پیگیری جدید در تاریخچه نیست'
assert all('userName' in f and 'createdAt' in f for f in fus), 'فیلد پیگیری ناقص'
print(f\"تعداد پیگیری‌ها: {len(fus)} | آخرین: {fus[0]['userName']}: {fus[0]['comment'][:40]}\")
" && pass "تاریخچهٔ کامل پیگیری" || failx "تاریخچهٔ پیگیری"

say "۹) بازگردانی دادهٔ اصلی (پاک‌سازی تست)"
ORIG_SC=$(echo "$ORIG" | cut -d'|' -f1 | tr -d ' ')
ORIG_ST=$(echo "$ORIG" | cut -d'|' -f2 | tr -d ' ')
curl -s -b "$CK" -X PATCH "$BASE/api/referrals" -H 'Content-Type: application/json' \
  -d "{\"id\":$RID,\"action\":\"edit\",\"status\":\"$ORIG_ST\",\"sessionsCount\":$ORIG_SC,\"cityId\":null,\"description\":\"\"}" > /dev/null && pass "بازگردانی شد" || failx "بازگردانی"

say "۱۰) متا: شهرها برای دراپ‌داون"
echo "$META" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert len(d.get('cities',[]))>10, f\"شهرها: {len(d.get('cities',[]))}\"
assert all('provinceId' in c for c in d['cities'][:10]), 'provinceId شهر جا افتاده'
print(f\"استان: {len(d['provinces'])} | شهر: {len(d['cities'])} | مرکز: {len(d['centers'])}\")
" && pass "متا کامل برای فیلترها" || failx "متا"

say "۱۱) دسترسی بدون ورود"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/referrals")
[ "$CODE" = "401" ] && pass "بدون کوکی: 401" || failx "بدون کوکی: $CODE"

say "۱۲) صفحات اصلی"
CODE2=$(curl -s -o /dev/null -w "%{http_code}" -b "$CK" "$BASE/")
[ "$CODE2" = "200" ] && pass "صفحهٔ اصلی: 200" || failx "صفحهٔ اصلی: $CODE2"

echo ""
if [ "$FAILS" = "0" ]; then echo "✅ همهٔ تست‌های ۶.۱۹ سبز"; else echo "❌ $FAILS تست قرمز"; exit 1; fi
