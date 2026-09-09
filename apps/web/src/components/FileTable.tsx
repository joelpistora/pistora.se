import { fileUrl, type FileEntry } from "@/lib/api";
import { formatDate, formatSize } from "@/lib/format";

interface FileTableProps {
  /** Current folder path, "" for the storage root. */
  path: string;
  entries: FileEntry[];
  /** Name of the selected file in this folder, or null. */
  selected: string | null;
  onOpenDir: (name: string) => void;
  onSelectFile: (name: string) => void;
}

function join(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

export default function FileTable({
  path,
  entries,
  selected,
  onOpenDir,
  onSelectFile,
}: FileTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-foreground/15 text-left text-foreground/60">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Size</th>
            <th className="py-2 pr-4 font-medium">Modified</th>
            <th className="py-2 font-medium" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isDir = entry.type === "directory";
            const isSelected = !isDir && entry.name === selected;
            return (
              <tr
                key={entry.name}
                onClick={() =>
                  isDir ? onOpenDir(entry.name) : onSelectFile(entry.name)
                }
                className={`cursor-pointer border-b border-foreground/10 transition-colors hover:bg-foreground/5 ${
                  isSelected ? "bg-foreground/10" : ""
                }`}
              >
                <td className="py-2 pr-4">
                  <span className="mr-2 text-foreground/50" aria-hidden>
                    {isDir ? "📁" : "📄"}
                  </span>
                  {entry.name}
                </td>
                <td className="py-2 pr-4 text-foreground/70">
                  {isDir ? "—" : formatSize(entry.size)}
                </td>
                <td className="py-2 pr-4 text-foreground/70">
                  {formatDate(entry.modifiedAt)}
                </td>
                <td className="py-2 text-right">
                  {isSelected && (
                    <a
                      href={fileUrl(join(path, entry.name), { download: true })}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/10"
                    >
                      Download
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
