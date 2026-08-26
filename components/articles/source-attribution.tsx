export function SourceAttribution({ name, url }: { name: string; url: string }) {
  return (
    <aside className="mt-10 border-y border-line py-5 text-sm" aria-label="Article source">
      <span className="font-semibold">Source:</span>{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-line underline-offset-4 hover:decoration-current"
      >
        {name}
      </a>
    </aside>
  );
}
