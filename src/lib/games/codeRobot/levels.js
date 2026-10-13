// The level ladder. Each level teaches one idea and some levels have more
// than one map, so the same program has to work on all of them: that's what
// makes a loop or an if worth writing.
//
// `par` is the number of lines a tidy solution needs; matching it earns
// three stars.

export const LEVELS = [
  {
    id: 'first-steps',
    title: 'First steps',
    lesson: 'Commands run in order, one per line.',
    task: 'Walk the robot to the goal.',
    maps: [['#######', '#>...G#', '#######']],
    par: 4,
    starter: 'move();\n',
    hint: 'Each move() goes one square. How many squares to the goal?',
  },
  {
    id: 'turn-the-corner',
    title: 'Turn the corner',
    lesson: 'turnLeft() and turnRight() turn on the spot.',
    task: 'Go along, then down to the goal.',
    maps: [['######', '#>..##', '###.##', '###G##', '######']],
    par: 5,
    starter: 'move();\nmove();\n',
    hint: 'After two moves, turn right to face down.',
  },
  {
    id: 'pick-it-up',
    title: 'Pick it up',
    lesson: 'pickUp() collects a gem on the square you are standing on.',
    task: 'Collect every gem, then reach the goal.',
    maps: [['#######', '#>*.*G#', '#######']],
    par: 6,
    starter: 'move();\n',
    hint: 'Stand on a gem, then pickUp().',
  },
  {
    id: 'the-long-hall',
    title: 'The long hall',
    lesson: 'A for loop repeats code a set number of times.',
    task: 'Twelve squares to go. Try not to write move() twelve times.',
    maps: [['################', '#>...........G##', '################']],
    par: 3,
    starter: 'for (let i = 0; i < 3; i++) {\n  move();\n}\n',
    hint: 'Change the 3 to the number of squares you need.',
  },
  {
    id: 'stairs',
    title: 'Stairs',
    lesson: 'A function gives a name to a few commands you use again and again.',
    task: 'Climb the stairs to the goal.',
    maps: [['#######', '#####G#', '####..#', '###..##', '##..###', '#>.####', '#######']],
    par: 9,
    starter: 'function step() {\n  move();\n  turnLeft();\n  move();\n  turnRight();\n}\n\nstep();\n',
    hint: 'One step is: move, turn left, move, turn right. Call step() a few times.',
  },
  {
    id: 'how-far',
    title: 'How far?',
    lesson: 'A while loop keeps going until something changes.',
    task: 'The hall is a different length each time. One program has to solve both.',
    maps: [['#########', '#>.....G#', '#########'], ['#############', '#>.........G#', '#############']],
    par: 3,
    starter: 'while (!atGoal()) {\n  \n}\n',
    hint: 'Keep moving while you are not at the goal.',
  },
  {
    id: 'wall-ahead',
    title: 'Wall ahead',
    lesson: 'if runs code only when something is true.',
    task: 'Walk to the end of each hall, turn, and find the goal. Both maps.',
    maps: [['#######', '#>...##', '####.##', '####.##', '####G##', '#######'], ['#########', '#>.....##', '######.##', '######G##', '#########']],
    par: 7,
    starter: 'while (!atGoal()) {\n  if (wallAhead()) {\n    \n  }\n  move();\n}\n',
    hint: 'When there is a wall ahead, turn right before moving.',
  },
  {
    id: 'gem-hunt',
    title: 'Gem hunt',
    lesson: 'Check where you are before you act.',
    task: 'Gems are scattered differently on each map. Collect them all on the way.',
    maps: [['##########', '#>.*..*.G#', '##########'], ['##########', '#>*.**...G', '##########'], ['##########', '#>......*G', '##########']],
    par: 6,
    starter: 'while (!atGoal()) {\n  move();\n}\n',
    hint: 'After each move, if onGem() then pickUp().',
  },
  {
    id: 'zigzag',
    title: 'Zigzag',
    lesson: 'Loops and ifs together can follow any path that has a rule.',
    task: 'Follow the corridor wherever it turns. Three different maps.',
    maps: [
      ['#######', '#>..###', '###.###', '###...#', '#####G#', '#######'],
      ['########', '#>.#####', '##.#####', '##....##', '#####.##', '#####G##', '########'],
      ['#####', '#>.##', '##.##', '##.##', '##..#', '###G#', '#####'],
    ],
    par: 12,
    starter: '// The corridor turns left or right. Look before you move.\nwhile (!atGoal()) {\n  move();\n}\n',
    hint: 'If a wall is ahead, try turning right; if there is still a wall, turn around (two lefts).',
  },
  {
    id: 'the-maze',
    title: 'The maze',
    lesson: 'Keep your right hand on the wall and you will find the way out.',
    task: 'Solve both mazes with one program.',
    maps: [
      ['#########', '#>..#...#', '#.#.#.#.#', '#.#...#.#', '#.#####.#', '#......G#', '#########'],
      ['#########', '#>#.....#', '#.#.###.#', '#...#G#.#', '#####.#.#', '#.....#.#', '#.#####.#', '#.......#', '#########'],
    ],
    par: 12,
    starter: '// Right-hand rule: turn right, then turn left until the way is clear, then move.\nwhile (!atGoal()) {\n  \n}\n',
    hint: 'Each step: turnRight(); then while (wallAhead()) turnLeft(); then move();',
  },
];

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export function nextLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}
