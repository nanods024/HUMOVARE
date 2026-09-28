import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/routes';
import { queryClient } from '@/lib/queryClient';
import { useAuthBootstrap } from '@/hooks/useAuth';
import { RouteFallback } from '@/components/common/RouteFallback';

function SessionGate({ children }: { children: React.ReactNode }) {
  // Restores the session from the refresh cookie before routes render.
  useAuthBootstrap();
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate>
        <Suspense fallback={<RouteFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </SessionGate>
    </QueryClientProvider>
  );
}

export default App;
