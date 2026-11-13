// The hub sign-up email links to APP_ORIGIN/confirm-email?token=..., but the
// route that confirms an account is /api/hub-auth/confirm-email. Without this,
// the link opened the board page and the account stayed unconfirmed, so its
// owner could never sign in. Links already sent keep working too.
export const HUB_CONFIRM_ROUTE = '/api/hub-auth/confirm-email';

export function hubConfirmRedirect(req, res) {
  const token = req.query?.token;
  // Only a plain token goes on; anything else lands on the route's own
  // "Invalid confirmation link" answer.
  if (typeof token !== 'string' || !/^[0-9a-f]{16,128}$/i.test(token)) {
    return res.redirect(302, HUB_CONFIRM_ROUTE);
  }
  return res.redirect(302, `${HUB_CONFIRM_ROUTE}?${new URLSearchParams({ token })}`);
}
