import React from 'react';

export const Icon = ({ name, size = 18, className = '' }) => {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  };
  switch (name) {
    case 'grid':
      return <svg {...props}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'refresh':
      return <svg {...props}><path d="M21 12a9 9 0 1 1-2.2-5.8" /><path d="M21 4v6h-6" /></svg>;
    case 'trash':
      return <svg {...props}><path d="M4 7h16M9 7V5h6v2M6 7l1 14h10l1-14" /></svg>;
    case 'play':
      return <svg {...props}><path d="M8 5v14l11-7z" /></svg>;
    case 'logout':
      return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>;
    case 'user':
      return <svg {...props}><circle cx="12" cy="8" r="3.2" /><path d="M5 19a7 7 0 0 1 14 0" /></svg>;
    case 'filter':
      return <svg {...props}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
    case 'check':
      return <svg {...props}><path d="M20 6 9 17l-5-5" /></svg>;
    default:
      return null;
  }
};
