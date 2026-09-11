import './BottomNav.css';

export type NavTab = 'home' | 'library' | 'stats' | 'settings';

export interface BottomNavProps {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  /** Path data for a 24x24 stroked icon, to match the rest of the chrome. */
  path: string;
}

/**
 * The destinations, as data. The bar maps over this and never branches on which
 * tab it is drawing (REQ-E2).
 *
 * Articles sit second because they are the largest body of reading in the app —
 * 284 of them against one generated round at a time — and a link buried on Home
 * did not say so.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', path: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9' },
  {
    id: 'library',
    label: 'Articles',
    path: 'M4 4.5h16v15H4zM7.5 8.5h9M7.5 12h9M7.5 15.5h5',
  },
  { id: 'stats', label: 'Stats', path: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  {
    id: 'settings',
    label: 'Settings',
    path: 'M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3',
  },
];

/**
 * Bottom navigation across the four destinations.
 *
 * Deliberately absent from reading and drilling. Those are the two screens
 * where the interface is supposed to disappear (§5.1), the reader already owns
 * the bottom edge with its gloss panel, and a tab bar there would invite you to
 * leave mid-sentence. Destinations get a bar; activities get a way back.
 */
export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const current = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={'bottom-nav__tab' + (current ? ' bottom-nav__tab--on' : '')}
            aria-current={current ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={item.path}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {item.id === 'settings' && (
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              )}
            </svg>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
