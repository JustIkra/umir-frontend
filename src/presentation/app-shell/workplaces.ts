// Account menu search (W08): restaurants whose name contains the query,
// ignoring case; organizations without a match are hidden.
export function filterWorkplaces<
  T extends { readonly restaurants: readonly { readonly name: string }[] },
>(list: readonly T[], query: string): readonly T[] {
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
