import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const EspressoIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Small cup */}
    <path d="M6 8v5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8H6z" />
    {/* Handle */}
    <path d="M18 10h1.5a1.5 1.5 0 0 1 1.5 1.5v0a1.5 1.5 0 0 1-1.5 1.5H18" />
    {/* Liquid line (1/3 full) */}
    <line x1="7" y1="13" x2="17" y2="13" strokeDasharray="1 1" />
    {/* Plate */}
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

export const DoubleEspressoIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 8v5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8H6z" />
    <path d="M18 10h1.5a1.5 1.5 0 0 1 1.5 1.5v0a1.5 1.5 0 0 1-1.5 1.5H18" />
    {/* Liquid line (2/3 full) */}
    <line x1="7" y1="11" x2="17" y2="11" strokeDasharray="1 1" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

export const AmericanoIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Larger mug */}
    <path d="M5 6v10a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V6H5z" />
    {/* Mug Handle */}
    <path d="M19 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    {/* Liquid line (mostly full) */}
    <line x1="6" y1="9" x2="18" y2="9" strokeDasharray="2 1" />
  </svg>
);

export const LatteIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 6v10a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V6H5z" />
    <path d="M19 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    {/* Foam layers */}
    <path d="M6 10c2-1 4 1 6 0s4-1 6 0" />
    <path d="M6 14c2-0.5 4 0.5 6 0s4-0.5 6 0" />
  </svg>
);

export const ColdBrewIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Tall tumbler glass */}
    <path d="M6 3h12l-2 18H8L6 3z" />
    {/* Ice cubes */}
    <rect x="9" y="8" width="3" height="3" rx="0.5" transform="rotate(15 9 8)" />
    <rect x="12" y="13" width="3" height="3" rx="0.5" transform="rotate(-10 12 13)" />
    {/* Straw */}
    <line x1="15" y1="2" x2="11" y2="12" />
    {/* Liquid line */}
    <line x1="6.5" y1="7" x2="17.5" y2="7" />
  </svg>
);

export const CroissantIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Minimalist crescent croissant outline */}
    <path d="M3 14c2-2 5-3 9-3s7 1 9 3c-1.5-3.5-4.5-6-9-6S4.5 10.5 3 14z" />
    <path d="M6 12.5C7.5 11 9 10 12 10s4.5 1 6 2.5" />
    {/* Curved ridges */}
    <path d="M8.5 7.5c.5 1.5.5 3 0 4.5" />
    <path d="M12 7v5" />
    <path d="M15.5 7.5c-.5 1.5-.5 3 0 4.5" />
  </svg>
);

export const PainChocIcon: React.FC<IconProps> = ({ size = 48, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Rounded puff pastry box */}
    <rect x="4" y="6" width="16" height="12" rx="2" />
    {/* Diagonal chocolate stripes or layered pastry lines */}
    <path d="M7 6v12M17 6v12" strokeDasharray="3 3" />
    <path d="M4 11h16" />
    <path d="M4 14h16" />
  </svg>
);

interface ProductIconProps extends IconProps {
  name: string;
}

export const ProductIcon: React.FC<ProductIconProps> = ({ name, ...props }) => {
  switch (name) {
    case 'espresso':
      return <EspressoIcon {...props} />;
    case 'double_espresso':
      return <DoubleEspressoIcon {...props} />;
    case 'americano':
      return <AmericanoIcon {...props} />;
    case 'latte':
      return <LatteIcon {...props} />;
    case 'cold_brew':
      return <ColdBrewIcon {...props} />;
    case 'croissant':
      return <CroissantIcon {...props} />;
    case 'pain_choc':
      return <PainChocIcon {...props} />;
    default:
      return <EspressoIcon {...props} />;
  }
};
