import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  email: z.string().trim().email("Please enter a valid email").max(255, "Email must be 255 characters or less"),
  message: z.string().trim().min(1, "Message is required").max(2000, "Message must be 2000 characters or less"),
});

const Contact = () => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse({ name, email, message });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-contact-email", {
        body: { name: name.trim(), email: email.trim(), message: message.trim() },
      });

      if (error) {
        throw new Error(error.message || "Failed to send message");
      }

      toast({
        title: "Message sent!",
        description: "Thanks for reaching out. We'll get back to you soon.",
      });

      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      console.error("Contact form error:", err);
      toast({
        title: "Failed to send",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <header className="border-b border-gray-200 bg-[#FFFDF9]">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/actsolo-logo-color.png" alt="ActSolo" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
        <p className="text-gray-600 mb-8">
          Have questions, feedback, or need support? We'd love to hear from you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700">Name</Label>
            <Input
              id="name"
              placeholder="Your name"
              className="bg-white border-gray-300 text-gray-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              className="bg-white border-gray-300 text-gray-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
            {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="message" className="text-gray-700">Message</Label>
            <Textarea
              id="message"
              placeholder="How can we help?"
              rows={5}
              className="bg-white border-gray-300 text-gray-900"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
            />
            {errors.message && <p className="text-sm text-red-600">{errors.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Message"
            )}
          </Button>
        </form>
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

export default Contact;
