import { createContext, useContext, useEffect, useState } from "react";
// Supabase removed - using mock auth for now
// import { supabase } from "../lib/supabase";
// import { Session, User } from "@supabase/supabase-js";

// Mock types to replace Supabase
type User = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
};

type Session = {
  user: User;
  access_token: string;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<{ provider: string; url: string; } | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // TEMPORARY: Skip auth for development (Supabase is paused)
    // TODO: Remove this when Supabase is restored or JWT auth is implemented
    const SKIP_AUTH = true;
    
    if (SKIP_AUTH) {
      // Create a mock user for development
      const mockUser = {
        id: 'dev-user-123',
        email: '2mylescameron@gmail.com',
        user_metadata: {
          full_name: 'Myles Cameron',
        },
      } as User;
      
      const mockSession = {
        user: mockUser,
        access_token: 'dev-token',
      } as Session;
      
      setUser(mockUser);
      setSession(mockSession);
      setIsLoading(false);
      return;
    }
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      // Match the exact URL from Supabase settings
      const redirectTo = window.location.origin + '/auth/callback';
      const site = window.location.origin;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'email profile',
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
            site
          }
        }
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from sign in');
      }

      return data;
    } catch (err: any) {
      throw new Error(`Google sign in failed: ${err.message}`);
    }
  };

  const signOut = async () => {
    try {
      // First try to sign out normally
      const { error } = await supabase.auth.signOut();
      
      // If we get an auth session missing error, just clear local state
      if (error && error.message === 'Auth session missing!') {
        // Clear local storage
        window.localStorage.removeItem('billbreeze-auth');
        
        // Clear state
        setUser(null);
        setSession(null);
        
        // Navigate to home
        window.location.href = '/';
        return;
      }
      
      if (error) throw error;
      
      // Navigate to home after successful sign out
      window.location.href = '/';
    } catch (error) {
      // If all else fails, force clear and redirect
      window.localStorage.removeItem('billbreeze-auth');
      setUser(null);
      setSession(null);
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, isLoading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
