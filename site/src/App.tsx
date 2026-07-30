import { Navigate, Route, Routes } from 'react-router-dom';
import { defaultSlug } from './content';
import AppShell from './components/AppShell';
import DocPage from './components/DocPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        {/* Routes are data-driven: any slug in the manifest resolves in DocPage,
            so a new README needs no code change here. */}
        <Route path="/" element={<Navigate to={`/${defaultSlug}`} replace />} />
        <Route path="/:slug" element={<DocPage />} />
        <Route path="*" element={<Navigate to={`/${defaultSlug}`} replace />} />
      </Routes>
    </AppShell>
  );
}
