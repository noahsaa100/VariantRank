import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { NewEvaluation } from './pages/NewEvaluation';
import { Results } from './pages/Results';
import { VariantDetail } from './pages/VariantDetail';
import { History } from './pages/History';
import { Compare } from './pages/Compare';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<NewEvaluation />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="/results/:id/variant/:variantId" element={<VariantDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
