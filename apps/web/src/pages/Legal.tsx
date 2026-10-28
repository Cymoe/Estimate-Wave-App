import React from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME, SUPPORT_EMAIL } from '../config/brand';

// The Terms of Service and Privacy Policy, as plain pages anyone can open
// without signing in. Linked from the landing page, sign-in, the apply form,
// and every page a homeowner or client sees (estimate, signoff, funding).

const UPDATED = 'October 28, 2026';

/** Terms and Privacy links for the bottom of a public page. */
export const LegalLinks: React.FC<{ className?: string }> = ({ className = 'text-xs text-gray-500' }) => (
  <p className={`${className} text-center`}>
    <Link to="/terms" className="underline underline-offset-2 hover:text-gray-700">
      Terms
    </Link>
    {' · '}
    <Link to="/privacy" className="underline underline-offset-2 hover:text-gray-700">
      Privacy
    </Link>
  </p>
);

const Page: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-h-screen bg-gray-50 text-gray-900">
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">
        ← {APP_NAME}
      </Link>
      <article className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-10">
        <h1 className="text-2xl md:text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated {UPDATED}</p>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-gray-800 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </article>
      <div className="mt-6">
        <LegalLinks />
      </div>
    </div>
  </div>
);

export const TermsPage: React.FC = () => (
  <Page title="Terms of Service">
    <p>
      These terms are an agreement between you and {APP_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, applying for
      one, or using {APP_NAME}, you agree to them. If you use {APP_NAME} for a company, you agree on that company&rsquo;s behalf.
    </p>

    <h2>What {APP_NAME} is</h2>
    <p>
      {APP_NAME} gives home-service contractors tools to write estimates, send contracts for signature, track projects, costs and payments,
      and buy homeowner leads from our marketplace. We are not a party to any contract between a contractor and their customer, and we
      don&rsquo;t perform or guarantee any of the work.
    </p>

    <h2>Your account</h2>
    <ul>
      <li>You must be at least 18 and give accurate information about yourself and your company.</li>
      <li>You are responsible for everything done with your account and for keeping your sign-in private.</li>
      <li>Owners and admins of a company account can add, remove and set the roles of its members.</li>
    </ul>

    <h2>Leads and your lead balance</h2>
    <ul>
      <li>Leads are homeowner requests we collect and verify as best we can. We sell them as described on each lead, usually to one company.</li>
      <li>Money you add to your lead balance is a prepayment for leads and never expires. Lead prices are shown before you buy, bid or set a standing bid.</li>
      <li>
        A lead with a wrong number, or that is not a real request for work, can be reported within 3 days of receiving it; if we agree, its
        price is credited back to your balance. Beyond that, lead purchases are final. A lead that doesn&rsquo;t turn into a job is not a refund
        reason.
      </li>
      <li>Balances are not cash and can&rsquo;t be withdrawn, except where the law requires it.</li>
      <li>You agree to contact homeowners lawfully: honor do-not-call requests, follow telemarketing and texting rules, and use lead details only for the job requested.</li>
    </ul>

    <h2>Estimates, contracts and payments</h2>
    <ul>
      <li>You are responsible for the content of your estimates and contracts, including prices, terms, licenses and any disclosures your trade or state requires.</li>
      <li>Electronic signatures collected through {APP_NAME} are intended to be binding between you and your customer under applicable e-signature law. We keep a record of what was signed and when.</li>
      <li>Payments you record in {APP_NAME} are your own records. Card payments for your lead balance are processed by Stripe under its terms.</li>
    </ul>

    <h2>Connected assistants</h2>
    <p>
      You can connect an AI assistant such as Claude or ChatGPT to your account. It then acts with the permissions you grant, as you, and you
      are responsible for what it does. You can disconnect it at any time in Settings.
    </p>

    <h2>Acceptable use</h2>
    <p>
      Don&rsquo;t use {APP_NAME} to break the law, send spam, harass anyone, scrape or resell our data or leads, probe our systems, or interfere
      with other users. We may suspend or close accounts that do.
    </p>

    <h2>Fees and changes</h2>
    <p>
      Prices and features can change. We&rsquo;ll give notice of material changes to paid features before they take effect. Using {APP_NAME} after
      a change means you accept it.
    </p>

    <h2>Ending the agreement</h2>
    <p>
      You can stop using {APP_NAME} at any time. We can suspend or end your access for breaking these terms or if we stop offering the
      service, and will try to give reasonable notice. Signed records your customers rely on may be kept as the law requires.
    </p>

    <h2>Disclaimers and limits</h2>
    <p>
      {APP_NAME} is provided &ldquo;as is&rdquo;. We don&rsquo;t promise it will be error-free or always available, or that any lead will become a
      job. To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses, and our total liability to you for any
      claim is limited to the amount you paid us in the 12 months before the claim.
    </p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of the State of Texas. Disputes will be handled in the courts of Midland County, Texas.</p>

    <h2>Contact</h2>
    <p>
      Questions about these terms: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </Page>
);

export const PrivacyPage: React.FC = () => (
  <Page title="Privacy Policy">
    <p>
      This policy explains what {APP_NAME} collects, why, and the choices you have. It covers contractors who use {APP_NAME}, homeowners
      whose requests become leads, and anyone who opens an estimate, contract or payment link sent through {APP_NAME}.
    </p>

    <h2>What we collect</h2>
    <ul>
      <li>
        <strong>Contractor accounts:</strong> name, email, phone, company details, and what you do in {APP_NAME} (estimates, projects, costs,
        price book, leads). If you sign in with Google, we receive your name, email and profile picture from Google.
      </li>
      <li>
        <strong>Homeowner leads:</strong> name, phone, email, address and a description of the work, collected through our forms, ads and
        partners, plus whether and when you confirmed the request.
      </li>
      <li>
        <strong>Estimate and contract links:</strong> when the page was opened, the name typed and signature drawn when signing, and the
        documents agreed to.
      </li>
      <li>
        <strong>Payments:</strong> card payments are handled by Stripe; we receive the amount and a confirmation, never your full card number.
      </li>
      <li>
        <strong>Technical:</strong> device, browser and usage information needed to run and secure the service.
      </li>
    </ul>

    <h2>How we use it</h2>
    <ul>
      <li>To run {APP_NAME}: show your estimates and jobs, deliver leads, process payments, and send the emails and texts you asked for.</li>
      <li>To send a homeowner&rsquo;s request to a contractor who buys that lead, so they can contact you about the work.</li>
      <li>To send reminders about estimates that haven&rsquo;t been signed, on the contractor&rsquo;s behalf, and to let you reply to them directly.</li>
      <li>To keep records of signed documents, as required for contracts.</li>
      <li>To prevent fraud, support you, and improve the service.</li>
    </ul>

    <h2>Texts and emails</h2>
    <p>
      Contractors who apply agree to a call and texts from {APP_NAME} about their account and new leads. Homeowners who request a quote may
      get a text to confirm the request and messages from the contractor they&rsquo;re matched with. Message and data rates may apply. Reply
      STOP to any text to stop texts from that number, or HELP for help. You can turn off email alerts in Settings.
    </p>

    <h2>Who we share it with</h2>
    <ul>
      <li>
        <strong>Contractors:</strong> a homeowner&rsquo;s request and contact details go to the contractor who buys the lead (and to no one else).
      </li>
      <li>
        <strong>Your customers:</strong> the estimate, contract and payment pages you send show your company&rsquo;s details to the people you
        send them to.
      </li>
      <li>
        <strong>Service providers</strong> who help us run {APP_NAME}: hosting and database (Vercel, Convex), email (Resend), texting (Twilio),
        payments (Stripe), and sign-in (Google). They may only use the data to provide their service to us.
      </li>
      <li>
        <strong>Connected assistants:</strong> if you connect Claude or ChatGPT, it can read and change your company&rsquo;s data in {APP_NAME}
        within the permissions you approve. Your use of the assistant itself is governed by its provider&rsquo;s policy.
      </li>
      <li>When the law requires it, or to protect {APP_NAME}, our users or others.</li>
    </ul>
    <p>We don&rsquo;t sell personal information other than selling homeowner lead requests to contractors as described above.</p>

    <h2>How long we keep it</h2>
    <p>
      Account data stays while your account is open and for a reasonable time after. Signed estimates and contracts are kept as long as
      needed for the parties&rsquo; records and legal requirements. Leads are kept so credits and disputes can be handled, then trimmed.
    </p>

    <h2>Your choices</h2>
    <ul>
      <li>You can see and update your account details in Settings, and ask us to delete your account.</li>
      <li>Homeowners can ask us to delete their request or stop sharing it by contacting us; a contractor who already received it keeps their own copy.</li>
      <li>You can opt out of texts by replying STOP and out of email alerts in Settings.</li>
    </ul>

    <h2>Security</h2>
    <p>
      Data is encrypted in transit, sign-in is handled by established providers, and access inside {APP_NAME} is limited to your own
      company&rsquo;s records. No system is perfectly secure, so please keep your sign-in private.
    </p>

    <h2>Children</h2>
    <p>{APP_NAME} is for businesses and adults. We don&rsquo;t knowingly collect information from anyone under 18.</p>

    <h2>Changes</h2>
    <p>We&rsquo;ll post changes here and update the date above. Material changes will also be announced in the app or by email.</p>

    <h2>Contact</h2>
    <p>
      Privacy questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. {APP_NAME} · Midland, Texas.
    </p>
  </Page>
);
