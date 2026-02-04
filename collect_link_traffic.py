# =========================================================
# collect_link_traffic.py
# - link_map.tsv -> unique LINK_ID
# - 서울시 TrafficInfo (XML) 호출
# - link_traffic.tsv 생성
# =========================================================

# ===== .env 로드 =====
from pathlib import Path
from dotenv import load_dotenv
import os

ENV_PATHS = [
    Path(__file__).resolve().parent / ".env",
    Path(__file__).resolve().parent.parent / ".env",
]

for p in ENV_PATHS:
    if p.exists():
        load_dotenv(p)
        break

SEOUL_API_KEY = os.getenv("SEOUL_API_KEY")
print("SEOUL_API_KEY =", repr(SEOUL_API_KEY))

if not SEOUL_API_KEY:
    raise SystemExit("SEOUL_API_KEY 환경변수(.env) 설정 필요")
# =====================

import csv
import time
import requests
import xml.etree.ElementTree as ET
from pathlib import Path

# -------------------------
# 경로
# -------------------------
BASE_DIR = Path(r"D:\DigitalTwin\ev-twin-ai-demo")
DATA_DIR = BASE_DIR / "data"

IN_LINK_MAP = DATA_DIR / "link_map.tsv"
OUT_TRAFFIC = DATA_DIR / "link_traffic.tsv"

# -------------------------
# 서울시 TrafficInfo API
# -------------------------
API_BASE = "http://openapi.seoul.go.kr:8088"
SERVICE = "TrafficInfo"
TYPE = "xml"          # ✅ 핵심
START = 1
END = 1


def fetch_traffic_xml(link_id: str):
    """
    return:
      (dict, "OK")
      (None, "INFO-200")
      (None, "ERROR-xxx")
    """
    url = f"{API_BASE}/{SEOUL_API_KEY}/{TYPE}/{SERVICE}/{START}/{END}/{link_id}"

    try:
        r = requests.get(url, timeout=10)
    except Exception as e:
        return None, f"REQUEST_FAIL:{e}"

    if r.status_code != 200:
        return None, f"HTTP_{r.status_code}"

    try:
        root = ET.fromstring(r.text)
    except Exception:
        return None, "XML_PARSE_FAIL"

    # RESULT 코드 확인
    result = root.find(".//RESULT")
    if result is not None:
        code = result.findtext("CODE")
        msg = result.findtext("MESSAGE")

        if code == "INFO-200":
            return None, "INFO-200"   # 데이터 없음
        if code != "INFO-000":
            return None, f"{code}:{msg}"

    row = root.find(".//row")
    if row is None:
        return None, "NO_ROW"

    speed = row.findtext("prcs_spd")
    travel_time = row.findtext("prcs_trv_time")

    return {
        "speed": speed,
        "travel_time": travel_time,
    }, "OK"


def main():
    if not IN_LINK_MAP.exists():
        raise SystemExit(f"입력 파일 없음: {IN_LINK_MAP}")

    with open(IN_LINK_MAP, encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))

    print(f"[OK] loaded rows: {len(rows)}")

    unique_links = sorted({r["link_id"] for r in rows})
    print(f"[OK] unique link_id: {len(unique_links)}")

    out_rows = []

    for i, link_id in enumerate(unique_links, 1):
        data, status = fetch_traffic_xml(link_id)

        print(f"[CALL] {i}/{len(unique_links)} {link_id} {status}")

        if status == "OK" and data:
            out_rows.append({
                "link_id": link_id,
                "speed": data["speed"],
                "travel_time": data["travel_time"],
            })

        time.sleep(0.05)  # 과호출 방지

    OUT_TRAFFIC.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_TRAFFIC, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["link_id", "speed", "travel_time"],
            delimiter="\t"
        )
        w.writeheader()
        w.writerows(out_rows)

    print(f"[OK] saved: {OUT_TRAFFIC} rows={len(out_rows)}")


if __name__ == "__main__":
    main()
