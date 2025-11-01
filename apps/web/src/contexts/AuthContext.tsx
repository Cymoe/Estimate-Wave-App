import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// User type
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  organizationId?: string;
}

interface AuthContextType {
  user: User | null;
  session: { user: User; access_token: string } | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ user: User; access_token: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verify token and get user on mount
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) {
          console.error('VITE_API_URL not configured');
          setIsLoading(false);
          return;
        }

        const response = await fetch(`${apiUrl}/api/auth/verify`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const userData: User = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            picture: data.user.picture,
            organizationId: data.user.organizationId,
          };
          
          setUser(userData);
          setSession({
            user: userData,
            access_token: token,
          });
        } else {
          // Invalid token, remove it
          localStorage.removeItem('auth_token');
        }
      } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('auth_token');
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error('VITE_API_URL not configured');
        return;
      }

      // Get the OAuth URL from backend
      const response = await fetch(`${apiUrl}/api/auth/google`);
      const data = await response.json();

      if (data.url) {
        // Redirect to Google OAuth
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error initiating Google sign-in:', error);
    }
  };

  const signOut = async () => {
    // Remove token
    localStorage.removeItem('auth_token');
    
    // Clear state
    setUser(null);
    setSession(null);
    
    // Redirect to home
    window.location.href = '/';
  };

  const value = {
    user,
    session,
    isLoading,
    signInWithGoogle,
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
