import { useEffect, useRef } from "react";
import "./BottomNav.css";

const NAV_ITEMS = [
  {
    id: "chats",
    label: "Chats",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    activeIcon: (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "status",
    label: "Status",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    activeIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "calls",
    label: "Calls",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    activeIcon: (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1-.22 1.12.46 2.33.68 3.6.68.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.07 21 3 13.93 3 5c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57-.11.32-.04.7.22.96l-2.69 1.27z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.49.74.83 1.3.83H21a2 2 0 1 1 0 4h-.09c-.56 0-1.1.34-1.51.83z" />
      </svg>
    ),
    activeIcon: (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-2 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.07 2.08a1 1 0 0 1 .93-.08l.58.2a1 1 0 0 1 .65.94V4a8.07 8.07 0 0 1 1.17.48l.66-.66a1 1 0 0 1 1.14-.21l.57.28a1 1 0 0 1 .43 1.36l-.4.7a8.1 8.1 0 0 1 .83.83l.7-.4a1 1 0 0 1 1.36.43l.28.57a1 1 0 0 1-.21 1.14l-.66.66c.18.38.34.77.48 1.17h.78a1 1 0 0 1 .94.65l.2.58a1 1 0 0 1-.08.93l-.45.64A8 8 0 0 1 20 12v.07l.45.64a1 1 0 0 1 .08.93l-.2.58a1 1 0 0 1-.94.65H18.6a8.1 8.1 0 0 1-.48 1.17l.66.66a1 1 0 0 1 .21 1.14l-.28.57a1 1 0 0 1-1.36.43l-.7-.4a8.07 8.07 0 0 1-.83.83l.4.7a1 1 0 0 1-.43 1.36l-.57.28a1 1 0 0 1-1.14-.21l-.66-.66A8.07 8.07 0 0 1 13 20.6v.78a1 1 0 0 1-.65.94l-.58.2a1 1 0 0 1-.93-.08l-.64-.45A8 8 0 0 1 12 22h-.07l-.64.45a1 1 0 0 1-.93.08l-.58-.2A1 1 0 0 1 9.13 21.38V20.6a8.07 8.07 0 0 1-1.17-.48l-.66.66a1 1 0 0 1-1.14.21l-.57-.28a1 1 0 0 1-.43-1.36l.4-.7a8.1 8.1 0 0 1-.83-.83l-.7.4a1 1 0 0 1-1.36-.43l-.28-.57a1 1 0 0 1 .21-1.14l.66-.66A8.07 8.07 0 0 1 3.4 13.4H2.62a1 1 0 0 1-.94-.65l-.2-.58a1 1 0 0 1 .08-.93l.45-.64A8 8 0 0 1 2 12v-.07l-.45-.64a1 1 0 0 1-.08-.93l.2-.58A1 1 0 0 1 2.62 9.13H3.4a8.07 8.07 0 0 1 .48-1.17l-.66-.66a1 1 0 0 1-.21-1.14l.28-.57a1 1 0 0 1 1.36-.43l.7.4a8.1 8.1 0 0 1 .83-.83l-.4-.7a1 1 0 0 1 .43-1.36l.57-.28a1 1 0 0 1 1.14.21l.66.66A8.07 8.07 0 0 1 9.13 3.4V2.62a1 1 0 0 1 .65-.94l.58-.2a1 1 0 0 1 .93.08l.64.45A8 8 0 0 1 12 2h.07l.64-.45a1 1 0 0 1 .93-.08z" />
      </svg>
    ),
  },
];

export default function BottomNav({ activeTab, onChange, unreadCount = 0, statusCount = 0, callCount = 0 }) {
  const indicatorRef = useRef(null);
  const navRef = useRef(null);

  // Animate the active indicator bar
  useEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;

    const activeBtn = nav.querySelector(".bottom-nav-item.active");
    if (!activeBtn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const left = btnRect.left - navRect.left + btnRect.width / 2;

    indicator.style.transform = `translateX(${left}px) translateX(-50%)`;
  }, [activeTab]);

  const getBadge = (id) => {
    if (activeTab === id) return null; // already on this page — badge cleared
    if (id === "chats" && unreadCount > 0) return unreadCount > 99 ? "99+" : unreadCount;
    if (id === "status" && statusCount > 0) return statusCount > 9 ? "9+" : statusCount;
    if (id === "calls" && callCount > 0) return callCount > 9 ? "9+" : callCount;
    return null;
  };

  return (
    <nav className="bottom-nav" ref={navRef} aria-label="Main navigation">
      {/* Sliding active indicator */}
      <span className="bottom-nav-indicator" ref={indicatorRef} aria-hidden="true" />

      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.id;
        const badge = getBadge(item.id);

        return (
          <button
            key={item.id}
            type="button"
            id={`nav-tab-${item.id}`}
            className={`bottom-nav-item${isActive ? " active" : ""}`}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="bottom-nav-icon-wrap">
              <span className="bottom-nav-icon">
                {isActive ? item.activeIcon : item.icon}
              </span>
              {badge && (
                <span className="bottom-nav-badge" aria-label={`${badge} new`}>
                  {badge}
                </span>
              )}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
