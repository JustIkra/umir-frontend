// Rules of the password, the name, the email address and the email code that
// password reset, the invitation and the registration share. The backend counts Unicode code points, not UTF-16 units.

export const codePoints = (value: string): number =>
  value.match(/./gsu)?.length ?? 0;

// A wait Auth did not name (a RateLimited answer without retryAfterSeconds).
export const defaultWaitSeconds = 60;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const minName = 2;
const maxName = 80;
const codePattern = /^[0-9]{6}$/;
const minPassword = 8;
const maxPassword = 32;

// The password is counted as typed (no trim, no normalization).
export function passwordProblem(
  password: string,
): 'required' | 'length' | undefined {
  if (password === '') return 'required';
  const length = codePoints(password);
  return length < minPassword || length > maxPassword ? 'length' : undefined;
}

// The email shows the code as «482 913»: spaces are dropped; undefined when
// what is left is not six digits.
export function normalizedCode(input: string): string | undefined {
  const code = input.replace(/\s/g, '');
  return codePattern.test(code) ? code : undefined;
}

// The display name, already trimmed.
export function nameProblem(name: string): 'required' | 'length' | undefined {
  if (name === '') return 'required';
  const length = codePoints(name);
  return length < minName || length > maxName ? 'length' : undefined;
}

// The shape of an address, already trimmed: something@something.something.
export function emailProblem(email: string): 'required' | 'format' | undefined {
  if (email === '') return 'required';
  return emailPattern.test(email) ? undefined : 'format';
}
