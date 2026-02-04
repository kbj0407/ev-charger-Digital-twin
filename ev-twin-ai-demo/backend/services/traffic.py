# services/traffic.py
import math
from typing import Literal

TrafficMode = Literal["congested", "normal", "free"]

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lon2 - lon1)
    a = math.sin(d1/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(d2/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def avg_speed_kmh(mode: TrafficMode) -> float:
    # MVP: 교통 모드별 평균 속도(나중에 실데이터로 대체)
    return {
        "congested": 18.0,
        "normal": 32.0,
        "free": 45.0,
    }.get(mode, 32.0)

def estimate_eta_min(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float, mode: TrafficMode) -> float:
    dist = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    kmh = max(avg_speed_kmh(mode), 5.0)
    return (dist / kmh) * 60.0
