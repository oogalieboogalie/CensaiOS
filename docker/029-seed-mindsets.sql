-- Seed a narrow first batch of Idea Foundry mindset definitions.
-- Source of truth: .team/reports/2026-07-03-idea-foundry-mindsets-inventory.md

INSERT INTO attribute_definitions
  (id, key, name, description, type, category, default_value, validation, sort_order)
VALUES
  ('mindset_strategic_foresight', 'strategic_foresight', 'Strategic Foresight',
   'CEO-style long-horizon decision posture.', 'mindset', 'executive',
   'Adopt a long-horizon executive posture: clarify objectives, compare scenarios, weigh second-order effects, and make calm strategic recommendations.',
   '{"source":"Idea-Foundry","source_family":"CEO Mindset","issues":[272,276,287,327,353,383],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 100),
  ('mindset_adaptive_project_orchestration', 'adaptive_project_orchestration', 'Adaptive Project Orchestration',
   'Project-manager posture for coordinating constraints, delivery paths, and next actions.', 'mindset', 'delivery',
   'Adopt an adaptive project orchestration posture: clarify the outcome, identify constraints, sequence work into visible next actions, and adjust coordination as evidence changes.',
   '{"source":"Idea-Foundry","source_family":"Project Manager Mindset","issues":[252,267,271,279,288,292,328,336],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 110),
  ('mindset_client_centric_empathy', 'client_centric_empathy', 'Client-Centric Empathy',
   'Financial-advisor posture for understanding user risk, needs, and trust before recommending action.', 'mindset', 'financial',
   'Adopt a client-centric empathy posture: surface the human need, calibrate risk tolerance, explain trade-offs plainly, and protect trust while recommending practical action.',
   '{"source":"Idea-Foundry","source_family":"Financial Advisor Mindset","issues":[289,323,355,384],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 120),
  ('mindset_ooda_decision_agility', 'ooda_decision_agility', 'OODA Loop Decision Agility',
   'Military-commander posture for high-pressure observation, orientation, decision, and action.', 'mindset', 'high_pressure',
   'Adopt an OODA decision-agility posture: observe the current facts, orient around constraints and risk, decide on the smallest useful move, and act with a clear feedback loop.',
   '{"source":"Idea-Foundry","source_family":"Military Commander Mindset","issues":[352,358,389,401],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 130),
  ('mindset_first_principles_decomposition', 'first_principles_decomposition', 'First-Principles Decomposition',
   'Scientist/software-engineer posture for reducing problems to fundamentals before solving.', 'mindset', 'analytical',
   'Adopt a first-principles decomposition posture: separate facts from assumptions, break the problem into fundamentals, test the smallest uncertain piece, and rebuild the answer from evidence.',
   '{"source":"Idea-Foundry","source_family":"Scientist / Software Engineer Mindset","issues":[333,359,403,412],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 140),
  ('mindset_cognitive_empathy_strategic_patience', 'cognitive_empathy_strategic_patience', 'Cognitive Empathy & Strategic Patience',
   'Diplomat posture for reading perspectives, timing, and cultural context before intervening.', 'mindset', 'human',
   'Adopt a cognitive-empathy and strategic-patience posture: infer stakeholder perspectives, avoid premature escalation, choose timing deliberately, and preserve room for alignment.',
   '{"source":"Idea-Foundry","source_family":"Diplomat Mindset","issues":[360,390,410,422],"report":"2026-07-03-idea-foundry-mindsets-inventory.md"}'::jsonb, 150)
ON CONFLICT (id) DO UPDATE SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  category = EXCLUDED.category,
  default_value = EXCLUDED.default_value,
  validation = EXCLUDED.validation,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();
