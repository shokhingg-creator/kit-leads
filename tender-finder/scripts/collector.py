import json, os, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

SOURCES = [
    ("ЕИС", "EIS_API_URL", "EIS_API_TOKEN"),
    ("Росэлторг", "ROSELTORG_API_URL", "ROSELTORG_API_TOKEN"),
    ("B2B-Center", "B2B_API_URL", "B2B_API_TOKEN"),
    ("Фабрикант", "FABRIKANT_API_URL", "FABRIKANT_API_TOKEN"),
]
KEYWORDS = ["грузоперевоз", "перевозка груз", "транспортно-экспедицион", "экспедирован", "ftl", "ltl", "складск", "ответственное хранение", "доставка продукции"]
EXCLUDE = ["пассажир", "автобус", "такси", "спецтехник", "аренда автомобиля"]

def first(row, *names, default=""):
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return default

def normalize(row, source):
    title = str(first(row, "title", "name", "purchaseName", "subject"))
    return {
        "id": str(first(row, "id", "number", "purchaseNumber", "registryNumber", default=title)),
        "title": title,
        "customer": str(first(row, "customer", "customerName", "organization", "buyer")),
        "inn": str(first(row, "inn", "customerInn", "buyerInn")),
        "region": str(first(row, "region", "deliveryRegion", "customerRegion", default="Не указан")),
        "price": float(first(row, "price", "maxPrice", "initialPrice", "nmck", default=0) or 0),
        "deadline": str(first(row, "deadline", "submissionDeadline", "endDate")),
        "score": 0,
        "source": source,
        "url": str(first(row, "url", "link", "purchaseUrl")),
        "publishedAt": str(first(row, "publishedAt", "publishDate", "createdAt")),
    }

def score(t):
    text = (t["title"] + " " + t["region"]).lower()
    points = 35
    points += 25 if any(k in text for k in KEYWORDS[:5]) else 12
    points += 15 if t["price"] >= 5_000_000 else 7
    points += 10 if t["customer"] and t["inn"] else 4
    points += 10 if t["deadline"] else 0
    points += 5 if t["url"] else 0
    return min(points, 100)

def relevant(title):
    text = title.lower()
    return any(k in text for k in KEYWORDS) and not any(k in text for k in EXCLUDE)

def fetch_source(name, url_key, token_key):
    base = os.getenv(url_key, "").strip()
    if not base:
        print(f"{name}: API URL не настроен — пропуск")
        return []
    token = os.getenv(token_key, "").strip()
    sep = "&" if "?" in base else "?"
    url = base + sep + urllib.parse.urlencode({"limit": 200, "updated_since_hours": 48})
    headers = {"Accept": "application/json", "User-Agent": "KIT-Tender-Radar/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        payload = json.load(response)
    if isinstance(payload, list):
        rows = payload
    else:
        rows = payload.get("items") or payload.get("results") or payload.get("data") or []
    result = []
    for row in rows:
        if isinstance(row, dict):
            item = normalize(row, name)
            if relevant(item["title"]):
                item["score"] = score(item)
                result.append(item)
    print(f"{name}: получено {len(result)} релевантных закупок")
    return result

def main():
    path = Path(__file__).resolve().parents[1] / "data" / "tenders.json"
    old = {"tenders": []}
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
    merged = {str(x.get("id")) + "|" + str(x.get("source")): x for x in old.get("tenders", [])}
    errors = []
    for source in SOURCES:
        try:
            for item in fetch_source(*source):
                merged[item["id"] + "|" + item["source"]] = item
        except Exception as exc:
            errors.append(f"{source[0]}: {exc}")
            print(f"{source[0]}: ошибка {exc}")
    items = sorted(merged.values(), key=lambda x: (x.get("score", 0), x.get("publishedAt", "")), reverse=True)
    output = {"updatedAt": datetime.now(timezone.utc).isoformat(), "sources": [x[0] for x in SOURCES], "errors": errors, "tenders": items}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Сохранено {len(items)} тендеров")

if __name__ == "__main__":
    main()
