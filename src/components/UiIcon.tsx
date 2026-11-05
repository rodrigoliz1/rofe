import type { SVGProps } from 'react';
export type UiIconName = 'card' | 'cash' | 'check' | 'search' | 'arrow' | 'grid' | 'coffee' | 'chart' | 'box' | 'users' | 'lock' | 'refresh' | 'terminal' | 'home' | 'plus' | 'minus' | 'bag' | 'pin' | 'qr' | 'download';
const paths: Record<UiIconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  bag: <><path d="M5 7h14l2 14H3ZM8 8V6a4 4 0 0 1 8 0v2" /></>,
  pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  qr: <><path d="M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3ZM15 15h3v3h3v3h-6ZM18 12h3M12 3v3m0 6v6m0 3h.01" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h3" /></>,
  cash: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  coffee: <><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2" /></>,
  chart: <path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4" />,
  box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M8 5l9 4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></>,
  terminal: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M9 6h6v5H9ZM9 15h.01M12 15h.01M15 15h.01M9 18h6" /></>,
  home: <><path d="m3 10 9-7 9 7v10H3ZM9 20v-7h6v7" /></>,
};
export function UiIcon({ name, size = 20, ...props }: { name: UiIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
