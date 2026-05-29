-- PostGIS schema for GeoSyntra AI Detection (run against agri_cloud database)

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  framework TEXT NOT NULL,
  model_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  manifest JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  imagery_source TEXT,
  model_id TEXT REFERENCES ai_models(id),
  params JSONB,
  progress REAL DEFAULT 0,
  tiles_done INT DEFAULT 0,
  tiles_total INT DEFAULT 0,
  gpu_usage_pct REAL,
  eta_seconds INT,
  message TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_results (
  job_id UUID PRIMARY KEY REFERENCES ai_jobs(id) ON DELETE CASCADE,
  feature_collection JSONB NOT NULL,
  feature_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID REFERENCES ai_jobs(id) ON DELETE CASCADE,
  class_name TEXT,
  confidence REAL,
  area REAL,
  detected_at TIMESTAMPTZ,
  geom GEOMETRY(Geometry, 4326)
);

CREATE INDEX IF NOT EXISTS idx_detections_job ON detections(job_id);
CREATE INDEX IF NOT EXISTS idx_detections_geom ON detections USING GIST(geom);

CREATE TABLE IF NOT EXISTS aoi_analysis (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES ai_jobs(id) ON DELETE CASCADE,
  aoi_geom GEOMETRY(Polygon, 4326),
  stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
