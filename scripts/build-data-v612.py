# -*- coding: utf-8 -*-
# ساخت داده‌های نسخهٔ ۶.۱۲ از مخزن special-spoon:
#  ۱) آزمون‌های روان‌شناختی (۱۱ جزء + متا + مقیاس‌ها)  → src/data/psych-tests.json
#  ۲) کلینیک‌های رز (۳۱ استان)                        → src/data/rose-clinics.json
#  ۳) دادهٔ نقشهٔ ایران (۳۱ استان)                    → src/components/iran-map-data.ts
#  ۴) تصاویر آزمون‌های تصویری CPM/RSPM                → public/psych/images/
import json, os, re, shutil, glob

SPOON = "/tmp/spoon"
TEKNO = "/home/z/my-project/tekno"

# ---------- ۱) آزمون‌ها ----------
tests = []
for p in sorted(glob.glob(os.path.join(SPOON, "backend/psych_seed/tests_part*.json")),
                key=lambda x: int(re.search(r"part(\d+)", x).group(1))):
    tests.extend(json.load(open(p, encoding="utf-8")))
meta = json.load(open(os.path.join(SPOON, "backend/psych_seed/meta.json"), encoding="utf-8"))
scales_raw = json.load(open(os.path.join(SPOON, "backend/psych_seed/scales.json"), encoding="utf-8"))
scales_by_slug = {s["test_slug"]: s.get("scales") for s in scales_raw}

# مقیاس‌های گزینه‌ای خلاصه‌نویسی‌شده در دادهٔ منبع — مطابق seed_psych_tests.py
SCALES = {
    "never0-3": [("هرگز", 0), ("چند روز", 1), ("بیش از نصف روزها", 2), ("تقریباً هر روز", 3)],
    "freq0-3": [("هرگز", 0), ("به‌ندرت", 1), ("اغلب", 2), ("همیشه", 3)],
    "freq0-4": [("هرگز", 0), ("به‌ندرت", 1), ("گاهی", 2), ("بیشتر وقت‌ها", 3), ("همیشه", 4)],
    "freq4-0": [("هرگز", 4), ("به‌ندرت", 3), ("گاهی", 2), ("بیشتر وقت‌ها", 1), ("همیشه", 0)],
    "agree0-3": [("کاملاً مخالفم", 0), ("مخالفم", 1), ("موافقم", 2), ("کاملاً موافقم", 3)],
    "agree3-0": [("کاملاً موافقم", 0), ("موافقم", 1), ("مخالفم", 2), ("کاملاً مخالفم", 3)],
    "ghqNeg": [("بهتر از حد معمول", 0), ("مثل همیشه", 0), ("کمتر از حد معمول", 1), ("بسیار کمتر از حد معمول", 1)],
    "ghqPos": [("بیشتر از حد معمول", 0), ("مثل همیشه", 0), ("کمتر از حد معمول", 1), ("بسیار کمتر از حد معمول", 1)],
}

img_refs = set()
out_tests = []
for t in tests:
    slug = t["slug"]
    m = meta.get(slug, {})
    qs = []
    for q in t.get("questions", []):
        opts = q["options"]
        if isinstance(opts, str):
            opts = SCALES[opts]  # [[label, score], ...]
        q2 = {"prompt": q["prompt"], "options": [[o[0], o[1]] for o in opts]}
        if q.get("subscale"): q2["subscale"] = q["subscale"]
        if q.get("image"):
            q2["image"] = q["image"]
            img_refs.add(q["image"])
        qs.append(q2)
    out_tests.append({
        "slug": slug,
        "title": t["title"],
        "topic": t.get("topic", "عمومی"),
        "description": t.get("description", ""),
        "code": m.get("code"),
        "ageRange": m.get("age_range"),
        "minutes": m.get("estimated_minutes"),
        "color": m.get("accent_color", "#a83a54"),
        "sortOrder": m.get("sort_order", 999),
        "questions": qs,
        "interpretations": t.get("interpretations", []),
        "scales": scales_by_slug.get(slug),
    })

os.makedirs(os.path.join(TEKNO, "src/data"), exist_ok=True)
with open(os.path.join(TEKNO, "src/data/psych-tests.json"), "w", encoding="utf-8") as f:
    json.dump(out_tests, f, ensure_ascii=False, separators=(",", ":"))
print(f"psych-tests.json: {len(out_tests)} tests, {sum(len(t['questions']) for t in out_tests)} questions, "
      f"{sum(1 for t in out_tests if t['scales'])} with scales, {len(img_refs)} image refs")

# ---------- ۲) کلینیک‌های رز ----------
clinics = json.load(open(os.path.join(SPOON, "backend/rose_seed/clinics.json"), encoding="utf-8"))
with open(os.path.join(TEKNO, "src/data/rose-clinics.json"), "w", encoding="utf-8") as f:
    json.dump(clinics, f, ensure_ascii=False, separators=(",", ":"))
print(f"rose-clinics.json: {len(clinics)} clinics, provinces: {len({c['province_code'] for c in clinics})}")

# ---------- ۳) نقشهٔ ایران ----------
shutil.copy(os.path.join(SPOON, "site/src/components/iranMapData.ts"),
            os.path.join(TEKNO, "src/components/iran-map-data.ts"))
print("iran-map-data.ts copied")

# ---------- ۴) تصاویر ----------
img_root = os.path.join(SPOON, "backend/psych_seed/images")
dst_root = os.path.join(TEKNO, "public/psych/images")
n_img = 0
for sub in os.listdir(img_root):
    src_dir = os.path.join(img_root, sub)
    if not os.path.isdir(src_dir): continue
    dst_dir = os.path.join(dst_root, sub)
    os.makedirs(dst_dir, exist_ok=True)
    for f in os.listdir(src_dir):
        shutil.copy(os.path.join(src_dir, f), os.path.join(dst_dir, f))
        n_img += 1
print(f"images copied: {n_img}")
missing = [i for i in img_refs if not os.path.exists(os.path.join(dst_root, i))]
print("missing images:", missing if missing else "none")
