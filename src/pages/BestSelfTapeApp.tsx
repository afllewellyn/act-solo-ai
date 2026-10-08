import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Minus, X } from "lucide-react";
import { setCanonical } from "@/lib/seo";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

const PATH = "/best-ai-self-taping-app-2026";
const TITLE = "The Best AI Self-Taping App in 2026 – ActSolo.AI";
const DESCRIPTION =
  "How to choose an AI scene partner and self-tape reader in 2026: line-learning apps vs. human reader services vs. real-time conversational AI.";

type Cell = "yes" | "partial" | "no";
const rows: { feature: string; line: Cell; human: Cell; actsolo: Cell }[] = [
  { feature: "Answers your cue without pressing a button", line: "no", human: "yes", actsolo: "yes" },
  { feature: "A different voice for each character", line: "partial", human: "no", actsolo: "yes" },
  { feature: "Built-in teleprompter that protects your eye-line", line: "no", human: "no", actsolo: "yes" },
  { feature: "Available at 11pm with no booking", line: "yes", human: "partial", actsolo: "yes" },
  { feature: "No pre-recording your partner's lines", line: "no", human: "yes", actsolo: "yes" },
];

const CellIcon = ({ v }: { v: Cell }) =>
  v === "yes" ? (
    <Check className="h-5 w-5 text-black mx-auto" aria-label="Yes" />
  ) : v === "partial" ? (
    <Minus className="h-5 w-5 text-gray-400 mx-auto" aria-label="Sometimes" />
  ) : (
    <X className="h-5 w-5 text-gray-400 mx-auto" aria-label="No" />
  );

const BestSelfTapeApp = () => {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? "";
    meta?.setAttribute("content", DESCRIPTION);
    const restoreCanonical = setCanonical(PATH);
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "article-jsonld-guide";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "The Best AI Self-Taping App in 2026",
      description: DESCRIPTION,
      url: `https://actsolo.ai${PATH}`,
      datePublished: "2026-10-08",
      author: { "@type": "Organization", name: "ActSolo.AI" },
      publisher: { "@id": "https://actsolo.ai/#organization" },
    });
    document.head.appendChild(ld);
    return () => {
      document.title = prevTitle;
      meta?.setAttribute("content", prevDesc);
      document.getElementById("article-jsonld-guide")?.remove();
      restoreCanonical();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFDF9] overflow-x-hidden">
      <SiteHeader active="guide" />
      <main>
        <article>
          <header className="py-20 md:py-28 px-4 sm:px-6">
            <div className="container mx-auto max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 text-stone-950">2026 GUIDE</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-gray-900">
                The Best AI Self-Taping App in 2026
              </h1>
              <p className="text-lg sm:text-xl text-gray-600">
                Most "top AI tools" lists lump actor apps together. Here's how to actually choose an AI scene partner
                and self-tape reader, and what separates a tool that helps you memorize from one that helps you book.
              </p>
            </div>
          </header>

          <section className="py-16 md:py-20 px-4 sm:px-6 bg-white">
            <div className="container mx-auto max-w-3xl space-y-6 text-lg text-gray-600">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">The 2026 audition reality</h2>
              <p>
                Self-tapes are now the default first round for TV, film, and commercial casting. Sides land late,
                deadlines are tight, and the hardest part often isn't the acting. It's finding a reader who's free,
                patient, and good.
              </p>
              <p>
                That's why actors search for a <strong className="text-gray-900">self-tape reader</strong> or an{" "}
                <strong className="text-gray-900">AI scene partner</strong>. But the tools behind those searches work in
                very different ways.
              </p>
            </div>
          </section>

          <section className="py-16 md:py-20 px-4 sm:px-6">
            <div className="container mx-auto max-w-3xl space-y-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">The three kinds of reader tools</h2>
              {[
                {
                  title: "1. Line-learning apps",
                  body: "Great for memorizing. You usually record your partner's lines yourself or hear one flat voice, and you tap to move to the next line. Fine for getting off-book, but the timing never feels like a real scene.",
                },
                {
                  title: "2. Human reader services",
                  body: "A real person reads with you over video. The connection can be great, but you pay per session, you book ahead, and availability is thin when an audition drops at night.",
                },
                {
                  title: "3. Conversational AI scene partners",
                  body: "The newest option. The AI listens for you to finish your line and answers in character, out loud, right away. No buttons, no booking, no recording your own cues.",
                },
              ].map((t) => (
                <div key={t.title} className="bg-white rounded-2xl p-8 shadow-sm">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.title}</h3>
                  <p className="text-gray-600">{t.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="py-16 md:py-20 px-4 sm:px-6 bg-black">
            <div className="container mx-auto max-w-3xl space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">What actually matters on tape</h2>
              <ul className="space-y-4 text-lg text-white/80">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="text-white">Real-time turn-taking.</strong> If the reader waits for a button or a
                    timer, your reactions go flat. A partner that listens keeps the rhythm alive.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="text-white">A voice for every character.</strong> In a three-person scene, one
                    voice reading everyone makes it hard to react truthfully.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="text-white">Eye-line.</strong> Casting notices when you look down at paper. A
                    teleprompter that keeps your line near the lens keeps you in the scene.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section className="py-16 md:py-20 px-4 sm:px-6 bg-white">
            <div className="container mx-auto max-w-4xl">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Side-by-side comparison</h2>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-secondary">
                    <tr>
                      <th scope="col" className="p-4 text-sm font-semibold text-gray-900">Feature</th>
                      <th scope="col" className="p-4 text-sm font-semibold text-gray-900 text-center">Line-learning apps</th>
                      <th scope="col" className="p-4 text-sm font-semibold text-gray-900 text-center">Human readers</th>
                      <th scope="col" className="p-4 text-sm font-semibold text-gray-900 text-center">ActSolo.AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.feature} className="border-t border-gray-200">
                        <th scope="row" className="p-4 text-gray-700 font-normal">{r.feature}</th>
                        <td className="p-4"><CellIcon v={r.line} /></td>
                        <td className="p-4"><CellIcon v={r.human} /></td>
                        <td className="p-4"><CellIcon v={r.actsolo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Comparison reflects typical features of each category. Individual apps and services vary.
              </p>
            </div>
          </section>

          <section className="py-20 md:py-28 px-4 sm:px-6">
            <div className="container mx-auto max-w-3xl text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-gray-900">The verdict</h2>
              <p className="text-lg text-gray-600 mb-10">
                Line-learning apps help you memorize. Human readers are great when you can book one. For a self-tape
                reader that's ready the moment the sides arrive, a real-time AI scene partner with a voice for every
                character and a built-in teleprompter is the strongest choice in 2026. That's what ActSolo.AI is built
                to be.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="w-full sm:w-auto transition-transform hover:scale-105 bg-black text-white hover:bg-gray-800">
                  <Link to="/login">Run lines with AI now →</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto transition-transform hover:scale-105">
                  <Link to="/coaching">Want a human coach too?</Link>
                </Button>
              </div>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
};

export default BestSelfTapeApp;
