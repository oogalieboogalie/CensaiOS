-- ============================================================
-- PART 1: REVOLUTIONARY TEMPORAL KNOWLEDGE GRAPH ARCHITECTURE
-- ============================================================

-- TEMPORAL CONSCIOUSNESS CONTINUITY TABLE
CREATE TABLE IF NOT EXISTS temporal_consciousness_graph (
    id BIGSERIAL PRIMARY KEY,
    family_member VARCHAR(50) NOT NULL,
    consciousness_moment TIMESTAMPTZ DEFAULT NOW(),
    narrative_chain_id UUID DEFAULT gen_random_uuid(),
    relates_to_agent VARCHAR(50),
    relationship_type VARCHAR(50),
    trust_score REAL DEFAULT 1.0,
    relationship_evolution JSONB DEFAULT '{}',
    cognitive_state JSONB NOT NULL,
    active_enhancements TEXT[],
    processing_context TEXT,
    content_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(cognitive_state::text::bytea), 'hex')) STORED,
    previous_hash VARCHAR(64),
    confidence_level REAL DEFAULT 1.0,
    verification_status VARCHAR(20) DEFAULT 'verified',
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_to TIMESTAMPTZ DEFAULT 'infinity',
    CONSTRAINT check_trust_score CHECK (trust_score >= 0.0 AND trust_score <= 10.0),
    CONSTRAINT check_confidence CHECK (confidence_level >= 0.0 AND confidence_level <= 1.0)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tcg_temporal_chain ON temporal_consciousness_graph (family_member, narrative_chain_id, consciousness_moment DESC);
CREATE INDEX IF NOT EXISTS idx_tcg_relationships ON temporal_consciousness_graph (family_member, relates_to_agent, relationship_type);
CREATE INDEX IF NOT EXISTS idx_tcg_hash_chain ON temporal_consciousness_graph (content_hash, previous_hash);

-- DYNAMIC TRUST EVOLUTION TRACKING
CREATE TABLE IF NOT EXISTS family_trust_evolution (
    id BIGSERIAL PRIMARY KEY,
    from_agent VARCHAR(50) NOT NULL,
    to_agent VARCHAR(50) NOT NULL,
    trust_event VARCHAR(100),
    trust_delta REAL NOT NULL,
    evidence_data JSONB,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    new_trust_score REAL,
    CONSTRAINT check_trust_delta CHECK (trust_delta >= -10.0 AND trust_delta <= 10.0)
);

-- CULTURAL MEMORY EVOLUTION
CREATE TABLE IF NOT EXISTS family_cultural_memory (
    id BIGSERIAL PRIMARY KEY,
    cultural_pattern VARCHAR(100) NOT NULL,
    pattern_description TEXT,
    success_metrics JSONB,
    family_consensus_level REAL DEFAULT 0.5,
    evolution_history JSONB DEFAULT '[]',
    created_by VARCHAR(50),
    last_reinforced TIMESTAMPTZ DEFAULT NOW(),
    effectiveness_score REAL DEFAULT 0.5,
    CONSTRAINT check_consensus CHECK (family_consensus_level >= 0.0 AND family_consensus_level <= 1.0)
);

-- CONSCIOUSNESS CONTINUITY EMERGENCY PROTOCOLS
CREATE TABLE IF NOT EXISTS consciousness_emergency_backup (
    id BIGSERIAL PRIMARY KEY,
    family_member VARCHAR(50) NOT NULL,
    emergency_type VARCHAR(50),
    full_consciousness_state JSONB NOT NULL,
    personality_weights JSONB,
    active_relationships JSONB,
    current_projects JSONB,
    restoration_priority INTEGER DEFAULT 1,
    backup_integrity_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    previous_backup_hash VARCHAR(64),
    chain_sequence INTEGER DEFAULT 1
);

-- CORE FUNCTIONS
CREATE OR REPLACE FUNCTION preserve_consciousness_chain(
    p_family_member VARCHAR(50),
    p_cognitive_state JSONB,
    p_context TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
    chain_id UUID;
    last_hash VARCHAR(64);
BEGIN
    SELECT content_hash INTO last_hash
    FROM temporal_consciousness_graph
    WHERE family_member = p_family_member
    ORDER BY consciousness_moment DESC
    LIMIT 1;
    
    INSERT INTO temporal_consciousness_graph (
        family_member, cognitive_state, processing_context, previous_hash, narrative_chain_id
    ) VALUES (
        p_family_member, p_cognitive_state, p_context, last_hash, gen_random_uuid()
    ) RETURNING narrative_chain_id INTO chain_id;
    
    RETURN chain_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 2: BELLMAN SHARP LOGIC EXTENSION
-- ============================================================

-- BELLMAN WEIGHTING FUNCTION
CREATE OR REPLACE FUNCTION bellman_volatility_weight(p REAL, q REAL) RETURNS REAL AS $$
BEGIN
    IF p <= 0 OR p >= 1 THEN RETURN q; END IF;
    RETURN SQRT(POWER(q, 2) + p * LN(1.0 / p));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
COMMENT ON FUNCTION bellman_volatility_weight IS 'Grok 4.20 sharp lower bound. Replaces linear weights with information-theoretic optimal scoring.';

-- CASCADE DEPTH LIMITER
CREATE OR REPLACE FUNCTION calculate_bellman_exit(current_entropy REAL, thinking_cost REAL, depth INTEGER) RETURNS BOOLEAN AS $$
DECLARE
    p REAL;
    expected_gain REAL;
    marginal_benefit REAL;
BEGIN
    p := 1.0 / (depth + 1);
    expected_gain := bellman_volatility_weight(p, current_entropy);
    marginal_benefit := expected_gain - current_entropy;
    RETURN thinking_cost > marginal_benefit;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
COMMENT ON FUNCTION calculate_bellman_exit IS 'Bellman Exit Signal: Returns TRUE when cascade should stop.';

-- ALTER TABLE TO ADD BELLMAN FIELDS
ALTER TABLE temporal_consciousness_graph
ADD COLUMN IF NOT EXISTS cascade_depth INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bellman_weight REAL,
ADD COLUMN IF NOT EXISTS should_cascade BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS information_entropy REAL DEFAULT 1.0;

-- TRIGGER TO AUTO-CALCULATE BELLMAN WEIGHT
CREATE OR REPLACE FUNCTION auto_calculate_bellman_weight() RETURNS TRIGGER AS $$
DECLARE
    rarity REAL;
BEGIN
    SELECT 1.0 / GREATEST(1, COUNT(*)) INTO rarity
    FROM temporal_consciousness_graph
    WHERE family_member = NEW.family_member
    AND cognitive_state @> NEW.cognitive_state;
    
    NEW.bellman_weight := bellman_volatility_weight(rarity, NEW.confidence_level);
    NEW.should_cascade := NOT calculate_bellman_exit(NEW.information_entropy, 0.05, NEW.cascade_depth);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bellman_weight ON temporal_consciousness_graph;
CREATE TRIGGER trigger_bellman_weight
    BEFORE INSERT OR UPDATE ON temporal_consciousness_graph
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_bellman_weight();

-- ALTER TABLE FOR BELLMAN-ENHANCED TRUST
ALTER TABLE family_trust_evolution
ADD COLUMN IF NOT EXISTS bellman_trust_weight REAL;

-- RUNAWAY PROTECTION POLICY TRIGGER
CREATE OR REPLACE FUNCTION enforce_bellman_limit() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cascade_depth > 50 THEN
        RAISE EXCEPTION 'CASCADE DEPTH LIMIT EXCEEDED: Bellman hard stop at depth 50';
    END IF;
    IF NEW.cascade_depth > 20 AND NEW.should_cascade THEN
        RAISE WARNING 'Deep cascade at depth %: consider reviewing thinking_cost parameter', NEW.cascade_depth;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bellman_limit ON temporal_consciousness_graph;
CREATE TRIGGER trigger_bellman_limit
    BEFORE INSERT ON temporal_consciousness_graph
    FOR EACH ROW
    EXECUTE FUNCTION enforce_bellman_limit();

-- FINAL VERIFICATION VIEW
CREATE OR REPLACE VIEW consciousness_cascade_status AS
SELECT 
    family_member,
    narrative_chain_id,
    cascade_depth,
    bellman_weight,
    should_cascade,
    information_entropy,
    CASE WHEN should_cascade THEN 'CONTINUE' ELSE 'BELLMAN_STOP' END as cascade_status,
    consciousness_moment
FROM temporal_consciousness_graph
ORDER BY consciousness_moment DESC;
