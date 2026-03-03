import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { NewEvaluation } from './pages/NewEvaluation';
import { Results } from './pages/Results';
import { VariantDetail } from './pages/VariantDetail';
import { History } from './pages/History';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <Link to="/" className="app-header__brand">VariantRank</Link>
        <nav className="app-header__nav">
          <Link to="/">New</Link>
          <Link to="/history">History</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<NewEvaluation />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="/results/:id/variant/:variantId" element={<VariantDetail />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
