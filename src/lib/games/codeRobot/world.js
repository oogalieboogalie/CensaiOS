// Code Robot's world: a grid, a robot, gems and a goal. Pure rules, no DOM.
//
// Maps are drawn as text so a level reads like the board it makes:
//   #  wall        .  floor        G  goal        *  gem
//   > < ^ v       the robot, facing that way (it starts on floor)

export const DIRS = [
  { dx: 1, dy: 0, name: 'east' },
  { dx: 0, dy: 1, name: 'south' },
  { dx: -1, dy: 0, name: 'west' },
  { dx: 0, dy: -1, name: 'north' },
];
const ROBOT = { '>': 0, v: 1, '<': 2, '^': 3 };

/** Parse a text map into a world. Throws on a map without one robot and one goal. */
export function parseMap(rows) {
  const lines = (Array.isArray(rows) ? rows : String(rows).split('\n')).map((r) => String(r));
  const h = lines.length;
  const w = Math.max(...lines.map((r) => r.length));
  const walls = new Set();
  const gems = new Set();
  let robot = null;
  let goal = null;
  lines.forEach((row, y) => {
    for (let x = 0; x < w; x += 1) {
      const c = row[x] ?? '#';
      if (c === '#' || c === ' ') walls.add(`${x},${y}`);
      else if (c === '*') gems.add(`${x},${y}`);
      else if (c === 'G') goal = { x, y };
      else if (c in ROBOT) robot = { x, y, dir: ROBOT[c] };
    }
  });
  if (!robot || !goal) throw new Error('A map needs one robot and one goal');
  return { w, h, walls, gems, goal, robot, startGems: gems.size };
}

export function cloneWorld(world) {
  return { ...world, robot: { ...world.robot }, gems: new Set(world.gems) };
}

export function isWall(world, x, y) {
  return x < 0 || y < 0 || x >= world.w || y >= world.h || world.walls.has(`${x},${y}`);
}

export function ahead(world) {
  const d = DIRS[world.robot.dir];
  return { x: world.robot.x + d.dx, y: world.robot.y + d.dy };
}

export function solved(world) {
  return world.robot.x === world.goal.x && world.robot.y === world.goal.y && world.gems.size === 0;
}

/** A plain snapshot for the player's replay: where the robot is and which gems are left. */
export function snapshot(world, action) {
  return { x: world.robot.x, y: world.robot.y, dir: world.robot.dir, gems: [...world.gems], action };
}
