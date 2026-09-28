/** Measurements in inches, garment laid flat. */
const TOPS = [
  { size: 'XS', chest: 38, length: 26, shoulder: 17 },
  { size: 'S', chest: 40, length: 27, shoulder: 18 },
  { size: 'M', chest: 42, length: 28, shoulder: 19 },
  { size: 'L', chest: 44, length: 29, shoulder: 20 },
  { size: 'XL', chest: 46, length: 30, shoulder: 21 },
  { size: 'XXL', chest: 48, length: 31, shoulder: 22 },
];

const BOTTOMS = [
  { size: '28', waist: 28, hip: 38, inseam: 29 },
  { size: '30', waist: 30, hip: 40, inseam: 29.5 },
  { size: '32', waist: 32, hip: 42, inseam: 30 },
  { size: '34', waist: 34, hip: 44, inseam: 30.5 },
  { size: '36', waist: 36, hip: 46, inseam: 31 },
];

function Table({ caption, columns, rows }: {
  caption: string;
  columns: string[];
  rows: Record<string, string | number>[];
}) {
  return (
    <section>
      <h3 className="eyebrow mb-3">{caption}</h3>
      <div className="overflow-x-auto rounded-2xl border border-line bg-canvas px-4 sm:px-5">
        <table className="w-full min-w-[26rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-black text-left">
              {columns.map((column) => (
                <th key={column} scope="col" className="py-2 pr-4 font-semibold capitalize">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.size)} className="border-b border-line last:border-b-0">
                {columns.map((column, index) =>
                  index === 0 ? (
                    <th key={column} scope="row" className="py-2.5 pr-4 text-left font-medium">
                      {row[column]}
                    </th>
                  ) : (
                    <td key={column} className="py-2.5 pr-4 text-ink-muted">
                      {row[column]}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Shared size tables. Rendered inside the product-page modal and again, in
 * full, on the FAQ page — one source so the two can never drift apart.
 */
export function SizeGuideTables() {
  return (
    <div className="space-y-8">
      <Table caption="Tops · tees, hoodies, shirts" columns={['size', 'chest', 'length', 'shoulder']} rows={TOPS} />
      <Table caption="Bottom wear" columns={['size', 'waist', 'hip', 'inseam']} rows={BOTTOMS} />

      <p className="text-xs text-ink-subtle">
        Between two sizes? Size up for oversized and relaxed fits, size down for slim.
      </p>
    </div>
  );
}

export default SizeGuideTables;
