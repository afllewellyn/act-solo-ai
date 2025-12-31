import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => {
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

        <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms and Conditions</h1>

        <div className="prose max-w-none space-y-6">
          <p className="text-gray-500">Last updated: December 2025</p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">1. Acceptance of Terms</h2>
            <p className="text-gray-600">
              By accessing and using ActSolo.AI, you accept and agree to be bound by the terms and provisions of this agreement.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">2. Use of Service</h2>
            <p className="text-gray-600">
              ActSolo.AI is a rehearsal tool designed to help actors practice their scripts. You agree to use the service only for its intended purpose and in compliance with all applicable laws.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">3. User Accounts</h2>
            <p className="text-gray-600">
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">4. Content</h2>
            <p className="text-gray-600">
              You retain ownership of any scripts you upload. By uploading content, you grant ActSolo.AI a license to process and store your content for the purpose of providing the service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">5. Limitation of Liability</h2>
            <p className="text-gray-600">
              ActSolo.AI is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">6. Contact</h2>
            <p className="text-gray-600">
              For questions about these terms, please contact us through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>.
            </p>
          </section>
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

export default Terms;
