import { createContext, useContext, ReactNode } from "react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// User type
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  organizationId?: string;
  role?: 'user' | 'admin' | 'super_admin';
}

interface AuthContextType {
  user: User | null;
  session: { user: User; access_token: string } | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (params: {
    email: string;
    password: string;
    flow: 'signIn' | 'signUp';
    name?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AFTER_SIGN_IN = '/profit-tracker';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  const { signIn, signOut: convexSignOut } = useAuthActions();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  // Signed in but the profile hasn't loaded yet still counts as loading.
  const isLoading = authLoading || (isAuthenticated && me === undefined);
  const user: User | null = isAuthenticated && me ? me : null;

  const signInWithGoogle = async () => {
    try {
      await signIn('google', { redirectTo: AFTER_SIGN_IN });
    } catch (error) {
      console.error('Error initiating Google sign-in:', error);
    }
  };

  const signInWithPassword: AuthContextType['signInWithPassword'] = async ({ email, password, flow, name }) => {
    await signIn('password', { email, password, flow, ...(name ? { name } : {}) });
  };

  const signOut = async () => {
    await convexSignOut();
    window.location.href = '/';
  };

  const value: AuthContextType = {
    user,
    session: user ? { user, access_token: token ?? '' } : null,
    isLoading,
    signInWithGoogle,
    signInWithPassword,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
