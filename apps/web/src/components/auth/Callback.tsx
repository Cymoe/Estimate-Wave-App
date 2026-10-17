import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Legacy sign-in landing route. Convex Auth finishes OAuth on its own, so this
 * just waits for the session and forwards to the dashboard (or home on error).
 */
export const Callback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      navigate('/?error=' + error);
      return;
    }

    if (isLoading) return;
    navigate(user ? '/profit-tracker' : '/');
  }, [searchParams, navigate, user, isLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-steel-blue mx-auto mb-4"></div>
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
};
