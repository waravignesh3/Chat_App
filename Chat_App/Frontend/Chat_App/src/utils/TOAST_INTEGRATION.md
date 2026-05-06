/**
 * INTEGRATION GUIDE: Toast Notifications
 * 
 * Quick reference for adding toasts to existing components
 */

// ═══════════════════════════════════════════════════════
// AUTHENTICATION COMPONENTS
// ═══════════════════════════════════════════════════════

/**
 * SIGN IN (components/login.jsx)
 */

// import { useToast } from './ToastContext';
// import { createToastHelpers } from '../utils/toastHelpers';

// function LoginPage() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       const response = await fetch('/api/auth/signin', { ... });
//       const user = await response.json();
//       
//       // SUCCESS: Show signin toast
//       toast.signIn(`Welcome back, ${user.username}!`);
//       // Redirect to dashboard
//       navigate('/dashboard');
//     } catch (error) {
//       // ERROR: Show error toast
//       toast.error('Invalid email or password');
//     }
//   };
//   return <form onSubmit={handleSubmit}>...</form>;
// }


// ═══════════════════════════════════════════════════════
// SIGN UP (components/signup.jsx)
// ═══════════════════════════════════════════════════════

// function SignupPage() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       const response = await fetch('/api/auth/signup', { ... });
//       
//       // SUCCESS: Show signup toast
//       toast.signUp('Account created! Signing you in...');
//       
//       // Auto-redirect after toast shows
//       setTimeout(() => navigate('/dashboard'), 1500);
//     } catch (error) {
//       if (error.message.includes('already exists')) {
//         toast.error('Email already registered');
//       } else {
//         toast.error('Sign up failed. Please try again');
//       }
//     }
//   };
//   return <form onSubmit={handleSubmit}>...</form>;
// }


// ═══════════════════════════════════════════════════════
// SIGN OUT (e.g., header or nav)
// ═══════════════════════════════════════════════════════

// function LogoutButton() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   const handleLogout = async () => {
//     try {
//       await fetch('/api/auth/signout', { method: 'POST' });
//       
//       // SUCCESS: Show signout toast
//       toast.signOut('You have been signed out');
//       
//       // Redirect after toast
//       setTimeout(() => navigate('/login'), 1500);
//     } catch (error) {
//       toast.error('Failed to sign out');
//     }
//   };

//   return <button onClick={handleLogout}>Sign Out</button>;
// }


// ═══════════════════════════════════════════════════════
// PROFILE UPDATES
// ═══════════════════════════════════════════════════════

// function ProfileSettings() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   const updateProfilePicture = async (file) => {
//     try {
//       const formData = new FormData();
//       formData.append('avatar', file);
//       
//       const response = await fetch('/api/user/profile/avatar', {
//         method: 'POST',
//         body: formData
//       });
//       
//       // SUCCESS: Show profile update toast
//       toast.profile('Profile picture updated successfully');
//     } catch (error) {
//       toast.error('Failed to update profile picture');
//     }
//   };

//   const updateBio = async (bio) => {
//     try {
//       await fetch('/api/user/profile/bio', {
//         method: 'PUT',
//         body: JSON.stringify({ bio })
//       });
//       
//       toast.profile('Bio updated');
//     } catch (error) {
//       toast.error('Failed to update bio');
//     }
//   };

//   return <div>...</div>;
// }


// ═══════════════════════════════════════════════════════
// STATUS UPDATES
// ═══════════════════════════════════════════════════════

// function StatusSelector() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   const setStatus = async (status) => {
//     try {
//       await fetch('/api/user/status', {
//         method: 'PUT',
//         body: JSON.stringify({ status })
//       });
//       
//       // SUCCESS: Show status update toast
//       const statusText = status === 'online' ? '🟢 Online' : 
//                          status === 'away' ? '🟡 Away' :
//                          status === 'offline' ? '🔴 Offline' : 'Available';
//       toast.status(`Status set to ${statusText}`);
//     } catch (error) {
//       toast.error('Failed to update status');
//     }
//   };

//   return (
//     <div>
//       <button onClick={() => setStatus('online')}>Online</button>
//       <button onClick={() => setStatus('away')}>Away</button>
//       <button onClick={() => setStatus('offline')}>Offline</button>
//     </div>
//   );
// }


// ═══════════════════════════════════════════════════════
// THEME CHANGES
// ═══════════════════════════════════════════════════════

// function ThemeToggle() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);
//   const [theme, setTheme] = useState('dark');

//   const toggleTheme = () => {
//     const newTheme = theme === 'dark' ? 'light' : 'dark';
//     setTheme(newTheme);
//     document.body.classList.toggle('theme-light');
//     localStorage.setItem('theme', newTheme);
//     
//     // SUCCESS: Show theme change toast
//     const themeName = newTheme === 'dark' ? 'Dark' : 'Light';
//     toast.theme(`Switched to ${themeName} theme`);
//   };

//   return <button onClick={toggleTheme}>Toggle Theme</button>;
// }


// ═══════════════════════════════════════════════════════
// SETTINGS UPDATES
// ═══════════════════════════════════════════════════════

// function SettingsPanel() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);
//   const [settings, setSettings] = useState({});

//   const saveSettings = async () => {
//     try {
//       await fetch('/api/user/settings', {
//         method: 'PUT',
//         body: JSON.stringify(settings)
//       });
//       
//       // SUCCESS: Show settings update toast
//       toast.settings('Settings saved successfully');
//     } catch (error) {
//       toast.error('Failed to save settings');
//     }
//   };

//   const enableNotifications = () => {
//     setSettings(prev => ({ ...prev, notifications: true }));
//     toast.settings('Notifications enabled');
//   };

//   const disableNotifications = () => {
//     setSettings(prev => ({ ...prev, notifications: false }));
//     toast.warning('Notifications disabled');
//   };

//   const updatePrivacy = async (level) => {
//     try {
//       await fetch('/api/user/settings/privacy', {
//         method: 'PUT',
//         body: JSON.stringify({ privacyLevel: level })
//       });
//       toast.settings('Privacy settings updated');
//     } catch (error) {
//       toast.error('Failed to update privacy settings');
//     }
//   };

//   return (
//     <div>
//       <button onClick={enableNotifications}>Enable Notifications</button>
//       <button onClick={disableNotifications}>Disable Notifications</button>
//       <button onClick={saveSettings}>Save All Settings</button>
//     </div>
//   );
// }


// ═══════════════════════════════════════════════════════
// ERROR HANDLING PATTERNS
// ═══════════════════════════════════════════════════════

// // Pattern 1: Try/Catch with specific errors
// async function handleAction() {
//   const toast = createToastHelpers(showToast);
//   try {
//     const result = await apiCall();
//     toast.success('Action completed');
//   } catch (error) {
//     if (error.code === 'AUTH_FAILED') {
//       toast.error('Authentication failed. Please sign in again.');
//     } else if (error.code === 'VALIDATION_ERROR') {
//       toast.warning(`Validation: ${error.message}`);
//     } else {
//       toast.error('An error occurred. Please try again.');
//     }
//   }
// }

// // Pattern 2: Promise-based
// async function handleAction() {
//   const toast = createToastHelpers(showToast);
//   apiCall()
//     .then(result => {
//       toast.success('Success!');
//       return result;
//     })
//     .catch(error => {
//       toast.error(error.message || 'Failed');
//       throw error;
//     });
// }


// ═══════════════════════════════════════════════════════
// UTILITY HOOKS
// ═══════════════════════════════════════════════════════

// /**
//  * Custom hook for managing auth toasts
//  * Usage: const authToasts = useAuthToasts();
//  */
// export function useAuthToasts() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   return {
//     signInSuccess: (username) => 
//       toast.signIn(`Welcome back, ${username}!`),
//     signInError: () => 
//       toast.error('Sign in failed. Check your credentials.'),
//     signUpSuccess: () => 
//       toast.signUp('Account created successfully!'),
//     signUpError: (reason) => 
//       toast.error(reason || 'Sign up failed.'),
//     signOutSuccess: () => 
//       toast.signOut('You have been signed out.'),
//   };
// }

// /**
//  * Custom hook for profile toasts
//  */
// export function useProfileToasts() {
//   const { showToast } = useToast();
//   const toast = createToastHelpers(showToast);

//   return {
//     pictureUpdated: () => 
//       toast.profile('Profile picture updated'),
//     bioUpdated: () => 
//       toast.profile('Bio updated'),
//     usernameUpdated: () => 
//       toast.profile('Username changed'),
//     profileError: (action) => 
//       toast.error(`Failed to update ${action}`),
//   };
// }


// ═══════════════════════════════════════════════════════
// BATCH OPERATIONS
// ═══════════════════════════════════════════════════════

// /**
//  * Show multiple toasts in sequence
//  */
// async function handleMultipleUpdates() {
//   const toast = createToastHelpers(showToast);
//   
//   try {
//     // Update 1
//     await updateProfile();
//     toast.profile('Profile updated');
//     
//     // Update 2 (will remove profile toast and show status)
//     await updateStatus();
//     toast.status('Status updated');
//     
//     // Update 3 (will remove status toast and show settings)
//     await updateSettings();
//     toast.settings('Settings saved');
//   } catch (error) {
//     toast.error('One or more updates failed');
//   }
// }

// // Result: Max 2 visible at a time, showing latest updates


// ═══════════════════════════════════════════════════════
// TIMELINE EXAMPLE
// ═══════════════════════════════════════════════════════

/*
User Actions → Toast Queue

1. Click "Sign In"
   → Show: "🔐 Welcome back!"
   
2. Wait 1 second
   → Show: (same toast)
   
3. Click "Update Profile"
   → Show: "🔐 Welcome back!" + "👤 Profile updated"
   → (now 2 toasts, max reached)
   
4. Click "Change Theme"
   → Show: "👤 Profile updated" + "🎨 Theme changed"
   → (older "Welcome" toast auto-removed)
   
5. User clicks X on profile toast
   → Show: "🎨 Theme changed"
   → (removed manually)
   
6. Auto-dismiss after 3 seconds
   → Show: (nothing)
   → (theme toast time expired)
*/


// ═══════════════════════════════════════════════════════
// NEXT STEPS
// ═══════════════════════════════════════════════════════

/*
1. Wrap your App component with ToastProvider
   
2. Import useToast and createToastHelpers where needed
   
3. Call toast methods after successful/failed operations
   
4. Test with ToastDemo component
   
5. Customize colors/duration as needed
   
6. Remove demo component from production
*/