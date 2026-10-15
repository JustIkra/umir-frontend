import { Box, Stack, Text, chakra } from '@chakra-ui/react';
import { TextAnchor } from '@/presentation/ui/actions';
import { rem } from '@/presentation/ui/units';

const officeAddress = 'Ростов-на-Дону, ул. Тургеневская, 10/6';
const officeHours = 'Пн–пт, 9:00–18:00';
// Yandex finds the building by the address and puts its own placemark there.
const mapQuery = encodeURIComponent('Ростов-на-Дону, Тургеневская улица, 10/6');
const yandexMapsUrl = `https://yandex.ru/maps/?text=${mapQuery}`;
const yandexWidgetUrl = `https://yandex.ru/map-widget/v1/?text=${mapQuery}&z=17`;

export function OfficeMap() {
  return (
    <Stack gap="3" position="relative">
      <Box
        position="relative"
        h={{ base: rem(240), sm: rem(440) }}
        overflow="clip"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="lg"
      >
        {/* Yandex Maps widget: Yandex receives the request data and may set its
            own cookies (see the privacy and cookie policies). */}
        <chakra.iframe
          src={yandexWidgetUrl}
          title={`Карта: ${officeAddress}`}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          display="block"
          w="full"
          h="full"
          border="0"
        />
      </Box>
      <Stack
        as="address"
        fontStyle="normal"
        gap="1"
        p="4"
        bg="bg.surface"
        borderRadius="md"
        borderWidth={{ base: '1px', sm: '0' }}
        borderColor="border.default"
        boxShadow={{ sm: 'overlay' }}
        position={{ sm: 'absolute' }}
        left={{ sm: '4' }}
        bottom={{ sm: '4' }}
        w={{ sm: rem(300) }}
      >
        <Text textStyle="caption.strong" color="text.secondary">
          Офис и поддержка
        </Text>
        <Text textStyle="body.strong">{officeAddress}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {officeHours}
        </Text>
        <TextAnchor
          href={yandexMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="caption"
          alignSelf="flex-start"
        >
          Открыть в Яндекс Картах
          <chakra.span srOnly> (откроется в новой вкладке)</chakra.span>
        </TextAnchor>
      </Stack>
    </Stack>
  );
}
