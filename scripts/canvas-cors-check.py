#!/usr/bin/env python3
"""canvas-cors-check.py — 验证 nycatai 网关对画布前端 origin 的 CORS 矩阵（P1 门禁，可重复跑）。

覆盖画布实际会发的所有请求形态：
  images/generations(JSON POST)、images/edits(multipart POST)、videos(multipart POST)、
  videos/{id}(GET 轮询)、videos/{id}/content(GET blob)、responses(SSE POST)、models(GET)。
默认只跑预检(OPTIONS,无需 key)；带 --key 时对 /models 逐分组发真实 GET 验证实际响应头 + 顺带拉模型清单。

用法: python canvas-cors-check.py [--origin https://canvas.nycatai.com] [--gateway https://api.nycatai.com] [--key sk-xxx]
输出: 每行一个检查项 PASS/FAIL + 汇总 JSON。退出码 0=全绿。
"""
import argparse
import json
import sys
import urllib.request

MATRIX = [
    ("POST", "/image/v1/images/generations", "authorization, content-type"),
    ("POST", "/image/v1/images/edits", "authorization"),
    ("POST", "/video/v1/videos", "authorization"),
    ("GET", "/video/v1/videos/task_id_placeholder", "authorization"),
    ("GET", "/video/v1/videos/task_id_placeholder/content", "authorization"),
    ("POST", "/codex/v1/responses", "authorization, content-type"),
    ("GET", "/image/v1/models", "authorization"),
    ("GET", "/video/v1/models", "authorization"),
    ("GET", "/codex/v1/models", "authorization"),
]


def http(method, url, headers, timeout=20):
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict((k.lower(), v) for k, v in resp.headers.items()), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict((k.lower(), v) for k, v in e.headers.items()), e.read()
    except Exception as e:
        return 0, {"__error__": str(e)}, b""


def allow_origin_ok(headers, origin):
    acao = headers.get("access-control-allow-origin", "")
    return acao == "*" or acao == origin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", default="https://canvas.nycatai.com")
    ap.add_argument("--gateway", default="https://api.nycatai.com")
    ap.add_argument("--key", default="")
    a = ap.parse_args()
    gateway = a.gateway.rstrip("/")

    results = []
    for method, path, req_headers in MATRIX:
        status, headers, _ = http("OPTIONS", gateway + path, {
            "Origin": a.origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": req_headers,
            "User-Agent": "canvas-cors-check/1.0",
        })
        acao = allow_origin_ok(headers, a.origin)
        allow_methods = headers.get("access-control-allow-methods", "")
        allow_headers = headers.get("access-control-allow-headers", "").lower()
        methods_ok = (not allow_methods) or method in allow_methods.upper() or "*" in allow_methods
        headers_ok = (not allow_headers) or "*" in allow_headers or all(h.strip() in allow_headers for h in req_headers.split(","))
        ok = status in (200, 204) and acao and methods_ok and headers_ok
        results.append({"check": f"preflight {method} {path}", "ok": ok, "http": status,
                        "acao": headers.get("access-control-allow-origin", ""),
                        "detail": headers.get("__error__", "")})
        print(("PASS" if ok else "FAIL"), f"preflight {method} {path}", f"http={status}", f"acao={headers.get('access-control-allow-origin','-')}")

    models = {}
    if a.key:
        for group in ("image", "video", "codex"):
            status, headers, body = http("GET", f"{gateway}/{group}/v1/models", {
                "Origin": a.origin, "Authorization": f"Bearer {a.key}", "User-Agent": "canvas-cors-check/1.0"})
            ok = status == 200 and allow_origin_ok(headers, a.origin)
            try:
                models[group] = sorted(m["id"] for m in json.loads(body)["data"])
            except Exception:
                models[group] = f"__parse_error__ http={status} body={body[:120]!r}"
                ok = False
            results.append({"check": f"real GET /{group}/v1/models", "ok": ok, "http": status,
                            "acao": headers.get("access-control-allow-origin", "")})
            print(("PASS" if ok else "FAIL"), f"real GET /{group}/v1/models", f"http={status}",
                  f"models={len(models[group]) if isinstance(models[group], list) else models[group]}")

    failed = [r for r in results if not r["ok"]]
    print(json.dumps({"origin": a.origin, "gateway": gateway, "pass": len(results) - len(failed),
                      "fail": len(failed), "models": models}, ensure_ascii=False, indent=1))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
