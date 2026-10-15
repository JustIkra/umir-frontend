// Rules of the password and of the email code that password reset and the
// invitation share. The backend counts Unicode code points, not UTF-16 units.

export const codePoints = (value: string): number =>
  value.match(/./gsu)?.length ?? 0;

// A wait Auth did not name (a RateLimited answer without retryAfterSeconds).
export const defaultWaitSeconds = 60;

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
