import { useState, useEffect } from "react";
import { UserCog } from "lucide-react";
import "./nav.css";

interface AppHeaderProps {
  /** Whether admin mode is currently active (tints the profile icon gold). */
  adminMode: boolean;
  /** Personalized greeting for the signed-in member (null hides it). */
  greeting?: string | null;
  /** Tapping the logo scrolls the active tab back to the top. */
  onLogoClick: () => void;
  /** Tapping the profile icon toggles / unlocks admin mode. */
  onProfileClick: () => void;
}

/**
 * Slim top app bar: the Saturday School "S" logo on the left and a
 * user/admin profile icon on the right. The old text title and the
 * secondary row of nav links have been removed in favour of the
 * floating bottom tab bar.
 */
export function AppHeader({ adminMode, greeting, onLogoClick, onProfileClick }: AppHeaderProps) {
  // The greeting is a welcome moment, not a fixture — fade it out after 20s.
  // Restarts if the greeting text changes (e.g. a new identity is picked).
  const [greetingVisible, setGreetingVisible] = useState(true);
  useEffect(() => {
    if (!greeting) return;
    setGreetingVisible(true);
    const t = setTimeout(() => setGreetingVisible(false), 7000);
    return () => clearTimeout(t);
  }, [greeting]);

  return (
    <header className="app-header app-bar" onClick={onLogoClick}>
      <button
        type="button"
        className="app-bar__logo"
        aria-label="Saturday School — scroll to top"
      >
        <img src="/logo.svg" alt="Saturday School" className="app-bar__logo-img" />
      </button>

      {greeting && (
        <div className={`app-bar__greeting${greetingVisible ? "" : " is-hidden"}`}>{greeting}</div>
      )}

      <button
        type="button"
        className={`app-bar__profile${adminMode ? " is-admin" : ""}`}
        onClick={e => { e.stopPropagation(); onProfileClick(); }}
        aria-label={adminMode ? "Exit admin mode" : "Admin profile"}
        title={adminMode ? "Exit Admin" : "Admin"}
      >
        <UserCog strokeWidth={2} size={22} />
      </button>
    </header>
  );
}
