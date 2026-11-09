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
  req.session.userEmail = user.email;
  req.session.userName = user.name || null;
  // A hub account is not a Homebase user. It gets no role (an allowlisted
  // admin email must not land here as admin), and the API guard refuses this marker.
  if (user.hubAccount) req.session.hubAccount = true;
  else req.session.userRole = user.role;

  if (typeof req.session.save !== 'function') {
    throw new Error('Authenticated session persistence is unavailable.');
  }
  await callbackPromise((done) => req.session.save(done));
}
