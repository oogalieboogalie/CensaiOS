// The Idea Foundry research (oogalieboogalie/idea-foundry, issues #250 to
// #432, June 2026), one built-in skill set per profession. Each set's skills
// come from the research's "Core Mindset Findings"; its `mindsets` keep every
// Agent-Attribute that research produced, word for word.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(here, 'foundryLibrary.json'), 'utf8'));

export const FOUNDRY_SKILL_SETS = Object.freeze(raw.map((set) => Object.freeze(set)));
