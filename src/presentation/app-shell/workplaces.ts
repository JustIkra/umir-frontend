import { type Organization } from '@/presentation/placeholder-organizations';

// Account menu search (W08): restaurants whose name contains the query,
// ignoring case; organizations without a match are hidden.
export function filterWorkplaces(
  list: readonly Organization[],
  query: string,
): readonly Organization[] {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return list;
  return list
    .map((organization) => ({
      ...organization,
      restaurants: organization.restaurants.filter((restaurant) =>
        restaurant.name.toLocaleLowerCase('ru').includes(needle),
      ),
    }))
    .filter((organization) => organization.restaurants.length > 0);
}
