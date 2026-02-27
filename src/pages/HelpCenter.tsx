import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const HelpCenter = () => {
  useEffect(() => {
    document.title = "Help & FAQ – ActSolo.AI | Script Rehearsal Questions Answered";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", "Find answers to common questions about ActSolo.AI — how to upload scripts, use Rehearsal Mode, assign voices, and practice self-tapes with your AI scene partner.");
    }
    return () => {
      document.title = "ActSolo.AI";
      const meta = document.querySelector('meta[name="description"]');
      if (meta) {
        meta.setAttribute("content", "ActSolo.AI is the AI scene partner & teleprompter for actors who need to nail self-tapes solo");
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <header className="border-b border-gray-200 bg-[#FFFDF9]">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/actsolo-logo-color.png" alt="ActSolo" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-4">Help & FAQ</h1>
        <p className="text-gray-600 mb-12">
          Find answers to common questions and learn how to get the most out of ActSolo.
        </p>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="getting-started" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How do I get started with ActSolo?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              Getting started is simple: create a free account, then head to the Manage Scripts page to add your first script. Paste or type your script content into the rich text editor, format it using bold and italic styles, and you're ready to start rehearsing.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="upload" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How do I upload a script?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              After signing in, go to the Manage Scripts page and click "Add Script." You can paste your script content directly or type it in using the rich text editor. Use <strong>italic</strong> formatting for lines you want the AI to read aloud (scene partner lines) and <strong>bold</strong> formatting for your own lines to practice.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="format" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">What script format should I use?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              No special format is required. Simply use the rich text editor to style your script. Mark scene partner lines in <em>italic</em> — these will be read aloud by the AI voice during rehearsal. Mark your own lines in <strong>bold</strong> so you know when it's your turn. Everything else (stage directions, notes) can be left as regular text.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rehearsal" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How does Rehearsal Mode work?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              In Rehearsal Mode, ActSolo acts as your scene partner. The AI reads the other characters' lines aloud using text-to-speech while you follow along in the script display and practice your own lines. Use the play/pause controls to move at your own pace, and on mobile you'll find convenient touch controls as well.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="roles" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How do I assign roles for rehearsal?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              When you start a rehearsal, you'll be prompted to assign roles. Select which character you want to play, and ActSolo will read the other characters' lines for you using text-to-speech.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="voices" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">Can I choose different voices for characters?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              Yes! During the role assignment step before rehearsal, you can select from a variety of voices for each character. This helps you distinguish between scene partners and makes rehearsal feel more natural.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="manage" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How do I manage and edit my scripts?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              The Manage Scripts page is your hub for all your scripts. From there you can add new scripts, edit existing ones using the rich text editor, or delete scripts you no longer need. All changes are saved automatically to your account.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="offline" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">Can I practice offline?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              Currently, ActSolo requires an internet connection for text-to-speech and script synchronization. We're working on offline support for future releases.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="audio" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">What audio formats are supported?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              ActSolo uses high-quality text-to-speech technology that works in all modern browsers. For best results, use Chrome, Safari, Firefox, or Edge with your device's audio enabled.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="free" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">Is ActSolo free?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              ActSolo is currently free to use while we're in early access. We'll announce any future pricing changes well in advance so you can plan accordingly.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="delete-account" className="border-gray-200">
            <AccordionTrigger className="text-gray-900">How do I delete my account?</AccordionTrigger>
            <AccordionContent className="text-gray-600">
              To delete your account and all associated data, please contact us through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>. We'll process your request within 48 hours.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-12 p-6 bg-white rounded-lg border border-gray-200 text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Still need help?</h3>
          <p className="text-gray-600 mb-4">Our support team is here to assist you.</p>
          <Link to="/contact">
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              Contact Support
            </button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center gap-6 text-sm text-gray-500 mb-4">
            <Link to="/terms" className="hover:text-gray-900">Terms</Link>
            <Link to="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link to="/contact" className="hover:text-gray-900">Contact</Link>
            <Link to="/help" className="hover:text-gray-900">Help</Link>
          </div>
          <p className="text-sm text-gray-500">© 2025 ActSolo.AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default HelpCenter;
