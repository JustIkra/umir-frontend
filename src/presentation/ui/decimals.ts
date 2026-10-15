import { plural } from './plural';

// «1 234,5»: grouped thousands and a decimal comma; trailing zeros drop.
export function displayDecimal(value: string): string {
  const [whole = '', fraction = ''] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const tail = fraction.replace(/0+$/, '');
  return tail === '' ? grouped : `${grouped},${tail}`;
}

// «1 день», «3 дня», «2,5 дня»: a fraction takes «дня».
export const days = (value: string): string => {
  const [whole = '0', fraction = ''] = value.split('.');
  const form = /[1-9]/.test(fraction)
    ? 'дня'
    : plural(whole, 'день', 'дня', 'дней');
  return `${displayDecimal(value)}\u00a0${form}`;
};
