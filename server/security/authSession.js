function callbackPromise(invoke) {
  return new Promise((resolve, reject) => {
    invoke((error) => error ? reject(error) : resolve());
  });
}

export async function establishAuthenticatedSession(req, user) {
  if (!req?.session || typeof req.session.regenerate !== 'function') {
    throw new Error('Authenticated session regeneration is unavailable.');
  }

  await callbackPromise((done) => req.session.regenerate(done));
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userEmail = user.email;

  if (typeof req.session.save !== 'function') {
    throw new Error('Authenticated session persistence is unavailable.');
  }
  await callbackPromise((done) => req.session.save(done));
}
