import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { landingFor } from '../lib/roles';

/** The page for an address that doesn't exist: says so and points home. */
export const NotFound: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Signed in: their home in the app. Signed out: the landing page, not a sign-in wall.
  const home = user ? landingFor(user, null) : '/';
  return (
    <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6" data-testid="not-found">
      <div className="max-w-md w-full text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide">404</p>
        <h1 className="mt-2 text-2xl font-semibold">There&rsquo;s nothing at this address</h1>
        <p className="mt-2 text-sm text-gray-400 font-mono break-all">{pathname}</p>
        <p className="mt-4 text-sm text-gray-400">If a link brought you here, it may be old. The page may have moved, or the address has a typo.</p>
        <Link to={home} className="inline-block mt-6 px-5 py-2.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white">
          {user ? 'Go to Tolliver' : 'Go to the home page'}
        </Link>
      </div>
    </div>
  );
};
