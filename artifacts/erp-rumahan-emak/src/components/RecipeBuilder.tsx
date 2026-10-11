import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export type RecipeDraftLine = { ingredientId: number; qtyRequired: number; recipeUnit: string };
type Stock = { id: number; name: string; unit: string; active?: boolean };
export const unitsFor = (unit: string) => ['kg', 'gram'].includes(unit) ? ['kg', 'gram'] : ['liter', 'ml'].includes(unit) ? ['liter', 'ml'] : [unit];

export default function RecipeBuilder({ ingredients, value, onChange, disabled = false, onPendingChange }: {
  ingredients: Stock[]; value: RecipeDraftLine[]; onChange: (value: RecipeDraftLine[]) => void; disabled?: boolean; onPendingChange?: (dirty: boolean) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const selected = ingredients.find((item) => item.id === selectedId);
  const options = ingredients.filter((item) => item.active !== false && item.name.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id'))).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const reset = () => { setSearch(''); setSelectedId(null); setUnit(''); setQty(''); setEditingId(null); setOpen(false); setError(''); };
  const pending = Boolean(selectedId || search || qty || editingId);
  useEffect(() => {
    const form = root.current?.closest('form');
    const protect = (event: Event) => { if (pending) { event.preventDefault(); event.stopImmediatePropagation(); setError('Tambahkan atau batalkan isian bahan sebelum menyimpan resep.'); } };
    form?.addEventListener('submit', protect, true);
    return () => form?.removeEventListener('submit', protect, true);
  }, [pending]);
  const add = () => {
    const number = Number(qty.replace(',', '.'));
    if (!selected || !Number.isFinite(number) || number <= 0 || !unitsFor(selected.unit).includes(unit)) { setError('Pilih bahan, satuan yang sesuai, dan jumlah lebih dari nol.'); return; }
    if (number < 0.001 || number > 99999999999.999 || Math.abs(number - Number(number.toFixed(3))) >= 1e-9) { setError('Jumlah maksimal tiga angka desimal. Pilih satuan lebih kecil, misalnya gram, agar pemakaian kecil tetap akurat.'); return; }
    if (value.some((line) => line.ingredientId === selected.id && line.ingredientId !== editingId)) { setError('Bahan sudah ada. Gunakan tombol Edit untuk mengubah jumlahnya.'); return; }
    const line = { ingredientId: selected.id, recipeUnit: unit, qtyRequired: number };
    onChange(editingId !== null ? value.map((item) => item.ingredientId === editingId ? line : item) : [...value, line]); reset();
  };
  return <div ref={root} className="recipe-builder" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); add(); }
  }}>
    <fieldset className="recipe-builder-fields" disabled={disabled}>
      <legend>{editingId !== null ? 'Edit bahan' : 'Tambah bahan'}</legend>
      <div className="field stock-combobox"><label htmlFor={`${id}-stock`}>Add Stok</label>
        <input id={`${id}-stock`} className="input" role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" value={search} placeholder="Cari dan pilih stok bahan" autoComplete="off"
          onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setOpen(false); }}
          onChange={(event) => { setSearch(event.target.value); setSelectedId(null); setUnit(''); setOpen(true); onPendingChange?.(true); }}
          onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); document.getElementById(`${id}-options`)?.querySelector<HTMLButtonElement>('button')?.focus(); } }} />
        {open && <div id={`${id}-options`} role="listbox" aria-label="Stok bahan" className="stock-options">
          {options.length ? options.map((item) => <button key={item.id} type="button" role="option" aria-selected={selectedId === item.id} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling; (next as HTMLElement | null)?.focus(); }
          }} onClick={() => { setSelectedId(item.id); setSearch(item.name); setUnit(item.unit); setOpen(false); setError(''); onPendingChange?.(true); document.getElementById(`${id}-qty`)?.focus(); }}>
            <span>{item.name}</span><small>{value.some((line) => line.ingredientId === item.id) ? 'Sudah di resep · edit di bawah' : item.unit}</small>
          </button>) : <p>Tidak ada bahan yang cocok.</p>}
        </div>}
      </div>
      <label className="field"><span>Satuan pemakaian</span><select className="input" value={unit} disabled={disabled || !selected} onChange={(event) => { setUnit(event.target.value); onPendingChange?.(true); }}><option value="">Pilih satuan</option>{selected && unitsFor(selected.unit).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field"><span>Jumlah</span><input id={`${id}-qty`} className="input" inputMode="decimal" value={qty} placeholder="Contoh: 0,25" onChange={(event) => { setQty(event.target.value); onPendingChange?.(true); }} /></label>
      <button type="button" className="button button-secondary" onClick={add}>{editingId !== null ? 'Terapkan perubahan' : 'Tambah ke resep'}</button>
      {pending && <button type="button" className="text-button" onClick={reset}>Batalkan isian bahan</button>}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <h3>Bahan dalam resep <small>({value.length})</small></h3>
    <div className="recipe-draft-list">{value.length ? value.map((line) => {
      const item = ingredients.find((stock) => stock.id === line.ingredientId);
      return <div className="recipe-draft-row" key={line.ingredientId}><div><b>{item?.name ?? `Bahan #${line.ingredientId}`}</b><small>{line.qtyRequired.toLocaleString('id-ID', { maximumFractionDigits: 8 })} {line.recipeUnit}</small></div>
        <button type="button" className="icon-button" disabled={disabled} aria-label={`Edit ${item?.name}`} onClick={() => { setEditingId(line.ingredientId); setSelectedId(line.ingredientId); setSearch(item?.name ?? ''); setQty(String(line.qtyRequired)); setUnit(line.recipeUnit); setError(''); onPendingChange?.(true); }}><Pencil size={16} /></button>
        <button type="button" className="icon-button" disabled={disabled} aria-label={`Hapus ${item?.name}`} onClick={() => { onChange(value.filter((row) => row.ingredientId !== line.ingredientId)); if (editingId === line.ingredientId) reset(); }}><Trash2 size={16} /></button>
      </div>;
    }) : <p className="modal-intro">Belum ada bahan. Pilih stok untuk mulai menyusun resep.</p>}</div>
    {pending && <p className="modal-intro" role="status">Isian bahan belum ditambahkan. Pilih Tambah ke resep atau batalkan isian sebelum menyimpan.</p>}

  </div>;
}
