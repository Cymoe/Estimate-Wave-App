import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { convexConfigured, convexHost } from "../../lib/convex";

/** Turns a Convex Auth failure into a message the user can act on. */
function describeAuthError(err: unknown): string {
  if (!convexConfigured) {
    return 'This site was built without its backend address (VITE_CONVEX_URL). Add it in Vercel for this environment and redeploy.';
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (/already exists/i.test(raw)) return 'An account with this email already exists. Use "Sign in" instead.';
  if (/InvalidAccountId/.test(raw)) return 'No account for that email yet. Create an account with it.';
  if (/RESEND_API_KEY|could not be sent/i.test(raw)) return "We can't email a sign-up code right now. Continue with Google instead, or try again later.";
  if (/InvalidSecret|Invalid credentials/.test(raw)) return 'Incorrect email or password.';
  if (/TooManyFailedAttempts/.test(raw)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/Invalid password/.test(raw)) return 'Password must be at least 8 characters.';
  if (/Could not verify code|Invalid code|Invalid verification/i.test(raw)) return "That code isn't right or has expired. Check the email, or send a new one.";
  if (/Missing environment variable/.test(raw)) return 'Sign-in isn\'t set up on the server yet.';
  if (/Failed to fetch|NetworkError|connection/i.test(raw)) {
    return `Can't reach the server at ${convexHost}. Check your connection (a VPN can block it) and try again. (${raw.split('\n')[0].slice(0, 120)})`;
  }
  // Unknown: show the server's message without Convex's request prefix.
  const detail = raw
    .replace(/^\[CONVEX[^\]]*\]\s*(\[Request ID:[^\]]*\]\s*)?/, '')
    .replace(/^Server Error\s*/, '')
    .replace(/^Uncaught Error:\s*/, '')
    .split('\n')[0]
    .trim();
  return `Sign-in failed: ${detail || 'unknown error'}`;
}

/** Email + password sign in / account creation (Convex Auth Password provider). */
export const EmailSignInForm = ({ onDone }: { onDone?: () => void }) => {
  const { signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The server emails a 6-digit code before a new (or not yet proven) address counts.
  const [step, setStep] = useState<'credentials' | 'code'>('credentials');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finish = () => {
    onDone?.();
    navigate({ pathname: '/home', search: window.location.search.includes('next=') ? window.location.search : '' });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { signingIn } = await signInWithPassword({ email, password, flow, name: flow === 'signUp' ? name : undefined });
      if (signingIn) finish();
      else {
        setStep('code');
        setCode('');
        setCodeSent(email);
      }
    } catch (err) {
      console.error('Email sign-in failed:', err);
      setError(describeAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithPassword({ email, flow: 'email-verification', code: code.trim() });
      finish();
    } catch (err) {
      console.error('Code check failed:', err);
      setError(describeAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (step === 'code') {
    return (
      <form onSubmit={handleCode} className="space-y-3" data-testid="email-code-form">
        <p className="text-sm text-gray-700">
          We emailed a 6-digit code to <span className="font-medium">{codeSent}</span>. Type it here to finish.
        </p>
        <input
          className={inputClass}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="6-digit code"
          aria-label="6-digit code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={isSubmitting || code.length !== 6} className="w-full px-4 py-2 text-white rounded-md disabled:opacity-50" style={{ backgroundColor: '#336699' }}>
          {isSubmitting ? 'Checking…' : 'Confirm code'}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="text-gray-600 hover:text-gray-900">
            Send a new code
          </button>
          <button type="button" onClick={() => { setStep('credentials'); setError(null); }} className="text-gray-600 hover:text-gray-900">
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="email-signin-form">
      {flow === 'signUp' && (
        <input
          className={inputClass}
          placeholder="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        className={inputClass}
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={inputClass}
        type="password"
        placeholder="Password"
        autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className="text-sm text-red-600">
          {error}
          {flow === 'signIn' && error.startsWith('No account for that email') && (
            <>
              {' '}
              <button type="button" onClick={() => { setFlow('signUp'); setError(null); }} className="underline font-medium">
                Create an account with it
              </button>
            </>
          )}
        </p>
      )}
      <p className="text-xs text-gray-500">
        By continuing you agree to the{' '}
        <Link to="/terms" className="underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-4 py-2 text-white rounded-md disabled:opacity-50"
        style={{ backgroundColor: '#336699' }}
      >
        {isSubmitting ? 'Please wait…' : flow === 'signIn' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        onClick={() => {
          setFlow(flow === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
        }}
        className="w-full text-sm text-gray-600 hover:text-gray-900"
      >
        {flow === 'signIn' ? "New here? Create an account" : 'Already have an account? Sign in'}
      </button>
    </form>
  );
};
