// Contact form rules mirrored from the feedback service contract
// (JustIkra/umir-feedback#1). The service stays authoritative and may return
// the same codes after its own normalization.

export interface FeedbackDraft {
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  // Hidden trap for bots; people never see or fill it.
  website: string;
}

export type FeedbackField = 'name' | 'email' | 'phone' | 'message' | 'consent';

export type FeedbackFieldError =
  | 'Required'
  | 'TooShort'
  | 'TooLong'
  | 'InvalidFormat'
  | 'InvalidCharacters'
  | 'ConsentRequired'
  | 'ConsentOutdated';

export type FeedbackFieldErrors = Partial<
  Record<FeedbackField, FeedbackFieldError>
>;

export const feedbackFieldOrder: readonly FeedbackField[] = [
  'name',
  'email',
  'phone',
  'message',
  'consent',
];

export const feedbackMessageLimit = 2000;
const nameLimit = 100;
const emailLimit = 254;
const phoneLimit = 32;

export const emptyFeedbackDraft: FeedbackDraft = {
  name: '',
  email: '',
  phone: '',
  message: '',
  consent: false,
  website: '',
};

// Lengths are counted in code points of the trimmed NFC text, like the service.
export const codePointLength = (value: string) =>
  value.trim().normalize('NFC').match(/./gsu)?.length ?? 0;

const controlCharacters = /\p{Cc}/u;
const messageControlCharacters = /[^\P{Cc}\n\t]/u;
const phoneCharacters = /^[\d +\-()]+$/;

function validateName(value: string): FeedbackFieldError | undefined {
  const name = value.trim();
  if (name === '') return 'Required';
  if (codePointLength(name) > nameLimit) return 'TooLong';
  if (controlCharacters.test(name)) return 'InvalidCharacters';
  return undefined;
}

function validateEmail(value: string): FeedbackFieldError | undefined {
  const email = value.trim();
  if (email === '') return 'Required';
  if (codePointLength(email) > emailLimit) return 'TooLong';
  const parts = email.split('@');
  const [local, domain] = parts;
  const valid =
    parts.length === 2 &&
    local !== undefined &&
    domain !== undefined &&
    local !== '' &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !/\s/u.test(email);
  return valid ? undefined : 'InvalidFormat';
}

function validatePhone(value: string): FeedbackFieldError | undefined {
  const phone = value.trim();
  if (phone === '') return undefined;
  if (codePointLength(phone) > phoneLimit) return 'TooLong';
  if (!phoneCharacters.test(phone)) return 'InvalidCharacters';
  const digits = phone.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15 ? undefined : 'InvalidFormat';
}

function validateMessage(value: string): FeedbackFieldError | undefined {
  const message = value.trim();
  if (message === '') return 'Required';
  if (codePointLength(message) > feedbackMessageLimit) return 'TooLong';
  if (messageControlCharacters.test(message)) return 'InvalidCharacters';
  return undefined;
}

export function validateFeedbackDraft(
  draft: FeedbackDraft,
): FeedbackFieldErrors {
  const errors: FeedbackFieldErrors = {};
  const name = validateName(draft.name);
  const email = validateEmail(draft.email);
  const phone = validatePhone(draft.phone);
  const message = validateMessage(draft.message);
  if (name) errors.name = name;
  if (email) errors.email = email;
  if (phone) errors.phone = phone;
  if (message) errors.message = message;
  if (!draft.consent) errors.consent = 'ConsentRequired';
  return errors;
}
