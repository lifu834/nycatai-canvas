#!/usr/bin/env python3
"""canvas-catalog-check.py — 体检 catalog.ts 与后端真实状态是否一致（防止模型漂移导致"点了必失败"）。

🔑 /v1/models **不是**可路由性的真相：实测 nano-banana-pro-2k/-4k 不在 /image/v1/models 里
   却能正常路由。真判据 = 下单探测：发一个必然被上游拒绝的空 prompt 请求，
   返回 model_not_found ⇒ 不可路由；返回其它任何错误 ⇒ 已路由到上游 ⇒ 可路由。

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


def probe_routable(group, model, key, timeout=90):
    """下单探测可路由性：model_not_found ⇒ 不可路由；其它错误 ⇒ 已到上游 ⇒ 可路由。
    返回 True/False/None(网络异常，判不了)。"""
    body = json.dumps({"model": model, "prompt": ""}).encode()
    req = urllib.request.Request(
        f"{GATEWAY}/{group}/v1/images/generations" if group in ("image",) else f"{GATEWAY}/{group}/v1/videos",
        method="POST", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "catalog-check/1.0"})
    try:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
        except urllib.error.HTTPError as e:
            raw = e.read()
        return b"model_not_found" not in raw and b"No available channel" not in raw
    except Exception:
        return None


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

        # /v1/models 未列出的模型，用下单探测复核（它不是可路由性的真相）
        unlisted = [m for m in spec["models"] if m not in routable]
        dead, unknown = [], []
        for m in unlisted:
            verdict = probe_routable(group, m, a.key)
            if verdict is False:
                dead.append(m)
            elif verdict is None:
                unknown.append(m)
        if dead:
            print(f"FAIL  [{group}] catalog 有但已不可路由: {', '.join(dead)}")
            failures.extend(dead)
        if unknown:
            print(f"WARN  [{group}] 探测超时判不了（网络问题，非模型问题）: {', '.join(unknown)}")
        confirmed = len(spec["models"]) - len(dead) - len(unknown)
        print(f"{'PASS' if not dead else 'FAIL'}  [{group}] {confirmed}/{len(spec['models'])} 个模型确认可路由"
              + (f"（其中 {len(unlisted) - len(dead) - len(unknown)} 个靠下单探测确认，未在 /v1/models 列出）" if unlisted else ""))

        if spec["default"]:
            ok = spec["default"] in routable or probe_routable(group, spec["default"], a.key) is True
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
