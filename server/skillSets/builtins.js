// Built-in skill sets: the Software Engineering set from Alex's drawing, then
// one set per profession from Alex's Idea Foundry research (foundryLibrary.js).
// A board can edit a built-in; its edit is stored as that board's own copy.

import { SOFTWARE_ENGINEERING_SKILL_SET } from './softwareEngineering.js';
import { FOUNDRY_SKILL_SETS } from './foundryLibrary.js';

export const BUILTIN_SKILL_SETS = Object.freeze([SOFTWARE_ENGINEERING_SKILL_SET, ...FOUNDRY_SKILL_SETS]);
export const BUILTIN_SKILL_SET_BY_ID = Object.freeze(Object.fromEntries(BUILTIN_SKILL_SETS.map((set) => [set.id, set])));
