import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { EmailSignInForm } from "./EmailSignInForm";

export const AuthButtons = () => {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
      // The browser is redirected to Google and back automatically
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setError('Failed to sign in with Google. Please try again.');
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="relative flex items-center gap-3">
      {error && (
        <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-red-50 border border-red-200 rounded-lg z-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {!user ? (
        <button
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          data-testid="google-signin"
          className="flex items-center justify-center px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded-full disabled:opacity-50"
        >
          <svg
            className="w-5 h-5 mr-2"
            aria-hidden="true"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
          </svg>
          {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
        </button>
      ) : null}
      {!user && (
        <div className="relative">
          <button
            onClick={() => setShowEmail(!showEmail)}
            data-testid="email-signin"
            className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap"
          >
            or use email
          </button>
          {showEmail && (
            <div className="absolute right-0 mt-2 w-72 p-4 bg-white border border-gray-200 rounded-lg shadow-xl z-50 text-left">
              <EmailSignInForm onDone={() => setShowEmail(false)} />
            </div>
          )}
        </div>
      )}
      {user ? (
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 transition-colors rounded-full"
        >
          Sign Out
        </button>
      ) : null}
    </div>
  );
};
