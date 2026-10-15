import { Stack } from '@chakra-ui/react';
import { useParams } from 'react-router';
import { FeedbackForm } from '@/presentation/feedback/feedback-form';
import { useServices } from '@/presentation/services';
import { useSession } from '@/presentation/session/hooks';
import { PageHeader } from './pages';

// The landing contact form inside the restaurant scope (the gateway needs the
// session of the restaurant for it). The name and email come from the session.
export function FeedbackPage() {
  const { restaurantID = '' } = useParams();
  const { restaurantFeedback } = useServices();
  const session = useSession();
  const user = session.status === 'active' ? session.user : undefined;
  return (
    <Stack gap="6" maxW="40rem">
      <PageHeader
        title="Обратная связь"
        description="Расскажите о проблеме или предложите улучшение. Мы ответим на указанный email."
      />
      <FeedbackForm
        key={`${restaurantID}/${user?.userID ?? ''}`}
        submitter={restaurantFeedback(restaurantID)}
        initial={{ name: user?.displayName ?? '', email: user?.email ?? '' }}
      />
    </Stack>
  );
}
