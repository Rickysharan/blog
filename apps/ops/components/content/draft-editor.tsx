"use client";
export function DraftEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="content-editor"><label htmlFor="draft-mdx">MDX content</label><p>Frontmatter, analysis and the final source link are validated on the server. Maximum 200 KiB.</p><textarea id="draft-mdx" spellCheck={false} autoCapitalize="none" autoCorrect="off" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} /></div>;
}
