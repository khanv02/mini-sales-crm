import { Route, Routes } from 'react-router-dom';
import { Layout } from './app/layout';
import { RequireAuth } from './features/auth/require-auth';
import { ContactsPage } from './features/contacts/contacts-page';
import { DealsPage } from './features/deals/deals-page';
import { PipelinesPage } from './features/pipelines/pipelines-page';
import { AccountPage } from './pages/account-page';
import { HomePage } from './pages/home-page';
import { LoginPage } from './pages/login-page';
import { NotFoundPage } from './pages/not-found-page';
import { RegisterPage } from './pages/register-page';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="contacts"
          element={
            <RequireAuth>
              <ContactsPage />
            </RequireAuth>
          }
        />
        <Route
          path="pipelines"
          element={
            <RequireAuth>
              <PipelinesPage />
            </RequireAuth>
          }
        />
        <Route
          path="deals"
          element={
            <RequireAuth>
              <DealsPage />
            </RequireAuth>
          }
        />
        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
