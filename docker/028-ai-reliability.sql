-- AI Reliability Scans and Feedback tables
CREATE TABLE IF NOT EXISTS ai_reliability_scans (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT,
    file_path TEXT NOT NULL,
    score INTEGER NOT NULL, -- 0-100
    heuristics JSONB, -- Breakdown of why the score was given
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_reliability_feedback (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER REFERENCES ai_reliability_scans(id),
    helpful BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
