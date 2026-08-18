import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthorizationContext, canAnyUse, canUse, type PermissionScope, type UserGrant } from '../stores/authStore';
import { Can } from '../components/auth/Authorization';
import { routePermissions } from '../router';
import { hospitalRoleTemplate } from '@healthcare/shared/authz';

function renderGate(
  permissions: string[],
  grants: UserGrant[],
  permission: string,
  scope?: PermissionScope,
) {
  return render(
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
      can: (required, requestedScope) => canUse(permissions, required, grants, requestedScope),
      canAny: (required, requestedScope) => canAnyUse(permissions, required, grants, requestedScope),
    }}>
      <Can permission={permission} scope={scope}>
        <span>visible</span>
      </Can>
    </AuthorizationContext.Provider>,
  );
}

describe('scope-aware frontend action gates', () => {
  it('shows pharmacy creation for a branch-scoped grant', () => {
    renderGate(
      ['pharmacy.create'],
      [{ permission: 'pharmacy.create', scope: 'branch' }],
      'pharmacy.create',
      'branch',
    );
    expect(screen.getByText('visible')).toBeInTheDocument();
  });

  it('hides a pharmacy branch action when the grant is narrower than branch scope', () => {
    renderGate(
      ['pharmacy.create'],
      [{ permission: 'pharmacy.create', scope: 'assigned_patients' }],
      'pharmacy.create',
      'branch',
    );
    expect(screen.queryByText('visible')).not.toBeInTheDocument();
  });

  it('separates pharmacy technician creation from pharmacist approval', () => {
    const { rerender } = render(
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
        can: (required, requestedScope) => canUse(
          ['pharmacy.view', 'pharmacy.create'],
          required,
          [
            { permission: 'pharmacy.view', scope: 'branch' },
            { permission: 'pharmacy.create', scope: 'branch' },
          ],
          requestedScope,
        ),
        canAny: () => false,
      }}>
        <Can permission="pharmacy.create" scope="branch"><span>create</span></Can>
        <Can permission="pharmacy.approve" scope="branch"><span>approve</span></Can>
      </AuthorizationContext.Provider>,
    );
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.queryByText('approve')).not.toBeInTheDocument();

    rerender(<span>reset</span>);
  });

  it('allows department nursing creation while keeping edit independently gated', () => {
    render(
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
        can: (required, requestedScope) => canUse(
          ['nursing.view', 'nursing.create'],
          required,
          [
            { permission: 'nursing.view', scope: 'department' },
            { permission: 'nursing.create', scope: 'department' },
          ],
          requestedScope,
        ),
        canAny: () => false,
      }}>
        <Can permission="nursing.create" scope="assigned_patients"><span>create</span></Can>
        <Can permission="nursing.edit" scope="assigned_patients"><span>edit</span></Can>
      </AuthorizationContext.Provider>,
    );
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
  });
});

describe('role-to-page protection boundaries', () => {
  it('protects previously unmapped operational pages', () => {
    expect(routePermissions['/departments']).toBe('departments.view');
    expect(routePermissions['/pharmacy-advanced']).toBe('pharmacy.view');
    expect(routePermissions['/insurance-claims-lifecycle']).toBe('insurance_claims.view');
    expect(routePermissions['/notification-logs']).toBe('notifications.manage');
  });

  it('keeps patient portal users out of staff portal administration', () => {
    const patient = hospitalRoleTemplate('patient_portal_user');
    const portalAdmin = hospitalRoleTemplate('patient_portal_administrator');
    expect(patient?.grants['patient_portal.view']).toBeUndefined();
    expect(patient?.grants['patient_self_service.view']).toBeDefined();
    expect(portalAdmin?.grants['patient_portal.*']).toBeDefined();
  });
});
