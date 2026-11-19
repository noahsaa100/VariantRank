import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ButtonLink } from './Button';
import styles from './DashboardLayout.module.css';

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
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand}>VariantRank</Link>
        <p className={styles.subtitle}>Decision Support</p>
        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className={styles.sidebarNote}>Evidence-led ecommerce evaluation.</p>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.topbarEyebrow}>Workspace</p>
            <h1 className={styles.topbarTitle}>{getPageTitle(location.pathname)}</h1>
          </div>
          <ButtonLink to="/">Run Evaluation</ButtonLink>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
