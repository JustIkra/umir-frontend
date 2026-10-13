import { Flex, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import {
  expiry,
  expiryBoundary,
  expirySummary,
  stockStamp,
} from '@/presentation/placeholder-warehouse';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { WarehouseLayout } from './warehouse-layout';

type Period = '24h' | '3d' | '7d';

// Figma S3 «Сроки годности», boundary 24 h. The period switch moves only the
// mark: the sample list stays the same. Batch details (S2) are not built, so
// the rows carry no chevron. On 390 the summary and the column heads go.
export function ExpiryPage() {
  const [period, setPeriod] = useState<Period>('24h');
  return (
    <WarehouseLayout section="Сроки годности" stamp={stockStamp}>
      <Flex wrap="wrap" align="center" columnGap="4" rowGap="3">
        <SegmentChoice
          label="Граница мониторинга"
          options={[
            { value: '24h', title: '24 ч' },
            { value: '3d', title: '3 дня' },
            { value: '7d', title: '7 дней' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <Stack gap="0">
          <Text textStyle="caption.default" color="text.secondary">
            Граница мониторинга
          </Text>
          <Text textStyle="mono.body">{expiryBoundary}</Text>
        </Stack>
        <Button variant="link">Своя граница</Button>
      </Flex>
      <ListCard p="0" overflow="hidden">
        <Text
          as="li"
          display={{ base: 'none', sm: 'block' }}
          px="4"
          py="3"
          textStyle="caption.default"
          color="text.secondary"
        >
          {expirySummary}
        </Text>
        <Flex
          as="li"
          aria-hidden="true"
          display={{ base: 'none', sm: 'flex' }}
          justify="space-between"
          px="4"
          py="calc({spacing.2} - 0.5px)"
          bg="bg.canvas"
          borderBottomWidth="1px"
          borderColor="border.default"
          textStyle="caption.strong"
          color="text.secondary"
        >
          <span>Продукт и партия</span>
          <span>Осталось по сроку</span>
        </Flex>
        {expiry.map((row, index) => (
          <Flex
            as="li"
            key={row.batch}
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'center' }}
            justify="space-between"
            gap={{ base: '1', sm: '4' }}
            px="4"
            py="3"
            borderTopWidth={index === 0 ? '0' : '1px'}
            borderColor="border.default"
          >
            <Stack gap="0.5" minW="0">
              <Text textStyle="body.strong">{row.product}</Text>
              <Text textStyle="caption.default" color="text.secondary">
                {row.batch}
              </Text>
            </Stack>
            <Flex
              direction={{ base: 'row', sm: 'column' }}
              align={{ base: 'center', sm: 'flex-end' }}
              gap={{ base: '2', sm: '1' }}
              flexShrink="0"
            >
              <Badge tone="expiry">{row.left}</Badge>
              <Text textStyle="caption.default" color="text.secondary">
                {row.until}
              </Text>
            </Flex>
          </Flex>
        ))}
      </ListCard>
    </WarehouseLayout>
  );
}
