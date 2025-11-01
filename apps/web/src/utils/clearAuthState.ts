// Run this in your browser console to clear auth state

export function clearAuthState() {
  console.log('Clearing auth state...');
  
  // Clear localStorage
  localStorage.removeItem('billbreeze-auth');
  localStorage.removeItem('supabase.auth.token');
  
  // Clear all supabase-related items
  Object.keys(localStorage).forEach(key => {
    if (key.includes('supabase') || key.includes('billbreeze')) {
      console.log('Removing:', key);
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ Auth state cleared. Please refresh the page.');
}

// Usage: import and call clearAuthState() or run this in console:
// localStorage.clear(); location.reload();

