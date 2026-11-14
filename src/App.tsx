import React from 'react';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { SuperAdminOverview } from './components/superadmin/SuperAdminOverview';
import { RegisteredGaragesPage } from './components/superadmin/RegisteredGaragesPage';
import { PlatformUsersPage } from './components/superadmin/PlatformUsersPage';
import { SubscriptionPlansPage } from './components/superadmin/SubscriptionPlansPage';
import { SystemSettingsPage } from './components/superadmin/SystemSettingsPage';
import { GarageDashboard } from './components/garage/GarageDashboard';
import { ImportExcelPage } from './components/garage/ImportExcelPage';
import { JobCardsPage } from './components/garage/JobCardsPage';
import { DeliveredVehiclesPage } from './components/garage/DeliveredVehiclesPage';
import { WhatsAppMessagesPage } from './components/garage/WhatsAppMessagesPage';
import { MessageTemplatesPage } from './components/garage/MessageTemplatesPage';
import { ReviewSocialLinksPage } from './components/garage/ReviewSocialLinksPage';
import { ReportsPage } from './components/garage/ReportsPage';
import { GarageSettingsPage } from './components/garage/GarageSettingsPage';
import { UserProfilePage } from './components/common/UserProfilePage';

function WorkspaceRouter() {
  const { session, activeTenant, superAdminPage, garagePage } = useAppState();

  if (!session) {
    return <LoginScreen />;
  }

  if (session.role === 'super_admin') {
    return (
      <AppShell>
        {superAdminPage === 'overview' && <SuperAdminOverview />}
        {superAdminPage === 'registered-garages' && <RegisteredGaragesPage />}
        {superAdminPage === 'users' && <PlatformUsersPage />}
        {superAdminPage === 'subscription-plans' && <SubscriptionPlansPage />}
        {superAdminPage === 'system-settings' && <SystemSettingsPage />}
        {superAdminPage === 'profile' && <UserProfilePage />}
      </AppShell>
    );
  }

  if (!activeTenant) {
    return <LoginScreen />;
  }

  return (
    <AppShell>
      {garagePage === 'dashboard' && <GarageDashboard />}
      {garagePage === 'import-excel' && <ImportExcelPage />}
      {garagePage === 'job-cards' && <JobCardsPage />}
      {garagePage === 'delivered-vehicles' && <DeliveredVehiclesPage />}
      {garagePage === 'whatsapp-messages' && <WhatsAppMessagesPage />}
      {garagePage === 'message-templates' && <MessageTemplatesPage />}
      {garagePage === 'review-social-links' && <ReviewSocialLinksPage />}
      {garagePage === 'reports' && <ReportsPage />}
      {garagePage === 'garage-settings' && <GarageSettingsPage />}
      {garagePage === 'profile' && <UserProfilePage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <WorkspaceRouter />
    </AppStateProvider>
  );
}
