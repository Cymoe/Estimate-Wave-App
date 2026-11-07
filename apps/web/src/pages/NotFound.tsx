import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { landingFor } from '../lib/roles';
import { LangProvider, LangToggle } from '../i18n';
import { useLang } from '../i18n/lang';

/** The page for an address that doesn't exist: says so and points home. */
const NotFoundPage: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { lang } = useLang();
  const es = lang === 'es';
  // Signed in: their home in the app. Signed out: the landing page, not a sign-in wall.
  const home = user ? landingFor(user, null) : '/';
  return (
    <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6" data-testid="not-found">
      <div className="max-w-md w-full text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide">404</p>
        <h1 className="mt-2 text-2xl font-semibold">{es ? 'No hay nada en esta dirección' : 'There’s nothing at this address'}</h1>
        <p className="mt-2 text-sm text-gray-400 font-mono break-all">{pathname}</p>
        <p className="mt-4 text-sm text-gray-400">
          {es
            ? 'Si un enlace te trajo aquí, puede ser antiguo. La página pudo moverse, o la dirección tiene un error.'
            : 'If a link brought you here, it may be old. The page may have moved, or the address has a typo.'}
        </p>
        <Link to={home} className="inline-block mt-6 px-5 py-2.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white">
          {user ? (es ? 'Ir a Webb Leads' : 'Go to Webb Leads') : es ? 'Ir a la página principal' : 'Go to the home page'}
        </Link>
        <LangToggle className="mt-8 text-xs text-gray-500 [&_button]:text-gray-400 [&_button[aria-pressed=true]]:text-white" />
      </div>
    </div>
  );
};

export const NotFound: React.FC = () => (
  <LangProvider>
    <NotFoundPage />
  </LangProvider>
);
