import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Active = "home" | "coaching" | "guide" | null;

interface SiteHeaderProps {
  active?: Active;
  /** Show the "Home" nav link (hidden on the homepage itself). */
  showHome?: boolean;
}

const navLinkClass = (isActive: boolean) =>
  cn(
    "text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2",
    isActive && "text-gray-900 underline underline-offset-8 decoration-2",
  );

export const SiteHeader = ({ active = null, showHome = true }: SiteHeaderProps) => (
  <header className="sticky top-0 z-50 border-b border-gray-200 bg-[#FFFDF9]/80 backdrop-blur-md shadow-sm">
    <div className="container mx-auto flex items-center justify-between gap-4 py-4 px-4 sm:px-6 max-w-6xl">
      <Link
        to="/"
        className="text-xl sm:text-2xl font-bold text-gray-900 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        ActSolo.AI
      </Link>
      <nav aria-label="Main" className="flex items-center gap-4 sm:gap-6">
        {showHome && (
          <Link to="/" className={navLinkClass(active === "home")} aria-current={active === "home" ? "page" : undefined}>
            Home
          </Link>
        )}
        <Link
          to="/coaching"
          className={navLinkClass(active === "coaching")}
          aria-current={active === "coaching" ? "page" : undefined}
        >
          Coaching
        </Link>
        <Link to="/login">
          <Button variant="outline" size="sm" tabIndex={-1}>
            Log In
          </Button>
        </Link>
      </nav>
    </div>
  </header>
);

export default SiteHeader;
