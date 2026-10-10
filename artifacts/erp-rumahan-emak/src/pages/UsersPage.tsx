import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Pencil, Plus, Shield, Trash2, UserRound } from "lucide-react";
import PasswordInput from "../components/PasswordInput";

type AppUser = { id: number; username: string; role: "admin" | "testing" | "user"; createdAt: string };
const headers = () => ({ });
function getLoggedInUserId(): number | null {
  try {
    const user = JSON.parse(localStorage.getItem("kasapink_user") || "null") as { id?: unknown } | null;
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editRole, setEditRole] = useState<AppUser["role"]>("user");
  const [editPassword, setEditPassword] = useState("");
  const loggedInUserId = getLoggedInUserId();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { headers: headers(), credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal memuat daftar user.");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar user.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          username: String(form.get("username") || "").trim(),
          password: String(form.get("password") || ""),
          role: form.get("role"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal menambahkan user.");
      formElement.reset();
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan user.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    setEditingUserId(editUser.id);
    setError("");
    try {
      const response = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ role: editRole, newPassword: editPassword || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan perubahan user.");
      setEditUser(null);
      setEditPassword("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan user.");
    } finally {
      setEditingUserId(null);
    }
  }

  async function deleteUser(user: AppUser) {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus user ${user.username}?`)) return;
    setDeletingUserId(user.id);
    setError("");
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE", headers: headers(), credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal menghapus user.");
      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus user.");
    } finally {
      setDeletingUserId(null);
    }
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">PENGATURAN SISTEM</div><h1>Manajemen User</h1><p>Kelola akun admin, user operasional, dan akun testing Kasapink.</p></div>
      <div className="heading-action"><button className="button button-primary" onClick={() => { setError(""); setShowForm((value) => !value); }}><Plus size={17} /> Tambah user</button></div>
    </div>

    {showForm && <section className="card table-card" style={{ marginBottom: 20 }}>
      <div className="card-heading"><div><span className="eyebrow">AKUN BARU</span><h2>Tambah user</h2></div></div>
      <form className="form-stack" onSubmit={addUser}>
        <div className="form-row">
          <label className="field"><span>Username</span><input className="input" name="username" required maxLength={80} autoComplete="username" /></label>
          <label className="field"><span>Password</span><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></label>
        </div>
        <label className="field"><span>Role</span><select className="input select" name="role" defaultValue="testing"><option value="testing">Testing · hanya baca</option><option value="user">User · kelola data operasional</option><option value="admin">Admin · akses penuh</option></select></label>
        <div className="form-error" role="note"><Shield size={16} /> User dapat mengubah data operasional. Hanya admin yang dapat membuka Manajemen User.</div>
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setShowForm(false)}>Batal</button><button className="button button-primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat user"}</button></div>
      </form>
    </section>}

    {editUser && <section className="card table-card" style={{ marginBottom: 20 }}>
      <div className="card-heading"><div><span className="eyebrow">EDIT AKUN</span><h2>Edit user</h2></div></div>
      <form className="form-stack" onSubmit={saveEdit}>
        <label className="field"><span>Username</span><input className="input" value={editUser.username} readOnly /></label>
        <label className="field"><span>Role</span><select className="input select" value={editRole} onChange={(event) => setEditRole(event.target.value as AppUser["role"])} disabled={editUser.id === loggedInUserId}><option value="testing">Testing · hanya baca</option><option value="user">User · kelola data operasional</option><option value="admin">Admin · akses penuh</option></select></label>
        <label className="field"><span>Password baru <small>(opsional)</small></span><PasswordInput name="newPassword" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" placeholder="Kosongkan jika tidak ingin mengubah" /></label>
        {editUser.id === loggedInUserId && <div className="form-error" role="note"><Shield size={16} /> Role akun yang sedang dipakai tidak dapat diubah dari sini. Password tetap dapat diganti jika diperlukan.</div>}
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => { setEditUser(null); setEditPassword(""); }}>Batal</button><button className="button button-primary" disabled={editingUserId !== null}>{editingUserId === editUser.id ? "Menyimpan…" : "Simpan perubahan"}</button></div>
      </form>
    </section>}

    <section className="card table-card">
      <div className="card-heading"><div><span className="eyebrow">AKUN KASAPINK</span><h2>Daftar user</h2></div><span className="result-count">{users.length} user</span></div>
      {error && !showForm && <div className="form-error"><AlertCircle size={16} />{error}<button className="text-button" onClick={() => { setError(""); void loadUsers(); }}>Coba lagi</button></div>}
      {loading ? <div className="loading-grid"><div className="skeleton" /></div> : users.length ? <div className="table-scroll"><table><thead><tr><th>USERNAME</th><th>ROLE</th><th>DIBUAT</th><th>AKSI</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.id}><td><div className="table-name"><span className="ingredient-token"><UserRound size={16} /></span><b>{user.username}</b></div></td><td><span className={`status-pill ${user.role === "testing" ? "status-low" : "status-ok"}`}>{user.role}</span></td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(user.createdAt))}</td><td><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="button button-quiet" onClick={() => { setError(""); setEditPassword(""); setEditRole(user.role); setEditUser(user); }} disabled={editingUserId !== null || deletingUserId !== null} aria-label={`Edit user ${user.username}`}><Pencil size={15} /> Edit</button>{user.id !== loggedInUserId && <button type="button" className="button button-quiet" onClick={() => void deleteUser(user)} disabled={deletingUserId !== null || editingUserId !== null} aria-label={`Hapus user ${user.username}`} style={{ color: "#613248" }}>{deletingUserId === user.id ? "Menghapus…" : <><Trash2 size={15} /> Hapus</>}</button>}</div></td></tr>)}
      </tbody></table></div> : <div className="empty-state"><span className="empty-icon"><UserRound size={20} /></span><b>Belum ada user</b><p>Buat user pertama untuk mulai mengelola akses.</p></div>}
    </section>
  </>;
}
