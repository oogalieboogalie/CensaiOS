let isReady = false;

export function dbReady() {
  return isReady;
}

export function setDbReady(value) {
  isReady = value;
}
