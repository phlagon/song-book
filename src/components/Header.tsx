import { Moon, Sun } from 'lucide-react';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onNavigateHome: () => void;
}

export function Header({ isDark, onToggleTheme, onNavigateHome }: HeaderProps) {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800 bg-[#FAF8F4] dark:bg-[#111110]">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <a
          href="/"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onNavigateHome();
            }
          }}
          className="font-editorial text-lg sm:text-xl font-semibold tracking-tight text-[#1C1917] dark:text-[#F4F1EA] hover:text-[#7C2D12] dark:hover:text-[#E2A856] transition-colors duration-150 whitespace-nowrap shrink-0"
        >
          Malayalam Christian Hymns
        </a>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={isDark}
          className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 text-[#1C1917] dark:text-[#F4F1EA] bg-white/70 dark:bg-[#1A1918] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-[#E2A856]" aria-hidden="true" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-stone-600" aria-hidden="true" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
