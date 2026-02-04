# make_tsv.py
# 목적:
# 1) station.tsv(충전소 좌표) -> nearest LINK_ID 매핑(link_map.tsv)
# 2) (선택) openapi.seoul.go.kr TrafficInfo로 LINK_ID별 실시간 속도 받아서 혼잡도(station_traffic.tsv) 계산
#
# ✅ 이번 확정 수정:
# - 서울시 "서비스링크 보간점 정보(LINK_VERTEX)"의 GRS80TM_X/Y 좌표계는 EPSG:5181이 가장 잘 맞음
#   (너 테스트 결과: EPSG 5181 median dist ≈ 117m)
# - LINK_POINTS_PATH가 .xlsx 이므로 pandas.read_excel로 읽음 (dict 반환 방지/멀티시트 처리)
# - station.tsv는 인코딩(utf-8/cp949/euc-kr) fallback + tsv/csv delimiter sniff
#
# 필요:
#   pip install pyproj pandas openpyxl numpy
# (권장, 빠른 KDTree):
#   pip install scipy
# (선택, TrafficInfo 호출):
#   pip install requests

import os
import csv
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import Counter

import numpy as np

# ====== (필수) 좌표 변환용 ======
try:
    from pyproj import Transformer
except Exception as e:
    raise SystemExit("pyproj가 필요합니다. `pip install pyproj` 후 다시 실행하세요.") from e

# ====== (필수) 엑셀(.xlsx) 읽기 ======
try:
    import pandas as pd
except Exception as e:
    raise SystemExit("pandas가 필요합니다. `pip install pandas openpyxl` 후 다시 실행하세요.") from e

# ====== (선택) 실시간 속도 조회용 ======
try:
    import requests
except Exception:
    requests = None


# -------------------------
# 경로 설정 (너 프로젝트 구조 기준)
# -------------------------
BASE_DIR = Path(r"D:\DigitalTwin\ev-twin-ai-demo")
DATA_DIR = BASE_DIR / "data"

STATION_TSV = DATA_DIR / "station.tsv"

# ✅ 서울시 교통소통 "서비스링크 보간점 정보(LINK_VERTEX)" (xlsx)
LINK_POINTS_PATH = DATA_DIR / "서비스링크 보간점 정보(LINK_VERTEX)_2025.xlsx"

OUT_LINK_MAP = DATA_DIR / "link_map.tsv"
OUT_TRAFFIC = DATA_DIR / "station_traffic.tsv"


# -------------------------
# 서울 OpenAPI (선택)
# -------------------------
SEOUL_API_KEY = os.getenv("SEOUL_API_KEY", "").strip()
SEOUL_API_BASE = "http://openapi.seoul.go.kr:8088"
SERVICE_TRAFFIC = "TrafficInfo"  # /{KEY}/json/TrafficInfo/1/5/{LINK_ID}


# -------------------------
# TM 좌표계(EPSG) 설정  ✅ 확정
# -------------------------
# 너가 실제로 돌린 후보 테스트 결과로 EPSG:5181이 최적
TM_EPSG = 5181

# WGS84(lat/lon) -> TM(x,y)
WGS84_TO_TM = Transformer.from_crs("EPSG:4326", f"EPSG:{TM_EPSG}", always_xy=True)


# ============================================================
# 유틸: 텍스트 파일(tsv/csv) 읽기 (인코딩 fallback + delimiter sniff)
# ============================================================
def sniff_delimiter_text(sample: str) -> str:
    if "\t" in sample:
        return "\t"
    return ","


def read_text_table_with_encoding_fallback(path: Path) -> List[Dict[str, str]]:
    """
    텍스트(tsv/csv) 파일: utf-8-sig -> cp949 -> euc-kr 순으로 시도
    """
    encodings = ["utf-8-sig", "cp949", "euc-kr"]
    last_err = None

    for enc in encodings:
        try:
            with open(path, "r", encoding=enc, newline="") as f:
                sample = f.read(4096)
                delim = sniff_delimiter_text(sample)
                f.seek(0)
                reader = csv.DictReader(f, delimiter=delim)
                return list(reader)
        except Exception as e:
            last_err = e

    raise SystemExit(f"텍스트 파일을 읽을 수 없음: {path}\n마지막 에러: {last_err}")


# ============================================================
# 유틸: 엑셀(.xlsx/.xls) 읽기 (멀티시트 dict 처리)
# ============================================================
def read_excel_as_dicts(path: Path, sheet_name: Optional[str] = None) -> List[Dict[str, str]]:
    """
    xlsx/xls를 pandas로 읽고 Dict list로 변환
    - sheet_name=None이면 dict(여러 시트)로 반환될 수 있어 첫 시트를 자동 선택
    """
    obj = pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl")

    if isinstance(obj, dict):
        if len(obj) == 0:
            raise SystemExit(f"엑셀 시트를 읽었는데 비어있음: {path}")
        first_sheet_name = next(iter(obj.keys()))
        df = obj[first_sheet_name]
        print(f"[INFO] Excel has multiple sheets. Using first sheet: {first_sheet_name}")
    else:
        df = obj

    df.columns = [str(c).strip() for c in df.columns]
    df = df.replace({np.nan: ""})
    return df.astype(str).to_dict(orient="records")


def read_table_any(path: Path) -> List[Dict[str, str]]:
    """
    확장자 기반으로 xlsx면 excel, 그 외는 tsv/csv로 읽기
    """
    ext = path.suffix.lower()
    if ext in [".xlsx", ".xls"]:
        return read_excel_as_dicts(path)
    return read_text_table_with_encoding_fallback(path)


def get_col_any(row: Dict[str, str], keys: List[str]) -> Optional[str]:
    for k in keys:
        if k in row and row[k] is not None:
            v = str(row[k]).strip()
            if v != "":
                return v
    return None


# ============================================================
# station.tsv 로딩
# ============================================================
def load_station_points() -> List[Dict]:
    rows = read_table_any(STATION_TSV)
    out = []

    for r in rows:
        stat_id = (r.get("stat_id") or "").strip()
        if not stat_id:
            continue

        lat_s = get_col_any(r, ["lat", "LAT", "latitude", "Latitude"])
        lon_s = get_col_any(r, ["lon", "LON", "lng", "LNG", "longitude", "Longitude"])
        if not lat_s or not lon_s:
            continue

        try:
            lat = float(lat_s)
            lon = float(lon_s)
        except:
            continue

        name = (r.get("stat_nm") or r.get("name") or stat_id).strip()
        out.append({"stat_id": stat_id, "name": name, "lat": lat, "lon": lon})

    if not out:
        if rows:
            print("[DEBUG] station columns:", list(rows[0].keys()))
        raise SystemExit(f"station.tsv에서 좌표를 하나도 못 읽음: {STATION_TSV}")

    return out


# ============================================================
# 링크 보간점 로딩 (엑셀 컬럼: LINK_ID, GRS80TM_X, GRS80TM_Y 확정)
# ============================================================
def load_link_points() -> Tuple[np.ndarray, List[str]]:
    """
    LINK_POINTS_PATH에서 보간점 좌표를 읽고,
    KDTree용 numpy 배열(X,Y) + 각 점의 link_id 리스트를 반환
    """
    rows = read_table_any(LINK_POINTS_PATH)

    xs, ys, lids = [], [], []
    for r in rows:
        lid = get_col_any(r, ["LINK_ID"])
        x_s = get_col_any(r, ["GRS80TM_X"])
        y_s = get_col_any(r, ["GRS80TM_Y"])
        if not lid or not x_s or not y_s:
            continue
        try:
            x = float(x_s)
            y = float(y_s)
        except:
            continue

        lids.append(lid)
        xs.append(x)
        ys.append(y)

    if len(lids) == 0:
        sample_cols = list(rows[0].keys()) if rows else []
        raise SystemExit(
            f"링크 보간점 파일에서 좌표를 못 읽음: {LINK_POINTS_PATH}\n"
            f"첫 행 컬럼들: {sample_cols}\n"
            f"→ 엑셀 컬럼명이 LINK_ID/GRS80TM_X/GRS80TM_Y인지 확인"
        )

    pts = np.column_stack([np.array(xs, dtype=np.float64), np.array(ys, dtype=np.float64)])
    return pts, lids


# ============================================================
# KDTree (scipy 있으면 빠르게)
# ============================================================
def build_kdtree(points_xy: np.ndarray):
    try:
        from scipy.spatial import cKDTree  # type: ignore
        return cKDTree(points_xy), "scipy"
    except Exception:
        return points_xy, "numpy"


def nearest_link_id(
    tree_obj, mode: str, points_xy: np.ndarray, lids: List[str], x: float, y: float
) -> Tuple[str, float]:
    if mode == "scipy":
        dist, idx = tree_obj.query([x, y], k=1)
        return lids[int(idx)], float(dist)

    # numpy brute-force fallback (느림)
    d2 = np.sum((points_xy - np.array([x, y], dtype=np.float64)) ** 2, axis=1)
    idx = int(np.argmin(d2))
    return lids[idx], float(np.sqrt(d2[idx]))


# ============================================================
# 서울 TrafficInfo 호출 (선택)
# ============================================================
def fetch_trafficinfo(link_id: str) -> Optional[Dict]:
    if not requests:
        return None
    if not SEOUL_API_KEY:
        return None

    url = f"{SEOUL_API_BASE}/{SEOUL_API_KEY}/json/{SERVICE_TRAFFIC}/1/5/{link_id}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        j = r.json()

        root = j.get(SERVICE_TRAFFIC) or j.get("TrafficInfo")
        if not root:
            return {"link_id": link_id, "_raw": j}

        rows = root.get("row") or []
        if not rows:
            return None
        row = rows[0]

        def g(row_obj, keys):
            for k in keys:
                if k in row_obj and row_obj[k] is not None:
                    v = str(row_obj[k]).strip()
                    if v != "":
                        return v
            return None

        spd = g(row, ["PRCS_SPD", "SPEED", "speed", "spd"])
        trv = g(row, ["PRCS_TRV_TIME", "TRAVEL_TIME", "travel_time", "trv_time"])

        out = {"link_id": link_id}
        if spd is not None:
            try:
                out["speed"] = float(spd)
            except:
                out["speed"] = spd
        if trv is not None:
            try:
                out["travel_time"] = float(trv)
            except:
                out["travel_time"] = trv
        return out
    except Exception:
        return None


# ============================================================
# main
# ============================================================
def main():
    if not STATION_TSV.exists():
        raise SystemExit(f"station.tsv 없음: {STATION_TSV}")
    if not LINK_POINTS_PATH.exists():
        raise SystemExit(
            f"서비스링크 보간점 파일이 필요함: {LINK_POINTS_PATH}\n"
            f"(서울시 교통소통 서비스링크 보간점 정보 파일을 data에 넣고 실행)"
        )

    stations = load_station_points()
    pts_xy, lids = load_link_points()
    tree, mode = build_kdtree(pts_xy)

    # 1) station -> nearest link_id
    link_map_rows = []
    for s in stations:
        x, y = WGS84_TO_TM.transform(s["lon"], s["lat"])
        lid, dist_m = nearest_link_id(tree, mode, pts_xy, lids, x, y)

        link_map_rows.append(
            {
                "stat_id": s["stat_id"],
                "stat_nm": s["name"],
                "lat": s["lat"],
                "lon": s["lon"],
                "link_id": lid,
                "dist_m": round(dist_m, 2),
            }
        )

    # 저장
    OUT_LINK_MAP.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_LINK_MAP, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(link_map_rows[0].keys()), delimiter="\t")
        w.writeheader()
        w.writerows(link_map_rows)

    print(f"[OK] link map saved -> {OUT_LINK_MAP} (rows={len(link_map_rows)})")
    print(f"      kdtree mode: {mode}, TM_EPSG={TM_EPSG}")

    # ✅ 매핑 검증 로그
    dists = np.array([r["dist_m"] for r in link_map_rows], dtype=float)
    print(
        "[CHECK] dist_m median/mean/min/max:",
        float(np.median(dists)),
        float(np.mean(dists)),
        float(np.min(dists)),
        float(np.max(dists)),
    )
    top5 = Counter([r["link_id"] for r in link_map_rows]).most_common(5)
    print("[CHECK] top-5 most common link_id:", top5)
    bad = [r for r in link_map_rows if float(r["dist_m"]) > 3000]
    print(f"[CHECK] dist_m > 3000m: {len(bad)} rows (show 3):", bad[:3])

    # 2) (선택) 실시간 속도 조회해서 혼잡도 예시 만들기 (Top 30만)
    if SEOUL_API_KEY and requests:
        cache: Dict[str, Dict] = {}
        out_rows = []

        BASELINE_SPEED = 60.0  # 임시 기준속도(나중에 링크/시간대별 평균속도로 교체 권장)

        for r in link_map_rows[:30]:
            lid = r["link_id"]
            if lid not in cache:
                cache[lid] = fetch_trafficinfo(lid) or {"link_id": lid}
                time.sleep(0.05)  # 과호출 방지

            ti = cache[lid]
            speed = ti.get("speed")
            congestion = None
            if isinstance(speed, (int, float)):
                congestion = max(0.0, min(1.0, 1.0 - (float(speed) / BASELINE_SPEED)))

            out_rows.append(
                {
                    **r,
                    "speed": speed if speed is not None else "",
                    "travel_time": ti.get("travel_time", ""),
                    "congestion": "" if congestion is None else round(congestion, 3),
                }
            )

        with open(OUT_TRAFFIC, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()), delimiter="\t")
            w.writeheader()
            w.writerows(out_rows)

        print(f"[OK] station traffic saved -> {OUT_TRAFFIC} (rows={len(out_rows)})")
        print("NOTE: speed/congestion은 테스트용(30개만). 운영은 Top-N에만 붙이면 됨.")
    else:
        print("[SKIP] 실시간 TrafficInfo 호출 생략 (SEOUL_API_KEY 또는 requests 없음).")
        print("       link_map.tsv까지 생성됐으니, 다음 단계에서 link_id로 TrafficInfo 조회 붙이면 됨.")


if __name__ == "__main__":
    main()
