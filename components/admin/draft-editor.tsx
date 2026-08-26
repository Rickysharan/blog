"use client";

export function DraftEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-bold text-ink" htmlFor="draft-mdx">
        MDX content
      </label>
      <p className="mt-1 text-xs leading-5 text-muted">
        Frontmatter, analysis, and the final source link are validated again on the server.
      </p>
      <textarea
        autoCapitalize="none"
        autoCorrect="off"
        className="mt-3 min-h-[34rem] w-full resize-y rounded-xl border border-line bg-canvas p-4 font-mono text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        id="draft-mdx"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}
