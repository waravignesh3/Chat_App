# Toast Notification System

Modern glassmorphism toast notification system with maximum 2 simultaneous popups, positioned above navigation bar.

## Features

✅ **Maximum 2 toasts visible** - New notifications replace oldest (FIFO)  
✅ **Bottom-positioned** - Appears above navigation bar  
✅ **Glassmorphism design** - Modern backdrop blur with dynamic colors  
✅ **11 notification types** - signin, signout, signup, success, error, warning, info, profile, status, theme, settings  
✅ **Auto-dismiss** - 3 seconds default (configurable)  
✅ **Smooth animations** - Slide up/down with easing  
✅ **Closeable** - Click X button to dismiss  
✅ **Accessible** - Proper z-index, focus management  
✅ **Mobile responsive** - Adapts to small screens  

---

## File Structure

```
src/
├── components/
│   ├── Toast.jsx              # Single toast component
│   ├── Toast.css              # Toast styling (glassmorphism)
│   ├── ToastContext.jsx        # Toast provider & hook
│   ├── ToastDemo.jsx           # Demo/testing component
│   └── ToastDemo.css           # Demo styling
└── utils/
    └── toastHelpers.js         # Toast helper functions
```

---

## Installation & Setup

### Step 1: Wrap App with ToastProvider

In your `App.jsx` or `main.jsx`:

```jsx
import { ToastProvider } from '@/components/ToastContext';

function App() {
  return (
    <ToastProvider>
      {/* Your app components */}
    </ToastProvider>
  );
}

export default App;
```

### Step 2: Use Toast in Components

```jsx
import { useToast } from '@/components/ToastContext';
import { createToastHelpers } from '@/utils/toastHelpers';

function MyComponent() {
  const { showToast } = useToast();
  const toast = createToastHelpers(showToast);

  // Now use toast helpers throughout component
  const handleSignIn = async () => {
    try {
      // ... sign in logic
      toast.signIn('Welcome back!');
    } catch (err) {
      toast.error('Sign in failed');
    }
  };

  return <button onClick={handleSignIn}>Sign In</button>;
}
```

---

## Available Toast Types

### Authentication

```jsx
toast.signIn('Welcome back!')           // 🔐 Cyan
toast.signOut('Goodbye!')                // 🚪 Purple
toast.signUp('Account created!')         // ➕ Pink
```

### Status

```jsx
toast.success('Done!')                   // ✓ Indigo
toast.error('Failed!')                   // ✕ Red
toast.warning('Be careful!')             // ⚠ Orange
toast.info('FYI')                        // ℹ Blue
toast.status('Status: Online')           // 🔘 Green
```

### User Actions

```jsx
toast.profile('Profile updated')         // 👤 Purple
toast.theme('Theme changed')             // 🎨 Indigo
toast.settings('Settings saved')         // ⚙ Blue
```

---

## API Reference

### useToast Hook

```jsx
const { showToast } = useToast();

showToast(message, type, duration, icon)
```

**Parameters:**
- `message` (string) - Notification text
- `type` (string) - One of: `success`, `error`, `warning`, `info`, `signin`, `signout`, `signup`, `profile`, `status`, `theme`, `settings`
- `duration` (number) - Milliseconds before auto-dismiss (default: 3000)
- `icon` (string) - Optional custom emoji/icon

**Returns:** void

### createToastHelpers

Helper factory for convenient toast methods:

```jsx
const toast = createToastHelpers(showToast);
toast.success(message, duration);
toast.error(message, duration);
// ... etc
```

---

## Color Palette

| Type | Color | RGB | Hex |
|------|-------|-----|-----|
| signin | Cyan | rgb(6, 182, 212) | #06B6D4 |
| signout | Purple | rgb(139, 92, 246) | #8B5CF6 |
| signup | Pink | rgb(236, 72, 153) | #EC4899 |
| success | Indigo | rgb(99, 102, 241) | #6366F1 |
| error | Red | rgb(239, 68, 68) | #EF4444 |
| warning | Orange | rgb(245, 158, 11) | #F59E0B |
| info | Blue | rgb(59, 130, 246) | #3B82F6 |
| profile | Purple | rgb(168, 85, 247) | #A855F7 |
| status | Green | rgb(34, 197, 94) | #22C55E |
| theme | Indigo | rgb(99, 102, 241) | #6366F1 |
| settings | Blue | rgb(59, 130, 246) | #3B82F6 |

---

## Positioning & Z-Index

- **Position:** `fixed` bottom (above nav bar)
- **Bottom offset:** `calc(70px + 16px)` (nav height + padding)
- **Max width:** 380px
- **Z-index:** `250` (above modals, below highest overlays)

---

## Styling Details

### Glassmorphism Effect

```css
backdrop-filter: blur(12px);
background: rgba(30, 41, 59, 0.85);
border: 1px solid rgba(99, 102, 241, 0.15);
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 
            0 0 1px rgba(99, 102, 241, 0.4);
```

### Animations

- **Slide Up:** 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
- **Slide Out:** Same timing, reversed
- **Hover:** translateY(-2px), enhanced shadow

---

## Example: Complete Implementation

```jsx
// auth.jsx
import { useToast } from '@/components/ToastContext';
import { createToastHelpers } from '@/utils/toastHelpers';

export function useAuthToasts() {
  const { showToast } = useToast();
  const toast = createToastHelpers(showToast);

  return {
    signInSuccess: (name) => toast.signIn(`Welcome back, ${name}!`),
    signOutSuccess: () => toast.signOut('You have been signed out'),
    signUpSuccess: () => toast.signUp('Account created successfully!'),
    signInError: () => toast.error('Sign in failed. Check your credentials'),
    signUpError: () => toast.error('Sign up failed. Email may already exist'),
  };
}

// LoginPage.jsx
import { useAuthToasts } from '@/lib/auth';

function LoginPage() {
  const authToasts = useAuthToasts();

  const handleLogin = async (credentials) => {
    try {
      const user = await loginUser(credentials);
      authToasts.signInSuccess(user.name);
    } catch (error) {
      authToasts.signInError();
    }
  };

  return <form onSubmit={handleLogin}>{/* form fields */}</form>;
}
```

---

## Testing

Use the included `ToastDemo` component:

```jsx
import ToastDemo from '@/components/ToastDemo';

// In your test page:
<ToastDemo />
```

Click any button to test that notification type.

---

## Behavior

### Queue Management

- Max 2 visible toasts
- 3rd notification removes 1st automatically
- FIFO (First In, First Out) order
- All animations smooth

### Auto-dismiss

- Default: 3000ms
- Customizable per toast
- Can be dismissed by user clicking X
- Toast removed from queue on close

### Mobile

- Responsive layout
- Adapts to small screens
- Touch-friendly close button
- Maintains z-index above nav

---

## Customization

### Modify Default Duration

```jsx
toast.success('Custom message', 5000); // 5 seconds
```

### Custom Icon

```jsx
showToast('Custom message', 'success', 3000, '🎉');
```

### Adjust Z-Index

In `Toast.css`:
```css
.toast-wrapper {
  z-index: 300; /* Change as needed */
}
```

### Change Position

In `Toast.css`:
```css
.toast-wrapper {
  bottom: calc(80px + 20px); /* Adjust for different nav height */
}
```

---

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

---

## Accessibility

- Proper color contrast
- Semantic HTML
- Keyboard dismissible (click X)
- Screen reader friendly
- Appropriate z-index management

---

## License

Part of Chat App Project