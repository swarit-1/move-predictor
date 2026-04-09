import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { Avatar } from "./Avatar";

interface AppHeaderProps {
  currentPhase: string;
  onNavigate: (target: "welcome" | "history" | "auth") => void;
}

export function AppHeader({ currentPhase, onNavigate }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-walnut-900/85 border-b border-edge">
      <div className="ed-shell flex items-center justify-between h-16">
        {/* Brand */}
        <button
          onClick={() => onNavigate("welcome")}
          className="flex items-baseline gap-2 group"
        >
          <span className="font-serif text-[22px] tracking-tightest text-paper">
            Move<span className="text-gradient">Predictor</span>
          </span>
          <span className="hidden sm:inline text-[10px] tracking-eyebrow uppercase text-walnut-300">
            Human-Aware Chess
          </span>
        </button>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <NavLink
            label="Play"
            active={currentPhase === "welcome" || currentPhase === "setup" || currentPhase === "playing"}
            onClick={() => onNavigate("welcome")}
          />
          {user && (
            <NavLink
              label="My Games"
              active={currentPhase === "history"}
              onClick={() => onNavigate("history")}
            />
          )}
        </nav>

        {/* User menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-walnut-700 transition-colors"
              >
                <Avatar name={user.username} size={28} />
                <span className="text-[13px] text-paper hidden sm:inline">{user.username}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-edge bg-walnut-800 shadow-liftLg overflow-hidden">
                  <div className="px-4 py-3 border-b border-edge">
                    <div className="text-[11px] tracking-eyebrow uppercase text-walnut-300">Signed in</div>
                    <div className="text-[13px] text-paper truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate("history");
                    }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-paper hover:bg-walnut-700"
                  >
                    My Games
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                      onNavigate("welcome");
                    }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-danger hover:bg-walnut-700"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => onNavigate("auth")}
              className="text-[12px] tracking-[0.12em] uppercase text-paper border border-edge hover:border-edgeStrong px-4 h-9 rounded-md transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 h-9 text-[12px] tracking-[0.12em] uppercase transition-colors ${
        active ? "text-paper" : "text-walnut-300 hover:text-paper"
      }`}
    >
      {label}
      {active && (
        <span className="absolute left-4 right-4 -bottom-[1px] h-px bg-gold" />
      )}
    </button>
  );
}
