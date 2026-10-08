import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, Drama, FileText, Star, Video } from "lucide-react";
import { setCanonical } from "@/lib/seo";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

const BOOKING_URL = "https://www.cameraoncreative.com/shop/p/coaching?utm_source=actsolo";

const faqs = [
  {
    q: "Do I need to use ActSolo to book coaching?",
    a: "No. Coaching is open to any actor, but ActSolo users can arrive with scenes already rehearsed.",
  },
  { q: "How are sessions held?", a: "Sessions are held virtually, so you can book from anywhere." },
  {
    q: "Who is coaching for?",
    a: "Actors preparing for theatre, TV, film, or commercial auditions. Sessions can also cover singing, modeling, and your brand overview.",
  },
];

const BookButton = ({ label, variant = "dark" }: { label: string; variant?: "dark" | "light" }) => (
  <Button
    asChild
    size="lg"
    className={
      variant === "dark"
        ? "w-full sm:w-auto transition-transform hover:scale-105 bg-black text-white hover:bg-gray-800"
        : "w-full sm:w-auto transition-transform hover:scale-105 bg-white text-black hover:bg-gray-100"
    }
  >
    <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  </Button>
);

const Coaching = () => {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Acting Coaching – ActSolo.AI";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? "";
    meta?.setAttribute(
      "content",
      "Practice with AI, then polish with a human. Book one-on-one online acting coaching for auditions and self-tapes.",
    );
    const restoreCanonical = setCanonical("/coaching");
    const faq = document.createElement("script");
    faq.type = "application/ld+json";
    faq.id = "faq-jsonld-coaching";
    faq.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    document.head.appendChild(faq);
    return () => {
      document.title = prevTitle;
      meta?.setAttribute("content", prevDesc);
      document.getElementById("faq-jsonld-coaching")?.remove();
      restoreCanonical();
    };
  }, []);

  const scrollToHow = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#FFFDF9] overflow-x-hidden">
      <SiteHeader active="coaching" />

      <main>
        {/* Hero */}
        <section className="py-20 md:py-32 px-4 sm:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider mb-4 text-stone-950">
                  HUMAN COACHING FOR ACTORS
                </p>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-gray-900">
                  Practice with AI. Polish with a human.
                </h1>
                <p className="text-lg sm:text-xl text-gray-600 mb-8">
                  ActSolo gets you off-book and reading with a scene partner at 11pm. A coach helps you decide what to
                  do with the scene. Book one-on-one time with a working actor before your next audition or self-tape.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <BookButton label="Book a coaching session →" />
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto transition-transform hover:scale-105">
                    <a href="#how" onClick={scrollToHow}>
                      See how it works
                    </a>
                  </Button>
                </div>
              </div>
              <div className="relative order-first lg:order-last">
                <img
                  alt="Anna Cameron smiling and holding a movie clapper with Cameraon Creative written on it"
                  className="rounded-3xl shadow-2xl w-full object-cover aspect-[3/4]"
                  src="/lovable-uploads/3ab4d7e5-4b52-482a-befb-3ffd1a49772a.png"
                  width={900}
                  height={1200}
                  {...({ fetchpriority: "high" } as Record<string, string>)}
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-20 md:py-32 px-4 sm:px-6 bg-black scroll-mt-20">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold text-white uppercase tracking-wider mb-3">HOW IT WORKS</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
              Rehearse with ActSolo. Refine with a coach.
            </h2>
            <p className="text-lg mt-6 max-w-2xl mx-auto text-white/70">
              Use ActSolo to run lines and get the take on its feet. Then bring it to a session for feedback on the
              choices only a person can see.
            </p>
            <div className="grid md:grid-cols-2 gap-6 mt-12 text-left">
              <div className="border border-white/20 rounded-2xl p-8">
                <h3 className="text-xl font-semibold text-white mb-3">Step 1 – Rehearse in ActSolo</h3>
                <p className="text-white/70">Paste your sides, assign AI voices, and run the scene until it moves.</p>
              </div>
              <div className="border border-white/20 rounded-2xl p-8">
                <h3 className="text-xl font-semibold text-white mb-3">Step 2 – Get a coach's eye</h3>
                <p className="text-white/70">Choices, energy, and self-tape polish from a working actor.</p>
              </div>
            </div>
          </div>
        </section>

        {/* What we work on */}
        <section className="py-20 md:py-32 px-4 sm:px-6">
          <div className="container mx-auto max-w-6xl">
            <p className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 text-center">
              WHAT WE WORK ON
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center text-gray-900">
              Coaching built around your next audition
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { icon: Drama, title: "Audition prep", body: "Theatre, TV, film, and commercial, plus singing and modeling." },
                { icon: FileText, title: "Monologue selection", body: "Find pieces that fit your type and show your range." },
                { icon: Video, title: "Self-tape review", body: "Your read, your framing, your take." },
                { icon: Star, title: "Brand overview", body: "Type assessment, headshot recommendations, resume, and reel review." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-white rounded-2xl p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <Icon className="h-6 w-6 text-black" aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
                  </div>
                  <p className="text-gray-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why pair them */}
        <section className="py-20 md:py-32 px-4 sm:px-6 bg-white">
          <div className="container mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider mb-3 text-gray-900">WHY PAIR THEM</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900">AI gets you ready. A coach gets you booked.</h2>
            <ul className="text-lg text-gray-600 space-y-3 mb-6">
              {[
                "Show up to the session already off-book and warmed up",
                "Spend coaching time on choices and story, not line-feeding",
                "Walk away with notes you can apply to your very next take",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-black mt-1 flex-shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-lg text-gray-600 font-semibold">
              Online, one-on-one, and built around the audition in front of you.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-20 md:py-32 px-4 sm:px-6 bg-secondary">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">PRICING</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-primary">One session. One clear price.</h2>
            <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 max-w-lg mx-auto text-left">
              <p className="text-gray-900 mb-6">
                <span className="text-4xl font-bold">$150</span>
                <span className="text-gray-600"> / hour-long session</span>
              </p>
              <ul className="text-gray-600 space-y-3 mb-8">
                {[
                  "Virtual sessions, wherever you are",
                  "One-on-one with Anna Cameron, working actor and acting coach",
                  "Audition prep, monologues, self-tape review, and brand overview",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-black mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <BookButton label="Book a session →" />
            </div>
            <p className="text-sm text-muted-foreground mt-6 max-w-lg mx-auto">
              Reschedule up to 24 hours ahead. Cancellations inside 24 hours may be non-refundable. No booking is
              guaranteed. Coaching is provided by Cameraon Creative.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 md:py-32 px-4 sm:px-6 bg-white">
          <div className="container mx-auto max-w-3xl">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 text-center">FAQ</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-center text-gray-900">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i + 1}`}>
                  <AccordionTrigger className="text-left text-lg font-medium text-gray-900">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-gray-600">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 md:py-32 px-4 sm:px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">GET STARTED</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-gray-900">Take your next self-tape further</h2>
            <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
              Rehearse with ActSolo. Then bring it to someone who can tell you what's working.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookButton label="Book a coaching session →" />
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto transition-transform hover:scale-105">
                <Link to="/login">Run lines with AI now</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter extraDescriptor="Coaching is offered through Camera On Creative." />
    </div>
  );
};

export default Coaching;
