import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  isAdmin: boolean;
  signUp: (email: string, password: string, metadata?: any) => Promise<{ data: any; error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: AuthError | null }>;
  signOut: () => Promise<void>;
  checkUserRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkUserRole = async () => {
    if (!user) {
      setUserRole(null);
      setIsAdmin(false);
      return;
    }

    try {
      // First check if this is the admin email
      if (user.email === 'admin@elverraglobal.com') {
        setUserRole('admin');
        setIsAdmin(true);
        return;
      }

      // Try to check user roles table, but handle missing table gracefully
      try {
        const { data: roleData, error } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id)
          .order('role');

        if (!error && roleData && roleData.length > 0) {
          // Check if user has admin role
          const hasAdminRole = roleData.some(role => role.role === 'admin');
          
          if (hasAdminRole) {
            setUserRole('admin');
            setIsAdmin(true);
            return;
          }
          
          // Set the highest priority role
          const priorityOrder = ['admin', 'agent', 'merchant', 'user'];
          const userRoles = roleData.map(r => r.role);
          
          for (const role of priorityOrder) {
            if (userRoles.includes(role)) {
              setUserRole(role);
              setIsAdmin(role === 'admin');
              return;
            }
          }
        }
      } catch (roleError: any) {
        // If table doesn't exist (42P01), silently continue with fallback
        if (roleError?.code !== '42P01') {
          console.warn('Error checking user roles, using fallback:', roleError);
        }
      }
      
      // Default to user role
      setUserRole('user');
      setIsAdmin(false);
    } catch (error) {
      console.error('Error checking user role:', error);
      setUserRole('user');
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && session?.user) {
        // Check user role after sign in
        setTimeout(() => {
          checkUserRole();
        }, 1000);
      } else if (event === 'SIGNED_OUT') {
        setUserRole(null);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      checkUserRole();
    }
  }, [user]);

  const signUp = async (email: string, password: string, metadata?: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    
    // If signup is successful and user type is member, they'll need membership
    if (data.user && metadata?.user_type === 'member') {
      // The redirect will be handled in the Register component
    }
    
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Post-login redirect logic will be handled in LoginForm component
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setUserRole(null);
      setIsAdmin(false);
    }
  };

  const value = {
    user,
    session,
    loading,
    userRole,
    isAdmin,
    signUp,
    signIn,
    signOut,
    checkUserRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};