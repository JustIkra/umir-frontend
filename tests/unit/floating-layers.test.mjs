import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  comboboxRecipe,
  datePickerRecipe,
} from '../../src/presentation/theme/recipes.ts';

// zag copies the z-index of the content into the positioner's `--z-index`
// and ignores one set on the positioner, so the lists and the calendar sit
// above the page only when the content carries it.
test('the list and the calendar carry the popover z-index on the content', () => {
  for (const recipe of [comboboxRecipe, datePickerRecipe]) {
    assert.equal(recipe.base.content.zIndex, 'popover');
    assert.equal(recipe.base.positioner, undefined);
  }
});
