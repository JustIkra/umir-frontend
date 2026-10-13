import { useNavigate } from 'react-router';
import { useServices } from '@/presentation/services';
import { NoRestaurants } from './access-states';

// Figma W13 inside the shell without a restaurant. «Обновить список» reads
// access again before /app chooses where to go.
export function NoRestaurantsPage() {
  const navigate = useNavigate();
  const { access } = useServices();
  return (
    <NoRestaurants
      onRefresh={() => {
        void access.refresh().then(() => navigate('/app'));
      }}
    />
  );
}
