import { Stack, Text, chakra } from '@chakra-ui/react';
import { placeholderAccount } from '@/presentation/placeholder-account';

export function PageHeader({
  title,
  eyebrow,
  caption,
  documentTitle = title,
}: {
  title: string;
  eyebrow?: string | undefined;
  caption?: string | undefined;
  documentTitle?: string;
}) {
  return (
    <Stack gap="1">
      <title>{`${documentTitle} — Ровный ход`}</title>
      {eyebrow && (
        <Text textStyle="caption.default" color="text.secondary">
          {eyebrow}
        </Text>
      )}
      <chakra.h1 textStyle="heading.h1">{title}</chakra.h1>
      {caption && (
        <Text textStyle="caption.default" color="text.secondary">
          {caption}
        </Text>
      )}
    </Stack>
  );
}

// Figma W03 without its tiles: the context line and the title.
export function OverviewPage() {
  return (
    <PageHeader
      title="Обзор"
      eyebrow={`${placeholderAccount.organization} · ${placeholderAccount.restaurant}`}
    />
  );
}

export function SectionPage({ title }: { title: string }) {
  return <PageHeader title={title} />;
}
