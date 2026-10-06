import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

/** Email + password sign in / account creation (Convex Auth Password provider). */
export const EmailSignInForm = ({ onDone }: { onDone?: () => void }) => {
  const { signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithPassword({ email, password, flow, name: flow === 'signUp' ? name : undefined });
      onDone?.();
      navigate('/profit-tracker');
    } catch (err) {
      console.error('Email sign-in failed:', err);
      setError(
        flow === 'signIn'
          ? 'Incorrect email or password.'
          : 'Could not create the account. Use a password of at least 8 characters, or sign in if you already have an account.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

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
      {error && <p className="text-sm text-red-600">{error}</p>}
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
