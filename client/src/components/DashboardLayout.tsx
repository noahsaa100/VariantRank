import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'New Evaluation' },
  { to: '/history', label: 'History' },
  { to: '/compare', label: 'Compare' },
];

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'New Evaluation';
  if (pathname.startsWith('/results/')) return 'Results';
  if (pathname === '/history') return 'Evaluation History';
  if (pathname === '/compare') return 'Compare Evaluations';
  return 'VariantRank';
}

export function DashboardLayout() {
  const location = useLocation();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link to="/" className="dashboard-sidebar__brand">VariantRank</Link>
        <p className="dashboard-sidebar__subtitle">Decision Support</p>
        <nav className="dashboard-sidebar__nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? 'dashboard-sidebar__link dashboard-sidebar__link--active' : 'dashboard-sidebar__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-topbar__eyebrow">Workspace</p>
            <h1 className="dashboard-topbar__title">{getPageTitle(location.pathname)}</h1>
          </div>
          <Link to="/" className="btn btn--primary">Run Evaluation</Link>
        </header>

        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
