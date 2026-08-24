#!/usr/bin/env python3
"""canvas-catalog-check.py — 体检 catalog.ts 与后端真实状态是否一致（防止模型漂移导致"点了必失败"）。

后端会漂移：260813→260824 就有 7 个视频模型改名/下架、image 的 2K/4K 六 SKU 全部不可路由。
每次合并上游、例行体检、或用户报"生成失败"时跑一遍。

校验三项：
  ① catalog 里的模型是否仍可路由（/{group}/v1/models）
  ② 各分组默认模型是否可用（默认模型失效 = 用户点生成必失败）
  ③ catalog 标注的价格是否与后端 /api/pricing 的 model_price 一致（按次类）

用法: python canvas-catalog-check.py <sk-key> [--catalog ../web/src/lib/nycatai/catalog.ts]
退出码 0=全绿。
"""
import argparse
import json
import os
import re
import sys
import urllib.request

GATEWAY = "https://api.nycatai.com"


def http_json(url, key):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "User-Agent": "catalog-check/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def parse_catalog(path):
    """从 catalog.ts 里抽出 {group: {"models": {name: price_or_None}, "default": name}}。"""
    src = open(path, encoding="utf-8").read()
    groups = {}
    for block in re.finditer(r'group:\s*"([a-z]+)".*?models:\s*\[(.*?)\n\s*\],', src, re.S):
        g, body = block.group(1), block.group(2)
        models = {}
        for m in re.finditer(r'\{\s*name:\s*"([^"]+)".*?\}', body):
            entry = m.group(0)
            price = re.search(r'amount:\s*([\d.]+),\s*per:\s*"(\w+)"', entry)
            models[m.group(1)] = (float(price.group(1)), price.group(2)) if price else None
        default = re.search(r'group:\s*"%s".*?defaultModel:\s*"([^"]+)"' % g, src, re.S)
        # defaultModel 必须出现在该 group 块内（块起点到 models 之间）
        head = src[block.start():block.start(2)]
        dm = re.search(r'defaultModel:\s*"([^"]+)"', head)
        groups[g] = {"models": models, "default": dm.group(1) if dm else None}
    return groups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("key")
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--catalog", default=os.path.join(here, "..", "web", "src", "lib", "nycatai", "catalog.ts"))
    a = ap.parse_args()

    catalog = parse_catalog(a.catalog)
    pricing = {r["model_name"]: r for r in http_json(f"{GATEWAY}/api/pricing", a.key)["data"]}
    failures = []

    for group, spec in catalog.items():
        try:
            routable = {m["id"] for m in http_json(f"{GATEWAY}/{group}/v1/models", a.key)["data"]}
        except Exception as e:
            print(f"FAIL  /{group}/v1/models 拉取失败: {e}")
            failures.append(group)
            continue

        dead = [m for m in spec["models"] if m not in routable]
        if dead:
            print(f"FAIL  [{group}] catalog 有但已不可路由: {', '.join(dead)}")
            failures.extend(dead)
        else:
            print(f"PASS  [{group}] {len(spec['models'])} 个模型全部可路由")

        if spec["default"]:
            ok = spec["default"] in routable
            print(f"{'PASS' if ok else 'FAIL'}  [{group}] 默认模型 {spec['default']} {'可用' if ok else '🔴已失效——用户点生成必失败'}")
            if not ok:
                failures.append(f"{group}:default")

        for name, price in spec["models"].items():
            if not price or name not in pricing:
                continue
            backend = pricing[name].get("model_price")
            # 只对"按次/按张"类价格做数值比对；按秒类后端同样存在 model_price 字段，语义一致
            if backend and abs(backend - price[0]) > 1e-6:
                print(f"WARN  [{group}] {name} 价格漂移: catalog ¥{price[0]} vs 后端 ¥{backend}")
                failures.append(f"{name}:price")

        extra = [m for m in routable if m not in spec["models"]]
        if extra:
            print(f"INFO  [{group}] 后端有但 catalog 未收录: {', '.join(sorted(extra))}")

    print(json.dumps({"fail": len(failures), "items": failures}, ensure_ascii=False))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
