import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';

// The name and the password fields that the invitation and the registration
// share. idPrefix keeps the ids of each page: «invite-name», «register-name».

const passwordHint =
  'От 8 до 32 символов. Можно вставить пароль из менеджера паролей.';

export interface CredentialFaults {
  readonly name?: 'required' | 'length' | undefined;
  readonly password?: 'required' | 'length' | undefined;
  readonly repeat?: 'mismatch' | undefined;
}

export interface CredentialErrors {
  readonly name: string | undefined;
  readonly password: string | undefined;
  readonly repeat: string | undefined;
}

// The texts of the faults of the name and the password fields.
export function credentialErrors(
  faults: CredentialFaults | undefined,
): CredentialErrors {
  let name: string | undefined;
  if (faults?.name === 'required') name = 'Введите имя';
  if (faults?.name === 'length') name = 'Нужно от 2 до 80 символов.';
  let password: string | undefined;
  if (faults?.password === 'required') password = 'Введите пароль';
  if (faults?.password === 'length') password = 'Нужно от 8 до 32 символов.';
  return {
    name,
    password,
    repeat: faults?.repeat === 'mismatch' ? 'Пароли не совпадают.' : undefined,
  };
}

export function NameField({
  idPrefix,
  defaultValue,
  error,
}: {
  idPrefix: string;
  defaultValue: string;
  error: string | undefined;
}) {
  return (
    <FieldGroup>
      <FieldLabel htmlFor={`${idPrefix}-name`}>Имя</FieldLabel>
      <TextInput
        id={`${idPrefix}-name`}
        name="displayName"
        autoComplete="name"
        defaultValue={defaultValue}
        invalid={error !== undefined}
        aria-describedby={`${idPrefix}-name-error`}
      />
      <FieldMessage
        id={`${idPrefix}-name-error`}
        error={error}
        hint="От 2 до 80 символов. Так вас увидят коллеги."
      />
    </FieldGroup>
  );
}

// «Пароль» and «Повторите пароль».
export function PasswordFields({
  idPrefix,
  errors,
}: {
  idPrefix: string;
  errors: Pick<CredentialErrors, 'password' | 'repeat'>;
}) {
  return (
    <>
      <FieldGroup>
        <FieldLabel htmlFor={`${idPrefix}-password`}>Пароль</FieldLabel>
        <PasswordInput
          id={`${idPrefix}-password`}
          name="password"
          autoComplete="new-password"
          invalid={errors.password !== undefined}
          aria-describedby={`${idPrefix}-password-hint`}
        />
        <FieldMessage
          id={`${idPrefix}-password-hint`}
          error={errors.password}
          hint={passwordHint}
        />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel htmlFor={`${idPrefix}-repeat`}>Повторите пароль</FieldLabel>
        <PasswordInput
          id={`${idPrefix}-repeat`}
          name="repeat"
          autoComplete="new-password"
          invalid={errors.repeat !== undefined}
          aria-describedby={
            errors.repeat === undefined ? undefined : `${idPrefix}-repeat-error`
          }
        />
        <FieldMessage id={`${idPrefix}-repeat-error`} error={errors.repeat} />
      </FieldGroup>
    </>
  );
}
