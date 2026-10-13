export function sendConfigurationError(res, error, fallback = 'Agent configuration is temporarily unavailable.') {
  const status = Number(error?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: fallback });
}
