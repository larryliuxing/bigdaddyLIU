export function UserAvatarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill="url(#avatarGrad)" opacity="0.25" />
      <circle cx="32" cy="24" r="10" fill="#8b7cff" />
      <path
        d="M14 50c2.5-10 10-15 18-15s15.5 5 18 15"
        stroke="#8b7cff"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="avatarGrad" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#8b7cff" />
          <stop offset="1" stopColor="#4c3db8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" fill="#e8a84a" />
      <path
        d="M8 11V8a4 4 0 1 1 8 0v3"
        stroke="#e8a84a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GavelIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13.5 4.5 19 10l-2 2-5.5-5.5 2-2Z"
        fill="#d4a574"
      />
      <path d="M4 20h10" stroke="#d4a574" strokeWidth="2" strokeLinecap="round" />
      <path
        d="m8.5 13.5 5-5 2 2-5 5-2-2Z"
        fill="#c4895a"
      />
      <path d="M7 16.5 4.5 19" stroke="#c4895a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TimerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="7" stroke="#c9d4e8" strokeWidth="2" />
      <path d="M12 13V9" stroke="#c9d4e8" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 4h6" stroke="#c9d4e8" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 4v2" stroke="#c9d4e8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h8v4a4 4 0 0 1-8 0V4Z"
        fill="#e8c15a"
      />
      <path d="M8 6H5a2 2 0 0 0 2 3h1" stroke="#e8c15a" strokeWidth="1.8" />
      <path d="M16 6h3a2 2 0 0 1-2 3h-1" stroke="#e8c15a" strokeWidth="1.8" />
      <path d="M12 12v2" stroke="#e8c15a" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 20h6" stroke="#e8c15a" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 18h4v2h-4v-2Z" fill="#e8c15a" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .05-2l2.05-1.6-2-3.46-2.45.9a7.7 7.7 0 0 0-1.73-1L15 3h-6l-.32 2.84a7.7 7.7 0 0 0-1.73 1l-2.45-.9-2 3.46L4.55 11a7.8 7.8 0 0 0 0 2l-2.05 1.6 2 3.46 2.45-.9a7.7 7.7 0 0 0 1.73 1L9 21h6l.32-2.84a7.7 7.7 0 0 0 1.73-1l2.45.9 2-3.46L19.4 13Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
