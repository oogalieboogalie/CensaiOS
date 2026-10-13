export function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required';
  const trimmed = username.trim();
  if (trimmed.length < 3) return 'Username must be at least 3 characters';
  if (trimmed.length > 64) return 'Username must be at most 64 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Username can only contain letters, numbers, and underscores';
  return null;
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email format';
  if (trimmed.length > 254) return 'Email is too long';
  const localPart = trimmed.split('@')[0];
  if (localPart.length > 64) return 'Email local part is too long';
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 12) return 'Password must be at least 12 characters';
  if (password.length > 128) return 'Password is too long';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}
