import { useNavigate } from 'react-router';
import { NoRestaurants } from './access-states';

// Figma W13 inside the shell without a restaurant.
export function NoRestaurantsPage() {
  const navigate = useNavigate();
  return (
    <NoRestaurants
      onRefresh={() => {
        void navigate('/app');
      }}
    />
  );
}
