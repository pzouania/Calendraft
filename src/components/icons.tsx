export const ICON_KEYS = [
  'calendar',
  'briefcase',
  'home',
  'users',
  'heart',
  'book',
  'moon',
  'sun',
  'star',
  'plane',
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

const PATHS: Record<string, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 13c2.8 0 5 2.2 5 5" />
    </>
  ),
  heart: (
    <path d="M12 21s-7.5-4.6-10-9.3C.5 8 2.4 4 6.4 4c2 0 3.6 1 5.6 3.3C14 5 15.6 4 17.6 4c4 0 5.9 4 4.4 7.7C19.5 16.4 12 21 12 21z" />
  ),
  book: (
    <>
      <path d="M4 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z" />
      <path d="M20 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  star: <path d="M12 2l3 7h7l-5.6 4.3L18.5 21 12 16.7 5.5 21l2.1-7.7L2 9h7z" />,
  plane: (
    <path d="M10.5 14.5L3 12l1.5-1.5L9 12l6-9h2.5L13 11l5.5 1.5-4.5 4L15 21h-2.5l-2-6.5L8 17.5v-3z" />
  ),
};

export default function Icon({
  name,
  size = 20,
  color = 'currentColor',
}: IconProps) {
  const path = PATHS[name] ?? PATHS.calendar;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}
