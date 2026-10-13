// Auth-generated identities (users, organizations, restaurants, epochs) are
// canonical lowercase UUIDv4 strings; the contract never reuses them.
const entityIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && entityIdPattern.test(value);
}
