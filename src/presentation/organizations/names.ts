// The name of an organization or a restaurant is checked before it is sent:
// Auth answers 400 InvalidArgument without saying which field (D16). Auth
// accepts 1–100 characters without \x00, \r and \n.
export type NameError = 'required' | 'long' | 'control';

export const maxNameLength = 100;

export function nameError(value: string): NameError | undefined {
  const name = value.trim();
  if (name === '') return 'required';
  if (name.includes('\0') || name.includes('\r') || name.includes('\n')) {
    return 'control';
  }
  return codePoints(name) > maxNameLength ? 'long' : undefined;
}

// Auth counts characters, not UTF-16 units.
function codePoints(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    count += 1;
    if ((value.codePointAt(index) ?? 0) > 0xffff) index += 1;
  }
  return count;
}

const common: Readonly<Record<Exclude<NameError, 'required'>, string>> = {
  long: 'Не длиннее 100 символов',
  control: 'Название — в одну строку',
};

export function organizationNameMessage(error: NameError): string {
  return error === 'required' ? 'Укажите название организации' : common[error];
}

export function restaurantNameMessage(error: NameError): string {
  return error === 'required' ? 'Укажите название ресторана' : common[error];
}
