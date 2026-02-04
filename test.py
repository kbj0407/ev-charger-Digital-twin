import pandas as pd
import numpy as np

p = r"D:\DigitalTwin\ev-twin-ai-demo\data\link_map_seoul_clean.tsv"
df = pd.read_csv(p, sep="\t")

desc = df["dist_m"].describe(percentiles=[0.5,0.75,0.9,0.95,0.99]).to_frame("dist_m")
print(desc)

print("\nunique link_id:", df["link_id"].nunique())
print("top1 ratio:", df["link_id"].value_counts(normalize=True).iloc[0])

# 구간별 비율
bins = [0, 50, 100, 200, 300, 500, 1000, 3000, 1e9]
labels = ["<=50m","<=100m","<=200m","<=300m","<=500m","<=1km","<=3km",">3km"]
df["dist_bucket"] = pd.cut(df["dist_m"], bins=bins, labels=labels, right=True)

bucket_ratio = (df["dist_bucket"].value_counts(normalize=True).sort_index() * 100).round(2)
print("\n=== dist bucket ratio(%) ===")
print(bucket_ratio)
