import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetErpStateQueryKey, getGetFinanceReportQueryKey, useHealthCheck, useCreateIngredient,
  useCreateProduct, useGetErpState, useGetFinanceReport, useRecordPurchase,
  useRecordSale, useRecordStockCount, useSaveProductRecipe, useUpdateIngredient,
  useUpdateProduct, getListIngredientsQueryKey, useListIngredients,
  getListProductsQueryKey, useListProducts, getListSalesQueryKey, useListSales,
} from '@workspace/api-client-react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import type { ErpState, Ingredient, Product, RecipeItem } from '@workspace/api-client-react';
import {
  AlertCircle, ArrowDownLeft, ArrowRight, Boxes, CalendarDays, Check, ChevronDown,
  CirclePlus, ClipboardList, CookingPot, Download, FileText, Home, LogOut, Menu,
  KeyRound, LoaderCircle, Pencil, Plus, ReceiptText, ShoppingBasket, Shield, Trash2,
  TrendingUp, UserRound, X,
} from 'lucide-react';
import ChangePasswordModal from './components/ChangePasswordModal';
import PasswordInput from './components/PasswordInput';
import UsersPage from './pages/UsersPage';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const client = new QueryClient();
type UserRole = 'admin' | 'testing' | 'user';
type AppUser = { id: number; username: string; role: UserRole };
setAuthTokenGetter(() => null);
const navItems = [
  { href: '/overview', label: 'Overview', icon: Home, children: [{ href: '/', label: 'Dashboard' }] },
  { href: '/inventory', label: 'Inventory', icon: Boxes, children: [
    { href: '/stok/makanan', label: 'Stok bahan · Makanan' },
    { href: '/stok/parfum', label: 'Stok bahan · Parfum' },
    { href: '/produk/makanan', label: 'Produk & resep · Makanan' },
    { href: '/produk/parfum', label: 'Produk & resep · Parfum' },
    { href: '/prep', label: 'Produksi / Prep' },
  ] },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, children: [
    { href: '/belanja', label: 'Catat belanja' },
    { href: '/penjualan', label: 'Catat penjualan' },
    { href: '/opname', label: 'Stok opname' },
  ] },
  { href: '/reports', label: 'Reports', icon: FileText, children: [
    { href: '/laporan', label: 'Laporan keuangan' },
    { href: '/kontrol-fnb', label: 'Kontrol F&B' },
  ] },
  { href: '/management', label: 'Management', icon: Shield, children: [{ href: '/users', label: 'Pengguna & role' }], adminOnly: true },
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
const authHeaders = () => ({ });

let unsavedChanges = false;
const setUnsavedChanges = (value: boolean) => { unsavedChanges = value; };
const confirmNavigation = () => !unsavedChanges || window.confirm('Perubahan belum disimpan. Jika pindah menu sekarang, isian yang belum disimpan akan hilang. Tetap keluar?');

function LoginPage({ onLogin, onSetup, setupAvailable, usernameInput, setUsernameInput, passwordInput, setPasswordInput, errorMsg, loginPending }: {
  onLogin: (e: React.FormEvent) => void;
  onSetup: (username: string, password: string, bootstrapToken: string) => void;
  setupAvailable: boolean;
  usernameInput: string;
  setUsernameInput: (val: string) => void;
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  errorMsg: string;
  loginPending: boolean;
}) {
  const [setupMode, setSetupMode] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  return (
    <div className="login-page">
      <div className="login-layout">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand-lockup">
            <span className="login-brand-mark"><CookingPot size={27} strokeWidth={1.8} /></span>
            <span><strong>Kasapink</strong><small>CATATAN USAHA</small></span>
          </div>
          <div className="login-card-heading">
            <div>
              <h2 id="login-title">{setupMode ? 'Buat akun admin' : 'Masuk'}</h2>
            </div>
          </div>

        {setupMode ? <form className="login-form" onSubmit={(e) => { e.preventDefault(); onSetup(setupUsername, setupPassword, bootstrapToken); }}>
          <label className="login-field"><span>TOKEN SETUP</span><input className="login-input" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder="Masukkan token setup" autoComplete="off" required /></label>
          <label className="login-field"><span>USERNAME ADMIN</span><input className="login-input" value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} placeholder="Username admin" autoComplete="username" required /></label>
          <label className="login-field"><span>PASSWORD</span><PasswordInput className="login-input" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required /></label>
          {errorMsg && <p className="login-error" role="alert">{errorMsg}</p>}
          <button type="submit" className="login-submit">Buat admin pertama</button>
          <button type="button" className="text-button" onClick={() => setSetupMode(false)}>Kembali ke login</button>
        </form> : <form onSubmit={onLogin} className="login-form">
          <label className="login-field"><span>USERNAME</span>
            <input disabled={loginPending} type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Masukkan username" autoComplete="username" required className="login-input" />
          </label>
          <label className="login-field"><span>PASSWORD</span>
            <PasswordInput
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
              disabled={loginPending}
              className="login-input"
              autoFocus
            />
          </label>
          {errorMsg && <p className="login-error" role="alert">{errorMsg}</p>}
          <button
            type="submit"
            disabled={loginPending}
            className="login-submit"
          >
            {loginPending ? <><LoaderCircle className="spin" size={17} /> Memeriksa…</> : 'Masuk'}
          </button>
          {setupAvailable && <button type="button" className="text-button" onClick={() => setSetupMode(true)}>Buat admin pertama</button>}
        </form>}

        </section>
        <section className="login-brand-panel" aria-label="Kasapink ERP">
          <img className="login-illustration" src="/kasapink-login-illustration.png" alt="Ilustrasi dashboard stok dan produk Kasapink ERP" />
        </section>
      </div>
    </div>
  );
}

function Shell({ children, connected, onLogout, user }: { children: React.ReactNode; connected: boolean; onLogout: () => void; user: AppUser }) {
  const [path] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const visibleNavItems = useMemo(() => navItems.filter((item) => !('adminOnly' in item && item.adminOnly) || user.role === 'admin'), [user.role]);
  const active = visibleNavItems.flatMap((n) => n.children || [n]).find((n) => n.href === path);
  useEffect(() => {
    const activeGroup = visibleNavItems.find((item) => item.children?.some((child) => child.href === path));
    if (activeGroup) setExpandedMenu(activeGroup.href);
  }, [path, user.role, visibleNavItems]);
  useEffect(() => {
    if (!userMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [userMenuOpen]);
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" onClick={() => setMobileNav(false)}>
        <span className="brand-mark"><CookingPot size={21} /></span>
        <span><strong>Kasapink</strong><small>CATATAN USAHA</small></span>
      </Link>
      <div className="sidebar-profile">
        <span className="profile-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
        <span><b>{user.username}</b><small>{user.role === 'admin' ? 'Business owner' : 'Read only'}</small></span>
      </div>
      <div className="side-caption">MENU UTAMA</div>
      <nav className="side-nav">
        {visibleNavItems.map(({ href, label, icon: Icon, children }) => children ? <div className={`nav-group ${children.some((child) => child.href === path) ? 'nav-group-active' : ''}`} key={href}>
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

          <div className="user-menu" ref={userMenuRef}>
            <button type="button" className="user-menu-trigger" aria-label={`Menu akun ${user.username}`} aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
              <span className="user-avatar"><UserRound size={15} /></span>
              <span className="user-menu-copy"><b>{user.username}</b><small>{user.role === 'admin' ? 'Administrator' : 'Testing'}</small></span>
              <ChevronDown className={userMenuOpen ? 'is-open' : ''} size={15} />
            </button>
            {userMenuOpen && <div className="user-menu-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); setShowChangePassword(true); }}><KeyRound size={15} /><span><b>Ganti password</b><small>Perbarui keamanan akun</small></span></button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}><LogOut size={15} /><span><b>Keluar</b><small>Akhiri semua sesi akun</small></span></button>
            </div>}
          </div>
        </div>
      </header>
      <div className={`page-content ${user.role === 'testing' ? 'testing-readonly' : ''}`}>
        {user.role === 'testing' && <div className="readonly-notice"><Shield size={16} /> Akun testing hanya dapat melihat data.</div>}
        {children}
      </div>
    </main>
    {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    {showLogoutConfirm && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-title">
      <span className="confirm-icon"><LogOut size={21} /></span>
      <div><span className="eyebrow">KONFIRMASI AKUN</span><h2 id="logout-title">Keluar dari Kasapink?</h2><p>Semua sesi aktif akun <b>{user.username}</b> akan diakhiri. Anda perlu login kembali untuk masuk.</p></div>
      <div className="confirm-actions"><Button variant="quiet" onClick={() => setShowLogoutConfirm(false)}>Batal</Button><button type="button" className="button button-danger" onClick={() => { setShowLogoutConfirm(false); onLogout(); }}><LogOut size={15} /> Ya, keluar</button></div>
    </div></div>}
  </div>;
}

function PageHeading({ kicker, title, note, action }: { kicker: string; title: string; note: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{note}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Card({ children, className = '', ...props }: React.ComponentProps<'section'>) { return <section className={`card ${className}`} {...props}>{children}</section>; }
function LoadingPanel() { return <div className="loading-grid"><div className="skeleton big" /><div className="skeleton" /><div className="skeleton" /></div>; }
function FnbLoadingPanel() { return <div className="grid gap-3" aria-label="Memuat kontrol F&B"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border border-stone-200 bg-white p-4"><div className="h-2 w-20 rounded bg-stone-200" /><div className="mt-5 h-6 w-28 rounded bg-stone-100" /></div>)}</div><div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="h-52 animate-pulse rounded-xl border border-stone-200 bg-white" /><div className="h-52 animate-pulse rounded-xl border border-stone-200 bg-white" /></div></div>; }
function ErrorPanel({ message, retry }: { message: string; retry: () => void }) { return <div className="error-panel"><AlertCircle size={22} /><div><b>Data belum dapat dimuat</b><p>{message}</p><button className="text-button" onClick={retry}>Coba muat kembali</button></div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span className="empty-icon"><Boxes size={20} /></span><b>{title}</b><p>{text}</p></div>; }
function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet'; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant}`} data-testid="button-action">{children}</button>;
}
function PaginationControls({ page, totalItems, pageSize, onPageChange, label = 'data' }: { page: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; label?: string }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalItems);
  return <div className="pagination-bar"><span>Menampilkan {start}–{end} dari {totalItems} {label}</span><div><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Halaman sebelumnya">‹</button><span>Halaman <b>{page}</b> / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Halaman berikutnya">›</button></div></div>;
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
    void qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
  };
}

function Dashboard({ state, error, retry }: { state?: ErpState; error?: string; retry: () => void }) {
  const chartParams = useMemo(() => ({ startDate: `${today().slice(0, 7)}-01`, endDate: today() }), []);
  const chartQuery = useGetFinanceReport(chartParams);
  const chartData = (chartQuery.data?.days || []).map((day) => ({ label: day.date.slice(5), sales: Number(day.revenue), purchases: Number(day.purchases) }));
  const chartMax = Math.max(1, ...chartData.flatMap((day) => [day.sales, day.purchases]));
  const chartPoint = (value: number, index: number) => {
    const x = chartData.length <= 1 ? 360 : 42 + (index / (chartData.length - 1)) * 636;
    const y = 170 - (value / chartMax) * 142;
    return `${x},${y}`;
  };
  const salesPoints = chartData.map((day, index) => chartPoint(day.sales, index)).join(' ');
  const purchasePoints = chartData.map((day, index) => chartPoint(day.purchases, index)).join(' ');
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
    <PageHeading kicker="WORKSPACE OVERVIEW" title="Dashboard" note="Pantau penjualan, stok, dan aktivitas usaha dari satu ruang kerja." action={<span className="date-chip"><CalendarDays size={16} />{dateLabel(todayData.date || today())}</span>} />
    <div className="metric-grid">
      <Card className="metric-card metric-feature"><span className="metric-label">TOTAL SALES</span><strong>{money(todayData.revenue)}</strong><span className="metric-foot"><TrendingUp size={14} /> Hari ini</span><div className="metric-stamp"><ReceiptText size={20} /></div></Card>
      <Card className="metric-card"><span className="metric-label">GROSS PROFIT</span><strong>{money(todayData.grossProfit)}</strong><span className="metric-foot">Setelah biaya bahan terjual</span><div className="metric-side-icon"><TrendingUp size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">PURCHASES</span><strong>{money(todayData.purchases)}</strong><span className="metric-foot">Belanja bahan hari ini</span><div className="metric-side-icon peach"><ShoppingBasket size={18} /></div></Card>
      <Card className="metric-card"><span className="metric-label">LOW STOCK</span><strong>{state.lowStockCount ?? 0}</strong><span className="metric-foot">Item perlu dicek</span><div className="metric-side-icon alert"><Boxes size={18} /></div></Card>
    </div>
    <Card className="dashboard-chart-card">
      <div className="card-heading dashboard-chart-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>Sales overview</h2></div><span className="period-chip">This month</span></div>
      <div className="dashboard-chart-legend"><span><i className="legend-dot sales" />Sales</span><span><i className="legend-dot purchases" />Purchases</span></div>
      <div className="dashboard-chart" aria-label="Grafik penjualan dan belanja bulanan">
        {chartData.length ? <svg className="sales-chart-svg" viewBox="0 0 720 205" role="img" aria-label="Grafik penjualan dan belanja bulanan">
          <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f2bfd2" stopOpacity=".65" /><stop offset="100%" stopColor="#f2bfd2" stopOpacity=".08" /></linearGradient></defs>
          {[28, 75, 122, 170].map((y) => <line key={y} x1="42" x2="678" y1={y} y2={y} stroke="#f2bfd2" strokeOpacity=".45" />)}
          <polygon points={`42,170 ${salesPoints} 678,170`} fill="url(#salesFill)" />
          <polyline points={salesPoints} fill="none" stroke="#f2bfd2" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={purchasePoints} fill="none" stroke="#fdcee0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {chartData.map((day, index) => <text key={day.label} x={chartData.length <= 1 ? 360 : 42 + (index / (chartData.length - 1)) * 636} y="198" textAnchor="middle" fill="#8b6072" fontSize="10">{day.label}</text>)}
          <text x="4" y="31" fill="#8b6072" fontSize="10">{chartMax >= 1000 ? `${Math.round(chartMax / 1000)}k` : chartMax}</text><text x="14" y="174" fill="#8b6072" fontSize="10">0</text>
        </svg> : <Empty title="Belum ada data grafik" text="Penjualan dan belanja akan membentuk grafik setelah ada transaksi." />}
      </div>
    </Card>
    <div className="dashboard-bottom">
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">OVERVIEW</span><h2>Stock overview</h2></div><Link href="/stok" className="inline-link">View products <ArrowRight size={15} /></Link></div>
        {low.length ? <div className="stock-list">{low.slice(0, 5).map((i) => <div className="stock-row" key={i.id}><span className="ingredient-token">{i.name.slice(0, 1).toUpperCase()}</span><span className="stock-name"><b>{i.name}</b><small>Minimum {i.minStock} {i.unit}</small></span><span className="stock-value">{i.stock} <small>{i.unit}</small></span><span className="status-pill status-low">Menipis</span></div>)}</div> : <Empty title="Stok aman" text="Belum ada bahan yang perlu segera dibeli." />}
      </Card>
      <Card className="table-card"><div className="card-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Recent activity</h2></div><Link href="/laporan" className="inline-link">View reports <ArrowRight size={15} /></Link></div>
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
const recipeUnitsFor = (stockUnit: string) => {
  const group = RECIPE_UNIT_GROUPS[stockUnit]?.group;
  return group
    ? Object.keys(RECIPE_UNIT_GROUPS).filter((unit) => RECIPE_UNIT_GROUPS[unit].group === group)
    : [stockUnit];
};

const STOCK_UNITS: Record<'Makanan' | 'Parfum', string[]> = {
  Makanan: ['kg', 'gram', 'liter', 'ml', 'butir', 'pcs', 'ekor', 'potong', 'ikat', 'pack', 'box'],
  Parfum: ['ml', 'liter', 'gram', 'kg', 'botol', 'pcs', 'pack'],
};

type PriceTrend = { ingredientId: number; ingredientName: string; unit: string; latestPrice: number | null; previousPrice: number | null; changeAmount: number | null; changePercent: number | null; history: Array<{ date: string; supplierType: string; quantity: number; totalCost: number; unitCost: number }> };

function StockPage({ ingredients = [], stockType = 'Makanan', readOnly = false }: { ingredients?: Ingredient[]; stockType?: 'Makanan' | 'Parfum'; readOnly?: boolean }) {
  const pageSize = 10;
  const [modal, setModal] = useState<Ingredient | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all');
  const [page, setPage] = useState(1);
  const create = useCreateIngredient(), update = useUpdateIngredient(), refresh = useRefresh();
  const [error, setError] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [nameError, setNameError] = useState('');
  const [formDirty, setFormDirty] = useState(false);
  const [priceTrends, setPriceTrends] = useState<PriceTrend[]>([]);
  const ingredientQuery = useListIngredients({
    stockType,
    search: search.trim() || undefined,
    lowStock: stockFilter === 'low' || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  useEffect(() => {
    let active = true;
    fetch('/api/erp/price-trends', { headers: authHeaders(), cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data: PriceTrend[]) => { if (active && Array.isArray(data)) setPriceTrends(data); })
      .catch(() => { if (active) setPriceTrends([]); });
    return () => { active = false; };
  }, []);
  const pagedIngredients = ingredientQuery.data?.items ?? ingredients.filter((x) => x.stockType === stockType);
  const totalItems = ingredientQuery.data?.pagination.total ?? pagedIngredients.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  useEffect(() => { setPage(1); }, [search, stockFilter, stockType]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

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
    const openingUnitCost = Number(f.get('openingUnitCost'));
    const success = () => { refresh(); setModal(null); setError(''); setNameError(''); setFormDirty(false); setUnsavedChanges(false); };
    if (modal === 'new') create.mutate({ data: { name, category, stockType: stockTypeValue, unit, stock, minStock, openingUnitCost } }, { onSuccess: success, onError: (e) => setError(errText(e)) });
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
    <Card className="table-card"><div className="table-toolbar"><div className="table-toolbar-main"><div className="search-wrap"><span className="search-mark">⌕</span><input aria-label="Cari bahan" data-testid="input-search-ingredients" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari nama atau kategori..." /></div><button type="button" className={`filter-chip ${stockFilter === 'low' ? 'is-active' : ''}`} aria-pressed={stockFilter === 'low'} onClick={() => { setStockFilter((value) => value === 'low' ? 'all' : 'low'); setPage(1); }}><AlertCircle size={14} /> Stok menipis</button></div><span className="result-count">{totalItems} bahan</span></div>
      {ingredientQuery.isError ? <ErrorPanel message={errText(ingredientQuery.error)} retry={() => void ingredientQuery.refetch()} /> : pagedIngredients.length ? <><div className="table-scroll"><table><thead><tr><th>BAHAN</th><th>KATEGORI</th><th>STOK SAAT INI</th><th>BATAS MINIMUM</th><th>HARGA TERAKHIR</th><th>TREN PEMBELIAN</th><th /></tr></thead><tbody>{pagedIngredients.map((i) => <tr key={i.id} data-testid={`row-ingredient-${i.id}`}><td><div className="table-name"><span className="ingredient-token">{i.name.slice(0, 1).toUpperCase()}</span><b>{i.name}</b></div></td><td>{i.category}</td><td><b>{i.stock}</b> <span className="muted">{i.unit}</span></td><td>{i.minStock} <span className="muted">{i.unit}</span></td><td>{money(i.lastPrice)}</td><td>{(() => { const trend = priceTrends.find((item) => item.ingredientId === i.id); if (!trend || trend.changePercent === null) return <span className="muted">Belum cukup data</span>; const up = trend.changePercent > 0; const down = trend.changePercent < 0; return <span className={`status-pill ${up ? 'status-low' : down ? 'status-ok' : ''}`}>{up ? '↑ Naik' : down ? '↓ Turun' : '→ Tetap'} {Math.abs(trend.changePercent).toLocaleString('id-ID')}%<small style={{ display: 'block' }}>{money(trend.previousPrice ?? 0)} → {money(trend.latestPrice ?? 0)}</small></span>; })()}</td><td><span className={`status-pill ${i.stock <= i.minStock ? 'status-low' : 'status-ok'}`}>{i.stock <= i.minStock ? 'Menipis' : 'Aman'}</span>{!readOnly && <><button className="icon-button tiny" aria-label={`Ubah ${i.name}`} onClick={() => openModal(i)}><Pencil size={15} /></button><button className="icon-button tiny" aria-label={`Hapus ${i.name}`} onClick={() => handleDelete(i.id, i.name)} style={{ marginLeft: '6px', color: '#613248' }}><Trash2 size={15} /></button></>}</td></tr>)}</tbody></table></div><PaginationControls page={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} label="bahan" /></> : <Empty title="Bahan belum ditemukan" text={search || stockFilter === 'low' ? 'Coba pencarian lain atau tampilkan semua stok.' : 'Tambahkan bahan pertama untuk mulai mengelola stok.'} />}
    </Card>
    {modal && <Modal title={modal === 'new' ? 'Tambah bahan baru' : 'Ubah data bahan'} onClose={closeStockModal}><form className="form-stack" onInput={() => { setFormDirty(true); setUnsavedChanges(true); }} onChange={() => { setFormDirty(true); setUnsavedChanges(true); }} onSubmit={save}>
      <Field label="Nama bahan"><FieldInput disabled={readOnly} name="name" required defaultValue={modal === 'new' ? '' : modal.name} placeholder="Contoh: Tepung terigu" onBlur={(e) => { const value = e.currentTarget.value.trim(); setNameError(value && !/^\p{Lu}/u.test(value) ? 'Nama bahan harus diawali huruf kapital. Contoh: Bawang Putih.' : ''); }} />{nameError && <small className="form-hint" style={{ color: '#613248' }}>{nameError}</small>}</Field>
      <Field label="Kategori"><FieldSelect disabled={readOnly} name="category" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required><option value="" disabled>Pilih kategori</option>{(STOCK_CATEGORIES[stockType] || []).map((category) => <option key={category} value={category}>{category}</option>)}{formCategory && !STOCK_CATEGORIES[stockType]?.includes(formCategory) && <option value={formCategory}>{formCategory} (kategori lama)</option>}</FieldSelect></Field>
      <Field label="Satuan"><FieldSelect disabled={readOnly} name="unit" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} required><option value="" disabled>Pilih satuan</option>{(STOCK_UNITS[stockType] || []).map((unit) => <option key={unit} value={unit}>{unit}</option>)}{formUnit && !STOCK_UNITS[stockType]?.includes(formUnit) && <option value={formUnit}>{formUnit} (satuan lama)</option>}</FieldSelect></Field>
      {modal === 'new' && <Field label="Stok awal"><FieldInput disabled={readOnly} name="stock" type="number" min="0" step="any" defaultValue="" placeholder="Masukkan jumlah stok" required /></Field>}
      {modal === 'new' && <Field label="Biaya per satuan stok awal"><FieldInput disabled={readOnly} name="openingUnitCost" type="number" min="0" step="any" defaultValue="0" placeholder="Masukkan biaya per satuan" required /><small className="form-hint">Dipakai sebagai HPP awal bahan.</small></Field>}
      <Field label="Batas minimum"><FieldInput disabled={readOnly} name="minStock" type="number" min="0" step="any" defaultValue={modal === 'new' ? '' : modal.minStock} placeholder="Masukkan batas minimum" required /></Field>
      <FormError text={error} /><div className="form-actions"><Button variant="quiet" onClick={closeStockModal}>Batal</Button><Button type="submit" disabled={readOnly || create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Menyimpan…' : 'Simpan bahan'}</Button></div>
    </form></Modal>}
  </>;
}

function ProductPage({ state, businessType = 'Makanan', readOnly = false }: { state: ErpState; businessType?: 'Makanan' | 'Parfum'; readOnly?: boolean }) {
  const productPageSize = 12;
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [needsRecipe, setNeedsRecipe] = useState(true);
  const [autoRecipe, setAutoRecipe] = useState(false);
  const [error, setError] = useState('');
  const [productFormDirty, setProductFormDirty] = useState(false);
  const [prepData, setPrepData] = useState<Prep[]>([]);
  const create = useCreateProduct(), update = useUpdateProduct(), saveRecipe = useSaveProductRecipe(), refresh = useRefresh();
  const productQuery = useListProducts({ businessType, search: productSearch.trim() || undefined, limit: productPageSize, offset: (productPage - 1) * productPageSize });
  const safeProducts = state.products || [];
  const visibleProducts = productQuery.data?.items ?? safeProducts.filter((product) => product.businessType === businessType);
  const productTotal = productQuery.data?.pagination.total ?? visibleProducts.length;
  const productTotalPages = Math.max(1, Math.ceil(productTotal / productPageSize));
  const safeRecipes = state.recipes || [];
  const safeIngredients = state.ingredients || [];
  const macroIngredients = safeIngredients.filter((ingredient) => ingredient.stockType === businessType && !/mikro|operasional/i.test(ingredient.category));
  const recipe = useMemo(() => recipeProduct ? safeRecipes.filter((r) => r.productId === recipeProduct.id) : [], [recipeProduct, safeRecipes]);
  useEffect(() => {
    let active = true;
    fetch('/api/erp/preparations', { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then((d: Prep[]) => { if (active && Array.isArray(d)) setPrepData(d); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { setProductPage(1); }, [businessType, productSearch]);
  useEffect(() => { if (productPage > productTotalPages) setProductPage(productTotalPages); }, [productPage, productTotalPages]);

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
    <Card className="table-card product-filter-card"><div className="table-toolbar"><div className="table-toolbar-main"><div className="search-wrap"><span className="search-mark">⌕</span><input aria-label="Cari produk" value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Cari nama produk..." /></div></div><span className="result-count">{productTotal} produk</span></div></Card>
    {productQuery.isError ? <ErrorPanel message={errText(productQuery.error)} retry={() => void productQuery.refetch()} /> : !visibleProducts.length ? <Card><Empty title={`Belum ada produk ${businessType.toLowerCase()}`} text={productSearch ? 'Coba kata kunci lain.' : 'Tambahkan produk di submenu ini untuk mulai mencatat penjualan.'} /></Card> :
      <><div className="product-list">{visibleProducts.map((p) => {
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
          <div className="product-top"><span className="product-illustration"><CookingPot size={21} /></span><div style={{ display: 'flex', gap: '4px' }}>{!readOnly && <><button className="icon-button" aria-label={`Ubah ${p.name}`} onClick={() => openEditProduct(p)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Hapus ${p.name}`} onClick={() => handleDeleteProduct(p.id, p.name)} style={{ color: '#613248' }}><Trash2 size={16} /></button></>}</div></div>
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
      })}</div><PaginationControls page={productPage} totalItems={productTotal} pageSize={productPageSize} onPageChange={setProductPage} label="produk" /></>}
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
  const salesPageSize = 5;
  const safeProducts = state.products || [];
  const [salesPage, setSalesPage] = useState(1);
  const [kategoriPenjualan, setKategoriPenjualan] = useState<'Makanan' | 'Parfum'>('Makanan');
  const availableProducts = safeProducts.filter((product) => product.businessType === kategoriPenjualan);
  const salesQuery = useListSales({ startDate: '2000-01-01', endDate: today(), limit: salesPageSize, offset: (salesPage - 1) * salesPageSize });
  const recentSales = salesQuery.data?.items ?? (state.recentSales || []);
  const salesTotal = salesQuery.data?.pagination.total ?? recentSales.length;
  const [date, setDate] = useState(today()), [lines, setLines] = useState<{ productId: number; quantity: number | '' }[]>([{ productId: safeProducts.find((product) => product.businessType === 'Makanan')?.id || 0, quantity: '' }]), [error, setError] = useState(''), [done, setDone] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const mutation = useRecordSale(), refresh = useRefresh();
  const total = lines.reduce((n, l) => n + (safeProducts.find((p) => p.id === l.productId)?.sellingPrice || 0) * (Number(l.quantity) || 0), 0);
  const pagedSales = recentSales;
  const salesTotalPages = Math.max(1, Math.ceil(salesTotal / salesPageSize));
  useEffect(() => { if (salesPage > salesTotalPages) setSalesPage(salesTotalPages); }, [salesPage, salesTotalPages]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setDone(''); setWarnings([]);
    mutation.mutate({ data: { date, items: lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })) } }, {
      onSuccess: (sale) => { refresh(); setUnsavedChanges(false); setDone(`Penjualan ${money(sale.totalRevenue)} berhasil dicatat.`); setWarnings(sale.warnings || []); setLines([{ productId: availableProducts[0]?.id || 0, quantity: '' }]); },
      onError: (x) => setError(errText(x)),
    });
  };
  return <><PageHeading kicker="PENJUALAN HARIAN" title="Catat Penjualan" note="Simpan transaksi meski stok kurang; periksa warning untuk bahan atau produk yang perlu diisi." />
    <div className="entry-layout"><Card className="entry-card"><div className="card-heading"><div><span className="eyebrow">TRANSAKSI BARU</span><h2>Penjualan</h2></div><span className="step-number">01</span></div><form onSubmit={submit} className="form-stack" onInput={() => setUnsavedChanges(true)} onChange={() => setUnsavedChanges(true)}>
      <div><span className="mb-2 block text-xs font-semibold text-gray-600">Kategori penjualan</span><div className="flex flex-wrap gap-2" role="group" aria-label="Kategori penjualan">{(['Makanan', 'Parfum'] as const).map((category) => <button key={category} disabled={readOnly} type="button" aria-pressed={kategoriPenjualan === category} className={`category-pill ${kategoriPenjualan === category ? 'is-active' : ''}`} onClick={() => { setKategoriPenjualan(category); setLines([{ productId: safeProducts.find((product) => product.businessType === category)?.id || 0, quantity: '' }]); setError(''); setDone(''); setWarnings([]); }}>{category}</button>)}</div></div>
      <Field label="Tanggal"><FieldInput disabled={readOnly} type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="line-head"><b>Produk terjual</b><span>Harga mengikuti daftar produk</span></div>
      {lines.map((l, idx) => <div className="sale-line" key={idx}><Field label="Produk"><FieldSelect disabled={readOnly} required value={l.productId || ''} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, productId: Number(e.target.value) } : item))}><option value="" disabled>Pilih produk</option>{availableProducts.map((p) => <option value={p.id} key={p.id}>{p.name} • {money(p.sellingPrice)}{p.needsRecipe ? ' • olahan' : ` • stok ${p.stock}`}</option>)}</FieldSelect></Field><Field label="Jumlah"><FieldInput disabled={readOnly} required type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLines(lines.map((item, i) => i === idx ? { ...item, quantity: e.target.value === '' ? '' : Number(e.target.value) } : item))} /></Field><button className="remove-line" type="button" disabled={readOnly || lines.length === 1} aria-label="Hapus produk" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><X size={16} /></button></div>)}
      <button className="add-line" type="button" disabled={readOnly || !availableProducts.length} onClick={() => setLines([...lines, { productId: availableProducts[0]?.id || 0, quantity: '' }])}><CirclePlus size={16} /> Tambah produk</button>
      {!availableProducts.length && <p className="text-sm text-gray-500">Belum ada produk kategori {kategoriPenjualan}. Tambahkan produk melalui menu Produk & Resep.</p>}
      {error && <div className="form-error"><AlertCircle size={16} /><span>{error}</span></div>}{done && <div className="success-message"><Check size={16} />{done}</div>}
      {warnings.length > 0 && <div className="warning-panel" role="alert"><AlertCircle size={18} /><div><b>Transaksi tersimpan dengan catatan stok</b><ul>{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}
      <div className="form-actions purchase-submit"><div><small>Perkiraan penjualan</small><strong>{money(total)}</strong></div><Button type="submit" disabled={readOnly || mutation.isPending || !availableProducts.length}>{mutation.isPending ? 'Menyimpan?' : 'Simpan penjualan'}</Button></div>
    </form></Card><aside className="side-tip"><div className="tip-symbol peach"><ReceiptText size={20} /></div><span className="eyebrow">SEBELUM MENYIMPAN</span><h3>Stok kurang tidak menghentikan transaksi</h3><p>Resep kosong atau stok minus akan ditampilkan sebagai warning setelah penjualan berhasil dicatat. Periksa dan sesuaikan stok secara berkala.</p><Link href="/produk" className="inline-link">Cek produk & resep <ArrowRight size={15} /></Link></aside></div>
    <Card className="table-card sales-history"><div className="card-heading"><div><span className="eyebrow">RIWAYAT TRANSAKSI</span><h2>Penjualan terakhir</h2></div><span className="result-count">{salesTotal} transaksi</span></div>
      {salesQuery.isError ? <ErrorPanel message={errText(salesQuery.error)} retry={() => void salesQuery.refetch()} /> : recentSales.length ? <><div className="table-scroll"><table><thead><tr><th>TANGGAL</th><th>PRODUK</th><th>JUMLAH</th><th>PENJUALAN</th><th>LABA KOTOR</th><th>STATUS</th></tr></thead><tbody>{pagedSales.map((sale) => <tr key={sale.id}><td><b>{dateLabel(sale.date)}</b><small className="muted">#{sale.id}</small></td><td>{sale.items.map((item) => item.productName).join(', ') || '—'}</td><td>{sale.items.reduce((sum, item) => sum + item.quantity, 0)} item</td><td><b>{money(sale.totalRevenue)}</b></td><td className="positive"><b>{money(sale.grossProfit)}</b></td><td><span className="status-pill status-ok">Tercatat</span></td></tr>)}</tbody></table></div><PaginationControls page={salesPage} totalItems={salesTotal} pageSize={salesPageSize} onPageChange={setSalesPage} label="transaksi" /></> : <Empty title="Belum ada penjualan" text="Transaksi yang disimpan akan muncul di tabel ini." />}
    </Card>
  </>;
}

type StockCountPreparation = { id: number; name: string; unit: string; stock: number; averageCost: number };

function StockCountPage({ ingredients = [], readOnly = false }: { ingredients?: Ingredient[]; readOnly?: boolean }) {
  const [preparations, setPreparations] = useState<StockCountPreparation[]>([]);
  const [date, setDate] = useState(today());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const mutation = useRecordStockCount(), refresh = useRefresh();

  useEffect(() => {
    let active = true;
    void fetch('/api/erp/preparations', { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error('Gagal memuat stok preparation.');
        const data = await response.json();
        if (active) setPreparations(Array.isArray(data) ? data : []);
      })
      .catch((reason) => { if (active) setError(errText(reason)); });
    return () => { active = false; };
  }, []);

  const rows = [
    ...ingredients.map((item) => ({ key: `ingredient:${item.id}`, itemType: 'ingredient' as const, id: item.id, name: item.name, unit: item.unit, stock: item.stock })),
    ...preparations.map((item) => ({ key: `preparation:${item.id}`, itemType: 'preparation' as const, id: item.id, name: item.name, unit: item.unit, stock: item.stock })),
  ];
  const countedRows = rows.filter((row) => counts[row.key] !== undefined && counts[row.key].trim() !== '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setDone('');
    if (readOnly) return;
    if (!countedRows.length) { setError('Masukkan jumlah fisik minimal untuk satu item.'); return; }
    mutation.mutate({ data: { date, items: countedRows.map((row) => row.itemType === 'ingredient'
      ? { ingredientId: row.id, countedStock: Number(counts[row.key]) }
      : { preparationId: row.id, countedStock: Number(counts[row.key]) }) } }, {
      onSuccess: () => { refresh(); setDone('Hasil opname dan adjustment stok berhasil disimpan.'); setCounts({}); },
      onError: (reason) => setError(errText(reason)),
    });
  };

  return <><PageHeading kicker="PENYESUAIAN PERSEDIAAN" title="Stok Opname" note="Catat stok fisik bahan dan preparation. Selisih dihitung dari stok fisik dikurangi stok sistem." />
    <Card className="table-card"><div className="opname-intro"><div><span className="eyebrow">HITUNG FISIK</span><h2>Stok aktual</h2><p>Kolom kosong tidak dikirim dan tidak mengubah stok item tersebut.</p></div><Field label="Tanggal opname"><FieldInput disabled={readOnly} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {rows.length ? <form onSubmit={submit}><div className="table-scroll"><table><thead><tr><th>ITEM</th><th>JENIS</th><th>STOK SISTEM</th><th>STOK FISIK</th><th>VARIANCE QTY</th></tr></thead><tbody>{rows.map((row) => {
        const entered = counts[row.key] !== undefined && counts[row.key].trim() !== '';
        const physical = entered ? Number(counts[row.key]) : null;
        const delta = physical === null ? null : physical - row.stock;
        return <tr key={row.key}>
          <td><div className="table-name"><span className="ingredient-token">{row.name.slice(0, 1)}</span><b>{row.name}</b></div></td>
          <td>{row.itemType === 'ingredient' ? 'Bahan' : 'Preparation'}</td>
          <td>{row.stock} {row.unit}</td>
          <td><div className="count-input"><FieldInput disabled={readOnly} aria-label={`Stok fisik ${row.name}`} type="number" min="0" step="0.001" value={counts[row.key] ?? ''} placeholder={String(row.stock)} onChange={(e) => setCounts({ ...counts, [row.key]: e.target.value })} /><span>{row.unit}</span></div></td>
          <td><span className={delta === null ? 'muted' : delta < 0 ? 'negative' : delta > 0 ? 'positive' : 'muted'}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${Number(delta.toFixed(3))} ${row.unit}`}</span></td>
        </tr>;
      })}</tbody></table></div><div className="opname-footer"><FormError text={error} />{done && <div className="success-message"><Check size={16} />{done}</div>}<Button type="submit" disabled={readOnly || mutation.isPending || !countedRows.length}>{mutation.isPending ? 'Menyimpan…' : 'Simpan hasil opname'}</Button></div></form> : <Empty title="Belum ada stok untuk dihitung" text="Tambahkan bahan atau preparation terlebih dahulu." />}
    </Card>
  </>;
}

function ReportPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [startDate, setStart] = useState(`${today().slice(0, 7)}-01`), [endDate, setEnd] = useState(today());
  const params = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const query = useGetFinanceReport(params);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportType, setExportType] = useState<'finance' | 'stock' | 'transactions'>('finance');
  const r = query.data;
  const safeDays = r?.days || [];
  const exportBackup = async () => {
    if (!isAdmin || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch('/api/erp/export', { headers: authHeaders() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal mengunduh export data.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kasapink-erp-export-${today()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(errText(error));
    } finally {
      setExporting(false);
    }
  };
  const exportReport = async (format: 'csv' | 'xls' | 'pdf') => {
    if (!isAdmin || exporting) return;
    setExporting(true); setExportError('');
    try {
      const response = await fetch(`/api/erp/report-export?type=${exportType}&format=${format}&startDate=${startDate}&endDate=${endDate}`, { headers: authHeaders(), credentials: 'include' });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Gagal mengunduh laporan.'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kasapink-${exportType}-${startDate}-${endDate}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setExportError(errText(error)); } finally { setExporting(false); }
  };
  return <><PageHeading kicker="ANGKA USAHA" title="Laporan keuangan" note="Ringkasan penjualan, belanja, dan laba kotor sesuai tanggal." />
    <Card className="report-filter"><div><span className="eyebrow">PERIODE LAPORAN</span><h2>Pilih rentang tanggal</h2></div><div className="date-range"><Field label="Dari"><FieldInput type="date" value={startDate} max={endDate} onChange={(e) => setStart(e.target.value)} /></Field><span className="range-separator">sampai</span><Field label="Sampai"><FieldInput type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEnd(e.target.value)} /></Field></div>{isAdmin && <div className="report-export-actions"><select className="input report-export-select" aria-label="Jenis laporan export" value={exportType} onChange={(e) => setExportType(e.target.value as typeof exportType)}><option value="finance">Keuangan</option><option value="stock">Stok</option><option value="transactions">Histori transaksi</option></select><div className="report-export-buttons"><button type="button" className="button button-secondary" onClick={() => void exportReport('csv')} disabled={exporting}>CSV</button><button type="button" className="button button-secondary" onClick={() => void exportReport('xls')} disabled={exporting}>Excel</button><button type="button" className="button button-secondary" onClick={() => void exportReport('pdf')} disabled={exporting}>PDF</button><button type="button" className="button button-primary report-export-button" onClick={() => void exportBackup()} disabled={exporting}><Download size={15} />Backup JSON</button></div></div>}</Card>
    {exportError && <div className="error-panel"><AlertCircle size={18} /><div><b>Export gagal</b><p>{exportError}</p></div></div>}
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<Array<{ ingredientId: number; qtyRequired: number; recipeUnit: string }>>([]);
  const [targetQty, setTargetQty] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [batchDate, setBatchDate] = useState(today());
  const [productId, setProductId] = useState('');
  const [productPrepDraft, setProductPrepDraft] = useState<Array<{ preparationId: number; qtyRequired: number; recipeUnit: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/erp/preparations', { headers: authHeaders() });
      const data = await r.json().catch(() => []);
      if (!r.ok) throw new Error(data.error || 'Gagal memuat data prep.');
      setPreps(data);
      setSelectedPrep((current) => current ?? data[0]?.id ?? null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ingredients = stateQuery.data?.ingredients.filter((x) => x.stockType === 'Makanan') ?? [];
  const products = stateQuery.data?.products.filter((x) => x.businessType === 'Makanan') ?? [];
  const prep = preps.find((x) => x.id === selectedPrep) ?? null;
  const selectedProduct = products.find((x) => x.id === Number(productId)) ?? null;
  const productionYield = Number(targetQty) > 0 && Number(actualQty) > 0
    ? (Number(actualQty) / Number(targetQty)) * 100
    : null;

  useEffect(() => {
    if (!prep) return;
    setRecipeDraft(prep.recipe.map((x) => ({
      ingredientId: x.ingredientId,
      qtyRequired: x.qtyRequired,
      recipeUnit: x.recipeUnit,
    })));
    setTargetQty('');
    setActualQty('');
  }, [selectedPrep]);

  const savePrep = async () => {
    if (readOnly || !newName.trim()) return;
    try {
      const r = await fetch('/api/erp/preparations', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), unit: newUnit, yieldQty: Number(newYieldQty) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Gagal membuat prep.');
      setNewName('');
      setShowCreateForm(false);
      await load();
      setSelectedPrep(data.id);
    } catch (e) {
      setError(errText(e));
    }
  };

  const saveRecipe = async () => {
    if (readOnly || !prep) return;
    try {
      const r = await fetch('/api/erp/preparations/' + prep.id + '/recipe', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: recipeDraft }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Gagal menyimpan resep prep.');
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  const produce = async () => {
    if (readOnly || !prep) return;
    try {
      const r = await fetch('/api/erp/preparations/' + prep.id + '/batches', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: batchDate,
          targetQty: Number(targetQty),
          actualQty: Number(actualQty),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Gagal mencatat produksi.');
      setTargetQty('');
      setActualQty('');
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  const loadProductPrep = async (id: string) => {
    setProductId(id);
    if (!id) {
      setProductPrepDraft([]);
      return;
    }
    const p = preps
      .flatMap((x) => x.products.map((line) => ({ ...line, preparationId: x.id })))
      .filter((x) => x.productId === Number(id));
    setProductPrepDraft(p.map((x) => ({
      preparationId: x.preparationId,
      qtyRequired: x.qtyRequired,
      recipeUnit: x.recipeUnit,
    })));
  };

  const saveProductPrep = async () => {
    if (readOnly || !productId) return;
    try {
      const r = await fetch('/api/erp/products/' + productId + '/preparations', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: productPrepDraft }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Gagal menyimpan komponen prep produk.');
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (loading) return <LoadingPanel />;

  const stockTone = (p: Prep) => p.stock <= 0 ? 'out' : p.stock <= p.yieldQty * 0.25 ? 'low' : 'ok';

  return <div className="page-stack prep-page">
    <PageHeading
      kicker="PRODUKSI & PERSIAPAN"
      title="Stok Prep"
      note="Kelola bahan olahan yang dibuat dalam batch sebelum dipakai oleh produk jualan."
      action={!readOnly ? <button className="button button-primary" type="button" onClick={() => setShowCreateForm((open) => !open)}><Plus size={15} /> {showCreateForm ? 'Tutup' : 'Buat prep'}</button> : undefined}
    />

    {error && <div className="error-panel"><AlertCircle size={20} /><div><b>Terjadi kendala</b><p>{error}</p></div></div>}

    <section className="prep-hero">
      <div>
        <span className="eyebrow">ALUR KERJA</span>
        <h2>Raw → Prep → Produk</h2>
        <p>Produksi batch mengurangi bahan baku, menambah stok prep, dan menghitung HPP secara otomatis.</p>
      </div>
      <div className="prep-flow">
        <span><b>1</b>Bahan baku</span>
        <ArrowRight size={15} />
        <span><b>2</b>Produksi batch</span>
        <ArrowRight size={15} />
        <span><b>3</b>Stok prep</span>
        <ArrowRight size={15} />
        <span><b>4</b>Produk jualan</span>
      </div>
    </section>

    <section className="prep-stock-section">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">STOK SAAT INI</span>
          <h2>Persiapan yang tersedia</h2>
        </div>
        <span className="period-chip">{preps.length} jenis prep</span>
      </div>

      {preps.length ? <div className="prep-stock-grid">
        {preps.map((p) => {
          const tone = stockTone(p);
          return <button
            key={p.id}
            type="button"
            aria-pressed={selectedPrep === p.id}
            className={'prep-stock-card ' + (selectedPrep === p.id ? 'is-selected' : '')}
            onClick={() => setSelectedPrep(p.id)}
          >
            <div className="prep-stock-top">
              <span className="prep-icon"><CookingPot size={18} /></span>
              <span className={'prep-status ' + tone}>{tone === 'ok' ? 'Stok aman' : tone === 'low' ? 'Perlu produksi' : 'Stok habis'}</span>
            </div>
            <b className="prep-stock-name">{p.name}</b>
            <strong>{p.stock} <small>{p.unit}</small></strong>
            <div className="prep-stock-meta">
              <span>Hasil standar {p.yieldQty} {p.unit}</span>
              <span>HPP {money(p.averageCost)}/{p.unit}</span>
            </div>
            <span className="prep-stock-action">{selectedPrep === p.id ? 'Sedang dipilih' : 'Kelola prep'} <ArrowRight size={14} /></span>
          </button>;
        })}
      </div> : <Card><Empty title="Belum ada stok prep" text="Buat prep pertama untuk mulai membuat stok olahan seperti nasi matang, ayam suwir, atau jamur marinasi." /></Card>}
    </section>

    {!readOnly && showCreateForm && <Card className="prep-create-card prep-create-card-open" id="prep-master-form">
      <div className="prep-create-copy">
        <span className="eyebrow">MASTER PREP</span>
        <h2>Buat jenis prep baru</h2>
        <p>Contoh: Nasi Matang, Ayam Suwir, Jamur Marinasi, atau Isian Lontong.</p>
      </div>
      <div className="prep-create-form">
        <Field label="Nama prep"><FieldInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contoh: Ayam Suwir" /></Field>
        <Field label="Satuan stok"><FieldInput value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="kg, gram, pcs" /></Field>
        <Field label="Hasil standar" hint="Hasil satu kali resep/batch."><FieldInput type="number" min="0.001" step="0.001" value={newYieldQty} onChange={(e) => setNewYieldQty(e.target.value)} placeholder="Contoh 5" /></Field>
        <div className="prep-create-submit"><button className="button button-primary" type="button" onClick={() => void savePrep()}><Plus size={15} /> Buat prep</button></div>
      </div>
    </Card>}

    {prep ? <section className="prep-workspace">
      <Card className="prep-detail-card">
        <div className="prep-detail-header">
          <div>
            <span className="eyebrow">DETAIL PREP</span>
            <h2>{prep.name}</h2>
            <p>Stok tersedia <b>{prep.stock} {prep.unit}</b> · Hasil standar <b>{prep.yieldQty} {prep.unit}</b> · HPP <b>{money(prep.averageCost)}/{prep.unit}</b></p>
          </div>
          <span className={'prep-status large ' + stockTone(prep)}>{stockTone(prep) === 'ok' ? 'Stok aman' : stockTone(prep) === 'low' ? 'Perlu produksi' : 'Stok habis'}</span>
        </div>

        <div className="prep-workspace-grid">
          <div className="prep-panel">
            <div className="prep-panel-head">
              <div><span className="eyebrow">RESEP</span><h3>Bahan untuk 1 hasil standar</h3></div>
              <span className="period-chip">{recipeDraft.length} bahan</span>
            </div>

            {recipeDraft.length ? <div className="prep-recipe-list">
              {recipeDraft.map((line, i) => {
                const ingredient = ingredients.find((x) => x.id === line.ingredientId);
                return <div className="prep-recipe-row" key={i}>
                  <div className="prep-recipe-main">
                    <span className="prep-row-number">{i + 1}</span>
                    <div>
                      <b>{ingredient?.name || 'Bahan tidak ditemukan'}</b>
                      <small>Stok saat ini {ingredient?.stock ?? 0} {ingredient?.unit || line.recipeUnit}</small>
                    </div>
                  </div>
                  <Field label="Jumlah"><FieldInput disabled={readOnly} type="number" min="0.001" step="0.001" value={line.qtyRequired} onChange={(e) => setRecipeDraft((x) => x.map((v, j) => j === i ? { ...v, qtyRequired: Number(e.target.value) } : v))} /></Field>
                  <Field label="Satuan"><FieldInput value={line.recipeUnit} disabled={readOnly} onChange={(e) => setRecipeDraft((x) => x.map((v, j) => j === i ? { ...v, recipeUnit: e.target.value } : v))} /></Field>
                  {!readOnly && <button className="icon-button" type="button" aria-label="Hapus bahan" onClick={() => setRecipeDraft((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
                </div>;
              })}
            </div> : <Empty title="Resep prep belum diatur" text="Tambahkan bahan baku yang dipakai untuk menghasilkan satu batch standar." />}

            {!readOnly && <div className="prep-panel-actions">
              <button className="button button-secondary" type="button" onClick={() => {
                const ing = ingredients[0];
                if (ing) setRecipeDraft((x) => [...x, { ingredientId: ing.id, qtyRequired: 1, recipeUnit: ing.unit }]);
              }}><Plus size={15} /> Tambah bahan</button>
              <button className="button button-primary" type="button" onClick={() => void saveRecipe()}><Check size={15} /> Simpan resep</button>
            </div>}
          </div>

          <div className="prep-panel prep-production-panel">
            <div className="prep-panel-head">
              <div><span className="eyebrow">PRODUKSI BATCH</span><h3>Tambah stok prep</h3></div>
              <span className="batch-badge">Produksi</span>
            </div>
            <p className="prep-panel-copy">Catat hasil masak yang benar-benar masuk stok. Target membantu melihat susut atau kelebihan hasil batch.</p>
            <div className="prep-production-summary">
              <div><span>Prep yang dibuat</span><strong>{prep.name}</strong></div>
              <div><span>Hasil standar</span><strong>{prep.yieldQty} {prep.unit}</strong></div>
              <div><span>HPP terakhir</span><strong>{money(prep.averageCost)}/{prep.unit}</strong></div>
            </div>
            <div className="prep-production-form">
              <Field label="Tanggal produksi"><FieldInput type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} /></Field>
              <Field label="Target hasil"><FieldInput type="number" min="0.001" step="0.001" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} placeholder={String(prep.yieldQty)} /></Field>
              <Field label="Hasil jadi"><FieldInput type="number" min="0.001" step="0.001" value={actualQty} onChange={(e) => setActualQty(e.target.value)} placeholder={prep.unit} /></Field>
              {!readOnly && <button className="button button-primary production-submit" type="button" onClick={() => void produce()}><CookingPot size={15} /> Catat produksi</button>}
            </div>
            {productionYield !== null && <div className={'prep-yield-preview ' + (productionYield < 100 ? 'is-below' : 'is-above')}>
              <div><span>Yield batch</span><strong>{productionYield.toFixed(1)}%</strong></div>
              <small>{Number(actualQty) < Number(targetQty) ? 'Ada susut ' + Math.abs(Number(targetQty) - Number(actualQty)).toFixed(3) + ' ' + prep.unit : Number(actualQty) > Number(targetQty) ? 'Hasil lebih ' + Math.abs(Number(actualQty) - Number(targetQty)).toFixed(3) + ' ' + prep.unit : 'Hasil sesuai target.'}</small>
            </div>}
            <div className="prep-production-note"><AlertCircle size={15} /><span>Pastikan resep di sebelah kiri sudah disimpan. Sistem akan mengurangi bahan baku dan menambah stok sebesar hasil jadi.</span></div>

            {prep.batches.length > 0 && <div className="prep-history">
              <div className="prep-history-head"><span className="eyebrow">RIWAYAT</span><b>Batch terakhir</b></div>
              {prep.batches.slice(0, 5).map((b) => <div className="prep-history-row" key={b.id}>
                <div><b>{dateLabel(b.date)}</b><small>{b.batchNumber}</small></div>
                <span>{b.actualQty} {prep.unit}</span>
                <span>{b.yieldPercentage}% yield</span>
                <strong>{money(b.unitCost)}/{prep.unit}</strong>
              </div>)}
            </div>}
          </div>
        </div>
      </Card>
    </section> : null}

    <Card className="prep-product-card">
      <div className="prep-product-header">
        <div>
          <span className="eyebrow">PAKAIAN PER MENU</span>
          <h2>Atur prep untuk produk jualan</h2>
          <p>Tentukan prep yang ikut terpakai setiap kali menu terjual. Pemakaian otomatis mengurangi stok prep dan masuk ke HPP.</p>
        </div>
        <span className="prep-product-step">HPP menu</span>
      </div>
      <div className="prep-product-body">
        <div className="prep-product-picker">
          <Field label="Pilih menu"><FieldSelect value={productId} onChange={(e) => void loadProductPrep(e.target.value)} disabled={readOnly}><option value="">Pilih produk makanan...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FieldSelect></Field>
          {selectedProduct && <div className="prep-product-summary">
            <div><span>Harga jual</span><strong>{money(selectedProduct.sellingPrice)}</strong></div>
            <div><span>Komponen prep</span><strong>{productPrepDraft.length} item</strong></div>
          </div>}
        </div>
        {productId ? <div className="prep-product-editor">
          {productPrepDraft.length ? <>
            <div className="prep-product-list">
              {productPrepDraft.map((line, i) => {
                const linkedPrep = preps.find((p) => p.id === line.preparationId);
                const sameUnit = linkedPrep ? line.recipeUnit.toLowerCase() === linkedPrep.unit.toLowerCase() : false;
                const lineCost = sameUnit && linkedPrep ? Number(line.qtyRequired) * Number(linkedPrep.averageCost) : null;
                return <div className="prep-product-row" key={i}>
                  <div className="prep-product-line-main">
                    <span className="prep-row-number">{i + 1}</span>
                    <div>
                      <b>{linkedPrep?.name || 'Prep tidak ditemukan'}</b>
                      <small>Stok tersedia {linkedPrep?.stock ?? 0} {linkedPrep?.unit || line.recipeUnit}</small>
                    </div>
                  </div>
                  <Field label="Pemakaian per porsi"><FieldInput type="number" min="0.001" step="0.001" value={line.qtyRequired} onChange={(e) => setProductPrepDraft((x) => x.map((v, j) => j === i ? { ...v, qtyRequired: Number(e.target.value) } : v))} disabled={readOnly} /></Field>
                  <Field label="Satuan"><FieldInput value={line.recipeUnit} disabled={readOnly} onChange={(e) => setProductPrepDraft((x) => x.map((v, j) => j === i ? { ...v, recipeUnit: e.target.value } : v))} /></Field>
                  <div className="prep-product-line-cost">{lineCost !== null ? <><span>HPP prep</span><strong>{money(lineCost)}</strong></> : <><span>HPP prep</span><small>Konversi</small></>}</div>
                  {!readOnly && <button className="icon-button" type="button" aria-label="Hapus prep dari produk" onClick={() => setProductPrepDraft((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
                </div>;
              })}
            </div>
            {!readOnly && <div className="prep-panel-actions">
              <button className="button button-secondary" type="button" onClick={() => {
                const p = preps[0];
                if (p) setProductPrepDraft((x) => [...x, { preparationId: p.id, qtyRequired: 1, recipeUnit: p.unit }]);
              }}><Plus size={15} /> Tambah prep</button>
              <button className="button button-primary" type="button" onClick={() => void saveProductPrep()}><Check size={15} /> Simpan pemakaian</button>
            </div>}
          </> : <Empty title="Belum ada prep untuk menu ini" text="Tambahkan prep yang benar-benar dipakai saat satu porsi/menu terjual." />}
        </div> : <div className="prep-product-empty"><CookingPot size={18} /><b>Pilih menu terlebih dahulu</b><span>Setelah dipilih, masukkan prep dan jumlah yang dipakai untuk satu porsi.</span></div>}
      </div>
    </Card>
  </div>;
}

function FnbControlPage({ readOnly = false }: { readOnly?: boolean }) {
  const fnbPageSize = 5;
  const stateQuery = useGetErpState();
  const [startDate,setStartDate]=useState(today());
  const [endDate,setEndDate]=useState(today());
  const [report,setReport]=useState<any>(null);
  const [reportLoading,setReportLoading]=useState(true);
  const [menuPage,setMenuPage]=useState(1);
  const [recipeVariancePage,setRecipeVariancePage]=useState(1);
  const [stockVariancePage,setStockVariancePage]=useState(1);
  const [wasteType,setWasteType]=useState<'ingredient'|'preparation'>('ingredient');
  const [wasteItem,setWasteItem]=useState('');
  const [wasteQty,setWasteQty]=useState('');
  const [wasteReason,setWasteReason]=useState('Basi / rusak');
  const [expenseCategory,setExpenseCategory]=useState('Gas');
  const [expenseDescription,setExpenseDescription]=useState('');
  const [expenseAmount,setExpenseAmount]=useState('');
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    try{
      setReportLoading(true);
      setError('');
      const r=await fetch(`/api/erp/fnb-report?startDate=${startDate}&endDate=${endDate}`,{headers:authHeaders()});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Gagal memuat laporan F&B.');
      setReport(d);
      setMenuPage(1); setRecipeVariancePage(1); setStockVariancePage(1);
    }catch(e){setError(errText(e));}
    finally{setReportLoading(false);}
  },[startDate,endDate]);

  useEffect(()=>{void load();},[load]);

  const ingredients=stateQuery.data?.ingredients.filter(x=>x.stockType==='Makanan')??[];
  const prepQuery=useState<Prep[]>([]);
  const preps=prepQuery[0];
  const setPreps=prepQuery[1];

  useEffect(()=>{
    void fetch('/api/erp/preparations',{headers:authHeaders()})
      .then(r=>r.json())
      .then(d=>setPreps(Array.isArray(d)?d:[]))
      .catch(()=>{});
  },[]);

  const items=wasteType==='ingredient'?ingredients:preps;

  const addWaste=async()=>{
    try{
      const r=await fetch('/api/erp/waste',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({
        date:endDate,itemType:wasteType,itemId:Number(wasteItem),quantity:Number(wasteQty),reason:wasteReason
      })});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Gagal mencatat waste.');
      setWasteQty(''); setWasteItem(''); await load();
    }catch(e){setError(errText(e));}
  };

  const addExpense=async()=>{
    try{
      const r=await fetch('/api/erp/expenses',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({
        date:endDate,category:expenseCategory,description:expenseDescription,amount:Number(expenseAmount)
      })});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Gagal mencatat biaya.');
      setExpenseDescription(''); setExpenseAmount(''); await load();
    }catch(e){setError(errText(e));}
  };

  const actualFc=Number(report?.actualFoodCostPercentage)||0;
  const theoreticalFc=Number(report?.theoreticalFoodCostPercentage)||0;
  const variance=Number(report?.foodCostVariance)||0;
  const variancePositive=variance>0;
  const menuCount=report?.menus?.length||0;
  const recipeVariance=report?.recipeUsageVariance||[];
  const stockVariance=report?.stockOpnameVariance||[];

  return <div className="page-stack fnb-page">
    <PageHeading kicker="KONTROL F&B" title="Kontrol F&B" note="Lihat kesehatan usaha, menu paling untung, dan kebocoran biaya tanpa harus membaca laporan panjang." />

    <Card className="fnb-period">
      <div className="fnb-period-title">
        <CalendarDays size={17}/>
        <div><b>Periode</b><span>{dateLabel(startDate)} — {dateLabel(endDate)}</span></div>
      </div>
      <div className="fnb-period-fields">
        <Field label="Dari"><FieldInput type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></Field>
        <Field label="Sampai"><FieldInput type="date" value={endDate} min={startDate} max={today()} onChange={e=>setEndDate(e.target.value)}/></Field>
      </div>
    </Card>

    {error&&<div className="error-panel"><AlertCircle size={20}/><div><b>Terjadi kendala</b><p>{error}</p></div></div>}

    {reportLoading ? <FnbLoadingPanel /> : report&&<>
      <div className="fnb-kpi-grid">
        <Card className="fnb-kpi"><span>PENJUALAN</span><strong>{money(report.revenue)}</strong><small>{report.menus?.reduce((n:any,m:any)=>n+Number(m.quantity||0),0)||0} porsi terjual</small></Card>
        <Card className="fnb-kpi"><span>HPP AKTUAL</span><strong>{money(report.actualCogs)}</strong><small>Food cost {actualFc}%</small></Card>
        <Card className="fnb-kpi"><span>WASTE</span><strong>{money(report.wasteCost)}</strong><small>{report.wasteCount} catatan</small></Card>
        <Card className="fnb-kpi fnb-kpi-primary"><span>LABA BERSIH</span><strong>{money(report.netProfit)}</strong><small>Setelah biaya operasional</small></Card>
      </div>

      <Card className="fnb-score-card">
        <div className="fnb-score-head">
          <div><span className="eyebrow">FOOD COST</span><h2>Biaya bahan masih sehat?</h2></div>
          <div className={'fnb-score-badge '+(variancePositive?'warning':'good')}>{variancePositive?'Perlu dicek':'Terkendali'}</div>
        </div>
        <div className="fnb-score-body">
          <div className="fnb-score-number"><strong>{actualFc}%</strong><span>aktual</span></div>
          <div className="fnb-score-compare">
            <div className="fnb-score-line"><span>Aktual <b>{actualFc}%</b></span><span>Standar resep <b>{theoreticalFc}%</b></span></div>
            <div className="fnb-score-track"><span style={{width:`${Math.min(100,Math.max(0,actualFc))}%`}}/></div>
            <div className="fnb-score-foot"><span>Selisih biaya</span><b className={variancePositive?'is-warning':''}>{money(Math.abs(variance))}{variancePositive?' lebih tinggi':''}</b></div>
          </div>
          <div className="fnb-score-side"><span>LABA KOTOR</span><strong>{money(report.grossProfit)}</strong><small>{Number(report.revenue)>0?((Number(report.grossProfit)/Number(report.revenue))*100).toFixed(1):'0.0'}% margin</small></div>
        </div>
      </Card>

      <Card className="fnb-section-card">
        <div className="fnb-section-head">
          <div><span className="eyebrow">MENU</span><h2>Menu paling menghasilkan</h2></div>
          <span className="fnb-count">{menuCount} menu</span>
        </div>
        {menuCount>0 ? <><div className="fnb-menu-list">{report.menus.slice((menuPage-1)*fnbPageSize,menuPage*fnbPageSize).map((m:any,i:number)=><div className="fnb-menu-row" key={m.productId}>
          <div className="fnb-menu-rank">{(menuPage-1)*fnbPageSize+i+1}</div>
          <div className="fnb-menu-name"><b>{m.productName}</b><small>{m.quantity} terjual · food cost {m.foodCostPercentage}%</small></div>
          <div className="fnb-menu-cost"><span>Penjualan</span><b>{money(m.revenue)}</b></div>
          <div className="fnb-menu-cost"><span>HPP</span><b>{money(m.actualCogs)}</b></div>
          <div className="fnb-menu-profit"><span>Laba kotor</span><b>{money(m.grossProfit)}</b></div>
        </div>)}</div><PaginationControls page={menuPage} totalItems={menuCount} pageSize={fnbPageSize} onPageChange={setMenuPage} label="menu" /></> : <div className="fnb-empty">Belum ada penjualan pada periode ini.</div>}
      </Card>

      <Card className="fnb-section-card">
        <div className="fnb-section-head">
          <div><span className="eyebrow">RECIPE USAGE VARIANCE</span><h2>Pemakaian aktual vs teoritis</h2><p>Selisih actual usage dikurangi theoretical usage dari resep dan penjualan.</p></div>
          <span className="fnb-count">Aktual − teoritis</span>
        </div>
        <div className="fnb-variance-list">{recipeVariance.slice((recipeVariancePage-1)*fnbPageSize,recipeVariancePage*fnbPageSize).map((v:any)=><div className="fnb-variance-row" key={v.itemType+'-'+v.itemId}>
          <div><b>{v.itemName}</b><small>{v.itemType==='preparation'?'Prep':'Bahan'} · {v.unit}</small></div>
          <span>{v.actualQty}</span><span>{v.theoreticalQty}</span>
          <strong className={Number(v.varianceQty)>0?'is-warning':'is-ok'}>{Number(v.varianceQty)>0?'+':''}{v.varianceQty} {v.unit}</strong>
          <b>{money(v.varianceCost)}</b>
        </div>)}</div>
        <div className="fnb-variance-labels"><span>ITEM</span><span>AKTUAL</span><span>TEORITIS</span><span>SELISIH</span><span>DAMPAK</span></div>
        <PaginationControls page={recipeVariancePage} totalItems={recipeVariance.length} pageSize={fnbPageSize} onPageChange={setRecipeVariancePage} label="item" />
        <p className="helper-text fnb-note">Variance positif berarti pemakaian aktual lebih tinggi dari kebutuhan resep. Prep yang dibuat sebelum periode juga bisa memengaruhi angka ini.</p>
      </Card>

      <Card className="fnb-section-card">
        <div className="fnb-section-head">
          <div><span className="eyebrow">STOCK OPNAME VARIANCE</span><h2>Stok fisik vs sistem</h2><p>Selisih dan nilai rupiah diambil dari adjustment saat opname.</p></div>
          <span className="fnb-count">Fisik − sistem</span>
        </div>
        {stockVariance.length ? <><div className="table-scroll"><table><thead><tr><th>TANGGAL</th><th>ITEM</th><th>STOK SISTEM</th><th>STOK FISIK</th><th>VARIANCE QTY</th><th>HPP SAAT OPNAME</th><th>VARIANCE RUPIAH</th></tr></thead><tbody>{stockVariance.slice((stockVariancePage-1)*fnbPageSize,stockVariancePage*fnbPageSize).map((v:any)=><tr key={`${v.itemType}-${v.itemId}-${v.movementId}`}>
          <td>{dateLabel(v.date)}</td><td><b>{v.itemName}</b><small className="muted">{v.itemType==='preparation'?'Preparation':'Ingredient'} · {v.unit}</small></td>
          <td>{v.systemStock} {v.unit}</td><td>{v.physicalStock} {v.unit}</td><td>{Number(v.varianceQty)>0?'+':''}{v.varianceQty} {v.unit}</td>
          <td>{v.unitCost == null ? '—' : money(v.unitCost)}</td><td>{v.varianceValue == null ? '—' : money(v.varianceValue)}</td>
        </tr>)}</tbody></table></div><PaginationControls page={stockVariancePage} totalItems={stockVariance.length} pageSize={fnbPageSize} onPageChange={setStockVariancePage} label="hasil opname" /></> : <Empty title="Belum ada hasil opname pada periode ini" text="Hasil opname akan tampil sesuai tanggal adjustment." />}
      </Card>

      <div className="fnb-action-grid">
        <Card className="fnb-action-card">
          <div className="fnb-action-head"><div className="fnb-action-icon"><Trash2 size={17}/></div><div><span className="eyebrow">WASTE</span><h2>Catat yang terbuang</h2><p>Bahan atau prep yang sudah tidak bisa digunakan.</p></div></div>
          <div className="fnb-form-grid">
            <Field label="Jenis"><select disabled={readOnly} className="input" value={wasteType} onChange={e=>{setWasteType(e.target.value as any);setWasteItem('')}}><option value="ingredient">Bahan</option><option value="preparation">Prep</option></select></Field>
            <Field label="Item"><select disabled={readOnly} className="input" value={wasteItem} onChange={e=>setWasteItem(e.target.value)}><option value="">Pilih item...</option>{items.map((x:any)=><option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}</select></Field>
            <Field label="Jumlah"><FieldInput type="number" min="0.001" step="0.001" value={wasteQty} onChange={e=>setWasteQty(e.target.value)} placeholder="0" /></Field>
            <Field label="Alasan"><FieldInput disabled={readOnly} value={wasteReason} onChange={e=>setWasteReason(e.target.value)} /></Field>
          </div>
          <button disabled={readOnly} className="button button-primary fnb-action-button" type="button" onClick={()=>void addWaste()}><Trash2 size={15}/> Catat waste</button>
        </Card>

        <Card className="fnb-action-card">
          <div className="fnb-action-head"><div className="fnb-action-icon"><ReceiptText size={17}/></div><div><span className="eyebrow">BIAYA USAHA</span><h2>Catat pengeluaran</h2><p>Gas, listrik, air, transport, dan biaya di luar bahan.</p></div></div>
          <div className="fnb-form-grid">
            <Field label="Kategori"><FieldInput disabled={readOnly} value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)} placeholder="Gas, listrik, air..." /></Field>
            <Field label="Keterangan"><FieldInput disabled={readOnly} value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)} placeholder="Contoh: isi ulang gas" /></Field>
            <Field label="Nominal"><FieldInput disabled={readOnly} type="number" min="1" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} placeholder="0" /></Field>
          </div>
          <button disabled={readOnly} className="button button-primary fnb-action-button" type="button" onClick={()=>void addExpense()}><ReceiptText size={15}/> Simpan pengeluaran</button>
        </Card>
      </div>
    </>}
  </div>;
}

function AppContent({ onLogout, user }: { onLogout: () => void; user: AppUser }) {
  const query = useGetErpState();
  const health = useHealthCheck();
  const state = query.data;
  const fallback: ErpState = { ingredients: [], products: [], recipes: [], recentPurchases: [], recentSales: [], today: { date: today(), revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }, lowStockCount: 0 };
  const shared = state || fallback;
  return <Shell connected={health.isSuccess} onLogout={onLogout} user={user}><ErrorBoundary resetKey="routes"><Switch>
    <Route path="/" component={() => <Dashboard state={state} error={query.isError ? errText(query.error) : undefined} retry={() => void query.refetch()} />} />
    <Route path="/stok" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Makanan" readOnly={user.role === 'testing'} />} />
    <Route path="/stok/makanan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Makanan" readOnly={user.role === 'testing'} />} />
    <Route path="/stok/parfum" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockPage ingredients={shared.ingredients} stockType="Parfum" readOnly={user.role === 'testing'} />} />
    <Route path="/produk" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Makanan" readOnly={user.role === 'testing'} />} />
    <Route path="/produk/makanan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Makanan" readOnly={user.role === 'testing'} />} />
    <Route path="/produk/parfum" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <ProductPage state={shared} businessType="Parfum" readOnly={user.role === 'testing'} />} />
    <Route path="/belanja" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <PurchasePage ingredients={shared.ingredients} readOnly={user.role === 'testing'} />} />
    <Route path="/penjualan" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <SalePage state={shared} readOnly={user.role === 'testing'} />} />
    <Route path="/prep" component={() => <PrepPage readOnly={user.role === 'testing'} />} />
    <Route path="/kontrol-fnb" component={() => <FnbControlPage readOnly={user.role === 'testing'} />} />
    <Route path="/opname" component={() => query.isLoading ? <LoadingPanel /> : query.isError ? <ErrorPanel message={errText(query.error)} retry={() => void query.refetch()} /> : <StockCountPage ingredients={shared.ingredients} readOnly={user.role === 'testing'} />} />
    <Route path="/laporan" component={() => <ReportPage isAdmin={user.role === 'admin'} />} />
    <Route path="/users" component={() => user.role === 'admin' ? <UsersPage /> : <div className="error-panel"><Shield size={20} /><div><b>Akses khusus admin</b><p>Akun testing hanya dapat melihat data ERP.</p></div></div>} />

    <Route component={() => <div className="not-found"><span className="eyebrow">HALAMAN TIDAK ADA</span><h1>Sepertinya tersesat.</h1><Link href="/" className="inline-link">Kembali ke ringkasan <ArrowRight size={16} /></Link></div>} />
  </Switch></ErrorBoundary></Shell>;
}

function AppRoutes({ isAuthenticated, authReady, user, setupAvailable, onLogin, onSetup, usernameInput, setUsernameInput, passwordInput, setPasswordInput, errorMsg, loginPending, onLogout }: {
  isAuthenticated: boolean; authReady: boolean; user: AppUser | null; setupAvailable: boolean;
  onLogin: (e: React.FormEvent) => void; onSetup: (username: string, password: string, bootstrapToken: string) => void;
  usernameInput: string; setUsernameInput: (val: string) => void; passwordInput: string;
  setPasswordInput: (val: string) => void; errorMsg: string; loginPending: boolean; onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  const redirectTarget = !authReady
    ? null
    : !isAuthenticated && location !== '/login'
      ? '/login'
      : isAuthenticated && (location === '/login' || (user?.role !== 'admin' && location === '/users'))
        ? '/'
        : null;

  useEffect(() => {
    if (redirectTarget) setLocation(redirectTarget);
  }, [redirectTarget, setLocation]);

  if (!authReady) return <LoadingPanel />;
  if (redirectTarget) return <LoadingPanel />;
  if (!isAuthenticated) return <LoginPage onLogin={onLogin} onSetup={onSetup} setupAvailable={setupAvailable}
    usernameInput={usernameInput} setUsernameInput={setUsernameInput} passwordInput={passwordInput}
    setPasswordInput={setPasswordInput} errorMsg={errorMsg} loginPending={loginPending} />;
  return user ? <AppContent onLogout={onLogout} user={user} /> : <LoadingPanel />;
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
  const [loginPending, setLoginPending] = useState(false);
  const logoutPending = useRef(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('kasapink_token');
    localStorage.removeItem('kasapink_user');
    localStorage.removeItem('kasapink_auth');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    client.clear();
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  const handleAccountLogout = useCallback(async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok && response.status !== 401) throw new Error('Logout gagal.');
      handleLogout();
    } catch {
      window.alert('Belum dapat mengakhiri sesi di server. Periksa koneksi dan coba lagi.');
    } finally {
      logoutPending.current = false;
    }
  }, [handleLogout]);

  const saveSession = useCallback((data: { token: string; user: AppUser }) => {
    client.clear();
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
        const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        if (!Number.isFinite(lastActivity) || Date.now() - lastActivity >= AUTO_LOGOUT_MS) {
          handleLogout();
          return;
        }
        const response = await fetch('/api/me', { credentials: 'include' });
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
    setLoginPending(true);
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameInput.trim(), password: passwordInput }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Login gagal.');
      saveSession(data);
      setUsernameInput(''); setPasswordInput('');
    } catch (error) { setErrorMsg(errText(error)); }
    finally { setLoginPending(false); }
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
            errorMsg={errorMsg} loginPending={loginPending} onLogout={() => { void handleAccountLogout(); }} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
