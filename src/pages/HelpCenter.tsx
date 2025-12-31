import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, MessageCircle, Video, Zap } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const HelpCenter = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/actsolo-logo-color.png" alt="ActSolo" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-4">Help Center</h1>
        <p className="text-muted-foreground mb-12">
          Find answers to common questions and learn how to get the most out of ActSolo.
        </p>

        {/* Quick Links */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <div className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <Zap className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Getting Started</h3>
            <p className="text-sm text-muted-foreground">Learn how to upload your first script and start rehearsing.</p>
          </div>
          <div className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <Video className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Rehearsal Mode</h3>
            <p className="text-sm text-muted-foreground">Master the rehearsal features for better performance.</p>
          </div>
          <div className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <BookOpen className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Script Management</h3>
            <p className="text-sm text-muted-foreground">Organize and edit your scripts efficiently.</p>
          </div>
          <div className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <MessageCircle className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Contact Support</h3>
            <p className="text-sm text-muted-foreground">Get help from our team for specific issues.</p>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>How do I upload a script?</AccordionTrigger>
            <AccordionContent>
              After signing in, go to the Manage Scripts page and click "Add Script." You can paste your script content directly or type it in. Make sure to include character names followed by colons before their lines (e.g., "JOHN: Hello there.").
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>How do I assign roles for rehearsal?</AccordionTrigger>
            <AccordionContent>
              When you start a rehearsal, you'll be prompted to assign roles. Select which character you want to play, and ActSolo will read the other characters' lines for you using text-to-speech.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>Can I practice offline?</AccordionTrigger>
            <AccordionContent>
              Currently, ActSolo requires an internet connection for text-to-speech and script synchronization. We're working on offline support for future releases.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>What audio formats are supported?</AccordionTrigger>
            <AccordionContent>
              ActSolo uses high-quality text-to-speech technology that works in all modern browsers. For best results, use Chrome, Safari, Firefox, or Edge with your device's audio enabled.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-5">
            <AccordionTrigger>How do I delete my account?</AccordionTrigger>
            <AccordionContent>
              To delete your account and all associated data, please contact us through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>. We'll process your request within 48 hours.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-12 p-6 bg-muted/50 rounded-lg text-center">
          <h3 className="font-semibold mb-2">Still need help?</h3>
          <p className="text-muted-foreground mb-4">Our support team is here to assist you.</p>
          <Link to="/contact">
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              Contact Support
            </button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center gap-6 text-sm text-muted-foreground mb-4">
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/help" className="hover:text-foreground">Help</Link>
          </div>
          <p className="text-sm text-muted-foreground">© 2024 ActSolo.AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default HelpCenter;
