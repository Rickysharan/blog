import type { ProviderState } from "@omnilede/contracts";
import { ReportProvenance } from "./report-provenance";

export function DataTable({ caption, columns, rows, source, fetchedAt, state }: { caption: string; columns: string[]; rows: Array<Array<string | number>>; source: string; fetchedAt: string | null; state: ProviderState }) {
  return <div className="report-table-wrap"><ReportProvenance source={source} fetchedAt={fetchedAt} state={state}/><table className="report-table"><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p>No verified rows were returned.</p>}</div>;
}
