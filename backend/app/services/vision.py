import os, json, base64, httpx
from ..schemas import ImageAccessSignals

def _image_data_url(image_url: str):
    """Meta Model API cannot fetch Mapillary thumbnail URLs directly
    (media_url_not_fetchable), so download and embed as base64."""
    try:
        r = httpx.get(image_url, timeout=30, follow_redirects=True,
                      headers={"User-Agent": "SafeRouteBrief/0.1"})
        if r.status_code != 200 or not r.content:
            return None
        ctype = r.headers.get("content-type", "image/jpeg").split(";")[0]
        return f"data:{ctype};base64," + base64.b64encode(r.content).decode()
    except Exception:
        return None

MODEL = "muse-spark-1.3"
VISION_PROMPT = """Analyse this street-level photograph for wheelchair and mobility accessibility evidence.
Return ONLY JSON with keys: steps_or_staircase, kerb_ramp, tactile_paving, pavement_obstruction,
sidewalk_discontinuity, pedestrian_crossing, crossing_barrier, surface_damage, visible_ramp, steep_gradient_suspected.
kerb_ramp means a dropped kerb / kerb ramp at a crossing point. crossing_barrier means a bollard, railing,
gate or other barrier blocking or narrowing a pedestrian crossing. surface_damage covers cracks, potholes,
broken paving and uneven surfaces visible in the photo.
Each value: {"present": true|false|null, "confidence": 0.0-1.0, "evidence": "short visual description or empty"}.
Rules: describe only what is visible. present=null when you cannot tell. Never measure or state exact
gradients, widths, or surface quality — steep_gradient_suspected is a visual suspicion only.
Never identify people or infer identity, intent, or disability of any person."""

def analyse_photo(photo: dict):
    """Real Muse Spark call via Meta Model API when MODEL_API_KEY is set.
    Otherwise (None, 'unavailable') — never mocked."""
    key = os.environ.get("MODEL_API_KEY", "").strip()
    url = photo.get("thumb_url")
    if not key or not url:
        return None, "unavailable"
    base = os.environ.get("MODEL_API_BASE_URL", "https://api.meta.ai/v1").rstrip("/")
    model = os.environ.get("VISION_MODEL", MODEL)
    data_url = _image_data_url(url)
    if not data_url:
        print("[vision] could not download Mapillary thumbnail to embed", flush=True)
        return None, "unavailable"
    try:
        r = httpx.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "temperature": 0, "messages": [{"role": "user", "content": [
                {"type": "text", "text": VISION_PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}}]}]}, timeout=60)
        if r.status_code != 200:
            print(f"[vision] Muse Spark HTTP {r.status_code}: {r.text[:300]}", flush=True)
            return None, "unavailable"
        text = r.json()["choices"][0]["message"]["content"]
        return ImageAccessSignals(**json.loads(text)), "muse_spark"
    except Exception as e:
        print(f"[vision] Muse Spark error: {type(e).__name__}: {str(e)[:200]}", flush=True)
        return None, "unavailable"

def sam_segment(photo: dict):
    """Real SAM 3.1 call only when SAM_API_URL is configured. Otherwise unavailable — no mask is fabricated."""
    endpoint = os.environ.get("SAM_API_URL", "").strip()
    if not endpoint or not photo.get("thumb_url"):
        return "unavailable", None
    key = os.environ.get("SAM_API_KEY", "")
    try:
        r = httpx.post(endpoint, headers={"Authorization": f"Bearer {key}"} if key else {},
            json={"image_url": photo["thumb_url"],
                  "prompts": ["steps", "kerb ramp", "tactile paving", "obstruction", "ramp", "crossing"]},
            timeout=45)
        r.raise_for_status()
        return "sam_3_1", r.json().get("mask_url")
    except Exception:
        return "unavailable", None
