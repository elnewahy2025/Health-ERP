import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthorizationContext } from '../stores/authStore';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

export function renderWithProviders(ui: React.ReactElement, options: CustomRenderOptions = {}) {
  const { initialEntries = ['/'], ...renderOptions } = options;
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthorizationContext.Provider value={{
          user: null,
          tenant: null,
          memberships: [],
          activeMembership: null,
          isAuthenticated: true,
          isLoading: false,
          login: async () => ({}),
          register: async () => undefined,
          logout: () => undefined,
          setLocale: () => undefined,
          refreshUser: async () => undefined,
          switchMembership: async () => undefined,
          can: () => true,
          canAny: () => true,
        }}>
          <MemoryRouter initialEntries={initialEntries}>
            {children}
          </MemoryRouter>
        </AuthorizationContext.Provider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}
