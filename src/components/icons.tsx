import type { ReactNode } from "react";

const S: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  flexShrink: 0,
};

interface IconProps {
  size?: number;
  className?: string;
}

function Icon({ d, size = 16, ...rest }: IconProps & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={S}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

function IconG({ children, size = 16, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={S}
      {...rest}
    >
      {children}
    </svg>
  );
}

function Ico(name: string, d: string): [string, ReactNode] {
  return [name, <Icon key={name} d={d} />];
}

function IcoG(name: string, el: ReactNode): [string, ReactNode] {
  return [name, <IconG key={name}>{el}</IconG>];
}

const icons: Record<string, ReactNode> = {
  ...Object.fromEntries([
    Ico("json-formatter", "M5 3v3c0 1-.5 1.5-.5 2s.5 1 .5 2v3 M11 3v3c0 1 .5 1.5 .5 2s-.5 1-.5 2v3"),

    Ico("curl-runner", "M3 3h10v10H3z M6 7l2 2-2 2 M10 6l1 4"),

    Ico("encode-convert", "M5 13V3M2 6l3-3 3 3 M11 3v10 M9 10l3 3 3-3"),

    Ico("hash", "M5 3h1.2v10H5z M9.8 3H11v10H9.8z M3 6h10 M3 10h10"),

    Ico("regex-tester", "M3 3h10v10H3z M5 7l2-1.5M5 7l2 3M5 7l2 1.5M11 7l-2-1.5M11 7l-2 3M11 7l-2 1.5"),

    Ico("jwt", "M8 2l-2 2v3l-3 1.5 1 3.5 3.5-.5L8 13l.5-1.5 3.5.5 1-3.5-3-1.5V4L8 2z M8 7.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"),

    Ico("param-convert", "M4 4h3v3H4z M9 4h3v3H9z M4 9h3v3H4z M9 9h3v3H9z M7.5 5.5l1 0 M5.5 7.5l0 1 M9.5 7.5l0 1 M7.5 9.5l1 0"),

    Ico("rsa", "M5 11V5a3 3 0 1 1 6 0v6 M5 8h6 M3 13h10"),
  ]),

  ...Object.fromEntries([
    IcoG(
      "json-diff",
      <>
        <rect x="2" y="3" width="5" height="10" rx="1" />
        <rect x="9" y="3" width="5" height="10" rx="1" />
        <line x1="7.5" y1="5" x2="7.5" y2="11" />
        <line x1="4" y1="7" x2="5.5" y2="7" />
        <line x1="4" y1="9" x2="5.5" y2="9" />
        <line x1="10.5" y1="7" x2="12" y2="7" />
        <line x1="10.5" y1="9" x2="12" y2="9" />
      </>,
    ),

    IcoG(
      "log-extractor",
      <>
        <path d="M3 3h10l-4 5v3l-2 1.5V8L3 3z" />
        <line x1="8" y1="3" x2="8" y2="5" />
      </>,
    ),

    IcoG(
      "text-diff",
      <>
        <rect x="3" y="2" width="8" height="8" rx="1" />
        <rect x="5" y="6" width="8" height="8" rx="1" />
        <line x1="6" y1="5" x2="8" y2="5" />
        <line x1="6" y1="7" x2="8" y2="7" />
        <line x1="8" y1="9" x2="10" y2="9" />
        <line x1="8" y1="11" x2="10" y2="11" />
      </>,
    ),

    IcoG(
      "json-table",
      <>
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="2" y1="8" x2="14" y2="8" />
      </>,
    ),

    IcoG(
      "json-field-extract",
      <>
        <rect x="3" y="2" width="10" height="5" rx="1" />
        <line x1="6" y1="4" x2="10" y2="4" />
        <path d="M8 8v5 M5 10l3 3 3-3" />
      </>,
    ),

    IcoG(
      "history",
      <>
        <circle cx="8" cy="8" r="6" />
        <polyline points="13,8 8,8 8,4" />
      </>,
    ),

    IcoG(
      "timestamp",
      <>
        <circle cx="8" cy="8" r="6" />
        <line x1="8" y1="5" x2="8" y2="8" />
        <line x1="8" y1="8" x2="11" y2="8" />
        <polyline points="8,2 8,3" />
        <polyline points="14,8 13,8" />
        <polyline points="2,8 3,8" />
        <polyline points="8,13 8,14" />
      </>,
    ),

    IcoG(
      "image-preview",
      <>
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <circle cx="5.5" cy="6" r="1.5" />
        <path d="M2 11l3-3 2 2 4-4 3 3" />
      </>,
    ),

    IcoG(
      "uuid",
      <>
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <line x1="4" y1="6" x2="12" y2="6" />
        <line x1="4" y1="9" x2="9" y2="9" />
      </>,
    ),
  ]),
};

export function ToolIcon({ name }: { name: string }) {
  return <>{icons[name] ?? name}</>;
}
