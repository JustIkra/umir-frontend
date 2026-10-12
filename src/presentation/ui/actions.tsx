import { chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { buttonRecipe, linkRecipe } from '@/presentation/theme/recipes';

export const Button = chakra('button', buttonRecipe, {
  defaultProps: { type: 'button' },
  displayName: 'Button',
});

// Same look as Button for navigation: router paths and in-page anchors.
export const ButtonLink = chakra(RouterLink, buttonRecipe, {
  displayName: 'ButtonLink',
});
export const ButtonAnchor = chakra('a', buttonRecipe, {
  displayName: 'ButtonAnchor',
});

export const TextLink = chakra(RouterLink, linkRecipe, {
  displayName: 'TextLink',
});
export const TextAnchor = chakra('a', linkRecipe, {
  displayName: 'TextAnchor',
});

// Inert button look for product illustrations: not focusable, not announced as
// a control.
export const ButtonLook = chakra('span', buttonRecipe, {
  displayName: 'ButtonLook',
});
