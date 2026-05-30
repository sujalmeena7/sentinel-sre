'use client'

import { Shield } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-10 text-sm">
          ← Back to home
        </a>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-6 h-6 text-indigo-500" />
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
        </div>

        <p className="text-sm text-zinc-500 mb-8">Last updated: May 30, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              Sentinel-SRE (&quot;we&quot;, &quot;our&quot;, &quot;the Service&quot;) is an open-source AI-powered
              root cause analysis platform. This Privacy Policy explains how we collect, use, and
              protect your information when you use our hosted service at sentinel-sre-zeta.vercel.app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">Account information:</strong> Email address and hashed password when you register.</li>
              <li><strong className="text-white">Incident data:</strong> Alert payloads sent via your Prometheus Alertmanager webhook (service names, alert labels, severity, timestamps).</li>
              <li><strong className="text-white">Analysis data:</strong> AI-generated root cause hypotheses, confidence scores, and postmortems associated with your incidents.</li>
              <li><strong className="text-white">Feedback data:</strong> Thumbs up/down ratings and comments you provide on AI verdicts.</li>
              <li><strong className="text-white">Usage data:</strong> Basic request logs (IP address, timestamps) for rate limiting and security.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide AI-powered root cause analysis on your incidents.</li>
              <li>To improve analysis accuracy via the feedback-driven RAG system (your feedback only improves results for your own tenant).</li>
              <li>To generate automated postmortems and dispatch them to your configured Slack/Teams channels.</li>
              <li>To enforce rate limits and prevent abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Isolation</h2>
            <p>
              Sentinel-SRE is multi-tenant with strict per-user data isolation. Your incident data,
              analysis results, and feedback are never shared with or visible to other users. Database
              queries and vector store (ChromaDB) retrievals are filtered by your user ID with
              defense-in-depth post-filtering.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Third-Party Services</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">Groq:</strong> Your incident symptoms and signals are sent to Groq&apos;s LLM API (llama-3.3-70b) for analysis. See <a href="https://groq.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Groq&apos;s Privacy Policy</a>.</li>
              <li><strong className="text-white">OpenAI (fallback):</strong> If Groq is unavailable, OpenAI&apos;s API may be used. See <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">OpenAI&apos;s Privacy Policy</a>.</li>
              <li><strong className="text-white">Render:</strong> Backend hosting. See <a href="https://render.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Render&apos;s Privacy Policy</a>.</li>
              <li><strong className="text-white">Vercel:</strong> Frontend hosting. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Vercel&apos;s Privacy Policy</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Security</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Passwords are stored as bcrypt hashes (never in plaintext).</li>
              <li>Webhook tokens are stored as SHA-256 hashes and shown only once at creation.</li>
              <li>JWTs are signed with HS256 and expire after 24 hours.</li>
              <li>Rate limiting is enforced on authentication and webhook endpoints.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Data Retention</h2>
            <p>
              Your data is retained as long as your account exists. You can request deletion of your
              account and all associated data by contacting us. Incident data in the vector store
              (ChromaDB) is scoped to your user ID and removed upon account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Open Source</h2>
            <p>
              Sentinel-SRE is open-source under the MIT License. You can self-host the entire platform
              and retain full control of your data. See the{' '}
              <a href="https://github.com/sujalmeena7/sentinel-sre" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                GitHub repository
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
            <p>
              For privacy-related questions, contact: <a href="mailto:meensujal60@gmail.com" className="text-indigo-400 hover:underline">meensujal60@gmail.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
