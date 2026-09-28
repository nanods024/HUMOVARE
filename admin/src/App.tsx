import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/routes';
import { queryClient } from '@/lib/queryClient';
import { useAdminAuthBootstrap } from '@/hooks/useAdminAuth';
import { ReauthDialog } from '@/components/common/ReauthDialog';
import { AccessGate } from '@/components/common/AccessGate';

function SessionGate({ children }: { children: React.ReactNode }) {
  // Restores the admin session from the refresh cookie before routes render.
  useAdminAuthBootstrap();
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Blocked networks see a countdown instead of the admin panel. */}
      <AccessGate>
        <SessionGate>
          <RouterProvider router={router} />
          {/* "Confirm it's you" for sensitive actions, opened by the API client. */}
          <ReauthDialog />
        </SessionGate>
      </AccessGate>
    </QueryClientProvider>
  );
}

export default App;
