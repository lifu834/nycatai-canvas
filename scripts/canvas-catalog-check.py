#!/usr/bin/env python3
"""canvas-catalog-check.py — 体检 catalog.ts 与后端真实状态是否一致（防止模型漂移导致"点了必失败"）。

🔑 /v1/models **不是**可路由性的真相：实测 nano-banana-pro-2k/-4k 不在 /image/v1/models 里
   却能正常路由。真判据 = 下单探测：发一个必然被上游拒绝的空 prompt 请求，
   返回 model_not_found ⇒ 不可路由；返回其它任何错误 ⇒ 已路由到上游 ⇒ 可路由。

后端会漂移：260813→260824 就有 7 个视频模型改名/下架、image 的 2K/4K 六 SKU 全部不可路由。
每次合并上游、例行体检、或用户报"生成失败"时跑一遍。

校验三项（+ 一项可选）：
  ① catalog 里的模型是否仍可路由（/{group}/v1/models）
  ② 各分组默认模型是否可用（默认模型失效 = 用户点生成必失败）
  ③ catalog 标注的价格是否与后端 /api/pricing 的 model_price 一致（按次类）
  ④ --semantic：中文提示词是否真的被模型看见（见下）

🔑 ①②③ 全都只问"通不通"，而**通不等于对**。260904 实测过一种 HTTP 200 + 有图 +
   照常计费、却发回完全无关的图的故障形态：提示词里的中文字符在到达模型前被替换成
   `?`（客户端用非 UTF-8 码页编码请求体时会这样），模型收到一串问号就返回一张
   "演示级"的库存照片。上面三项检查会**全部判通过**。中文用户几乎是全部用户，
   所以必须有一项直接对**产出内容**下判据 —— 这就是 ④。

   判据要可自动化，就不能靠"看图像不像"。所以用一条**中文的、正确产出唯一**的提示词
   （整张纯红色），再读落盘像素的平均色：红色主导 ⇒ 中文被看见了；其它任何东西
   （库存照片、插画）平均色都不会是红的。实测：正常出图 R=137~251 / G,B≈1，
   问号提示词出的库存照 RGB=(81,90,91) 灰扑扑，两者差得很开。
   —— 与 image2api "档位真伪只认落盘像素"同一个思路：上游回话不算数，只认字节。

用法: python canvas-catalog-check.py <sk-key> [--catalog ../web/src/lib/nycatai/catalog.ts]
                                              [--semantic] [--semantic-model nano-banana-2-1k]
退出码 0=全绿。
"""
import argparse
import base64
import json
import os
import re
import struct
import sys
import time
import urllib.request
import zlib

GATEWAY = "https://api.nycatai.com"

# ④ 用的中文提示词。刻意写成"正确产出唯一"的样子：只要模型真读到了这句中文，
# 出来的就只能是一整片红。任何"没读到"的退化形态（空 prompt / 问号串 / 被换掉）
# 都会得到别的东西，而别的东西平均色不会是红的。
SEMANTIC_PROMPT = "一整张纯红色的图片：整个画面全部是红色，没有任何物体、人物、文字或图案"


def http_json(url, key):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "User-Agent": "catalog-check/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def probe_routable_once(group, model, key, timeout=90):
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


def probe_routable(group, model, key, timeout=90, retries=1):
    """带重试的可路由性判定。

    🔑 `No available channel` 文案有歧义：既可能是"模型不存在"，也可能是"模型在但此刻
    所有渠道都忙/冷却"——后者是瞬时的（实测撞到过 kling-3.0-1080p 误报，手动复测即恢复）。
    所以判死前重试，任意一次探到"已路由"就算可路由，降低误报。
    注意：本脚本查得出"模型不可路由"，查不出"渠道在但底下没货"。
    """
    for attempt in range(retries + 1):
        verdict = probe_routable_once(group, model, key, timeout)
        if verdict is not False:
            return verdict
        if attempt < retries:
            time.sleep(4)
    return False


def png_mean_rgb(data, step=8):
    """手工解 PNG 取平均色。只支持 8bit 灰度/RGB/RGBA、非隔行 —— 够用，
    因为客户拿到的就是这些。解不出就抛，由调用方判 WARN 而不是 FAIL。

    不引 Pillow：这脚本要能在任何机器上 `python xxx.py <key>` 直接跑，
    为一个体检项加二进制依赖不划算（image2api 的 px_of 也是同样的取舍）。
    step 是抽样步长，1024² 全解太慢，隔 8 行 8 列取样对"平均色"足够。
    """
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG（可能是 JPEG/WebP）")
    pos, idat, w, h, depth, ct = 8, b"", None, None, None, None
    while pos + 8 <= len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        if typ == b"IHDR":
            w, h, depth, ct = struct.unpack(">IIBB", data[pos + 8:pos + 18])
        elif typ == b"IDAT":
            idat += data[pos + 8:pos + 8 + ln]
        elif typ == b"IEND":
            break
        pos += 12 + ln
    ch = {0: 1, 2: 3, 4: 2, 6: 4}.get(ct)
    if ch is None or depth != 8:
        raise ValueError(f"不支持的 PNG 形态 colortype={ct} depth={depth}")
    raw = zlib.decompress(idat)
    stride, prev, i = w * ch, bytearray(w * ch), 0
    tot, n = [0, 0, 0], 0
    for y in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        # 逐字节反滤波：PNG 每行的滤波器依赖上一行，所以行不能跳过，只能跳采样
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0
            b = prev[x]
            c = prev[x - ch] if x >= ch else 0
            v = line[x]
            if f == 1:
                v += a
            elif f == 2:
                v += b
            elif f == 3:
                v += (a + b) >> 1
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                v += a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[x] = v & 255
        prev = line
        if y % step:
            continue
        for x in range(0, w, step):
            o = x * ch
            tot[0] += line[o]
            tot[1] += line[o + 1] if ch >= 3 else line[o]
            tot[2] += line[o + 2] if ch >= 3 else line[o]
            n += 1
    return [tot[0] / n, tot[1] / n, tot[2] / n]


def semantic_probe_once(group, model, key, timeout=300):
    """发一条中文提示词并把图取回来。返回 (bytes, None) 或 (None, 原因)。"""
    body = json.dumps({"model": model, "prompt": SEMANTIC_PROMPT, "size": "1024x1024"},
                      ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{GATEWAY}/{group}/v1/images/generations", method="POST", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "User-Agent": "catalog-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read()[:160].decode('utf-8', 'replace')}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:160]
    item = (d.get("data") or [{}])[0]
    try:
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"]), None
        if item.get("url"):
            g = urllib.request.Request(item["url"], headers={"User-Agent": "catalog-check/1.0"})
            with urllib.request.urlopen(g, timeout=180) as r:
                return r.read(), None
    except Exception as e:  # noqa: BLE001
        return None, "取图失败: " + str(e)[:120]
    return None, "响应里没有图片: " + json.dumps(d)[:160]


def semantic_check(group, model, key, retries=1):
    """判中文提示词有没有真的到达模型。返回 (verdict, 说明)。
    verdict: True=红色主导（中文被看见）/ False=产出与提示词无关 / None=判不了。

    False 之前必重试一次：模型偶尔会自作主张加个物体，单次不红不足以定罪，
    而误报一次体检项的代价比漏报还大（同 probe_routable 的重试理由）。
    """
    judged, why = False, "没拿到任何产出"
    for attempt in range(retries + 1):
        raw, err = semantic_probe_once(group, model, key)
        if raw is None:
            judged, why = False, err          # 没出图 = 判不了，不是"图不对"
            if attempt < retries:
                time.sleep(4)
            continue
        try:
            r, g, b = png_mean_rgb(raw)
        except Exception as e:  # noqa: BLE001
            # 解不出格式 ≠ 出图不对。判不了就说判不了，别拿它当故障。
            return None, f"无法解析产出（{e}）"
        # 阈值：实测正常 R=137~251 且 G,B≈1；问号提示词的库存照是 (81,90,91)。
        # 取 R≥110 且比 G/B 各高 60，两侧都留了很宽的余量。
        if r >= 110 and r - g >= 60 and r - b >= 60:
            return True, "平均色 RGB=(%.0f,%.0f,%.0f) 红色主导" % (r, g, b)
        judged, why = True, "平均色 RGB=(%.0f,%.0f,%.0f) 不是红色" % (r, g, b)
        if attempt < retries:
            time.sleep(4)
    # 只有"确实看过图、且连续两次都不红"才判 FAIL；请求本身没成功一律 None。
    return (False if judged else None), why


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("key")
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--catalog", default=os.path.join(here, "..", "web", "src", "lib", "nycatai", "catalog.ts"))
    ap.add_argument("--semantic", action="store_true",
                    help="加做④：发一条中文提示词，按落盘像素判产出是否真的对应它。"
                         "会真出图、真计费，所以默认关闭。")
    ap.add_argument("--semantic-model", default=None,
                    help="④ 用哪个模型出图，默认取 catalog 里 image 分组的 defaultModel")
    a = ap.parse_args()

    catalog = parse_catalog(a.catalog)
    pricing = {r["model_name"]: r for r in http_json(f"{GATEWAY}/api/pricing", a.key)["data"]}
    all_models = {name for spec in catalog.values() for name in spec["models"]}
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

        # 「后端新增了模型、画布还没收录」——判据用 /api/pricing 的 enable_groups，
        # 不用 /v1/models：后者按分组裁剪过，会漏（见 memory gpt-image-25-upstream-survey-260909）。
        # 画布的价格/下架是运行时自动跟后端走的（web/src/lib/nycatai/pricing-sync.ts），
        # 唯独「新模型叫什么、归哪档」得人工在 catalog.ts 补一行，所以这条要醒目。
        # 跟【整个 catalog】比而不是只跟本组比：生图模型同时挂在 image 和 codex 两个分组下，
        # 只跟本组比会把它们在 codex 那轮全报一遍。leonardo-* 是同价隐藏别名，catalog 有意不暴露。
        extra = sorted(
            name for name, row in pricing.items()
            if group in (row.get("enable_groups") or [])
            and name not in all_models
            and not name.startswith("leonardo-")
        )
        if extra:
            print(f"WARN  [{group}] 后端有但 catalog 未收录（新模型要补展示信息）: {', '.join(extra)}")

    # ④ 中文语义校验。放在最后：它是唯一会真花钱的一项，前面全绿再花这笔。
    if a.semantic:
        model = a.semantic_model or (catalog.get("image") or {}).get("default")
        if not model:
            print("WARN  [image] 找不到默认模型，跳过中文语义校验")
        else:
            verdict, why = semantic_check("image", model, a.key)
            if verdict is True:
                print(f"PASS  [image] {model} 中文提示词生效（{why}）")
            elif verdict is False:
                print(f"FAIL  [image] {model} 🔴中文提示词未生效：{why}"
                      f" —— 出的图与提示词无关，但 HTTP 200 且照常计费")
                failures.append(f"{model}:semantic")
            else:
                print(f"WARN  [image] {model} 中文语义校验判不了（{why}）")

    print(json.dumps({"fail": len(failures), "items": failures}, ensure_ascii=False))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
