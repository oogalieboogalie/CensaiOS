function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function getSessionCookieOptions(appOrigin, {
  crossSite = enabled(process.env.CENSAI_CROSS_SITE_COOKIES),
} = {}) {
  const isHttps = String(appOrigin || '').startsWith('https://');
  if (crossSite && !isHttps) {
    throw new Error('CENSAI_CROSS_SITE_COOKIES requires an HTTPS APP_ORIGIN.');
  }
  return {
    secure: isHttps,
    sameSite: crossSite ? 'none' : 'lax',
    httpOnly: true,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
}
