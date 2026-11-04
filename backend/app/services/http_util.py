"""HTTP JSON helpers. Falls back to curl when the local Python TLS stack
(LibreSSL on older macOS) cannot handshake with modern servers."""
import json, subprocess, urllib.parse
import httpx

HEADERS = {"User-Agent": "SafeRouteBrief/0.1 (hackathon demo)"}

def _httpx_get_json(url, params=None, timeout=15):
    r = httpx.get(url, params=params, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()

def _curl_get_json(url, params=None, data=None, timeout=20):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    cmd = ["curl", "-s", "-f", "-m", str(timeout), "-A", HEADERS["User-Agent"]]
    if data is not None:
        cmd += ["--data-urlencode", f"data={data}"]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
    if out.returncode != 0:
        raise RuntimeError(f"curl failed ({out.returncode}): {out.stderr[:200]}")
    return json.loads(out.stdout)

def get_json(url, params=None, timeout=15):
    try:
        return _httpx_get_json(url, params=params, timeout=timeout)
    except Exception:
        return _curl_get_json(url, params=params, timeout=timeout)

def post_json(url, data, timeout=25):
    try:
        r = httpx.post(url, data={"data": data}, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return _curl_get_json(url, data=data, timeout=timeout)
