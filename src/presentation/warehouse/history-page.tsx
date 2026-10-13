import { Flex, Grid, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import {
  history,
  historyRange,
  historyStamp,
  type EventKind,
} from '@/presentation/placeholder-warehouse';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { Icon } from '@/presentation/ui/icon';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { rem } from '@/presentation/ui/units';
import { WarehouseLayout } from './warehouse-layout';

const kinds: Record<
  EventKind,
  { label: string; icon: string; tone: 'neutral' | 'success' }
> = {
  sale: { label: 'Продажа', icon: ordersIcon, tone: 'neutral' },
  receipt: { label: 'Поступление', icon: warehouseIcon, tone: 'success' },
  writeoff: { label: 'Списание просрочки', icon: clockIcon, tone: 'neutral' },
};

type Filter = 'all' | EventKind;

// Figma H1 «История». The filter shows events of one kind from the sample;
// «Показать ранние» does nothing yet. On 390 the time moves up beside the
// badge and the date goes under the text.
export function HistoryPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const shown =
    filter === 'all'
      ? history
      : history.filter((event) => event.kind === filter);
  return (
    <WarehouseLayout section="История" stamp={historyStamp}>
      <SegmentChoice
        label="Тип событий"
        options={[
          { value: 'all', title: 'Все' },
          { value: 'receipt', title: 'Поступления' },
          { value: 'sale', title: 'Продажи' },
          { value: 'writeoff', title: 'Списания' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ListCard p="0">
        <Flex
          as="li"
          wrap="wrap"
          align="center"
          justify="space-between"
          columnGap="4"
          rowGap="1"
          px="4"
          pt={{ base: '3', sm: '4' }}
          pb={{ base: '1', sm: '2' }}
        >
          <Text textStyle="caption.default" color="text.secondary">
            {historyRange}
          </Text>
          <Button variant="link">Показать ранние</Button>
        </Flex>
        {shown.map((event, index) => {
          const kind = kinds[event.kind];
          const time = event.at.split(', ')[1];
          return (
            <Grid
              as="li"
              key={event.id}
              gridTemplateAreas={{
                base: "'id icon badge time' 'text text text text' 'at at at at'",
                sm: "'id icon badge text at'",
              }}
              gridTemplateColumns={{
                base: 'auto auto 1fr auto',
                sm: `${rem(56)} ${rem(20)} ${rem(144)} 1fr ${rem(88)}`,
              }}
              alignItems="center"
              columnGap={{ base: '2', sm: '3' }}
              rowGap="1"
              px="4"
              py="3"
              borderTopWidth={index === 0 ? '0' : '1px'}
              borderColor="border.default"
            >
              <Text
                gridArea="id"
                textStyle="mono.default"
                color="text.secondary"
              >
                {event.id}
              </Text>
              <Icon gridArea="icon" src={kind.icon} size={20} />
              <Badge
                gridArea="badge"
                justifySelf="start"
                ms={{ sm: '-2' }}
                tone={kind.tone}
              >
                {kind.label}
              </Badge>
              <chakra.span
                gridArea="time"
                display={{ sm: 'none' }}
                textStyle="mono.default"
                color="text.secondary"
              >
                {time}
              </chakra.span>
              <Text gridArea="text" textStyle="body.default">
                {event.text}
              </Text>
              <Text
                gridArea="at"
                textAlign={{ sm: 'end' }}
                textStyle="caption.default"
                color="text.secondary"
              >
                {event.at}
              </Text>
            </Grid>
          );
        })}
      </ListCard>
    </WarehouseLayout>
  );
}
