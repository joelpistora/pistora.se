interface BreadcrumbsProps {
  /** Current folder path, "" for the storage root. */
  path: string;
  /** Navigate to an ancestor path ("" = root). */
  onNavigate: (path: string) => void;
}

export default function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const segments = path.split("/").filter(Boolean);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
      <Crumb
        label="Home"
        isCurrent={segments.length === 0}
        onClick={() => onNavigate("")}
      />
      {segments.map((segment, i) => {
        const prefix = segments.slice(0, i + 1).join("/");
        return (
          <span key={prefix} className="flex items-center gap-1">
            <span className="text-foreground/40">/</span>
            <Crumb
              label={segment}
              isCurrent={i === segments.length - 1}
              onClick={() => onNavigate(prefix)}
            />
          </span>
        );
      })}
    </nav>
  );
}

function Crumb({
  label,
  isCurrent,
  onClick,
}: {
  label: string;
  isCurrent: boolean;
  onClick: () => void;
}) {
  if (isCurrent) {
    return <span className="font-medium">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
    >
      {label}
    </button>
  );
}
