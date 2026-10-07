export default function StudioLoading() {
  return (
    <div className="studio-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Loading live data</p>
      <div className="studio-route-progress" role="progressbar" aria-label="Opening page" />
    </div>
  );
}
