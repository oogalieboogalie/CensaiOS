// Sizes for the board's tool dock. The pill is the circle plus the padding
// above and below it: 30 + 3 + 3 = 36. Every tool button stays a circle.

export const DOCK = {
  button: 30,
  icon: 16,
  stroke: 1.75,
  padY: 3,
  padX: 4,
  gap: 4,
  divider: 16,
};

export const DOCK_PAD = `${DOCK.padY}px ${DOCK.padX}px`;
