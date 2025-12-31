import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Clock, Mic, Target, Users, Zap } from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <img 
            src="/actsolo-logo-color.png" 
            alt="ActSolo.AI" 
            className="h-8 sm:h-10"
          />
          <Link to="/login">
            <Button variant="outline" size="sm">
              Log In
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
            ActSolo.AI — AI Scene Partner & Teleprompter for Actors Who Need to Nail Self-Tapes Solo
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            When an audition comes in last-minute and you don't have a reader, ActSolo.AI helps you rehearse, react, and record with confidence. It's a performance-first teleprompter and AI reader that listens and responds in real time—so your self-tapes feel alive, not mechanical.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Start rehearsing in seconds
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                See how it works
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Separator />

      {/* Built for the Real Problem */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Built for the Real Problem — Urgent Auditions and No Reader
          </h2>
          <p className="text-lg text-muted-foreground mb-6">You know the moment:</p>
          <ul className="text-lg text-muted-foreground space-y-2 mb-6 list-disc list-inside">
            <li>Sides arrive late.</li>
            <li>Deadline is tomorrow.</li>
            <li>Your "available" reader can't read, rushes lines, or you need help with the kids.</li>
          </ul>
          <p className="text-lg text-muted-foreground">
            Most rehearsal apps help you memorize. Auditions demand something else: presence, timing, and reaction. ActSolo is built for that.
          </p>
        </div>
      </section>

      <Separator />

      {/* Deliver a Confident... */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-muted/30">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Deliver a Confident, Performance-Ready Self-Tape Without Relying on Anyone
          </h2>
          <p className="text-lg text-muted-foreground mt-4">
            ActSolo.AI is designed to remove the friction that shows up on camera—so you can focus on the performance that books the role.
          </p>
        </div>
      </section>

      <Separator />

      {/* Feature 1: Perform Under Deadline Pressure */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="h-8 w-8 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold">Perform Under Deadline Pressure</h2>
          </div>
          <h3 className="text-xl font-semibold text-muted-foreground mb-6">
            Get from script to scene fast
          </h3>
          <p className="text-lg text-muted-foreground mb-6">
            ActSolo is built for speed when the clock is real.
          </p>
          <div className="space-y-3">
            <p className="font-semibold">Features</p>
            <ul className="text-muted-foreground space-y-2 list-disc list-inside">
              <li>Paste your script and start immediately</li>
              <li>Real-time cue detection to keep the scene moving</li>
              <li>No scheduling, no favors, no waiting on a reader</li>
            </ul>
          </div>
        </div>
      </section>

      <Separator />

      {/* Feature 2: Stay Present in the Scene */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <Mic className="h-8 w-8 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold">Stay Present in the Scene</h2>
          </div>
          <h3 className="text-xl font-semibold text-muted-foreground mb-6">
            Your tape feels responsive, not rehearsed
          </h3>
          <p className="text-lg text-muted-foreground mb-6">
            The difference between "fine" and "bookable" is often reaction—timing, listening, and flow.
          </p>
          <div className="space-y-3">
            <p className="font-semibold">Features</p>
            <ul className="text-muted-foreground space-y-2 list-disc list-inside">
              <li>AI voices that listen and respond (not simple playback)</li>
              <li>Natural turn-taking so your performance stays alive</li>
              <li>Adjustable pacing and timing to match the scene</li>
            </ul>
          </div>
        </div>
      </section>

      <Separator />

      {/* Feature 3: Control the Outcome */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <Target className="h-8 w-8 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold">Control the Outcome</h2>
          </div>
          <h3 className="text-xl font-semibold text-muted-foreground mb-6">
            Fewer takes, stronger submissions
          </h3>
          <p className="text-lg text-muted-foreground mb-6">
            ActSolo is built to protect your energy and raise your floor—especially when you're taping alone.
          </p>
          <div className="space-y-3">
            <p className="font-semibold">Features</p>
            <ul className="text-muted-foreground space-y-2 list-disc list-inside">
              <li>Teleprompter support without breaking eye line</li>
              <li>A consistent scene partner every time</li>
              <li>Repeat scenes smoothly until you have the take you want</li>
            </ul>
          </div>
        </div>
      </section>

      <Separator />

      {/* Who ActSolo Is For */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-center">Who ActSolo Is For</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-semibold">Working / Striving Actors</h3>
              </div>
              <p className="text-muted-foreground">
                You're auditioning often, balancing life, and taping when you can—usually alone. ActSolo helps you deliver a stronger tape without dependence on anyone else.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Zap className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-semibold">Self-Tape Pros</h3>
              </div>
              <p className="text-muted-foreground">
                You don't need another tool. You need control, consistency, and a process that keeps performances sharp under pressure. ActSolo is built to reduce friction and protect the work.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* FAQ Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-left text-lg font-medium">
                Is ActSolo a line-learning app?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                It can help you rehearse, but it's built for performance, not just memorization—specifically for self-tapes when you need a responsive partner.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-left text-lg font-medium">
                Does it replace a human reader?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                It removes the dependency. When a reader isn't available—or isn't good—ActSolo gives you a consistent, responsive partner so the scene keeps its rhythm.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-left text-lg font-medium">
                Is it a teleprompter?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Yes—ActSolo includes teleprompter support designed for actors, so you can stay present without breaking eye line.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <Separator />

      {/* Final CTA Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-muted/30">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Submit Something You're Proud Of</h2>
          <p className="text-lg text-muted-foreground mb-8">
            When you're not scrambling for a reader, you don't settle. You commit. And that confidence shows up on camera.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Start rehearsing with ActSolo.AI
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Learn how it works
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 sm:px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="flex justify-center mb-6">
            <img 
              src="/actsolo-logo-bw.png" 
              alt="ActSolo.AI" 
              className="h-6 opacity-60"
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            ActSolo.AI is an AI teleprompter and AI scene partner for actors who want to rehearse and record self-tape auditions without needing a reader. Designed for urgent auditions, ActSolo helps actors run lines, maintain timing, and deliver more confident performances with responsive AI voices and real-time turn-taking.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
