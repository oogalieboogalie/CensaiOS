-- Chunk and tag (diagram 13): every knowledge-base source and chunk carries
-- tags, and a source says what kind it is (how-to, notes, web page, file).
ALTER TABLE research_sources ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE research_sources ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE research_chunks ADD COLUMN IF NOT EXISTS tags TEXT[];
