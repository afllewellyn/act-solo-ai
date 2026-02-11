import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, Clock, Mic, Target, Users, Zap, ArrowRight } from "lucide-react";
import movieScriptImg from "@/assets/movie-script.jpg";
import actorHeadshotImg from "@/assets/actor-headshot.jpg";
const Landing = () => {
  return <div className="min-h-screen bg-[#FFFDF9]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-[#FFFDF9]/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6 max-w-6xl">
          <span className="text-xl sm:text-2xl font-bold text-gray-900">ActSolo.AI</span>
          <Link to="/login">
            <Button variant="outline" size="sm">
              Log In
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section - Split Layout */}
      <section className="py-20 md:py-32 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text Left */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 text-stone-950">AI SCENE PARTNER & TELEPROMPTER</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-left text-gray-900">A Scene Partner for Solo Actors</h1>
              <p className="text-lg sm:text-xl text-gray-600 mb-8 text-left">When an audition comes in last-minute and you don't have a reader, ActSolo.AI helps you rehearse, react, and record with confidence. It's a performance-first teleprompter and AI reader that listens and responds in real time so your self-tapes feel alive, not mechanical.</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/login">
                  <Button size="lg" className="w-full sm:w-auto group transition-transform hover:scale-105 bg-black text-white hover:bg-gray-800">
                    Run lines with AI now →
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto transition-transform hover:scale-105">
                    See how it works
                  </Button>
                </Link>
              </div>
            </div>
            {/* Image Right */}
            <div className="relative order-first lg:order-last">
              <img alt="Anna Cameron smiling and holding a movie clapper with Cameraon Creative written on it" className="rounded-3xl shadow-2xl w-full object-cover aspect-[3/4]" src="/lovable-uploads/3ab4d7e5-4b52-482a-befb-3ffd1a49772a.png" />
            </div>
          </div>
        </div>
      </section>

      {/* Built for the Real Problem - Image Left, Text Right */}
      <section className="py-20 md:py-32 px-4 sm:px-6 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image Left */}
            <div className="relative">
              <img alt="Movie script with highlighter and pen" className="rounded-2xl shadow-xl w-full object-cover object-top aspect-[4/3]" src="/lovable-uploads/94ee3c69-f424-4746-89b0-3003b9147218.png" />
            </div>
            {/* Text Right */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider mb-3 text-background">The Problem</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900">
                Built for the Real Problem - Urgent Auditions and No Reader
              </h2>
              <p className="text-lg text-gray-600 mb-6">You know the moment:</p>
              <ul className="text-lg text-gray-600 space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-black mt-1 flex-shrink-0" />
                  <span>Sides arrive late.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-black mt-1 flex-shrink-0" />
                  <span>Deadline is tomorrow</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-black mt-1 flex-shrink-0" />
                  <span>Your reliable reader isn't available</span>
                </li>
              </ul>
              <p className="text-lg text-gray-600 font-semibold">
                Most rehearsal apps help you memorize. Auditions demand something else: presence, timing, and reaction.
                ActSolo is built for that.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deliver a Confident... - Full Width Centered */}
      <section className="py-20 md:py-32 px-4 sm:px-6 bg-black">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold text-white uppercase tracking-wider mb-3">The Solution</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
            Deliver a Performance Ready Self-Tape Solo
          </h2>
          <p className="text-lg mt-6 max-w-2xl mx-auto text-white/70">
            ActSolo.AI is designed to remove the friction that shows up on camera so you can focus on the performance
            that books the role.
          </p>
        </div>
      </section>

      {/* Feature 1: Perform Under Deadline Pressure - Text Left, Image Right */}
      <section className="py-20 md:py-32 px-4 sm:px-6 bg-black">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text Left */}
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Feature</p>
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-8 w-8 text-foreground" />
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Perform Under Deadline Pressure</h2>
              </div>
              <h3 className="text-xl font-semibold text-foreground/80 mb-6">Get from script to scene fast</h3>
              <p className="text-lg text-muted-foreground mb-6">ActSolo is built for speed when the clock is real.</p>
              <div className="space-y-3">
                <ul className="text-muted-foreground space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 mt-0.5 flex-shrink-0 text-foreground" />
                    <span>Paste your script, format it, and start immediately</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
                    <span>Real-time cue detection to keep the scene moving</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
                    <span>No scheduling, no favors, no waiting on a reader</span>
                  </li>
                </ul>
              </div>
            </div>
            {/* Image Right */}
            <div className="relative order-first lg:order-last">
              <img alt="Home recording setup with microphone" className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]" src="/lovable-uploads/ae4cedfc-4789-44ae-b2fb-1a93f4cf3b6b.png" />
            </div>
          </div>
        </div>
      </section>

      {/* Feature 2: Stay Present in the Scene - Image Left, Text Right */}
      <section className="py-20 md:py-32 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image Left */}
            <div className="relative">
              <img src={actorHeadshotImg} alt="Actor headshot" className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]" />
            </div>
            {/* Text Right */}
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Feature</p>
              <div className="flex items-center gap-3 mb-4">
                <Mic className="h-8 w-8 text-black" />
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Stay Present in the Scene</h2>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-6">Your tape feels responsive, not rehearsed</h3>
              <p className="text-lg text-gray-600 mb-6">
                The difference between "fine" and "bookable" is often reaction, timing, listening, and flow.
              </p>
              <div className="space-y-3">
                <p className="font-semibold text-gray-900">You'll get:</p>
                <ul className="text-gray-600 space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-black mt-0.5 flex-shrink-0" />
                    <span>A selection of AI voices that listen and respond (not simple playback)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-black mt-0.5 flex-shrink-0" />
                    <span>Natural turn-taking so your performance stays alive</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-black mt-0.5 flex-shrink-0" />
                    <span>Adjustable pacing and timing to match the scene</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: Control the Outcome - Text Left, Image Right */}
      <section className="py-20 md:py-32 px-4 sm:px-6 bg-secondary">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text Left */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Target className="h-8 w-8 text-primary" />
                <h2 className="text-2xl sm:text-3xl font-bold text-primary">Control the Outcome</h2>
              </div>
              <h3 className="text-xl font-semibold mb-6 text-primary">Fewer takes, stronger submissions</h3>
              <p className="text-lg mb-6 text-primary">
                ActSolo is built to protect your energy and raise your floor - especially when you're taping alone.
              </p>
              <div className="space-y-3">
                <ul className="text-gray-600 space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-primary">Teleprompter support without breaking eye line</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-primary">A consistent scene partner every time</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-primary">Repeat scenes smoothly until you have the take you want</span>
                  </li>
                </ul>
              </div>
            </div>
            {/* Image Right */}
            <div className="relative order-first lg:order-last">
              <img src="https://images.squarespace-cdn.com/content/v1/630bad25b4306e0ea902c91a/3dd0b3e8-4c6b-4d7f-b9fe-e12ab6c222f7/Copy+of+Coney2c.jpg?format=1500w" alt="Anna Cameron smiling with a shirt that says 'babe you've got this'" className="rounded-2xl shadow-xl w-full object-cover aspect-[3/4]" />
            </div>
          </div>
        </div>
      </section>

      {/* Who ActSolo Is For - Cards Layout */}
      <section className="py-20 md:py-32 px-4 sm:px-6 text-secondary bg-secondary">
        <div className="container mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 text-center">Who It's For</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center text-primary">ActSolo Is For</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Users className="h-6 w-6 text-black" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Working / Striving Actors</h3>
              </div>
              <p className="text-gray-600">
                You're auditioning often, balancing life, and taping when you can - usually alone. ActSolo helps you
                deliver a stronger tape without dependence on anyone else.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Zap className="h-6 w-6 text-black" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Self-Tape Pros</h3>
              </div>
              <p className="text-gray-600">
                You don't need another tool. You need control, consistency, and a process that keeps performances sharp
                under pressure. ActSolo is built to reduce friction and protect the work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 md:py-32 px-4 sm:px-6 bg-white">
        <div className="container mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 text-center">FAQ</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-center text-gray-900">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-left text-lg font-medium text-gray-900">
                Is ActSolo a line-learning app?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                It can help you rehearse, but it's built for performance, not just memorization—specifically for
                self-tapes when you need a responsive partner.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-left text-lg font-medium text-gray-900">
                Does it replace a human reader?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                It removes the dependency. When a reader isn't available—or isn't good—ActSolo gives you a consistent,
                responsive partner so the scene keeps its rhythm.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-left text-lg font-medium text-gray-900">
                Is it a teleprompter?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Yes—ActSolo includes teleprompter support designed for actors, so you can stay present without breaking
                eye line.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 md:py-32 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Get Started</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-gray-900">
            Submit Something You're Proud Of
          </h2>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            When you're not scrambling for a reader, you don't settle. You commit. And that confidence shows up on
            camera.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login">
              <Button size="lg" className="w-full sm:w-auto group transition-transform hover:scale-105">
                Make your next self tape stronger →
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto transition-transform hover:scale-105">
                Learn how it works
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-4 sm:px-6 bg-white dark:bg-background">
        <div className="container mx-auto max-w-6xl">
          <div className="flex justify-center mb-6">
            <img src="/actsolo-logo-bw.png" alt="ActSolo.AI" className="h-6 opacity-60" />
          </div>
          <div className="flex justify-center gap-6 text-sm text-muted-foreground mb-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
            <Link to="/help" className="hover:text-foreground transition-colors">
              Help
            </Link>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto">
            ActSolo.AI is an AI teleprompter and AI scene partner for actors who want to rehearse and record self-tape
            auditions without needing a reader. Designed for urgent auditions, ActSolo helps actors run lines, maintain
            timing, and deliver more confident performances with responsive AI voices and real-time turn-taking.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-4">© 2025 ActSolo.AI. All rights reserved.</p>
        </div>
      </footer>
    </div>;
};
export default Landing;