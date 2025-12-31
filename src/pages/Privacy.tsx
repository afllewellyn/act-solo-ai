import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Privacy = () => {
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

        <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="prose max-w-none space-y-6">
          <p className="text-gray-500">Last updated: December 2025</p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">1. Information We Collect</h2>
            <p className="text-gray-600">
              We collect information you provide directly, including your email address, account credentials, and any scripts you upload for rehearsal purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">2. How We Use Your Information</h2>
            <p className="text-gray-600">
              We use your information to provide and improve our rehearsal services, communicate with you about your account, and ensure the security of our platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">3. Data Storage</h2>
            <p className="text-gray-600">
              Your scripts and account data are stored securely using industry-standard encryption. We retain your data only as long as necessary to provide our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">4. Third-Party Services</h2>
            <p className="text-gray-600">
              We use third-party services for authentication, text-to-speech, and hosting. These services have their own privacy policies governing their use of your data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">5. Your Rights</h2>
            <p className="text-gray-600">
              You have the right to access, correct, or delete your personal data. You can delete your account and all associated data at any time through your account settings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">6. Contact</h2>
            <p className="text-gray-600">
              For privacy-related questions, please contact us through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>.
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

export default Privacy;
