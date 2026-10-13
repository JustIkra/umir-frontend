import { Text, chakra } from '@chakra-ui/react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router';
import {
  type Member,
  type Organization,
} from '@/presentation/placeholder-organizations';
import { Button } from '@/presentation/ui/actions';
import { ModalPanel } from '@/presentation/ui/dialog';
import { organizationPath } from './format';

// Figma RV01. «Отмена» comes first and gets the initial focus; «Отозвать
// доступ» returns to the members list without changing anything.
export function RevokeAccessDialog({
  dialogRef,
  organization,
  member,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  organization: Organization;
  member: Member;
}) {
  const navigate = useNavigate();
  const lines = organization.restaurants.flatMap((restaurant) => {
    const roles = member.roles[restaurant.name];
    return roles?.length ? [`${restaurant.name} — ${roles.join(', ')}`] : [];
  });
  return (
    <ModalPanel
      dialogRef={dialogRef}
      width={520}
      title={`Отозвать доступ ${member.genitive}?`}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Отмена
          </Button>
          <Button
            onClick={() =>
              void navigate(`${organizationPath(organization)}/members`)
            }
          >
            Отозвать доступ
          </Button>
        </>
      }
    >
      <Text textStyle="body.default">
        {`${member.name} потеряет доступ к организации «${organization.name}» и ко всем назначениям:`}
      </Text>
      {/* A real list for screen readers; Figma draws inline bullets. */}
      <chakra.ul listStyleType="none" textStyle="body.default">
        {lines.map((line) => (
          <chakra.li key={line} _before={{ content: '"• "' }}>
            {line}
          </chakra.li>
        ))}
      </chakra.ul>
      <Text textStyle="caption.default" color="text.secondary">
        Учётная запись сохранится. Незавершённые действия участника в
        организации будут прерваны.
      </Text>
    </ModalPanel>
  );
}
