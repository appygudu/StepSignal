from typing import List, Optional
from pydantic import BaseModel, Field

class Obs(BaseModel):
    present: Optional[bool] = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence: str = ""  # what in the image supports this; empty if unsure

class ImageAccessSignals(BaseModel):
    """Visually observed only. null = cannot tell from this photo."""
    steps_or_staircase: Obs = Obs()
    kerb_ramp: Obs = Obs()
    tactile_paving: Obs = Obs()
    pavement_obstruction: Obs = Obs()
    sidewalk_discontinuity: Obs = Obs()
    pedestrian_crossing: Obs = Obs()
    crossing_barrier: Obs = Obs()
    surface_damage: Obs = Obs()
    visible_ramp: Obs = Obs()
    steep_gradient_suspected: Obs = Obs()  # suspected only — never a measured gradient

class EvidencePhoto(BaseModel):
    image_id: str
    thumb_url: Optional[str] = None
    captured_at: Optional[str] = None
    lat: float
    lon: float
    signals: Optional[ImageAccessSignals] = None
    signals_source: str = "not_analysed"  # muse_spark | unavailable
    sam_status: str = "unavailable"  # sam_3_1 | unavailable — no mask is fabricated
    sam_mask_url: Optional[str] = None

class Segment(BaseModel):
    segment_id: str
    index: int
    lat: float
    lon: float
    status: str = "uncertain"  # confirmed_barrier | observed_clear_of_barriers | uncertain
    status_reason: str = ""
    osm: dict = {}
    photos: List[EvidencePhoto] = []
    observations: List[str] = []
    warnings: List[str] = []

class BriefRequest(BaseModel):
    origin: str
    destination: str

class BriefResponse(BaseModel):
    origin_label: str
    destination_label: str
    distance_m: float
    duration_min: float
    route_geojson: dict
    alternate_geojson: Optional[dict] = None
    alternate_note: Optional[str] = None
    segments: List[Segment] = []
    coverage_pct: float = 0.0
    coverage_note: str = ""
    counts: dict = {}
    summary: str
    limits: List[str] = [
        "Missing data never means a stretch is accessible. Segments without evidence are marked uncertain.",
        "Gradients, widths and surface quality are not measured from photographs unless stated as visually suspected only.",
        "A stretch described as observed clear means no barrier was visible in the available evidence — not that the route is fully wheelchair accessible.",
        "Photographs may be outdated; capture dates are shown per photo.",
    ]
    warnings: List[str] = []
    integrations: dict = {}
