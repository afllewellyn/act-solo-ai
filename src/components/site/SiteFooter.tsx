import { Link } from "react-router-dom";

interface SiteFooterProps {
  extraDescriptor?: string;
}

const links = [
  { to: "/coaching", label: "Coaching" },
  { to: "/best-ai-self-taping-app-2026", label: "Best AI Self-Tape App" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/contact", label: "Contact" },
  { to: "/help", label: "Help" },
];

export const SiteFooter = ({ extraDescriptor }: SiteFooterProps) => (
  <footer className="border-t py-10 px-4 sm:px-6 bg-white dark:bg-background">
    <div className="container mx-auto max-w-6xl">
      <div className="flex justify-center mb-6">
        <img src="/actsolo-logo-bw.png" alt="ActSolo.AI" className="h-6 opacity-60" />
      </div>
      <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-6">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="hover:text-foreground transition-colors">
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto">
        ActSolo.AI is an AI teleprompter and AI scene partner for actors who want to rehearse and record self-tape
        auditions without needing a reader. Designed for urgent auditions, ActSolo helps actors run lines, maintain
        timing, and deliver more confident performances with responsive AI voices and real-time turn-taking.
        {extraDescriptor ? ` ${extraDescriptor}` : ""}
      </p>
      <p className="text-sm text-muted-foreground text-center mt-4">© 2025 ActSolo.AI. All rights reserved.</p>
    </div>
  </footer>
);

export default SiteFooter;
