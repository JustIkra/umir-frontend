import { Flex, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { Navigate, useLoaderData, useNavigate } from 'react-router';
import { failureOf } from '@/application/api';
import { orgKeys, type Outcome } from '@/application/organization-commands';
import type { OrganizationProfile } from '@/application/organizations';
import { useServices } from '@/presentation/services';
import { useAttempts, useReadModel } from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Card, CardForm } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { ServiceUnavailableAlert } from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import { DeleteOrganizationDialog } from './delete-organization-dialog';
import { DeletionNotice } from './deletion-notice';
import { zoneLine, organizationPath } from './format';
import { type OrganizationRoute } from './loaders';
import {
  OrganizationHeader,
  OrganizationLayout,
  OrganizationState,
  OrganizationTabs,
} from './organization-layout';
import { useRefreshOnOpen } from './refresh';
import { TimezoneField, zoneUnsupported } from './timezone-field';
import { useOrganizationDeletion } from './use-deletion';

// The zone section of the profile: TZ06 to TZ13.
export type ZoneState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'changed' } // TZ06
  | { readonly kind: 'saving' } // TZ07
  | { readonly kind: 'saved'; readonly timeZone: string } // TZ08
  | { readonly kind: 'unsupported'; readonly timeZone: string } // TZ09
  | { readonly kind: 'forbidden' } // TZ10
  | { readonly kind: 'unavailable' } // TZ11
  // TZ12: the zone of the profile read again; undefined until it is read.
  | { readonly kind: 'conflict'; readonly timeZone: string | undefined }
  | { readonly kind: 'unknown' }; // TZ13

export interface ZoneMessage {
  readonly title?: string;
  readonly text: string;
  readonly tone: 'success' | 'error' | 'info';
}

const notSaved = 'Часовой пояс не сохранён';

// What the frames TZ06–TZ13 say. The idle state has no message.
export function zoneMessage(
  state: ZoneState,
  nowMs: number,
): ZoneMessage | undefined {
  switch (state.kind) {
    case 'idle':
      return undefined;
    case 'changed':
      return {
        text: 'Изменится отображение дат и границы новых календарных периодов. Уже сохранённые сроки партий не изменятся.',
        tone: 'info',
      };
    case 'saving':
      return { text: 'Сохраняем…', tone: 'info' };
    case 'saved':
      return {
        title: 'Часовой пояс сохранён',
        text: `Даты во всех ресторанах организации отображаются в зоне ${zoneLine(state.timeZone, nowMs)}.`,
        tone: 'success',
      };
    case 'unsupported':
      return { text: zoneUnsupported(state.timeZone), tone: 'error' };
    case 'forbidden':
      return {
        title: notSaved,
        text: 'Роль администратора организации снята. Изменять часовой пояс может администратор организации.',
        tone: 'error',
      };
    case 'unavailable':
      return {
        title: notSaved,
        text: 'Сервис авторизации не отвечает. Выбор сохранён в поле, повторите сохранение через несколько минут.',
        tone: 'error',
      };
    case 'conflict':
      return {
        title: 'Часовой пояс уже изменён',
        text: `Другой администратор сохранил ${
          state.timeZone === undefined
            ? 'новую зону'
            : `зону «${zoneLine(state.timeZone, nowMs)}»`
        }. Проверьте выбор и сохраните повторно, если нужно.`,
        tone: 'error',
      };
    case 'unknown':
      return {
        title: 'Результат сохранения неизвестен',
        text: 'Ответ сервиса не получен. Часовой пояс мог измениться. Проверка продолжит ту же попытку.',
        tone: 'info',
      };
  }
}

// The state after the answer of Auth to «Сохранить часовой пояс». A refusal
// without a frame of its own means the zone was not saved and Auth did not
// answer in time.
export function zoneOutcomeState(
  outcome: Outcome<OrganizationProfile>,
  timeZone: string,
): ZoneState {
  switch (outcome.kind) {
    case 'done':
      return { kind: 'saved', timeZone: outcome.value.settings.timeZone };
    case 'invalid':
      return outcome.code === 'UnknownTimeZone'
        ? { kind: 'unsupported', timeZone }
        : { kind: 'unavailable' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'conflict':
      // Auth sends no current settings: the profile is read again.
      return { kind: 'conflict', timeZone: undefined };
    case 'unknown':
      return { kind: 'unknown' };
    case 'ended':
      return { kind: 'idle' };
    case 'unavailable':
    case 'limited':
    case 'last-admin':
    case 'invited':
    case 'closed':
    case 'gone':
    case 'delivery':
      return { kind: 'unavailable' };
  }
}

// The section «Удаление организации». The dialog asks for the name; a deletion
// whose answer was lost is checked here, with the name of the profile.
function DeletionSection({ profile }: { profile: OrganizationProfile }) {
  const { commands } = useServices().organizations;
  const { orgID, name } = profile;
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  useAttempts();
  // The list of organizations says that the organization is being deleted.
  const leave = () => {
    void navigate('/app/organizations');
  };
  const { stored, run } = useOrganizationDeletion(orgID, name, leave);
  const unsettled = commands.isUnsettled(orgKeys.deleteOrganization(orgID));
  const state =
    stored.kind === 'deleting' || stored.kind === 'done'
      ? stored
      : unsettled
        ? ({ kind: 'unknown' } as const)
        : stored;
  return (
    <Card as="section" aria-labelledby="organization-deletion-title">
      <chakra.h2 id="organization-deletion-title" textStyle="heading.h3">
        Удаление организации
      </chakra.h2>
      <Text textStyle="body.default" color="text.secondary">
        Удаление закрывает доступ всем участникам ко всем ресторанам
        организации. Учётные записи сохранятся. Отменить удаление нельзя.
      </Text>
      <DeletionNotice
        subject="organization"
        name={name}
        state={state}
        onCheck={() => {
          void run();
        }}
      />
      <Button
        variant="danger"
        alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        aria-haspopup="dialog"
        disabled={state.kind === 'deleting' || unsettled}
        onClick={() => dialog.current?.showModal()}
      >
        Удалить организацию
      </Button>
      <DeleteOrganizationDialog
        dialogRef={dialog}
        orgID={orgID}
        name={name}
        onDeleted={leave}
      />
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <Stack aria-hidden="true" gap={{ base: '4', sm: '6' }}>
      <Skeleton h={rem(96)} borderRadius="md" />
      <Skeleton h={rem(160)} borderRadius="md" />
    </Stack>
  );
}

function ProfileSections({ profile }: { profile: OrganizationProfile }) {
  const { organizations, now } = useServices();
  const { commands } = organizations;
  const { orgID } = profile;
  const key = orgKeys.setTimeZone(orgID);
  const profileZone = profile.settings.timeZone;
  // The zone chosen in the field; undefined while the field shows the profile.
  const [chosen, setChosen] = useState<string>();
  const [stored, setStored] = useState<ZoneState>({ kind: 'idle' });
  // The version a conflict found stale: a different one is the profile read
  // again, and its zone is the one the other administrator saved.
  const [staleVersion, setStaleVersion] = useState<string>();
  const zone = chosen ?? profileZone;
  const differs = zone !== profileZone;

  const state: ZoneState =
    stored.kind === 'saving'
      ? stored
      : commands.isUnsettled(key)
        ? { kind: 'unknown' }
        : stored.kind === 'idle' && differs
          ? { kind: 'changed' }
          : stored.kind === 'conflict'
            ? {
                kind: 'conflict',
                timeZone:
                  staleVersion !== undefined &&
                  profile.settings.settingsVersion !== staleVersion
                    ? profileZone
                    : undefined,
              }
            : stored;
  const message = zoneMessage(state, now());
  const locked = state.kind === 'saving' || state.kind === 'unknown';

  const save = async () => {
    const version = profile.settings.settingsVersion;
    setStored({ kind: 'saving' });
    const outcome = await commands.setTimeZone(orgID, zone, version);
    if (outcome.kind === 'conflict') setStaleVersion(version);
    setStored(zoneOutcomeState(outcome, zone));
  };
  const cancel = () => {
    setChosen(undefined);
    setStored({ kind: 'idle' });
  };
  const canSave =
    differs &&
    state.kind !== 'saved' &&
    state.kind !== 'saving' &&
    state.kind !== 'unknown';

  return (
    <>
      <Card>
        <ReadOnlyValue
          label="Название организации"
          value={profile.name}
          note="Название задаётся при создании организации."
        />
      </Card>
      <CardForm
        noValidate
        aria-labelledby="organization-zone-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void save();
        }}
      >
        <chakra.h2 id="organization-zone-title" textStyle="heading.h3">
          Часовой пояс
        </chakra.h2>
        <TimezoneField
          id="organization-zone"
          hint="Действует для всех ресторанов организации."
          value={zone}
          disabled={locked}
          error={
            state.kind === 'unsupported' && message ? message.text : undefined
          }
          onChange={(next) => {
            setChosen(next);
            setStored({ kind: 'idle' });
          }}
        />
        {message && state.kind === 'unknown' && (
          <FormMessage
            tone="unknown"
            title={message.title ?? ''}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void save();
                }}
              >
                Проверить сохранение
              </Button>
            }
          >
            {message.text}
          </FormMessage>
        )}
        {message && (state.kind === 'changed' || state.kind === 'saving') && (
          <Text role="status" textStyle="body.default" color="text.secondary">
            {message.text}
          </Text>
        )}
        {message?.title !== undefined && state.kind !== 'unknown' && (
          <FormMessage tone={message.tone} title={message.title}>
            {message.text}
          </FormMessage>
        )}
        {(canSave || state.kind === 'saving') && (
          <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
            <Button
              type="submit"
              disabled={state.kind === 'saving'}
              aria-busy={state.kind === 'saving' ? true : undefined}
            >
              Сохранить часовой пояс
            </Button>
            <Button
              variant="secondary"
              disabled={state.kind === 'saving'}
              onClick={cancel}
            >
              Отменить
            </Button>
          </Flex>
        )}
      </CardForm>
      <DeletionSection profile={profile} />
    </>
  );
}

// The profile is read by the administrator only. A lost read is not an empty
// profile; a removed role (Forbidden) leaves the page for the organization.
function ProfileBody({ orgID }: { orgID: string }) {
  const { organizations } = useServices();
  const model = organizations.reads.profile(orgID);
  const snapshot = useReadModel(model);
  useRefreshOnOpen(model);
  const failure = snapshot.failed ? failureOf(snapshot.failure) : undefined;
  if (failure?.status === 403 || failure?.code === 'Forbidden') {
    return <Navigate to={organizationPath(orgID)} replace />;
  }
  if (snapshot.value !== undefined) {
    return <ProfileSections profile={snapshot.value} />;
  }
  if (snapshot.failed) {
    return (
      <ServiceUnavailableAlert
        title="Профиль организации не получен"
        onRetry={() => {
          model.refresh();
        }}
      >
        Сервис авторизации не отвечает.
      </ServiceUnavailableAlert>
    );
  }
  return <ProfileSkeleton />;
}

// Figma TZ01: the name is read-only, the zone opens the TZ02 list; the new
// zone is saved to Auth under the settingsVersion that was read.
export function OrganizationProfilePage() {
  const { orgID } = useLoaderData<OrganizationRoute>();
  return (
    <OrganizationState orgID={orgID}>
      {(organization) => (
        <OrganizationLayout
          header={
            <OrganizationHeader
              organization={organization}
              section="Профиль организации"
            />
          }
        >
          <OrganizationTabs orgID={orgID} />
          <ProfileBody orgID={orgID} />
        </OrganizationLayout>
      )}
    </OrganizationState>
  );
}
