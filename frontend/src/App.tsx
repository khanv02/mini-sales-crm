import { Route, Routes } from 'react-router-dom';
import { Layout } from './app/layout';
import { HomePage } from './pages/home-page';
import { LoginPage } from './pages/login-page';
import { NotFoundPage } from './pages/not-found-page';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
