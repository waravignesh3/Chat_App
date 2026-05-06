import React from 'react';
import { useToast } from './ToastContext';
import { createToastHelpers } from '../utils/toastHelpers';
import './ToastDemo.css';

/**
 * ToastDemo Component
 * Showcases all toast notification types
 * Use this for testing and reference
 */

const ToastDemo = () => {
  const { showToast } = useToast();
  const toast = createToastHelpers(showToast);

  const demoButtons = [
    { label: 'Success', onClick: () => toast.success('✓ Operation completed successfully!'), color: 'success' },
    { label: 'Error', onClick: () => toast.error('✕ An error occurred'), color: 'error' },
    { label: 'Warning', onClick: () => toast.warning('⚠ Please review this warning'), color: 'warning' },
    { label: 'Info', onClick: () => toast.info('ℹ Here is some information'), color: 'info' },
    { label: 'Sign In', onClick: () => toast.signIn('🔐 Welcome back, User!'), color: 'signin' },
    { label: 'Sign Out', onClick: () => toast.signOut('🚪 You have been signed out'), color: 'signout' },
    { label: 'Sign Up', onClick: () => toast.signUp('➕ Account created successfully'), color: 'signup' },
    { label: 'Theme Changed', onClick: () => toast.theme('🎨 Theme switched to dark mode'), color: 'theme' },
    { label: 'Profile Updated', onClick: () => toast.profile('👤 Profile picture updated'), color: 'profile' },
    { label: 'Status Updated', onClick: () => toast.status('🔘 Status set to online'), color: 'status' },
    { label: 'Settings Saved', onClick: () => toast.settings('⚙ Settings have been saved'), color: 'settings' },
  ];

  return (
    <div className="toast-demo-container">
      <div className="toast-demo-header">
        <h3>Toast Notification Demo</h3>
        <p>Click any button to test notifications</p>
      </div>
      <div className="toast-demo-grid">
        {demoButtons.map((btn, idx) => (
          <button
            key={idx}
            className={`toast-demo-btn toast-demo-${btn.color}`}
            onClick={btn.onClick}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="toast-demo-info">
        <p>• Maximum 2 toasts visible at once</p>
        <p>• New notifications appear at bottom</p>
        <p>• Positioned above navigation bar</p>
        <p>• Auto-dismisses after 3 seconds</p>
      </div>
    </div>
  );
};

export default ToastDemo;