import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { setAuthTokenGetter } from '@workspace/api-client-react';
import type { ErpState, Ingredient, Product, RecipeItem } from '@workspace/api-client-react';
import {
  AlertCircle, ArrowDownLeft, ArrowRight, Boxes, CalendarDays, Check, ChevronDown,
  CirclePlus, ClipboardList, CookingPot, FileText, Home, LogOut, Menu,
  KeyRound, Pencil, Plus, ReceiptText, ShoppingBasket, Shield, Trash2, TrendingUp, X,
} from 'lucide-react';
import ChangePasswordModal from './components/ChangePasswordModal';
import PasswordInput from './components/PasswordInput';
import UsersPage from './pages/UsersPage';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const client = new QueryClient();
type UserRole = 'admin' | 'testing' | 'user';
type AppUser = { id: number; username: string; role: UserRole };
setAuthTokenGetter(() => localStorage.getItem('kasapink_token'));
const navItems = [
  { href: '/', label: 'Ringkasan', icon: Home },
  { href: '/stok', label: 'Stok Bahan', icon: Boxes, children: [{ href: '/stok/makanan', label: 'Makanan' }, { href: '/stok/parfum', label: 'Parfum' }] },
  { href: '/produk', label: 'Produk & Resep', icon: CookingPot, children: [{ href: '/produk/makanan', label: 'Makanan' }, { href: '/produk/parfum', label: 'Parfum' }] },
  { href: '/belanja', label: 'Catat Belanja', icon: ShoppingBasket },
  { href: '/penjualan', label: 'Catat Penjualan', icon: ReceiptText },
  { href: '/prep', label: 'Produksi / Prep', icon: CookingPot },
  { href: '/kontrol-fnb', label: 'Kontrol F&B', icon: TrendingUp },
  { href: '/opname', label: 'Stok Opname', icon: ClipboardList },
  { href: '/laporan', label: 'Laporan', icon: FileText },
  { href: '/users', label: 'Manajemen User', icon: Shield, adminOnly: true },
];
const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const money = (n?: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const dateLabel = (d: string | Date) => {
  if (!d) return "";
  const day = d instanceof Date ? d.toISOString()?.slice(0, 10) : d?.slice?.(0, 10) ?? "";
  if (!day) return "";
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T00:00:00`));
};

const errText = (e: unknown) => {
  const x = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return x?.response?.data?.error || x?.response?.data?.message || x?.message || 'Terjadi kendala. Silakan coba lagi.';
};
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('kasapink_token') || ''}` });

let unsavedChanges = false;
const setUnsavedChanges = (value: boolean) => { unsavedChanges = value; };
const confirmNavigation = () => !unsavedChanges || window.confirm('Perubahan belum disimpan. Jika pindah menu sekarang, isian yang belum disimpan akan hilang. Tetap keluar?');

function LoginPage({ onLogin, onSetup, setupAvailable, usernameInput, setUsernameInput, passwordInput, setPasswordInput, errorMsg }: {
  onLogin: (e: React.FormEvent) => void;
  onSetup: (username: string, password: string, bootstrapToken: string) => void;
  setupAvailable: boolean;
  usernameInput: string;
  setUsernameInput: (val: string) => void;
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  errorMsg: string;
}) {
  const [setupMode, setSetupMode] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF8F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #E5E0D8', borderRadius: '24px', padding: '40px 36px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 30px -5px rgba(27, 59, 43, 0.08)', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '60px', backgroundColor: '#1B3B2B', color: '#fff', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '26px', boxShadow: '0 6px 16px rgba(27, 59, 43, 0.2)' }}>
          🍲
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1B3B2B', marginBottom: '4px' }}>Kasapink</h1>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '28px' }}>CATATAN USAHA</p>

        {setupMode ? <form onSubmit={(e) => { e.preventDefault(); onSetup(setupUsername, setupPassword, bootstrapToken); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
          <p style={{ color: '#555', fontSize: '13px', margin: 0 }}>Buat akun admin pertama. Token setup diberikan oleh pemilik aplikasi.</p>
          <input value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder="Token setup admin" autoComplete="off" required style={{ width: '100%', padding: '12px 16px', border: '1px solid #E5E0D8', borderRadius: '12px', boxSizing: 'border-box' }} />
          <input value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} placeholder="Username admin" autoComplete="username" required style={{ width: '100%', padding: '12px 16px', border: '1px solid #E5E0D8', borderRadius: '12px', boxSizing: 'border-box' }} />
          <PasswordInput value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} placeholder="Password (min. 8 karakter)" autoComplete="new-password" minLength={8} required style={{ width: '100%', padding: '12px 40px 12px 16px', border: '1px solid #E5E0D8', borderRadius: '12px', boxSizing: 'border-box' }} />
          {errorMsg && <p style={{ color: '#e11d48', fontSize: '12px', margin: 0 }}>{errorMsg}</p>}
          <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#1B3B2B', color: '#fff', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Buat admin pertama</button>
          <button type="button" className="text-button" onClick={() => setSetupMode(false)}>Kembali ke login</button>
        </form> : <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '6px', letterSpacing: '0.5px' }}>USERNAME</label>
            <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Username" autoComplete="username" required style={{ width: '100%', padding: '12px 16px', backgroundColor: '#FAF8F5', border: '1px solid #E5E0D8', borderRadius: '12px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', color: '#1B3B2B', marginBottom: '12px' }} />
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '6px', letterSpacing: '0.5px' }}>PASSWORD</label>
            <PasswordInput
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Masukkan password..."
              autoComplete="current-password"
              style={{ width: '100%', padding: '12px 40px 12px 16px', backgroundColor: '#FAF8F5', border: '1px solid #E5E0D8', borderRadius: '12px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', color: '#1B3B2B' }}
              autoFocus
            />
          </div>
          {errorMsg && <p style={{ color: '#e11d48', fontSize: '12px', margin: 0, fontWeight: '500' }}>{errorMsg}</p>}
          <button
            type="submit"
            style={{ width: '100%', padding: '12px', backgroundColor: '#1B3B2B', color: '#fff', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '14px', marginTop: '6px', boxShadow: '0 4px 12px rgba(27, 59, 43, 0.2)', transition: 'background 0.2s' }}
          >
            Masuk ke Sistem
          </button>
          {setupAvailable && <button type="button" className="text-button" onClick={() => setSetupMode(true)}>Buat admin pertama</button>}
        </form>}

        <div style={{ marginTop: '32px', fontSize: '12px', color: '#888', borderTop: '1px solid #F0ECE6', paddingTop: '16px' }}>
          Created by Leoneshenkad
        </div>
      </div>
    </div>
  );
}

function Shell({ children, connected, onLogout, role }: { children: React.ReactNode; connected: boolean; onLogout: () => void; role: UserRole }) {
  const [path] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const visibleNavItems = navItems.filter((item) => !('adminOnly' in item && item.adminOnly) || role === 'admin');
  const active = visibleNavItems.flatMap((n) => n.children || [n]).find((n) => n.href === path);
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" onClick={() => setMobileNav(false)}>
        <span className="brand-mark"><CookingPot size={21} /></span>
        <span><strong>Kasapink</strong><small>CATATAN USAHA</small></span>
      </Link>
      <div className="side-caption">MENU UTAMA</div>
      <nav className="side-nav">
        {visibleNavItems.map(({ href, label, icon: Icon, children }) => children ? <div className={`nav-group ${path.startsWith(`${href}/`) ? 'nav-group-active' : ''}`} key={href}>
          <button type="button" className="nav-group-heading" aria-expanded={expandedMenu === href} aria-controls={`${href.slice(1)}-submenu`} onClick={() => setExpandedMenu((open) => open === href ? null : href)}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronDown className={`nav-group-chevron ${expandedMenu === href ? 'is-open' : ''}`} size={16} />
          </button>
          {expandedMenu === href && <div className="nav-submenu" id={`${href.slice(1)}-submenu`}>{children.map((child) => <Link key={child.href} href={child.href} onClick={(e) => { if (!confirmNavigation()) { e.preventDefault(); return; } setMobileNav(false); setUnsavedChanges(false); }} className={`nav-sub-link ${path === child.href ? 'is-active' : ''}`} data-testid={`link-nav-${child.href.replaceAll('/', '-')}`}>
            <span>{child.label}</span>{path === child.href && <span className="nav-current" />}
          </Link>)}</div>}
        </div> : <Link key={href} href={href} onClick={(e) => { if (!confirmNavigation()) { e.preventDefault(); return; } setMobileNav(false); setUnsavedChanges(false); }} className={`nav-link ${path === href ? 'is-active' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'dashboard'}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{path === href && <span className="nav-current" />}
        </Link>)}
      </nav>
      <div className="sidebar-note"><span className="note-dot" /><div><b>Kasapink ERP</b><small>Catat rapi, hati lebih tenang.</small></div></div>
      <div className="side-footer">Created by<br />Leoneshenkad</div>
    </aside>
    {mobileNav && <button className="scrim" aria-label="Tutup menu" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Buka menu"><Menu size={20} /></button>
        <div className="crumb">Usaha <span>/</span> <b>{active?.label || 'Halaman'}</b></div>
        <div className="topbar-meta">
          <span className={`connection ${connected ? '' : 'connection-off'}`}><i />{connected ? 'Tersambung' : 'Menghubungkan'}</span>
          <div className="top-date"><CalendarDays size={15} /> {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>

          <button type="button" onClick={() => setShowChangePassword(true)} title="Ganti Password" aria-label="Ganti Password" className="button button-secondary" style={{ padding: '6px 10px', marginLeft: '6px' }}>
            <KeyRound size={14} /> Password
          </button>

          <button
            onClick={onLogout}
            title="Kunci Aplikasi"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: 'rgba(225, 29, 72, 0.08)', color: '#e11d48', border: '1px solid rgba(225, 29, 72, 0.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.2s', marginLeft: '6px' }}
          >
            <LogOut size={14} /> Kunci
          </button>
        </div>
      </header>
      <div className={`page-content ${role === 'testing' ? 'testing-readonly' : ''}`}>
        {role === 'testing' && <div className="readonly-notice"><Shield size={16} /> Akun testing hanya dapat melihat data.</div>}
        {children}
      </div>
    </main>
    {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
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
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="input select" {...props} />; }
export function FormError({ text }: { text: string }) { return text ? <div className="form-error"><AlertCircle size={16} />{text}</div> : null; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

  const todayData = state.today || { date: today(), revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 };
  const low = (state.ingredients || []).filter((i) => i.stock <= i.minStock);
  const recentSales = state.recentSales || [];
  const recentPurchases = state.recentPurchases || [];

  const recent = [
    ...recentSales.map((x) => ({ id: `j-${x.id}`, date: x.date, title: 'Penjualan', detail: `${(x.items || []).length} jenis produk`, amount: x.totalRevenue, kind: 'sale' })),
    ...recentPurchases.map((x) => ({ id: `b-${x.id}`, date: x.date, title: 'Belanja bahan', detail: x.supplierType, amount: x.totalCost, kind: 'buy' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return <>
    <PageHeading kicker="RINGKASAN HARI INI" title="KASAPINK." note="Semua catatan usaha hari ini, dalam satu tempat." action={<span className="date-chip"><CalendarDays size={16} />{dateLabel(todayData.date || today())}</span>} />
    <div className="metric-grid">
      <Card className="metric-card metric-feature"><span className="metric-label">PENJUALAN HARI INI</span><strong>{money(todayData.revenue)}</strong><span className="metric-foot"><TrendingUp size={14} /> Uang masuk dari penjualan</span><div className="metric-stamp"><ReceiptText size={20} /></div></Card>
      <Card className="metric-card"><span className="metric-label">LABA KOTOR</span><strong>{money(todayData.grossProfit)}</strong><span className="metric-foot">Setelah biaya bahan terjual</span><div className="metric-side-icon"><TrendingUp size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">BELANJA BAHAN</span><strong>{money(todayData.purchases)}</strong><span className="metric-foot">Pengeluaran hari ini</span><div className="metric-side-icon peach"><ShoppingBasket size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">BAHAN MENIPIS</span><strong>{state.lowStockCount ?? 0}</strong><span className="metric-foot">Perlu dicek sebelum belanja</span><div className="metric-side-icon alert"><Boxes size={18} /></div></Card>
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

const STOCK_CATEGORIES: Record<'Makanan' | 'Parfum', string[]> = {
  Makanan: ['Bahan Pokok', 'Bumbu & Rempah', 'Protein', 'Sayuran', 'Buah', 'Dairy & Olahan Susu', 'Bahan Minuman', 'Bahan Pelengkap', 'Kemasan', 'Lainnya'],
  Parfum: ['Bibit / Fragrance Oil', 'Alcohol & Solvent', 'Fixative & Additive', 'Pewarna', 'Kemasan Parfum', 'Aksesoris', 'Lainnya'],
};

const RECIPE_UNIT_GROUPS: Record<string, { group: string; factor: number }> = {
  gram: { group: 'weight', factor: 1 }, kg: { group: 'weight', factor: 1000 },
  ml: { group: 'volume', factor: 1 }, liter: { group: 'volume', factor: 1000 },
  pcs: { group: 'count', factor: 1 }, butir: { group: 'count', factor: 1 }, ekor: { group: 'count', factor: 1 },
  potong: { group: 'count', factor: 1 }, ikat: { group: 'count', factor: 1 }, pack: { group: 'count', factor: 1 },
  box: { group: 'count', factor: 1 }, botol: { group: 'count', factor: 1 },
};
const recipeUnitFactor = (recipeUnit: string, stockUnit: string) => {
  if (recipeUnit === stockUnit) return 1;
  const a = RECIPE_UNIT_GROUPS[recipeUnit], b = RECIPE_UNIT_GROUPS[stockUnit];
  return a && b && a.group === b.group ? a.factor / b.factor : 1;
};

const STOCK_UNITS: Record<'Makanan' | 'Parfum', string[]> = {
  Makanan: ['kg', 'gram', 'liter', 'ml', 'butir', 'pcs', 'ekor', 'potong', 'ikat', 'pack', 'box'],
  Parfum: ['ml', 'liter', 'gram', 'kg', 'botol', 'pcs', 'pack'],
};

type PriceTrend = { ingredientId: number; ingredientName: string; unit: string; latestPrice: number | null; previousPrice: number | null; changeAmount: number | null; changePercent: number | null; history: Array<{ date: string; supplierType: string; quantity: number; totalCost: number; unitCost: number }> };

function StockPage({ ingredients = [], stockType = 'Makanan', readOnly = false }: { ingredients?: Ingredient[]; stockType?: 'Makanan' | 'Parfum'; readOnly?: boolean }) {
  const safeIngredients = ingredients || [];
  const [modal, setModal] = useState<Ingredient | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const create = useCreateIngredient(), update = useUpdateIngredient(), refresh = useRefresh();
  const [error, setError] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [nameError, setNameError] = useState('');
  const [formDirty, setFormDirty] = useState(false);
  const [priceTrends, setPriceTrends] = useState<PriceTrend[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/erp/price-trends', { headers: authHeaders(), cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data: PriceTrend[]) => { if (active && Array.isArray(data)) setPriceTrends(data); })
      .catch(() => { if (active) setPriceTrends([]); });
    return () => { active = false; };
  }, []);
  const visible = safeIngredients.filter((x) => x.stockType === stockType && `${x.name} ${x.category}`.toLowerCase().includes(search.toLowerCase()));

  const openModal = (value: Ingredient | 'new') => {
    setError('');
    setNameError('');
    setFormDirty(false);
    setUnsavedChanges(false);
    setModal(value);
    setFormCategory(value === 'new' ? '' : value.category);
    setFormUnit(value === 'new' ? '' : value.unit);
  };

  const closeStockModal = () => {
    if (formDirty && !window.confirm('Perubahan belum disimpan. Yakin ingin menutup form? Isian yang belum disimpan akan hilang.')) return;
    setModal(null);
    setFormDirty(false);
    setUnsavedChanges(false);
  };

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const name = String(f.get('name')).trim(), category = String(f.get('category')), unit = String(f.get('unit'));
    if (name && !/^\p{Lu}/u.test(name)) {
      setNameError('Nama bahan harus diawali huruf kapital. Contoh: Bawang Putih.');
      return;
    }
    const stockTypeValue = stockType;
    const minStock = Number(f.get('minStock')), stock = Number(f.get('stock'));
    const success = () => { refresh(); setModal(null); setError(''); setNameError(''); setFormDirty(false); setUnsavedChanges(false); };
    if (modal === 'new') create.mutate({ data: { name, category, stockType: stockTypeValue, unit, stock, minStock } }, { onSuccess: success, onError: (e) => setError(errText(e)) });
    else if (modal) update.mutate({ ingredientId: modal.id, data: { name, category, stockType: stockTypeValue, unit, minStock } }, { onSuccess: success, onError: (e) => setError(errText(e)) });
  };

  const handleDelete = async (id: number, name: string) => {
    if (confirm(`Yakin ingin menghapus bahan "${name}"?`)) {
      try {
        const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Gagal menghapus bahan');
        }
        refresh();
      } catch (err: unknown) {
        alert(errText(err));
      }
    }
  };

  return <>
    <PageHeading kicker={`STOK ${stockType.toUpperCase()}`} title="Stok Bahan" note={`Pantau persediaan dan biaya bahan ${stockType.toLowerCase()}.`} action={<Button onClick={() => openModal('new')}><Plus size={17} /> Tambah bahan</Button>} />
    <Card className="table-card"><div className="table-toolbar"><div className="search-wrap"><span className="search-mark">⌕</span><input aria-label="Cari bahan" data-testid="input-search-ingredients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau kategori..." /></div><span className="result-count">{visible.length} bahan</span></div>
      {visible.length ? <div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>KATEGORI</th><th>STOK SAAT INI</th><th>BATAS MINIMUM</th><th>HARGA TERAKHIR</th><th>TREN PEMBELIAN</th><th /></tr></thead><tbody>{visible.map((i) => <tr key={i.id} data-testid={`row-ingredient-${i.id}`}><td><div className="table-name"><span className="ingredient-token">{i.name.slice(0, 1).toUpperCase()}</span><b>{i.name}</b></div></td><td>{i.category}</td><td><b>{i.stock}</b> <span className="muted">{i.unit}</span></td><td>{i.minStock} <span className="muted">{i.unit}</span></td><td>{money(i.lastPrice)}</td><td>{(() => { const trend = priceTrends.find((item) => item.ingredientId === i.id); if (!trend || trend.changePercent === null) return <span className="muted">Belum cukup data</span>; const up = trend.changePercent > 0; const down = trend.changePercent < 0; return <span className={`status-pill ${up ? 'status-low' : down ? 'status-ok' : ''}`}>{up ? '↑ Naik' : down ? '↓ Turun' : '→ Tetap'} {Math.abs(trend.changePercent).toLocaleString('id-ID')}%<small style={{ display: 'block' }}>{money(trend.previousPrice ?? 0)} → {money(trend.latestPrice ?? 0)}</small></span>; })()}</td><td><span className={`status-pill ${i.stock <= i.minStock ? 'status-low' : 'status-ok'}`}>{i.stock <= i.minStock ? 'Menipis' : 'Aman'}</span>{!readOnly && <><button className="icon-button tiny" aria-label={`Ubah ${i.name}`} onClick={() => openModal(i)}><Pencil size={15} /></button><button className="icon-button tiny" aria-label={`Hapus ${i.name}`} onClick={() => handleDelete(i.id, i.name)} style={{ marginLeft: '6px', color: '#e11d48' }}><Trash2 size={15} /></button></>}</td></tr>)}</tbody></table></div> : <Empty title="Bahan belum ditemukan" text={search ? 'Coba kata pencarian lain.' : 'Tambahkan bahan pertama untuk mulai mengelola stok.'} />}
    </Card>
    {modal && <Modal title={modal === 'new' ? 'Tambah bahan baru' : 'Ubah data bahan'} onClose={closeStockModal}><form className="form-stack" onInput={() => { setFormDirty(true); setUnsavedChanges(true); }} onChange={() => { setFormDirty(true); setUnsavedChanges(true); }} onSubmit={save}>
      <Field label="Nama bahan"><FieldInput disabled={readOnly} name="name" required defaultValue={modal === 'new' ? '' : modal.name} placeholder="Contoh: Tepung terigu" onBlur={(e) => { const value = e.currentTarget.value.trim(); setNameError(value && !/^\p{Lu}/u.test(value) ? 'Nama bahan harus diawali huruf kapital. Contoh: Bawang Putih.' : ''); }} />{nameError && <small className="form-hint" style={{ color: '#b42318' }}>{nameError}</small>}</Field>
      <Field label="Kategori"><FieldSelect disabled={readOnly} name="category" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required><option value="" disabled>Pilih kategori</option>{(STOCK_CATEGORIES[stockType] || []).map((category) => <option key={category} value={category}>{category}</option>)}{formCategory && !STOCK_CATEGORIES[stockType]?.includes(formCategory) && <option value={formCategory}>{formCategory} (kategori lama)</option>}</FieldSelect></Field>
      <Field label="Satuan"><FieldSelect disabled={readOnly} name="unit" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} required><option value="" disabled>Pilih satuan</option>{(STOCK_UNITS[stockType] || []).map((unit) => <option key={unit} value={unit}>{unit}</option>)}{formUnit && !STOCK_UNITS[stockType]?.includes(formUnit) && <option value={formUnit}>{formUnit} (satuan lama)</option>}</FieldSelect></Field>
      {modal === 'new' && <Field label="Stok awal"><FieldInput disabled={readOnly} name="stock" type="number" min="0" step="any" defaultValue="" placeholder="Masukkan jumlah stok" required /></Field>}
      <Field label="Batas minimum"><FieldInput disabled={readOnly} name="minStock" type="number" min="0" step="any" defaultValue={modal === 'new' ? '' : modal.minStock} placeholder="Masukkan batas minimum" required /></Field>
      <FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={closeStockModal}>Batal</Button><Button type="submit" disabled={readOnly || create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Menyimpan…' : 'Simpan bahan'}</Button></div>
    </form></Modal>}
  </>;
}

function ProductPage({ state, businessType = 'Makanan', readOnly = false }: { state: ErpState; businessType?: 'Makanan' | 'Parfum'; readOnly?: boolean }) {
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [needsRecipe, setNeedsRecipe] = useState(true);
  const [autoRecipe, setAutoRecipe] = useState(false);
  const [error, setError] = useState('');
  const [productFormDirty, setProductFormDirty] = useState(false);
  const [prepData, setPrepData] = useState<Prep[]>([]);
  const create = useCreateProduct(), update = useUpdateProduct(), saveRecipe = useSaveProductRecipe(), refresh = useRefresh();
  const safeProducts = state.products || [];
  const visibleProducts = safeProducts.filter((product) => product.businessType === businessType);
  const safeRecipes = state.recipes || [];
  const safeIngredients = state.ingredients || [];
  const macroIngredients = safeIngredients.filter((ingredient) => ingredient.stockType === businessType && !/mikro|operasional/i.test(ingredient.category));
  const recipe = useMemo(() => recipeProduct ? safeRecipes.filter((r) => r.productId === recipeProduct.id) : [], [recipeProduct, safeRecipes]);
  useEffect(() => {
    let active = true;
    fetch('/api/erp/preparations', { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then((d: Prep[]) => { if (active && Array.isArray(d)) setPrepData(d); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const openNewProduct = () => {
    setError('');
    setProductFormDirty(false);
    setUnsavedChanges(false);
    setNeedsRecipe(true);
    setAutoRecipe(false);
    setEditing('new');
  };
  const openEditProduct = (product: Product) => {
    setError('');
    setProductFormDirty(false);
    setUnsavedChanges(false);
    setNeedsRecipe(product.needsRecipe);
    setAutoRecipe(false);
    setEditing(product);
  };
  const closeProductForm = () => {
    if (productFormDirty && !window.confirm('Perubahan belum disimpan. Yakin ingin menutup form? Isian yang belum disimpan akan hilang.')) return;
    setEditing(null);
    setAutoRecipe(false);
    setProductFormDirty(false);
    setUnsavedChanges(false);
  };
  const submitProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      name: String(f.get('name')).trim(),
      sellingPrice: Number(f.get('sellingPrice')),
      businessType,
      needsRecipe,
      stock: needsRecipe ? 0 : Number(f.get('stock') || 0),
      averageCost: needsRecipe ? 0 : Number(f.get('averageCost') || 0),
      ...(editing === 'new' && autoRecipe
        ? { autoRecipeIngredientId: Number(f.get('autoRecipeIngredientId')) }
        : {}),
    };
    const success = () => { refresh(); setEditing(null); setError(''); setAutoRecipe(false); setProductFormDirty(false); setUnsavedChanges(false); };
    if (editing === 'new') create.mutate({ data }, { onSuccess: success, onError: (x) => setError(errText(x)) });
    else if (editing) update.mutate({ productId: editing.id, data }, { onSuccess: success, onError: (x) => setError(errText(x)) });
  };
  const saveRecipeForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!recipeProduct) return;
    const form = new FormData(e.currentTarget);
    const items = safeIngredients.map((i) => ({ ingredientId: i.id, recipeUnit: String(form.get(`unit-${i.id}`) || i.unit), qtyRequired: Number(form.get(`qty-${i.id}`)) || 0 })).filter((i) => i.qtyRequired > 0);
    saveRecipe.mutate({ productId: recipeProduct.id, data: { items } }, { onSuccess: () => { refresh(); setRecipeProduct(null); setError(''); }, onError: (x) => setError(errText(x)) });
  };
  const handleDeleteProduct = async (id: number, name: string) => {
    if (confirm(`Yakin ingin menghapus produk "${name}"?`)) {
      try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Gagal menghapus produk');
        }
        refresh();
      } catch (err: unknown) {
        alert(errText(err));
      }
    }
  };

  return <>
    <PageHeading kicker={`PRODUK ${businessType.toUpperCase()}`} title="Produk & Resep" note="Pilih barang jadi yang stoknya dijual langsung, atau produk olahan yang memakai bahan makro." action={<Button onClick={openNewProduct}><Plus size={17} /> Tambah produk</Button>} />
    {!visibleProducts.length ? <Card><Empty title={`Belum ada produk ${businessType.toLowerCase()}`} text="Tambahkan produk di submenu ini untuk mulai mencatat penjualan." /></Card> :
      <div className="product-list">{visibleProducts.map((p) => {
        const items = safeRecipes.filter((r) => r.productId === p.id);
        const macroItems = items.filter((item) => {
          const ingredient = safeIngredients.find((x) => x.id === item.ingredientId);
          return ingredient && !/mikro|operasional/i.test(ingredient.category);
        });
        const recipeCost = macroItems.reduce((sum, item) => {
          const ingredient = safeIngredients.find((x) => x.id === item.ingredientId);
          return sum + item.qtyRequired * recipeUnitFactor(item.recipeUnit, ingredient?.unit ?? item.recipeUnit) * (ingredient?.averageCost ?? 0);
        }, 0);
        const prepCost = prepData.flatMap((prep) => prep.products.filter((line) => line.productId === p.id).map((line) => line.qtyRequired * recipeUnitFactor(line.recipeUnit, prep.unit) * prep.averageCost)).reduce((sum, value) => sum + value, 0);
        const unitCost = p.needsRecipe ? recipeCost + prepCost : p.averageCost;
        const estimatedGrossProfit = p.sellingPrice - unitCost;
        const marginPercent = p.sellingPrice > 0 ? (estimatedGrossProfit / p.sellingPrice) * 100 : 0;
        return <Card className="product-card" key={p.id}>
          <div className="product-top"><span className="product-illustration"><CookingPot size={21} /></span><div style={{ display: 'flex', gap: '4px' }}>{!readOnly && <><button className="icon-button" aria-label={`Ubah ${p.name}`} onClick={() => openEditProduct(p)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Hapus ${p.name}`} onClick={() => handleDeleteProduct(p.id, p.name)} style={{ color: '#e11d48' }}><Trash2 size={16} /></button></>}</div></div>
          <h2>{p.name}</h2>
          <span className="status-pill status-ok">{p.needsRecipe ? 'Produk olahan' : 'Produk jadi'}</span>
          <div className="product-price">{money(p.sellingPrice)} <small>/ unit</small></div>
          <div className="product-economics">
            {p.needsRecipe && !macroItems.length
              ? <small>Resep belum diatur. Penjualan tetap bisa disimpan dengan warning.</small>
              : <><div><span>{p.needsRecipe ? 'Perkiraan biaya bahan' : 'Biaya beli per unit'}</span><b>{money(unitCost)}</b></div><div><span>Sisa setelah biaya produk</span><b>{money(estimatedGrossProfit)}</b></div><small>{marginPercent.toFixed(1)}% dari harga jual ? di luar biaya operasional</small></>}
            {!p.needsRecipe && <div><span>Stok barang jadi</span><b>{p.stock}</b></div>}
          </div>
          <div className="recipe-summary">{p.needsRecipe ? (macroItems.length ? <>{macroItems.length} bahan makro ? {macroItems.slice(0, 3).map((r) => r.ingredientName).join(', ')}{macroItems.length > 3 ? '?' : ''}</> : <span className="recipe-missing">Resep belum diatur</span>) : 'Stok produk dipotong langsung saat penjualan.'}</div>
          {p.needsRecipe && <button className="recipe-button" disabled={readOnly} onClick={() => { setRecipeProduct(p); setError(''); }}><ClipboardList size={16} /> Atur resep <ArrowRight size={15} /></button>}
        </Card>;
      })}</div>}
    {editing && <Modal title={editing === 'new' ? 'Tambah produk' : 'Ubah produk'} onClose={closeProductForm}>
      <form className="form-stack" onInput={() => { setProductFormDirty(true); setUnsavedChanges(true); }} onChange={() => { setProductFormDirty(true); setUnsavedChanges(true); }} onSubmit={submitProduct}>
        <Field label="Nama produk"><FieldInput disabled={readOnly} name="name" required defaultValue={editing === 'new' ? '' : editing.name} placeholder="Contoh: Parfum botol 30 ml" /></Field>
        <Field label="Harga jual per unit"><FieldInput disabled={readOnly} name="sellingPrice" required type="number" min="0" step="100" defaultValue={editing === 'new' ? '' : editing.sellingPrice} /></Field>

        <fieldset className="product-type-options">
          <legend>Jenis produk</legend>
          <label><input disabled={readOnly} type="radio" name="productType" checked={!needsRecipe} onChange={() => { setNeedsRecipe(false); setAutoRecipe(false); }} /> Produk Jadi <small>Stok barang yang dibeli lalu dijual kembali.</small></label>
          <label><input disabled={readOnly} type="radio" name="productType" checked={needsRecipe} onChange={() => setNeedsRecipe(true)} /> Produk Olahan <small>Penjualan memakai resep bahan makro.</small></label>
        </fieldset>
        {!needsRecipe && <div className="form-row">
          <Field label={editing === 'new' ? 'Stok awal barang jadi' : 'Stok barang jadi'} hint="Isi ulang atau koreksi stok lewat formulir ini."><FieldInput disabled={readOnly} name="stock" required type="number" min="0" step="any" defaultValue={editing === 'new' ? '0' : editing.stock} /></Field>
          <Field label="Biaya beli per unit" hint="Dipakai sebagai biaya pokok penjualan."><FieldInput disabled={readOnly} name="averageCost" required type="number" min="0" step="100" defaultValue={editing === 'new' ? '0' : editing.averageCost} /></Field>
        </div>}
        {needsRecipe && editing === 'new' && <div className="auto-recipe-box">
          <label><input disabled={readOnly} type="checkbox" checked={autoRecipe} onChange={(event) => setAutoRecipe(event.target.checked)} /> Otomatis ambil dari bahan (rasio 1:1)</label>
          <small>Pilih bahan makro utama; sistem membuat resep satu unit bahan untuk satu unit produk.</small>
          {autoRecipe && <Field label="Bahan makro utama"><FieldSelect disabled={readOnly} name="autoRecipeIngredientId" required defaultValue=""><option value="" disabled>Pilih bahan</option>{macroIngredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</FieldSelect></Field>}
        </div>}
        <FormError text={error} />
        <div className="form-actions"><Button variant="quiet" onClick={closeProductForm}>Batal</Button><Button type="submit" disabled={readOnly || create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Menyimpan?' : 'Simpan produk'}</Button></div>
      </form>
    </Modal>}
    {recipeProduct && <Modal title={`Atur resep — ${recipeProduct.name}`} onClose={() => setRecipeProduct(null)}>
      <form className="form-stack" onSubmit={saveRecipeForm}>
        <p className="modal-intro">Masukkan jumlah bahan yang digunakan untuk satu produk. Satuan resep boleh berbeda dari satuan stok jika masih satu kelompok, misalnya stok ayam dalam kg tetapi resep menggunakan gram. Sistem akan mengonversinya otomatis.</p>
        {macroIngredients.length ? <div className="recipe-editor">{macroIngredients.map((i) => { const saved = recipe.find((r) => r.ingredientId === i.id); const units = recipeUnitsFor(i.unit); const selectedUnit = saved?.recipeUnit && units.includes(saved.recipeUnit) ? saved.recipeUnit : i.unit; return <div className="recipe-line" key={i.id}><div><b>{i.name}</b><small>Stok: {i.unit} · digunakan per produk</small></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FieldSelect disabled={readOnly} aria-label={`Satuan resep untuk ${i.name}`} name={`unit-${i.id}`} defaultValue={selectedUnit}>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</FieldSelect><FieldInput disabled={readOnly} aria-label={`Jumlah ${i.name} per produk`} name={`qty-${i.id}`} type="number" min="0" step="any" defaultValue={saved?.qtyRequired || ''} placeholder="Jumlah" /></div></div>; })}</div> : <Empty title="Belum ada bahan makro" text="Tambahkan bahan utama di Stok Bahan terlebih dahulu." />}
        <FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={() => setRecipeProduct(null)}>Batal</Button><Button type="submit" disabled={saveRecipe.isPending || !macroIngredients.length}>{saveRecipe.isPending ? 'Menyimpan?' : 'Simpan resep'}</Button></div>
      </form>
    </Modal>}
  </>;
}

type PurchaseLine = { ingredientId: number; quantity: number; totalCost: number | '' };
function PurchasePage({ ingredients = [], readOnly = false }: { ingredients?: Ingredient[]; readOnly?: boolean }) {
  const safeIngredients = ingredients || [];
  const [date, setDate] = useState(today()), [supplier, setSupplier] = useState('Pasar'), [lines, setLines] = useState<PurchaseLine[]>([{ ingredientId: safeIngredients[0]?.id || 0, quantity: 1, totalCost: '' }]), [error, setError] = useState(''), [done, setDone] = useState('');
  const mutation = useRecordPurchase(), refresh = useRefresh();
  const total = lines.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const patch = (index: number, key: keyof PurchaseLine, value: number | '') => setLines((prev) => prev.map((l, i) => i === index ? { ...l, [key]: value } : l));
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); setDone(''); mutation.mutate({ data: { date, supplierType: supplier, items: lines.filter((l) => l.ingredientId && l.quantity > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), totalCost: Number(l.totalCost || 0) })) } }, { onSuccess: (p) => { refresh(); setUnsavedChanges(false); setDone(`Belanja ${money(p.totalCost)} berhasil dicatat.`); setLines([{ ingredientId: safeIngredients[0]?.id || 0, quantity: 1, totalCost: '' }]); }, onError: (x) => setError(errText(x)) }); };
  return <><PageHeading kicker="PEMBELIAN BAHAN" title="Catat Belanja" note="Satu catatan untuk semua bahan yang dibeli hari ini." />
    <div className="entry-layout"><Card className="entry-card"><div className="card-heading"><div><span className="eyebrow">DETAIL BELANJA</span><h2>Belanja bahan</h2></div><span className="step-number">01</span></div><form onSubmit={submit} className="form-stack" onInput={() => setUnsavedChanges(true)} onChange={() => setUnsavedChanges(true)}><div className="form-row"><Field label="Tanggal"><FieldInput disabled={readOnly} type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Asal belanja"><FieldSelect disabled={readOnly} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option>Pasar</option><option>Toko</option><option>Grosir</option><option>Lainnya</option></FieldSelect></Field></div>
      <div className="line-head"><b>Daftar bahan</b><span>Jumlah & biaya total</span></div>
      {lines.map((l, idx) => <div className="purchase-line" key={idx}><Field label="Bahan"><FieldSelect disabled={readOnly} required value={l.ingredientId || ''} onChange={(e) => patch(idx, 'ingredientId', Number(e.target.value))}><option value="" disabled>Pilih bahan</option>{safeIngredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</FieldSelect></Field><Field label="Jumlah"><FieldInput disabled={readOnly} required min="0.001" step="any" type="number" value={l.quantity} onChange={(e) => patch(idx, 'quantity', Number(e.target.value))} /></Field><Field label="Total biaya"><FieldInput disabled={readOnly} required min="0" step="100" type="number" value={l.totalCost} onChange={(e) => patch(idx, 'totalCost', e.target.value === '' ? '' : Number(e.target.value))} /></Field><button className="remove-line" type="button" aria-label="Hapus baris" disabled={readOnly || lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))}><X size={16} /></button></div>)}
      <button className="add-line" type="button" disabled={readOnly} onClick={() => setLines([...lines, { ingredientId: safeIngredients[0]?.id || 0, quantity: 1, totalCost: '' }])}><CirclePlus size={16} /> Tambah bahan</button>
      <FormError text={error} />{done && <div className="success-message"><Check size={16} />{done}</div>}<div className="form-actions purchase-submit"><div><small>Total pengeluaran</small><strong>{money(total)}</strong></div><Button type="submit" disabled={readOnly || mutation.isPending || !safeIngredients.length}>{mutation.isPending ? 'Menyimpan…' : 'Simpan belanja'}</Button></div>
    </form></Card><aside className="side-tip"><div className="tip-symbol"><ShoppingBasket size={20} /></div><span className="eyebrow">CATATAN KECIL</span><h3>Masukkan total harga per bahan</h3><p>Jika membeli beberapa bahan sekaligus, pisahkan ke baris masing-masing. Stok dan rata-rata biaya akan diperbarui otomatis.</p><div className="tip-rule" /><span className="tip-foot">Belanja hari ini</span><strong>{money(total)}</strong></aside></div>
  </>;
}

function SalePage({ state, readOnly = false }: { state: ErpState; readOnly?: boolean }) {
  const safeProducts = state.products || [];
  const [kategoriPenjualan, setKategoriPenjualan] = useState<'Makanan' | 'Parfum'>('Makanan');
  const availableProducts = safeProducts.filter((product) => product.businessType === kategoriPenjualan);
  const [date, setDate] = useState(today()), [lines, setLines] = useState<{ productId: number; quantity: number | '' }[]>([{ productId: safeProducts.find((product) => product.businessType === 'Makanan')?.id || 0, quantity: '' }]), [error, setError] = useState(''), [done, setDone] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const mutation = useRecordSale(), refresh = useRefresh();
  const total = lines.reduce((n, l) => n + (safeProducts.find((p) => p.id === l.productId)?.sellingPrice || 0) * (Number(l.quantity) || 0), 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setDone(''); setWarnings([]);
    mutation.mutate({ data: { date, items: lines.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })) } }, {
      onSuccess: (sale) => { refresh(); setUnsavedChanges(false); setDone(`Penjualan ${money(sale.totalRevenue)} berhasil dicatat.`); setWarnings(sale.warnings || []); setLines([{ productId: availableProducts[0]?.id || 0, quantity: '' }]); },
      onError: (x) => setError(errText(x)),
    });
  };
  return <><PageHeading kicker="PENJUALAN HARIAN" title="Catat Penjualan" note="Simpan transaksi meski stok kurang; periksa warning untuk bahan atau produk yang perlu diisi." />
    <div className="entry-layout"><Card className="entry-card"><div className="card-heading"><div><span className="eyebrow">TRANSAKSI BARU</span><h2>Penjualan</h2></div><span className="step-number">01</span></div><form onSubmit={submit} className="form-stack" onInput={() => setUnsavedChanges(true)} onChange={() => setUnsavedChanges(true)}>
      <div><span className="mb-2 block text-xs font-semibold text-gray-600">Kategori penjualan</span><div className="flex flex-wrap gap-2" role="group" aria-label="Kategori penjualan">{(['Makanan', 'Parfum'] as const).map((category) => <button key={category} disabled={readOnly} type="button" aria-pressed={kategoriPenjualan === category} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${kategoriPenjualan === category ? 'bg-[#2A3F32] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => { setKategoriPenjualan(category); setLines([{ productId: safeProducts.find((product) => product.businessType === category)?.id || 0, quantity: '' }]); setError(''); setDone(''); setWarnings([]); }}>{category}</button>)}</div></div>
      <Field label="Tanggal"><FieldInput disabled={readOnly} type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="line-head"><b>Produk terjual</b><span>Harga mengikuti daftar produk</span></div>
      {lines.map((l, idx) => <div className="sale-line" key={idx}><Field label="Produk"><FieldSelect disabled={readOnly} required value={l.productId || ''} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, productId: Number(e.target.value) } : item))}><option value="" disabled>Pilih produk</option>{availableProducts.map((p) => <option value={p.id} key={p.id}>{p.name} • {money(p.sellingPrice)}{p.needsRecipe ? ' • olahan' : ` • stok ${p.stock}`}</option>)}</FieldSelect></Field><Field label="Jumlah"><FieldInput disabled={readOnly} required type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, quantity: e.target.value === '' ? '' : Number(e.target.value) } : item))} /></Field><button className="remove-line" type="button" disabled={readOnly || lines.length === 1} aria-label="Hapus produk" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><X size={16} /></button></div>)}
      <button className="add-line" type="button" disabled={readOnly || !availableProducts.length} onClick={() => setLines([...lines, { productId: availableProducts[0]?.id || 0, quantity: '' }])}><CirclePlus size={16} /> Tambah produk</button>
      {!availableProducts.length && <p className="text-sm text-gray-500">Belum ada produk kategori {kategoriPenjualan}. Tambahkan produk melalui menu Produk & Resep.</p>}
      {error && <div className="form-error"><AlertCircle size={16} /><span>{error}</span></div>}{done && <div className="success-message"><Check size={16} />{done}</div>}
      {warnings.length > 0 && <div className="warning-panel" role="alert"><AlertCircle size={18} /><div><b>Transaksi tersimpan dengan catatan stok</b><ul>{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}
      <div className="form-actions purchase-submit"><div><small>Perkiraan penjualan</small><strong>{money(total)}</strong></div><Button type="submit" disabled={readOnly || mutation.isPending || !availableProducts.length}>{mutation.isPending ? 'Menyimpan?' : 'Simpan penjualan'}</Button></div>
    </form></Card><aside className="side-tip"><div className="tip-symbol peach"><ReceiptText size={20} /></div><span className="eyebrow">SEBELUM MENYIMPAN</span><h3>Stok kurang tidak menghentikan transaksi</h3><p>Resep kosong atau stok minus akan ditampilkan sebagai warning setelah penjualan berhasil dicatat. Periksa dan sesuaikan stok secara berkala.</p><Link href="/produk" className="inline-link">Cek produk & resep <ArrowRight size={15} /></Link></aside></div>
  </>;
}

function StockCountPage({ ingredients = [] }: { ingredients?: Ingredient[] }) {
  const safeIngredients = ingredients || [];
  const [date, setDate] = useState(today()), [counts, setCounts] = useState<Record<number, string>>({}), [error, setError] = useState(''), [done, setDone] = useState('');
  const mutation = useRecordStockCount(), refresh = useRefresh();
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); setDone(''); mutation.mutate({ data: { date, items: safeIngredients.map((i) => ({ ingredientId: i.id, countedStock: Number(counts[i.id] ?? i.stock) })) } }, { onSuccess: () => { refresh(); setDone('Stok fisik berhasil disimpan dan saldo stok diperbarui.'); setCounts({}); }, onError: (x) => setError(errText(x)) }); };
  return <><PageHeading kicker="PENYESUAIAN PERSEDIAAN" title="Stok Opname" note="Cocokkan catatan dengan jumlah bahan yang benar-benar ada." />
    <Card className="table-card"><div className="opname-intro"><div><span className="eyebrow">HITUNG FISIK</span><h2>Jumlah bahan di dapur</h2><p>Isi jumlah aktual. Kolom kosong akan memakai jumlah stok saat ini.</p></div><Field label="Tanggal opname"><FieldInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {safeIngredients.length ? <form onSubmit={submit}><div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>CATATAN SISTEM</th><th>JUMLAH FISIK</th><th>SELISIH</th></tr></thead><tbody>{safeIngredients.map((i) => { const value = counts[i.id] === undefined ? i.stock : Number(counts[i.id]); const delta = value - i.stock; return <tr key={i.id}><td><div className="table-name"><span className="ingredient-token">{i.name.slice(0, 1)}</span><b>{i.name}</b></div></td><td>{i.stock} {i.unit}</td><td><div className="count-input"><FieldInput aria-label={`Jumlah fisik ${i.name}`} type="number" min="0" step="any" value={counts[i.id] ?? ''} placeholder={String(i.stock)} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /><span>{i.unit}</span></div></td><td><span className={delta < 0 ? 'negative' : delta > 0 ? 'positive' : 'muted'}>{delta > 0 ? '+' : ''}{delta} {i.unit}</span></td></tr>; })}</tbody></table></div><div className="opname-footer"><FormError text={error} />{done && <div className="success-message"><Check size={16} />{done}</div>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Menyimpan…' : 'Simpan hasil opname'}</Button></div></form> : <Empty title="Belum ada bahan untuk dihitung" text="Tambahkan bahan di menu stok terlebih dahulu." />}
    </Card>
  </>;
}

function ReportPage() {
  const [startDate, setStart] = useState(`${today().slice(0, 7)}-01`), [endDate, setEnd] = useState(today());
  const params = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const query = useGetFinanceReport(params);
  const r = query.data;
  const safeDays = r?.days || [];
  return <><PageHeading kicker="ANGKA USAHA" title="Laporan keuangan" note="Ringkasan penjualan, belanja, dan laba kotor sesuai tanggal." />
    <Card className="report-filter"><div><span className="eyebrow">PERIODE LAPORAN</span><h2>Pilih rentang tanggal</h2></div><div className="date-range"><Field label="Dari"><FieldInput type="date" value={startDate} max={endDate} onChange={(e) => setStart(e.target.value)} /></Field><span className="range-separator">sampai</span><Field label="Sampai"><FieldInput type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEnd(e.target.value)} /></Field></div></Card>
    {query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : r && <>
      <div className="report-metrics"><Card className="report-total"><span className="metric-label">TOTAL PENJUALAN</span><strong>{money(r.revenue)}</strong><small>Pemasukan dari produk terjual</small></Card><Card className="report-total"><span className="metric-label">HARGA POKOK TERJUAL</span><strong>{money(r.costOfGoodsSold)}</strong><small>Biaya bahan untuk produk terjual</small></Card><Card className="report-total"><span className="metric-label">BELANJA BAHAN</span><strong>{money(r.purchases)}</strong><small>Total pembelian bahan baku</small></Card><Card className="report-total highlight"><span className="metric-label">LABA KOTOR</span><strong>{money(r.grossProfit)}</strong><small>Penjualan dikurangi harga pokok</small></Card></div>
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">RINCIAN HARIAN</span><h2>Pergerakan per hari</h2></div><span className="period-chip">{dateLabel(r.startDate)} — {dateLabel(r.endDate)}</span></div>{safeDays.length ? <div className="table-scroll"><table><thead><tr><th>TANGGAL</th><th>PENJUALAN</th><th>HARGA POKOK</th><th>BELANJA</th><th>LABA KOTOR</th></tr></thead><tbody>{safeDays.map((d) => <tr key={d.date}><td><b>{dateLabel(d.date)}</b></td><td>{money(d.revenue)}</td><td>{money(d.costOfGoodsSold)}</td><td>{money(d.purchases)}</td><td><b>{money(d.grossProfit)}</b></td></tr>)}</tbody></table></div> : <Empty title="Belum ada catatan pada periode ini" text="Coba pilih rentang tanggal yang berbeda." />}</Card>
    </>}
  </>;
}


type PrepRecipeLine = { ingredientId: number; ingredientName: string; ingredientUnit: string; qtyRequired: number; recipeUnit: string; conversionFactor: number };
type PrepProductLine = { productId: number; productName: string; qtyRequired: number; recipeUnit: string };
type PrepBatch = { id: number; batchNumber: string; date: string; targetQty: number; actualQty: number; totalCost: number; unitCost: number; yieldPercentage: number; status: string };
type Prep = { id: number; name: string; unit: string; yieldQty: number; stock: number; averageCost: number; active: boolean; recipe: PrepRecipeLine[]; products: PrepProductLine[]; batches: PrepBatch[] };

function PrepPage({ readOnly = false }: { readOnly?: boolean }) {
  const stateQuery = useGetErpState();
  const [preps, setPreps] = useState<Prep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [newYieldQty, setNewYieldQty] = useState('1');
  const [selectedPrep, setSelectedPrep] = useState<number | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<Array<{ ingredientId: number; qtyRequired: number; recipeUnit: string }>>([]);
  const [targetQty, setTargetQty] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [batchDate, setBatchDate] = useState(today());
  const [productId, setProductId] = useState('');
  const [productPrepDraft, setProductPrepDraft] = useState<Array<{ preparationId: number; qtyRequired: number; recipeUnit: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/erp/preparations', { headers: authHeaders() });
      const data = await r.json().catch(() => []);
      if (!r.ok) throw new Error(data.error || 'Gagal memuat data prep.');
      setPreps(data);
    } catch (e) { setError(errText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ingredients = stateQuery.data?.ingredients.filter((x) => x.stockType === 'Makanan') ?? [];
  const products = stateQuery.data?.products.filter((x) => x.businessType === 'Makanan') ?? [];
  const prep = preps.find((x) => x.id === selectedPrep) ?? null;

  useEffect(() => {
    if (!prep) return;
    setRecipeDraft(prep.recipe.map((x) => ({ ingredientId: x.ingredientId, qtyRequired: x.qtyRequired, recipeUnit: x.recipeUnit })));
    setTargetQty(''); setActualQty('');
  }, [selectedPrep]);

  const savePrep = async () => {
    if (readOnly || !newName.trim()) return;
    try {
      const r = await fetch('/api/erp/preparations', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), unit: newUnit, yieldQty: Number(newYieldQty) }) });
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Gagal membuat prep.');
      setNewName(''); await load(); setSelectedPrep(data.id);
    } catch (e) { setError(errText(e)); }
  };

  const saveRecipe = async () => {
    if (readOnly || !prep) return;
    try {
      const r = await fetch(`/api/erp/preparations/${prep.id}/recipe`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ items: recipeDraft }) });
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Gagal menyimpan resep prep.');
      await load();
    } catch (e) { setError(errText(e)); }
  };

  const produce = async () => {
    if (readOnly || !prep) return;
    try {
      const r = await fetch(`/api/erp/preparations/${prep.id}/batches`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ date: batchDate, targetQty: Number(targetQty), actualQty: Number(actualQty) }) });
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Gagal mencatat produksi.');
      setTargetQty(''); setActualQty(''); await load();
    } catch (e) { setError(errText(e)); }
  };

  const loadProductPrep = async (id: string) => {
    setProductId(id);
    if (!id) { setProductPrepDraft([]); return; }
    const p = preps.flatMap((x) => x.products.map((line) => ({ ...line, preparationId: x.id }))).filter((x) => x.productId === Number(id));
    setProductPrepDraft(p.map((x) => ({ preparationId: x.preparationId, qtyRequired: x.qtyRequired, recipeUnit: x.recipeUnit })));
  };
  const saveProductPrep = async () => {
    if (readOnly || !productId) return;
    try {
      const r = await fetch(`/api/erp/products/${productId}/preparations`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ items: productPrepDraft }) });
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Gagal menyimpan komponen prep produk.');
      await load();
    } catch (e) { setError(errText(e)); }
  };

  if (loading) return <LoadingPanel />;
  return <div className="page-stack">
    <PageHeader eyebrow="PRODUKSI" title="Produksi / Prep" description="Buat stok semi-finished seperti nasi matang, ayam suwir, jamur marinasi, usus berbumbu, lontong, dan isian. Resep prep dihitung untuk satu hasil standar; target batch akan menskalakan bahan otomatis." />
    {error && <div className="error-panel"><AlertCircle size={20} /><div><b>Terjadi kendala</b><p>{error}</p></div></div>}

    <Card>
      <div className="card-heading"><div><span className="eyebrow">MASTER PREP</span><h2>Tambah prep baru</h2></div></div>
      <div className="form-grid">
        <Field label="Nama prep"><FieldInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contoh: Ayam Suwir" /></Field>
        <Field label="Satuan stok"><FieldInput value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="kg / gram / pcs" /></Field>
        <Field label="Hasil standar per resep"><FieldInput type="number" min="0.001" step="0.001" value={newYieldQty} onChange={(e) => setNewYieldQty(e.target.value)} placeholder="Contoh 1.8" /></Field>
        {!readOnly && <button className="primary-button" type="button" onClick={() => void savePrep()}><Plus size={16} /> Buat Prep</button>}
      </div>
    </Card>

    <div className="content-grid">
      <Card>
        <div className="card-heading"><div><span className="eyebrow">PREP</span><h2>Stok Prep</h2></div><span className="period-chip">{preps.length} jenis</span></div>
        {preps.length ? <div className="list-stack">{preps.map((p) => <button key={p.id} type="button" className={`list-row ${selectedPrep === p.id ? 'is-active' : ''}`} onClick={() => setSelectedPrep(p.id)}>
          <span><b>{p.name}</b><small>Stok {p.stock} {p.unit} · Hasil standar {p.yieldQty} {p.unit} · HPP {money(p.averageCost)}/{p.unit}</small></span><ArrowRight size={16} />
        </button>)}</div> : <Empty title="Belum ada prep" text="Buat prep pertama untuk memulai produksi batch." />}
      </Card>

      {prep ? <Card>
        <div className="card-heading"><div><span className="eyebrow">DETAIL PREP</span><h2>{prep.name}</h2></div><span className="period-chip">Stok {prep.stock} {prep.unit}</span></div>
        <div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>QTY</th><th>SATUAN RESEP</th><th /></tr></thead><tbody>
          {recipeDraft.map((line, i) => <tr key={i}><td><select value={line.ingredientId} disabled={readOnly} onChange={(e) => setRecipeDraft((x) => x.map((v,j)=>j===i?{...v,ingredientId:Number(e.target.value)}:v))}>{ingredients.map((ing)=><option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}</select></td><td><input type="number" min="0.001" step="0.001" value={line.qtyRequired} disabled={readOnly} onChange={(e)=>setRecipeDraft((x)=>x.map((v,j)=>j===i?{...v,qtyRequired:Number(e.target.value)}:v))}/></td><td><input value={line.recipeUnit} disabled={readOnly} onChange={(e)=>setRecipeDraft((x)=>x.map((v,j)=>j===i?{...v,recipeUnit:e.target.value}:v))}/></td><td>{!readOnly && <button className="icon-button" type="button" onClick={()=>setRecipeDraft((x)=>x.filter((_,j)=>j!==i))}><Trash2 size={15}/></button>}</td></tr>)}
        </tbody></table></div>
        {!readOnly && <div className="button-row"><button className="secondary-button" type="button" onClick={()=>{const ing=ingredients[0]; if(ing)setRecipeDraft((x)=>[...x,{ingredientId:ing.id,qtyRequired:1,recipeUnit:ing.unit}]);}}><Plus size={16}/> Tambah bahan</button><button className="primary-button" type="button" onClick={()=>void saveRecipe()}><Check size={16}/> Simpan resep prep</button></div>}

        <div className="section-divider" />
        <div className="card-heading"><div><span className="eyebrow">PRODUKSI BATCH</span><h2>Buat stok prep</h2></div></div>
        <div className="form-grid"><Field label="Tanggal"><FieldInput type="date" value={batchDate} onChange={(e)=>setBatchDate(e.target.value)} /></Field><Field label="Target"><FieldInput type="number" min="0.001" step="0.001" value={targetQty} onChange={(e)=>setTargetQty(e.target.value)} placeholder={`mis. 2 ${prep.unit}`} /></Field><Field label="Hasil aktual"><FieldInput type="number" min="0.001" step="0.001" value={actualQty} onChange={(e)=>setActualQty(e.target.value)} placeholder={`mis. 1.8 ${prep.unit}`} /></Field>{!readOnly && <button className="primary-button" type="button" onClick={()=>void produce()}><CookingPot size={16}/> Catat produksi</button>}</div>
        <p className="helper-text">Yield dihitung otomatis dari hasil aktual ÷ target. Bahan baku dikurangi saat produksi dikonfirmasi dan hasilnya masuk sebagai stok prep.</p>

        {prep.batches.length > 0 && <div className="table-scroll"><table><thead><tr><th>BATCH</th><th>TANGGAL</th><th>HASIL</th><th>YIELD</th><th>HPP/UNIT</th></tr></thead><tbody>{prep.batches.slice(0,10).map((b)=><tr key={b.id}><td><b>{b.batchNumber}</b></td><td>{dateLabel(b.date)}</td><td>{b.actualQty} {prep.unit}</td><td>{b.yieldPercentage}%</td><td>{money(b.unitCost)}</td></tr>)}</tbody></table></div>}
      </Card> : <Card><Empty title="Pilih prep" text="Pilih prep di sebelah kiri untuk mengatur resep dan produksi batch." /></Card>}
    </div>

    <Card>
      <div className="card-heading"><div><span className="eyebrow">INTEGRASI PRODUK</span><h2>Pasangkan prep ke produk jualan</h2></div></div>
      <p className="helper-text">Contoh: Nasi Bakar Ayam memakai Nasi Matang 120 g dan Ayam Suwir 40 g. Saat terjual, stok prep akan berkurang otomatis.</p>
      <div className="form-grid"><Field label="Produk"><select value={productId} onChange={(e)=>void loadProductPrep(e.target.value)}><option value="">Pilih produk...</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></div>
      {productId && <><div className="table-scroll"><table><thead><tr><th>PREP</th><th>QTY</th><th>SATUAN RESEP</th><th /></tr></thead><tbody>{productPrepDraft.map((line,i)=><tr key={i}><td><select value={line.preparationId} onChange={(e)=>setProductPrepDraft(x=>x.map((v,j)=>j===i?{...v,preparationId:Number(e.target.value)}:v)} disabled={readOnly}>{preps.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></td><td><input type="number" min="0.001" step="0.001" value={line.qtyRequired} onChange={(e)=>setProductPrepDraft(x=>x.map((v,j)=>j===i?{...v,qtyRequired:Number(e.target.value)}:v)} disabled={readOnly}/></td><td><input value={line.recipeUnit} disabled={readOnly} onChange={(e)=>setProductPrepDraft(x=>x.map((v,j)=>j===i?{...v,recipeUnit:e.target.value}:v))}/></td><td>{!readOnly&&<button className="icon-button" type="button" onClick={()=>setProductPrepDraft(x=>x.filter((_,j)=>j!==i))}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table></div>{!readOnly&&<div className="button-row"><button className="secondary-button" type="button" onClick={()=>{const p=preps[0];if(p)setProductPrepDraft(x=>[...x,{preparationId:p.id,qtyRequired:1,recipeUnit:p.unit}]);}}><Plus size={16}/> Tambah prep</button><button className="primary-button" type="button" onClick={()=>void saveProductPrep()}><Check size={16}/> Simpan komponen prep</button></div>}</>}
    </Card>
  </div>;
}


function FnbControlPage() {
  const stateQuery = useGetErpState();
  const [startDate,setStartDate]=useState(today());
  const [endDate,setEndDate]=useState(today());
  const [report,setReport]=useState<any>(null);
  const [wasteType,setWasteType]=useState<'ingredient'|'preparation'>('ingredient');
  const [wasteItem,setWasteItem]=useState('');
  const [wasteQty,setWasteQty]=useState('');
  const [wasteReason,setWasteReason]=useState('Basi / rusak');
  const [expenseCategory,setExpenseCategory]=useState('Gas');
  const [expenseDescription,setExpenseDescription]=useState('');
  const [expenseAmount,setExpenseAmount]=useState('');
  const [error,setError]=useState('');
  const load=useCallback(async()=>{try{setError('');const r=await fetch(`/api/erp/fnb-report?startDate=${startDate}&endDate=${endDate}`,{headers:authHeaders()});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Gagal memuat laporan F&B.');setReport(d);}catch(e){setError(errText(e));}},[startDate,endDate]);
  useEffect(()=>{void load();},[load]);
  const ingredients=stateQuery.data?.ingredients.filter(x=>x.stockType==='Makanan')??[];
  const prepQuery=useState<Prep[]>([]); const preps=prepQuery[0]; const setPreps=prepQuery[1];
  useEffect(()=>{void fetch('/api/erp/preparations',{headers:authHeaders()}).then(r=>r.json()).then(d=>setPreps(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const items=wasteType==='ingredient'?ingredients:preps;
  const addWaste=async()=>{try{const r=await fetch('/api/erp/waste',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({date:endDate,itemType:wasteType,itemId:Number(wasteItem),quantity:Number(wasteQty),reason:wasteReason})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Gagal mencatat waste.');setWasteQty('');await load();}catch(e){setError(errText(e));}};
  const addExpense=async()=>{try{const r=await fetch('/api/erp/expenses',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({date:endDate,category:expenseCategory,description:expenseDescription,amount:Number(expenseAmount)})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Gagal mencatat biaya.');setExpenseDescription('');setExpenseAmount('');await load();}catch(e){setError(errText(e));}};
  return <div className="page-stack">
    <PageHeader eyebrow="KONTROL F&B" title="Food Cost & Profitabilitas" description="Pantau food cost aktual, food cost teoritis, waste, biaya operasional, dan menu paling menguntungkan." />
    <Card><div className="form-grid"><Field label="Dari"><FieldInput type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></Field><Field label="Sampai"><FieldInput type="date" value={endDate} min={startDate} max={today()} onChange={e=>setEndDate(e.target.value)}/></Field></div></Card>
    {error&&<div className="error-panel"><AlertCircle size={20}/><div><b>Terjadi kendala</b><p>{error}</p></div></div>}
    {report&&<><div className="report-metrics">
      <Card className="report-total"><span className="metric-label">PENJUALAN</span><strong>{money(report.revenue)}</strong><small>Pendapatan menu</small></Card>
      <Card className="report-total"><span className="metric-label">FOOD COST AKTUAL</span><strong>{report.actualFoodCostPercentage}%</strong><small>{money(report.actualCogs)} COGS</small></Card>
      <Card className="report-total"><span className="metric-label">FOOD COST TEORITIS</span><strong>{report.theoreticalFoodCostPercentage}%</strong><small>{money(report.theoreticalCogs)} biaya ideal</small></Card>
      <Card className="report-total highlight"><span className="metric-label">LABA BERSIH OPERASIONAL</span><strong>{money(report.netProfit)}</strong><small>Setelah waste & biaya operasional</small></Card>
    </div>
    <Card><div className="card-heading"><div><span className="eyebrow">MENU PROFITABILITY</span><h2>Performa per menu</h2></div><span className="period-chip">Variance {money(report.foodCostVariance)}</span></div><div className="table-scroll"><table><thead><tr><th>MENU</th><th>TERJUAL</th><th>PENJUALAN</th><th>HPP</th><th>FOOD COST</th><th>LABA KOTOR</th></tr></thead><tbody>{report.menus.map((m:any)=><tr key={m.productId}><td><b>{m.productName}</b></td><td>{m.quantity}</td><td>{money(m.revenue)}</td><td>{money(m.actualCogs)}</td><td>{m.foodCostPercentage}%</td><td><b>{money(m.grossProfit)}</b></td></tr>)}</tbody></table></div></Card>
    <div className="content-grid"><Card><div className="card-heading"><div><span className="eyebrow">WASTE</span><h2>Catat bahan terbuang</h2></div></div><div className="form-grid"><Field label="Jenis"><select value={wasteType} onChange={e=>{setWasteType(e.target.value as any);setWasteItem('')}}><option value="ingredient">Bahan</option><option value="preparation">Prep</option></select></Field><Field label="Item"><select value={wasteItem} onChange={e=>setWasteItem(e.target.value)}><option value="">Pilih...</option>{items.map((x:any)=><option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}</select></Field><Field label="Jumlah"><FieldInput type="number" min="0.001" step="0.001" value={wasteQty} onChange={e=>setWasteQty(e.target.value)}/></Field><Field label="Alasan"><FieldInput value={wasteReason} onChange={e=>setWasteReason(e.target.value)}/></Field><button className="primary-button" type="button" onClick={()=>void addWaste()}><Trash2 size={16}/> Catat Waste</button></div><p className="helper-text">Waste langsung mengurangi stok dan nilainya masuk laporan. Ini dipisahkan dari susut/yield produksi.</p></Card>
    <Card><div className="card-heading"><div><span className="eyebrow">BIAYA OPERASIONAL</span><h2>Catat biaya di luar bahan</h2></div></div><div className="form-grid"><Field label="Kategori"><FieldInput value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)} placeholder="Gas, listrik, air, transport..." /></Field><Field label="Keterangan"><FieldInput value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)}/></Field><Field label="Nominal"><FieldInput type="number" min="1" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)}/></Field><button className="primary-button" type="button" onClick={()=>void addExpense()}><ReceiptText size={16}/> Simpan Biaya</button></div><p className="helper-text">Biaya operasional dipakai untuk menghitung laba bersih setelah laba kotor.</p></Card></div>
    <Card><div className="card-heading"><div><span className="eyebrow">RINGKASAN KONTROL</span><h2>Waste & biaya</h2></div></div><div className="report-metrics"><div className="metric-box"><span>Waste</span><b>{money(report.wasteCost)}</b><small>{report.wasteCount} catatan</small></div><div className="metric-box"><span>Biaya operasional</span><b>{money(report.operatingExpenses)}</b><small>periode terpilih</small></div><div className="metric-box"><span>Variance food cost</span><b>{money(report.foodCostVariance)}</b><small>aktual − teoritis</small></div></div></Card>
    </>}
  </div>;
}

function AppContent({ onLogout, role }: { onLogout: () => void; role: UserRole }) {
  const query = useGetErpState();
  const health = useHealthCheck();
  const state = query.data;
  const fallback: ErpState = { ingredients: [], products: [], recipes: [], recentPurchases: [], recentSales: [], today: { date: today(), revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }, lowStockCount: 0 };
  const shared = state || fallback;
  return <Shell connected={health.isSuccess} onLogout={onLogout} role={role}><ErrorBoundary resetKey="routes"><Switch>
    <Route path="/" component={() => <Dashboard state={state} error={query.isError ? errText(query.error) : undefined} retry={() => void query.refetch()} />} />
    <Route path="/stok" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Makanan" readOnly={role === 'testing'} />} />
    <Route path="/stok/makanan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Makanan" />} />
    <Route path="/stok/parfum" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Parfum" readOnly={role === 'testing'} />} />
    <Route path="/produk" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Makanan" readOnly={role === 'testing'} />} />
    <Route path="/produk/makanan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Makanan" />} />
    <Route path="/produk/parfum" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Parfum" readOnly={role === 'testing'} />} />
    <Route path="/belanja" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <PurchasePage ingredients={shared.ingredients} readOnly={role === 'testing'} />} />
    <Route path="/penjualan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <SalePage state={shared} readOnly={role === 'testing'} />} />
    <Route path="/prep" component={() => <PrepPage readOnly={role === 'testing'} />} />
    <Route path="/kontrol-fnb" component={() => <FnbControlPage />} />
    <Route path="/opname" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockCountPage ingredients={shared.ingredients} />} />
    <Route path="/laporan" component={ReportPage} />
    <Route path="/users" component={() => role === 'admin' ? <UsersPage /> : <div className="error-panel"><Shield size={20} /><div><b>Akses khusus admin</b><p>Akun testing hanya dapat melihat data ERP.</p></div></div>} />

    <Route component={() => <div className="not-found"><span className="eyebrow">HALAMAN TIDAK ADA</span><h1>Sepertinya tersesat.</h1><Link href="/" className="inline-link">Kembali ke ringkasan <ArrowRight size={16} /></Link></div>} />
  </Switch></ErrorBoundary></Shell>;
}

function AppRoutes({ isAuthenticated, authReady, user, setupAvailable, onLogin, onSetup, usernameInput, setUsernameInput, passwordInput, setPasswordInput, errorMsg, onLogout }: {
  isAuthenticated: boolean; authReady: boolean; user: AppUser | null; setupAvailable: boolean;
  onLogin: (e: React.FormEvent) => void; onSetup: (username: string, password: string, bootstrapToken: string) => void;
  usernameInput: string; setUsernameInput: (val: string) => void; passwordInput: string;
  setPasswordInput: (val: string) => void; errorMsg: string; onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  if (!authReady) return <LoadingPanel />;
  if (!isAuthenticated && location !== '/login') setLocation('/login');
  if (isAuthenticated && location === '/login') setLocation('/');
  if (isAuthenticated && user?.role !== 'admin' && location === '/users') setLocation('/');
  if (!isAuthenticated) return <LoginPage onLogin={onLogin} onSetup={onSetup} setupAvailable={setupAvailable}
    usernameInput={usernameInput} setUsernameInput={setUsernameInput} passwordInput={passwordInput}
    setPasswordInput={setPasswordInput} errorMsg={errorMsg} />;
  return <AppContent onLogout={onLogout} role={user?.role || 'testing'} />;
}

const AUTO_LOGOUT_MS = 20 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'kasapink_last_activity';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogout = useCallback(() => {
    localStorage.removeItem('kasapink_token');
    localStorage.removeItem('kasapink_user');
    localStorage.removeItem('kasapink_auth');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  const saveSession = useCallback((data: { token: string; user: AppUser }) => {
    localStorage.setItem('kasapink_token', data.token);
    localStorage.setItem('kasapink_user', JSON.stringify(data.user));
    localStorage.setItem('kasapink_auth', 'true');
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setCurrentUser(data.user);
    setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const setupResponse = await fetch('/api/setup/status');
        const setup = await setupResponse.json().catch(() => ({}));
        if (active) setSetupAvailable(Boolean(setup.needsAdmin && setup.setupEnabled));
        const token = localStorage.getItem('kasapink_token');
        const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        if (!token || !Number.isFinite(lastActivity) || Date.now() - lastActivity >= AUTO_LOGOUT_MS) {
          handleLogout();
          return;
        }
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) { handleLogout(); return; }
        const data = await response.json();
        if (active) {
          localStorage.setItem('kasapink_user', JSON.stringify(data.user));
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        }
      } catch {
        handleLogout();
      } finally {
        if (active) setAuthReady(true);
      }
    })();
    return () => { active = false; };
  }, [handleLogout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameInput.trim(), password: passwordInput }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Login gagal.');
      saveSession(data);
      setUsernameInput(''); setPasswordInput('');
    } catch (error) { setErrorMsg(errText(error)); }
  };

  const handleSetup = async (username: string, password: string, bootstrapToken: string) => {
    setErrorMsg('');
    try {
      const response = await fetch('/api/setup/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, bootstrapToken }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal membuat admin.');
      saveSession(data);
      setSetupAvailable(false);
    } catch (error) { setErrorMsg(errText(error)); }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: number;
    const expireIfIdle = () => {
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      const remaining = AUTO_LOGOUT_MS - (Date.now() - lastActivity);
      if (!Number.isFinite(lastActivity) || remaining <= 0) {
        handleLogout();
        return;
      }
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(expireIfIdle, remaining);
    };
    const recordActivity = () => {
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      if (Number.isFinite(lastActivity) && Date.now() - lastActivity >= AUTO_LOGOUT_MS) {
        handleLogout();
        return;
      }
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      expireIfIdle();
    };
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) expireIfIdle();
      if (event.key === 'kasapink_token' && !event.newValue) handleLogout();
    };

    expireIfIdle();
    window.addEventListener('pointerdown', recordActivity);
    window.addEventListener('keydown', recordActivity);
    window.addEventListener('touchstart', recordActivity);
    window.addEventListener('wheel', recordActivity);
    window.addEventListener('storage', syncAcrossTabs);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
      window.removeEventListener('wheel', recordActivity);
      window.removeEventListener('storage', syncAcrossTabs);
    };
  }, [isAuthenticated, handleLogout]);

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRoutes isAuthenticated={isAuthenticated} authReady={authReady} user={currentUser}
            setupAvailable={setupAvailable} onLogin={handleLogin} onSetup={handleSetup}
            usernameInput={usernameInput} setUsernameInput={setUsernameInput}
            passwordInput={passwordInput} setPasswordInput={setPasswordInput}
            errorMsg={errorMsg} onLogout={handleLogout} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
