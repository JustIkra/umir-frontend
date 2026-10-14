const normalize = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

// The search of a list: by any of the values (name, code), ignoring case.
export function matchesQuery(
  query: string,
  ...values: readonly string[]
): boolean {
  const needle = normalize(query);
  return (
    needle === '' || values.some((value) => normalize(value).includes(needle))
  );
}
