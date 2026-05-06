/**
 * Toast Notification Helpers
 * Usage: import { toastSuccess, toastError, etc } from './utils/toastHelpers'
 * 
 * Features:
 * - Maximum 2 toasts visible simultaneously
 * - Positioned above navigation bar
 * - Modern glassmorphism styling with dynamic colors
 * - Auto-dismisses after 3 seconds (configurable)
 * - Supports 11 notification types
 */

/**
 * Toast notification hook must be used within component:
 * const { showToast } = useToast();
 */

// ═══════════════════════════════════════════════════════
// NOTIFICATION TYPES & USAGE
// ═══════════════════════════════════════════════════════

/**
 * @param {Function} showToast - From useToast hook
 * @param {string} message - Notification message
 * @param {number} duration - Duration in ms (default: 3000)
 * @param {string} icon - Optional custom icon/emoji
 */

export const createToastHelpers = (showToast) => ({
  /**
   * Success notification - Green/Indigo
   * Usage: toastSuccess("Profile updated successfully")
   */
  success: (message, duration = 3000) => {
    showToast(message, 'success', duration, '✓');
  },

  /**
   * Error notification - Red
   * Usage: toastError("Failed to update profile")
   */
  error: (message, duration = 3000) => {
    showToast(message, 'error', duration, '✕');
  },

  /**
   * Warning notification - Orange
   * Usage: toastWarning("Unsaved changes will be lost")
   */
  warning: (message, duration = 3000) => {
    showToast(message, 'warning', duration, '⚠');
  },

  /**
   * Info notification - Blue
   * Usage: toastInfo("New message received")
   */
  info: (message, duration = 3000) => {
    showToast(message, 'info', duration, 'ℹ');
  },

  /**
   * Sign In notification - Cyan
   * Usage: toastSignIn("Welcome back, John!")
   */
  signIn: (message, duration = 3000) => {
    showToast(message, 'signin', duration, '🔐');
  },

  /**
   * Sign Out notification - Purple
   * Usage: toastSignOut("You've been signed out")
   */
  signOut: (message, duration = 3000) => {
    showToast(message, 'signout', duration, '🚪');
  },

  /**
   * Sign Up notification - Pink
   * Usage: toastSignUp("Account created successfully!")
   */
  signUp: (message, duration = 3000) => {
    showToast(message, 'signup', duration, '➕');
  },

  /**
   * Theme Change notification - Indigo
   * Usage: toastTheme("Dark theme activated")
   */
  theme: (message, duration = 3000) => {
    showToast(message, 'theme', duration, '🎨');
  },

  /**
   * Profile Update notification - Purple
   * Usage: toastProfile("Profile picture updated")
   */
  profile: (message, duration = 3000) => {
    showToast(message, 'profile', duration, '👤');
  },

  /**
   * Status Update notification - Green
   * Usage: toastStatus("Status set to online")
   */
  status: (message, duration = 3000) => {
    showToast(message, 'status', duration, '🔘');
  },

  /**
   * Settings Update notification - Blue
   * Usage: toastSettings("Settings saved")
   */
  settings: (message, duration = 3000) => {
    showToast(message, 'settings', duration, '⚙');
  },
});

// ═══════════════════════════════════════════════════════
// USAGE EXAMPLES
// ═══════════════════════════════════════════════════════

/*
EXAMPLE IN COMPONENT:

import { useToast } from '@/components/ToastContext';
import { createToastHelpers } from '@/utils/toastHelpers';

function MyComponent() {
  const { showToast } = useToast();
  const toast = createToastHelpers(showToast);

  const handleSignIn = async () => {
    try {
      // ... sign in logic
      toast.signIn('Welcome back!');
    } catch (err) {
      toast.error('Sign in failed');
    }
  };

  const handleProfileUpdate = async () => {
    try {
      // ... update profile
      toast.profile('Profile updated successfully');
    } catch (err) {
      toast.error('Update failed');
    }
  };

  const handleThemeChange = () => {
    // ... theme change logic
    toast.theme('Theme changed to dark mode');
  };

  const handleSettingsChange = () => {
    // ... settings update
    toast.settings('Settings saved');
  };

  const handleStatusUpdate = () => {
    // ... status update
    toast.status('Status set to online');
  };

  return (
    <div>
      <button onClick={handleSignIn}>Sign In</button>
      <button onClick={handleSignOut}>Sign Out</button>
      <button onClick={handleSignUp}>Sign Up</button>
      <button onClick={handleProfileUpdate}>Update Profile</button>
      <button onClick={handleThemeChange}>Change Theme</button>
      <button onClick={handleSettingsChange}>Save Settings</button>
      <button onClick={handleStatusUpdate}>Update Status</button>
    </div>
  );
}

NOTIFICATION TYPES & COLORS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  signin    → Cyan (#06B6D4)       - User authentication
  signout   → Purple (#8B5CF6)     - Logout confirmation
  signup    → Pink (#EC4899)       - Account creation
  success   → Indigo (#6366F1)     - Success/confirm
  error     → Red (#EF4444)        - Error/failure
  warning   → Orange (#F59E0B)     - Caution
  info      → Blue (#3B82F6)       - Information
  profile   → Purple (#A855F7)     - Profile updates
  theme     → Indigo (#6366F1)     - Theme changes
  status    → Green (#22C55E)      - Status updates
  settings  → Blue (#3B82F6)       - Settings changes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FEATURES:
✓ Maximum 2 toasts visible at once
✓ New notifications appear at bottom
✓ Old notifications removed from top (FIFO)
✓ Positioned above navigation bar
✓ Auto-dismisses after 3000ms
✓ Glassmorphism styling
✓ Smooth animations
✓ Modern color palette
✓ Closeable with X button
✓ Hover effects
*/