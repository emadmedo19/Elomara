import React from 'react';

// Both assets retain their original colours; CSS follows the app preference,
// including explicit dark mode when the phone itself is set to light.
export function BrandLogo({ className = '', id }: { className?: string; id?: string }) {
  return <span id={id} className={`brand-logo ${className}`}>
    <img src="/brand-lockup.png" alt="العمارة" className="brand-logo-light"/>
    <img src="/brand-lockup-dark.png" alt="العمارة" className="brand-logo-dark"/>
  </span>;
}
