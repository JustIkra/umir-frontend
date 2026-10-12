import { Box, Stack, Text, chakra } from '@chakra-ui/react';
import mapPin from '@/presentation/assets/icons/map-pin.svg';
import { TextAnchor } from '@/presentation/ui/actions';
import { rem } from '@/presentation/ui/units';

// Placeholders from the design; the operator fills them in before publication.
const officeAddress = 'Москва, [адрес офиса]';
const officeHours = '[часы работы поддержки]';
const yandexMapsUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(officeAddress)}`;

const columns = [-20, 76, 172, 268, 364, 460, 556];
const rows = [-10, 62, 134, 206, 278, 350, 422];

function Strip({
  x,
  y,
  width,
  height,
  color = 'bg.surface',
  radius,
  rotate,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  radius?: number;
  rotate?: number;
}) {
  return (
    <Box
      position="absolute"
      left={rem(x)}
      top={rem(y)}
      w={rem(width)}
      h={rem(height)}
      bg={color}
      borderRadius={radius === undefined ? undefined : rem(radius)}
      rotate={rotate === undefined ? undefined : `${String(rotate)}deg`}
    />
  );
}

// Static schematic map: no third-party map, cookies or IP transfer (Figma Map
// 203:3279). The 560×440 drawing is scaled to 70% on phones, as in the design.
function MapDrawing() {
  return (
    <Box
      aria-hidden="true"
      position="absolute"
      top="0"
      left="0"
      w={rem(560)}
      h={rem(440)}
      overflow="clip"
      bg="bg.canvas"
      transformOrigin="top left"
      scale={{ base: '0.7', sm: '1' }}
    >
      {columns.flatMap((x) =>
        rows.map((y) => (
          <Strip
            key={`${String(x)}:${String(y)}`}
            x={x}
            y={y}
            width={78}
            height={54}
            color="bg.subtle"
            radius={6}
          />
        )),
      )}
      <Strip
        x={360}
        y={30}
        width={170}
        height={120}
        color="decor.mintSoft"
        radius={22}
      />
      <Strip
        x={-99.92}
        y={334.24}
        width={820}
        height={64}
        color="decor.skySoft"
        radius={32}
        rotate={14}
      />
      <Strip x={-40} y={168} width={640} height={20} />
      <Strip x={262} y={-40} width={20} height={520} />
      <Strip x={-107.29} y={217.7} width={760} height={12} rotate={28} />
      <Strip x={-40} y={96} width={640} height={8} />
      <Strip x={168} y={-40} width={8} height={520} />
      <chakra.img
        src={mapPin}
        alt=""
        htmlWidth={40}
        htmlHeight={52}
        position="absolute"
        left={rem(252)}
        top={rem(84)}
        w={rem(40)}
        h={rem(52)}
      />
    </Box>
  );
}

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
        <MapDrawing />
        {/* The pin label keeps its text size while the drawing scales. */}
        <Text
          aria-hidden="true"
          position="absolute"
          left={{ base: rem(207.2), sm: rem(296) }}
          top={{ base: rem(61.6), sm: rem(88) }}
          px="2.5"
          py="1.5"
          bg="bg.surface"
          borderRadius="md"
          boxShadow="overlay"
          textStyle="caption.strong"
          whiteSpace="nowrap"
        >
          Ровный ход
        </Text>
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
