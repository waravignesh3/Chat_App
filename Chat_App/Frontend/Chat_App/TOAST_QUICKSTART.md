# Toast Notifications - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Wrap Your App
In `main.jsx` or `App.jsx`:

```jsx
import { ToastProvider } from '@/components/ToastContext';

export default function App() {
  return (
    <ToastProvider>
      {/* Your components */}
    </ToastProvider>
  );
}
```

### 2. Use in Any Component
```jsx
import { useToast } from '@/components/ToastContext';
import { createToastHelpers } from '@/utils/toastHelpers';

export function LoginPage() {
  const { showToast } = useToast();
  const toast = createToastHelpers(showToast);

  const handleLogin = async (credentials) => {
    try {
      const user = await loginUser(credentials);
      toast.signIn(`Welcome back, ${user.name}!`);
      navigate('/dashboard');
    } catch (error) {
      toast.error('Login failed');
    }
  };

  return <form onSubmit={handleLogin}>...</form>;
}
```

---

## 📋 All Toast Types

```jsx
// Authentication
toast.signIn('message')      // 🔐 Cyan
toast.signOut('message')     // 🚪 Purple  
toast.signUp('message')      // ➕ Pink

// Feedback
toast.success('message')     // ✓ Indigo
toast.error('message')       // ✕ Red
toast.warning('message')     // ⚠ Orange
toast.info('message')        // ℹ Blue

// User Actions
toast.profile('message')     // 👤 Purple
toast.status('message')      // 🔘 Green
toast.theme('message')       // 🎨 Indigo
toast.settings('message')    // ⚙ Blue
```

---

## ⚙️ Configuration

### Custom Duration
```jsx
toast.success('Done!', 5000); // Show for 5 seconds
```

### Custom Icon
```jsx
showToast('Custom!', 'success', 3000, '🎉');
```

---

## 📍 Key Features

- ✅ Max 2 toasts visible
- ✅ Positioned above nav bar
- ✅ Modern glassmorphism design
- ✅ Auto-dismisses after 3s
- ✅ Closeable with X button
- ✅ FIFO queue management
- ✅ Smooth animations
- ✅ Mobile responsive

---

## 🎨 Design Details

**Position:** Fixed bottom, above navigation  
**Max Width:** 380px  
**Z-Index:** 250 (above modals)  
**Animation:** 0.3s slide-up  
**Glassmorphism:** Blur + semi-transparent background

---

## 📝 Common Patterns

### Sign In Success
```jsx
toast.signIn(`Welcome back, ${username}!`);
navigate('/dashboard');
```

### Form Error
```jsx
try {
  await submitForm(data);
  toast.success('Saved successfully');
} catch (error) {
  toast.error(error.message);
}
```

### Profile Update
```jsx
await updateProfile(newData);
toast.profile('Profile updated');
```

### Theme Toggle
```jsx
toggleTheme();
toast.theme('Dark theme activated');
```

### Settings Save
```jsx
await saveSettings();
toast.settings('Settings saved');
```

### Status Update
```jsx
await setUserStatus('online');
toast.status('Status: 🟢 Online');
```

---

## 📚 Files

- `components/Toast.jsx` - Toast component
- `components/ToastContext.jsx` - Provider & hook
- `components/Toast.css` - Styling
- `components/ToastDemo.jsx` - Testing component
- `utils/toastHelpers.js` - Helper functions
- `components/TOAST_README.md` - Full documentation
- `utils/TOAST_INTEGRATION.md` - Integration examples

---

## 🧪 Test It

View demo component:
```jsx
import ToastDemo from '@/components/ToastDemo';

export function TestPage() {
  return <ToastDemo />;
}
```

---

## 💡 Pro Tips

1. Create custom hooks for each feature:
   ```jsx
   export function useAuthToasts() {
     const { showToast } = useToast();
     const toast = createToastHelpers(showToast);
     return {
       signInSuccess: (name) => toast.signIn(`Welcome ${name}`),
       signInError: () => toast.error('Login failed'),
     };
   }
   ```

2. Use descriptive messages:
   ```jsx
   // Good
   toast.error('Email already registered');
   
   // Bad
   toast.error('Error');
   ```

3. Combine with other feedback:
   ```jsx
   // Show toast + redirect after delay
   toast.signOut('Goodbye!');
   setTimeout(() => navigate('/login'), 1500);
   ```

---

## ❓ FAQ

**Q: Can I show more than 2 toasts?**  
A: No, max is 2 by design. Older toasts auto-remove.

**Q: Can I change the duration?**  
A: Yes! Pass duration as 2nd parameter: `toast.success('msg', 5000)`

**Q: Can I position toasts differently?**  
A: Edit `Toast.css` `.toast-wrapper` bottom/left values

**Q: Are toasts accessible?**  
A: Yes - proper color contrast, semantics, and keyboard support

**Q: Works on mobile?**  
A: Yes! Responsive design included

---

## 🔗 Quick Links

- Full docs: `components/TOAST_README.md`
- Integration guide: `utils/TOAST_INTEGRATION.md`
- Helper functions: `utils/toastHelpers.js`
- Demo: `components/ToastDemo.jsx`

---

## 📞 Support

For issues or questions, see the documentation files or contact the team.

---

**Happy notifying! 🎉**