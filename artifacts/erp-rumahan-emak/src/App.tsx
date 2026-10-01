import { useMemo, useState } from 'react';
import type React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetErpStateQueryKey, getGetFinanceReportQueryKey, useHealthCheck, useCreateIngredient,
  useCreateProduct, useGetErpState, useGetFinanceReport, useRecordPurchase,
  useRecordSale, useRecordStockCount, useSaveProductRecipe, useUpdateIngredient,
  useUpdateProduct,
} from '@workspace/api-client-react';
import type { ErpState, Ingredient, Product, RecipeItem } from '@workspace/api-client-react';
import {
  AlertCircle, ArrowDownLeft, ArrowRight, Boxes, CalendarDays, Check,
  CirclePlus, ClipboardList, CookingPot, FileText, Home, Menu,
  Pencil, Plus, ReceiptText, ShoppingBasket, TrendingUp, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const client = new QueryClient();
const navItems = [
  { href: '/', label: 'Ringkasan', icon: Home },
  { href: '/stok', label: 'Stok bahan', icon: Boxes },
  { href: '/produk', label: 'Produk & resep', icon: CookingPot },
  { href: '/belanja', label: 'Catat belanja', icon: ShoppingBasket },
  { href: '/penjualan', label: 'Catat penjualan', icon: ReceiptText },
  { href: '/opname', label: 'Stok opname', icon: ClipboardList },
  { href: '/laporan', label: 'Laporan', icon: FileText },
];
const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const money = (n?: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const dateLabel = (d: string | Date) => {
  const day = d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T00:00:00`));
};
const errText = (e: unknown) => {
  const x = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return x?.response?.data?.error || x?.response?.data?.message || x?.message || 'Terjadi kendala. Silakan coba lagi.';
};

function Shell({ children, connected }: { children: React.ReactNode; connected: boolean }) {
  const [path] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const active = navItems.find((n) => n.href === path);
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" onClick={() => setMobileNav(false)}>
        <span className="brand-mark"><CookingPot size={21} /></span>
        <span><strong>Kasapink</strong><small>CATATAN USAHA</small></span>
      </Link>
      <div className="side-caption">MENU UTAMA</div>
      <nav className="side-nav">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className={`nav-link ${path === href ? 'is-active' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'dashboard'}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{path === href && <span className="nav-current" />}
        </Link>)}
      </nav>
      <div className="sidebar-note"><span className="note-dot" /><div><b>Usaha bertumbuh</b><small>Catat rapi, hati lebih tenang.</small></div></div>
      <div className="side-footer">Dibuat untuk usaha rumahan<br />keluarga Indonesia</div>
    </aside>
    {mobileNav && <button className="scrim" aria-label="Tutup menu" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Buka menu"><Menu size={20} /></button>
        <div className="crumb">Usaha <span>/</span> <b>{active?.label || 'Halaman'}</b></div>
        <div className="topbar-meta"><span className={`connection ${connected ? '' : 'connection-off'}`}><i />{connected ? 'Tersambung' : 'Menghubungkan'}</span><div className="top-date"><CalendarDays size={15} /> {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div></div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}

function PageHeading({ kicker, title, note, action }: { kicker: string; title: string; note: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{note}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
function LoadingPanel() { return <div className="loading-grid"><div className="skeleton big" /><div className="skeleton" /><div className="skeleton" /></div>; }
function ErrorPanel({ message, retry }: { message: string; retry: () => void }) { return <div className="error-panel"><AlertCircle size={22} /><div><b>Data belum dapat dimuat</b><p>{message}</p><button className="text-button" onClick={retry}>Coba muat kembali</button></div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span className="empty-icon"><Boxes size={20} /></span><b>{title}</b><p>{text}</p></div>; }
function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet'; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant}`} data-testid="button-action">{children}</button>;
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="input select" {...props} />; }
function FormError({ text }: { text: string }) { return text ? <div className="form-error"><AlertCircle size={16} />{text}</div> : null; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-head"><div><span className="eyebrow">FORM DATA</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={19} /></button></div>{children}</div></div>;
}
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: getGetErpStateQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetFinanceReportQueryKey() });
  };
}
function Dashboard({ state, error, retry }: { state?: ErpState; error?: string; retry: () => void }) {
  if (!state) return error ? <ErrorPanel message={error} retry={retry} /> : <LoadingPanel />;
  const low = state.ingredients.filter((i) => i.stock <= i.minStock);
  const recent = [
    ...state.recentSales.map((x) => ({ id: `j-${x.id}`, date: x.date, title: 'Penjualan', detail: `${x.items.length} jenis produk`, amount: x.totalRevenue, kind: 'sale' })),
    ...state.recentPurchases.map((x) => ({ id: `b-${x.id}`, date: x.date, title: 'Belanja bahan', detail: x.supplierType, amount: x.totalCost, kind: 'buy' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return <>
    <PageHeading kicker="RINGKASAN HARI INI" title="Pagi, Bu." note="Semua catatan usaha hari ini, dalam satu tempat." action={<span className="date-chip"><CalendarDays size={16} />{dateLabel(state.today.date || today())}</span>} />
    <div className="metric-grid">
      <Card className="metric-card metric-feature"><span className="metric-label">PENJUALAN HARI INI</span><strong>{money(state.today.revenue)}</strong><span className="metric-foot"><TrendingUp size={14} /> Uang masuk dari penjualan</span><div className="metric-stamp"><ReceiptText size={20} /></div></Card>
      <Card className="metric-card"><span className="metric-label">LABA KOTOR</span><strong>{money(state.today.grossProfit)}</strong><span className="metric-foot">Setelah biaya bahan terjual</span><div className="metric-side-icon"><TrendingUp size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">BELANJA BAHAN</span><strong>{money(state.today.purchases)}</strong><span className="metric-foot">Pengeluaran hari ini</span><div className="metric-side-icon peach"><ShoppingBasket size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">BAHAN MENIPIS</span><strong>{state.lowStockCount}</strong><span className="metric-foot">Perlu dicek sebelum belanja</span><div className="metric-side-icon alert"><Boxes size={18} /></div></Card>
    </div>
    <div className="dashboard-bottom">
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">PERHATIAN</span><h2>Stok perlu diisi</h2></div><Link href="/stok" className="inline-link">Lihat semua <ArrowRight size={15} /></Link></div>
        {low.length ? <div className="stock-list">{low.slice(0, 5).map((i) => <div className="stock-row" key={i.id}><span className="ingredient-token">{i.name.slice(0, 1).toUpperCase()}</span><span className="stock-name"><b>{i.name}</b><small>Minimum {i.minStock} {i.unit}</small></span><span className="stock-value">{i.stock} <small>{i.unit}</small></span><span className="status-pill status-low">Menipis</span></div>)}</div> : <Empty title="Stok aman" text="Belum ada bahan yang perlu segera dibeli." />}
      </Card>
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">AKTIVITAS TERBARU</span><h2>Catatan terakhir</h2></div><Link href="/laporan" className="inline-link">Laporan <ArrowRight size={15} /></Link></div>
        {recent.length ? <div className="activity-list">{recent.map((r) => <div className="activity-row" key={r.id}><span className={`activity-icon ${r.kind}`} >{r.kind === 'sale' ? <ArrowDownLeft size={16} /> : <ShoppingBasket size={16} />}</span><div className="activity-name"><b>{r.title}</b><small>{dateLabel(r.date)} · {r.detail}</small></div><strong className={r.kind === 'sale' ? 'positive' : ''}>{money(r.amount)}</strong></div>)}</div> : <Empty title="Belum ada transaksi" text="Belanja dan penjualan yang dicatat akan tampil di sini." />}
      </Card>
    </div>
  </>;
}

function StockPage({ ingredients }: { ingredients: Ingredient[] }) {
  const [modal, setModal] = useState<Ingredient | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const create = useCreateIngredient(), update = useUpdateIngredient(), refresh = useRefresh();
  const [error, setError] = useState('');
  const visible = ingredients.filter((x) => `${x.name} ${x.category}`.toLowerCase().includes(search.toLowerCase()));
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const name = String(f.get('name')), category = String(f.get('category')), unit = String(f.get('unit'));
    const minStock = Number(f.get('minStock')), stock = Number(f.get('stock'));
    const openingUnitCost = Number(f.get('openingUnitCost'));
    const success = () => { refresh(); setModal(null); setError(''); };
    if (modal === 'new') create.mutate({ data: { name, category, unit, stock, minStock, openingUnitCost } }, { onSuccess: success, onError: (e) => setError(errText(e)) });
    else if (modal) update.mutate({ ingredientId: modal.id, data: { name, category, unit, minStock } }, { onSuccess: success, onError: (e) => setError(errText(e)) });
  };
  return <>
    <PageHeading kicker="PERSIAPAN DAPUR" title="Stok bahan" note="Pantau persediaan dan biaya bahan baku." action={<Button onClick={() => { setError(''); setModal('new'); }}><Plus size={17} /> Tambah bahan</Button>} />
    <Card className="table-card"><div className="table-toolbar"><div className="search-wrap"><span className="search-mark">⌕</span><input aria-label="Cari bahan" data-testid="input-search-ingredients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau kategori..." /></div><span className="result-count">{visible.length} bahan</span></div>
      {visible.length ? <div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>KATEGORI</th><th>STOK SAAT INI</th><th>BATAS MINIMUM</th><th>HARGA TERAKHIR</th><th /></tr></thead><tbody>{visible.map((i) => <tr key={i.id} data-testid={`row-ingredient-${i.id}`}><td><div className="table-name"><span className="ingredient-token">{i.name.slice(0, 1).toUpperCase()}</span><b>{i.name}</b></div></td><td>{i.category}</td><td><b>{i.stock}</b> <span className="muted">{i.unit}</span></td><td>{i.minStock} <span className="muted">{i.unit}</span></td><td>{money(i.lastPrice)}</td><td><span className={`status-pill ${i.stock <= i.minStock ? 'status-low' : 'status-ok'}`}>{i.stock <= i.minStock ? 'Menipis' : 'Aman'}</span><button className="icon-button tiny" aria-label={`Ubah ${i.name}`} onClick={() => { setError(''); setModal(i); }}><Pencil size={15} /></button></td></tr>)}</tbody></table></div> : <Empty title="Bahan belum ditemukan" text={search ? 'Coba kata pencarian lain.' : 'Tambahkan bahan pertama untuk mulai mengelola stok.'} />}
    </Card>
    {modal && <Modal title={modal === 'new' ? 'Tambah bahan baru' : 'Ubah data bahan'} onClose={() => setModal(null)}><form className="form-stack" onSubmit={save}>
      <Field label="Nama bahan"><FieldInput name="name" required defaultValue={modal === 'new' ? '' : modal.name} placeholder="Contoh: Tepung terigu" /></Field>
      <div className="form-row"><Field label="Kategori"><FieldInput name="category" required defaultValue={modal === 'new' ? '' : modal.category} placeholder="Bahan kering" /></Field><Field label="Satuan"><FieldInput name="unit" required defaultValue={modal === 'new' ? '' : modal.unit} placeholder="kg, liter, butir" /></Field></div>
      {modal === 'new' && <Field label="Stok awal"><FieldInput name="stock" type="number" min="0" step="any" defaultValue="0" required /></Field>}
       {modal === 'new' && <Field label="Biaya per satuan stok awal" hint="Isi nilai biaya agar laba kotor dapat dihitung dengan lebih tepat."><FieldInput name="openingUnitCost" type="number" min="0" step="any" defaultValue="0" required /></Field>}
      <Field label="Batas minimum"><FieldInput name="minStock" type="number" min="0" step="any" defaultValue={modal === 'new' ? '0' : modal.minStock} required /></Field>
      <FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={() => setModal(null)}>Batal</Button><Button type="submit" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Menyimpan…' : 'Simpan bahan'}</Button></div>
    </form></Modal>}
  </>;
}

function ProductPage({ state }: { state: ErpState }) {
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const create = useCreateProduct(), update = useUpdateProduct(), saveRecipe = useSaveProductRecipe(), refresh = useRefresh();
  const recipe = useMemo(() => recipeProduct ? state.recipes.filter((r) => r.productId === recipeProduct.id) : [], [recipeProduct, state.recipes]);
  const submitProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const data = { name: String(f.get('name')), sellingPrice: Number(f.get('sellingPrice')) };
    const success = () => { refresh(); setEditing(null); setError(''); };
    if (editing === 'new') create.mutate({ data }, { onSuccess: success, onError: (x) => setError(errText(x)) });
    else if (editing) update.mutate({ productId: editing.id, data }, { onSuccess: success, onError: (x) => setError(errText(x)) });
  };
  const saveRecipeForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!recipeProduct) return;
    const form = new FormData(e.currentTarget);
    const items = state.ingredients.map((i) => ({ ingredientId: i.id, qtyRequired: Number(form.get(`qty-${i.id}`)) || 0 })).filter((i) => i.qtyRequired > 0);
    saveRecipe.mutate({ productId: recipeProduct.id, data: { items } }, { onSuccess: () => { refresh(); setRecipeProduct(null); setError(''); }, onError: (x) => setError(errText(x)) });
  };
  return <>
    <PageHeading kicker="MENU DAPUR" title="Produk & resep" note="Atur harga jual dan bahan yang dipakai tiap produk." action={<Button onClick={() => { setError(''); setEditing('new'); }}><Plus size={17} /> Tambah produk</Button>} />
    {!state.products.length ? <Card><Empty title="Belum ada produk" text="Tambahkan produk jualan untuk mulai mencatat penjualan." /></Card> :
      <div className="product-list">{state.products.map((p) => {
        const items = state.recipes.filter((r) => r.productId === p.id);
        return <Card className="product-card" key={p.id}><div className="product-top"><span className="product-illustration"><CookingPot size={21} /></span><button className="icon-button" aria-label={`Ubah ${p.name}`} onClick={() => { setEditing(p); setError(''); }}><Pencil size={16} /></button></div><h2>{p.name}</h2><div className="product-price">{money(p.sellingPrice)} <small>/ porsi</small></div><div className="recipe-summary">{items.length ? <>{items.length} bahan · {items.slice(0, 3).map((r) => r.ingredientName).join(', ')}{items.length > 3 ? '…' : ''}</> : <span className="recipe-missing">Resep belum diatur</span>}</div><button className="recipe-button" onClick={() => { setRecipeProduct(p); setError(''); }}><ClipboardList size={16} /> Atur resep <ArrowRight size={15} /></button></Card>;
      })}</div>}
    {editing && <Modal title={editing === 'new' ? 'Tambah produk' : 'Ubah produk'} onClose={() => setEditing(null)}><form className="form-stack" onSubmit={submitProduct}><Field label="Nama produk"><FieldInput name="name" required defaultValue={editing === 'new' ? '' : editing.name} placeholder="Contoh: Risoles sayur" /></Field><Field label="Harga jual"><FieldInput name="sellingPrice" required type="number" min="0" step="100" defaultValue={editing === 'new' ? '' : editing.sellingPrice} /></Field><FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={() => setEditing(null)}>Batal</Button><Button type="submit" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Menyimpan…' : 'Simpan produk'}</Button></div></form></Modal>}
    {recipeProduct && <Modal title={`Resep ${recipeProduct.name}`} onClose={() => setRecipeProduct(null)}><form className="form-stack" onSubmit={saveRecipeForm}><p className="modal-intro">Isi jumlah setiap bahan untuk membuat satu produk. Kosongkan bahan yang tidak digunakan.</p>{state.ingredients.length ? <div className="recipe-editor">{state.ingredients.map((i) => <div className="recipe-line" key={i.id}><div><b>{i.name}</b><small>{i.unit} per produk</small></div><FieldInput aria-label={`Jumlah ${i.name}`} name={`qty-${i.id}`} type="number" min="0" step="any" defaultValue={recipe.find((r: RecipeItem) => r.ingredientId === i.id)?.qtyRequired || ''} placeholder="0" /></div>)}</div> : <Empty title="Belum ada bahan" text="Tambahkan data bahan sebelum menyusun resep." />}<FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={() => setRecipeProduct(null)}>Batal</Button><Button type="submit" disabled={saveRecipe.isPending || !state.ingredients.length}>{saveRecipe.isPending ? 'Menyimpan…' : 'Simpan resep'}</Button></div></form></Modal>}
  </>;
}

type PurchaseLine = { ingredientId: number; quantity: number; totalCost: number };
function PurchasePage({ ingredients }: { ingredients: Ingredient[] }) {
  const [date, setDate] = useState(today()), [supplier, setSupplier] = useState('Pasar'), [lines, setLines] = useState<PurchaseLine[]>([{ ingredientId: ingredients[0]?.id || 0, quantity: 1, totalCost: 0 }]), [error, setError] = useState(''), [done, setDone] = useState('');
  const mutation = useRecordPurchase(), refresh = useRefresh();
  const total = lines.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const patch = (index: number, key: keyof PurchaseLine, value: number) => setLines((prev) => prev.map((l, i) => i === index ? { ...l, [key]: value } : l));
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); setDone(''); mutation.mutate({ data: { date, supplierType: supplier, items: lines.filter((l) => l.ingredientId && l.quantity > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), totalCost: Number(l.totalCost) })) } }, { onSuccess: (p) => { refresh(); setDone(`Belanja ${money(p.totalCost)} berhasil dicatat.`); setLines([{ ingredientId: ingredients[0]?.id || 0, quantity: 1, totalCost: 0 }]); }, onError: (x) => setError(errText(x)) }); };
  return <><PageHeading kicker="PEMBELIAN BAHAN" title="Catat belanja" note="Satu catatan untuk semua bahan yang dibeli hari ini." />
    <div className="entry-layout"><Card className="entry-card"><div className="card-heading"><div><span className="eyebrow">DETAIL BELANJA</span><h2>Belanja bahan</h2></div><span className="step-number">01</span></div><form onSubmit={submit} className="form-stack"><div className="form-row"><Field label="Tanggal"><FieldInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Asal belanja"><FieldSelect value={supplier} onChange={(e) => setSupplier(e.target.value)}><option>Pasar</option><option>Toko</option><option>Grosir</option><option>Lainnya</option></FieldSelect></Field></div>
      <div className="line-head"><b>Daftar bahan</b><span>Jumlah & biaya total</span></div>
      {lines.map((l, idx) => <div className="purchase-line" key={idx}><Field label="Bahan"><FieldSelect required value={l.ingredientId || ''} onChange={(e) => patch(idx, 'ingredientId', Number(e.target.value))}><option value="" disabled>Pilih bahan</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</FieldSelect></Field><Field label="Jumlah"><FieldInput required min="0.001" step="any" type="number" value={l.quantity} onChange={(e) => patch(idx, 'quantity', Number(e.target.value))} /></Field><Field label="Total biaya"><FieldInput required min="0" step="100" type="number" value={l.totalCost} onChange={(e) => patch(idx, 'totalCost', Number(e.target.value))} /></Field><button className="remove-line" type="button" aria-label="Hapus baris" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))}><X size={16} /></button></div>)}
      <button className="add-line" type="button" onClick={() => setLines([...lines, { ingredientId: ingredients[0]?.id || 0, quantity: 1, totalCost: 0 }])}><CirclePlus size={16} /> Tambah bahan</button>
      <FormError text={error} />{done && <div className="success-message"><Check size={16} />{done}</div>}<div className="form-actions purchase-submit"><div><small>Total pengeluaran</small><strong>{money(total)}</strong></div><Button type="submit" disabled={mutation.isPending || !ingredients.length}>{mutation.isPending ? 'Menyimpan…' : 'Simpan belanja'}</Button></div>
    </form></Card><aside className="side-tip"><div className="tip-symbol"><ShoppingBasket size={20} /></div><span className="eyebrow">CATATAN KECIL</span><h3>Masukkan total harga per bahan</h3><p>Jika membeli beberapa bahan sekaligus, pisahkan ke baris masing-masing. Stok dan rata-rata biaya akan diperbarui otomatis.</p><div className="tip-rule" /><span className="tip-foot">Belanja hari ini</span><strong>{money(total)}</strong></aside></div>
  </>;
}

function SalePage({ state }: { state: ErpState }) {
  const [date, setDate] = useState(today()), [lines, setLines] = useState([{ productId: state.products[0]?.id || 0, quantity: 1 }]), [error, setError] = useState(''), [done, setDone] = useState('');
  const mutation = useRecordSale(), refresh = useRefresh();
  const total = lines.reduce((n, l) => n + (state.products.find((p) => p.id === l.productId)?.sellingPrice || 0) * l.quantity, 0);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); setDone(''); mutation.mutate({ data: { date, items: lines.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })) } }, { onSuccess: (sale) => { refresh(); setDone(`Penjualan ${money(sale.totalRevenue)} berhasil dicatat.`); setLines([{ productId: state.products[0]?.id || 0, quantity: 1 }]); }, onError: (x) => setError(errText(x)) }); };
  return <><PageHeading kicker="PENJUALAN HARIAN" title="Catat penjualan" note="Masukkan produk yang terjual. Stok bahan berkurang mengikuti resep." />
    <div className="entry-layout"><Card className="entry-card"><div className="card-heading"><div><span className="eyebrow">TRANSAKSI BARU</span><h2>Penjualan</h2></div><span className="step-number">01</span></div><form onSubmit={submit} className="form-stack"><Field label="Tanggal"><FieldInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="line-head"><b>Produk terjual</b><span>Harga mengikuti daftar produk</span></div>
      {lines.map((l, idx) => <div className="sale-line" key={idx}><Field label="Produk"><FieldSelect required value={l.productId || ''} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, productId: Number(e.target.value) } : item))}><option value="" disabled>Pilih produk</option>{state.products.map((p) => <option value={p.id} key={p.id}>{p.name} — {money(p.sellingPrice)}</option>)}</FieldSelect></Field><Field label="Jumlah"><FieldInput required type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, quantity: Number(e.target.value) } : item))} /></Field><button className="remove-line" type="button" disabled={lines.length === 1} aria-label="Hapus produk" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><X size={16} /></button></div>)}
      <button className="add-line" type="button" disabled={!state.products.length} onClick={() => setLines([...lines, { productId: state.products[0]?.id || 0, quantity: 1 }])}><CirclePlus size={16} /> Tambah produk</button>
      {error && <div className="form-error"><AlertCircle size={16} /><span>{error}<small>Periksa kembali resep produk dan ketersediaan stok bahan.</small></span></div>}{done && <div className="success-message"><Check size={16} />{done}</div>}
      <div className="form-actions purchase-submit"><div><small>Perkiraan penjualan</small><strong>{money(total)}</strong></div><Button type="submit" disabled={mutation.isPending || !state.products.length}>{mutation.isPending ? 'Menyimpan…' : 'Simpan penjualan'}</Button></div>
    </form></Card><aside className="side-tip"><div className="tip-symbol peach"><ReceiptText size={20} /></div><span className="eyebrow">SEBELUM MENYIMPAN</span><h3>Pastikan resep produk sudah lengkap</h3><p>Penjualan akan mengurangi stok bahan sesuai takaran resep. Sistem akan menolak transaksi jika resep belum diatur atau stok tidak cukup.</p><Link href="/produk" className="inline-link">Atur resep produk <ArrowRight size={15} /></Link></aside></div>
  </>;
}

function StockCountPage({ ingredients }: { ingredients: Ingredient[] }) {
  const [date, setDate] = useState(today()), [counts, setCounts] = useState<Record<number, string>>({}), [error, setError] = useState(''), [done, setDone] = useState('');
  const mutation = useRecordStockCount(), refresh = useRefresh();
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); setDone(''); mutation.mutate({ data: { date, items: ingredients.map((i) => ({ ingredientId: i.id, countedStock: Number(counts[i.id] ?? i.stock) })) } }, { onSuccess: () => { refresh(); setDone('Stok fisik berhasil disimpan dan saldo stok diperbarui.'); setCounts({}); }, onError: (x) => setError(errText(x)) }); };
  return <><PageHeading kicker="PENYESUAIAN PERSEDIAAN" title="Stok opname" note="Cocokkan catatan dengan jumlah bahan yang benar-benar ada." />
    <Card className="table-card"><div className="opname-intro"><div><span className="eyebrow">HITUNG FISIK</span><h2>Jumlah bahan di dapur</h2><p>Isi jumlah aktual. Kolom kosong akan memakai jumlah stok saat ini.</p></div><Field label="Tanggal opname"><FieldInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {ingredients.length ? <form onSubmit={submit}><div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>CATATAN SISTEM</th><th>JUMLAH FISIK</th><th>SELISIH</th></tr></thead><tbody>{ingredients.map((i) => { const value = counts[i.id] === undefined ? i.stock : Number(counts[i.id]); const delta = value - i.stock; return <tr key={i.id}><td><div className="table-name"><span className="ingredient-token">{i.name.slice(0, 1)}</span><b>{i.name}</b></div></td><td>{i.stock} {i.unit}</td><td><div className="count-input"><FieldInput aria-label={`Jumlah fisik ${i.name}`} type="number" min="0" step="any" value={counts[i.id] ?? ''} placeholder={String(i.stock)} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /><span>{i.unit}</span></div></td><td><span className={delta < 0 ? 'negative' : delta > 0 ? 'positive' : 'muted'}>{delta > 0 ? '+' : ''}{delta} {i.unit}</span></td></tr>; })}</tbody></table></div><div className="opname-footer"><FormError text={error} />{done && <div className="success-message"><Check size={16} />{done}</div>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Menyimpan…' : 'Simpan hasil opname'}</Button></div></form> : <Empty title="Belum ada bahan untuk dihitung" text="Tambahkan bahan di menu stok terlebih dahulu." />}
    </Card>
  </>;
}

function ReportPage() {
  const [startDate, setStart] = useState(`${today().slice(0, 7)}-01`), [endDate, setEnd] = useState(today());
  const params = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const query = useGetFinanceReport(params);
  const r = query.data;
  return <><PageHeading kicker="ANGKA USAHA" title="Laporan keuangan" note="Ringkasan penjualan, belanja, dan laba kotor sesuai tanggal." />
    <Card className="report-filter"><div><span className="eyebrow">PERIODE LAPORAN</span><h2>Pilih rentang tanggal</h2></div><div className="date-range"><Field label="Dari"><FieldInput type="date" value={startDate} max={endDate} onChange={(e) => setStart(e.target.value)} /></Field><span className="range-separator">sampai</span><Field label="Sampai"><FieldInput type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEnd(e.target.value)} /></Field></div></Card>
    {query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : r && <>
      <div className="report-metrics"><Card className="report-total"><span className="metric-label">TOTAL PENJUALAN</span><strong>{money(r.revenue)}</strong><small>Pemasukan dari produk terjual</small></Card><Card className="report-total"><span className="metric-label">HARGA POKOK TERJUAL</span><strong>{money(r.costOfGoodsSold)}</strong><small>Biaya bahan untuk produk terjual</small></Card><Card className="report-total"><span className="metric-label">BELANJA BAHAN</span><strong>{money(r.purchases)}</strong><small>Total pembelian bahan baku</small></Card><Card className="report-total highlight"><span className="metric-label">LABA KOTOR</span><strong>{money(r.grossProfit)}</strong><small>Penjualan dikurangi harga pokok</small></Card></div>
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">RINCIAN HARIAN</span><h2>Pergerakan per hari</h2></div><span className="period-chip">{dateLabel(r.startDate)} — {dateLabel(r.endDate)}</span></div>{r.days.length ? <div className="table-scroll"><table><thead><tr><th>TANGGAL</th><th>PENJUALAN</th><th>HARGA POKOK</th><th>BELANJA</th><th>LABA KOTOR</th></tr></thead><tbody>{r.days.map((d) => <tr key={d.date}><td><b>{dateLabel(d.date)}</b></td><td>{money(d.revenue)}</td><td>{money(d.costOfGoodsSold)}</td><td>{money(d.purchases)}</td><td><b>{money(d.grossProfit)}</b></td></tr>)}</tbody></table></div> : <Empty title="Belum ada catatan pada periode ini" text="Coba pilih rentang tanggal yang berbeda." />}</Card>
    </>}
  </>;
}

function AppContent() {
  const query = useGetErpState();
  const health = useHealthCheck();
  const state = query.data;
  const fallback: ErpState = { ingredients: [], products: [], recipes: [], recentPurchases: [], recentSales: [], today: { date: today(), revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }, lowStockCount: 0 };
  const shared = state || fallback;
  return <Shell connected={health.isSuccess}><ErrorBoundary resetKey="routes"><Switch>
    <Route path="/" component={() => <Dashboard state={state} error={query.isError ? errText(query.error) : undefined} retry={() => void query.refetch()} />} />
    <Route path="/stok" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} />} />
    <Route path="/produk" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} />} />
    <Route path="/belanja" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <PurchasePage ingredients={shared.ingredients} />} />
    <Route path="/penjualan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <SalePage state={shared} />} />
    <Route path="/opname" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockCountPage ingredients={shared.ingredients} />} />
    <Route path="/laporan" component={ReportPage} />
    <Route component={() => <div className="not-found"><span className="eyebrow">HALAMAN TIDAK ADA</span><h1>Sepertinya tersesat.</h1><Link href="/" className="inline-link">Kembali ke ringkasan <ArrowRight size={16} /></Link></div>} />
  </Switch></ErrorBoundary></Shell>;
}
function App() {
  return <QueryClientProvider client={client}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppContent /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;