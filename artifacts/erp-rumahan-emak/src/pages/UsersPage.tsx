import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Plus, Shield, UserRound } from "lucide-react";
import PasswordInput from "../components/PasswordInput";

type AppUser = { id: number; username: string; role: "admin" | "testing" | "user"; createdAt: string };
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("kasapink_token") || ""}` });

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { headers: headers() });
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
        headers: { ...headers(), "Content-Type": "application/json" },
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

    <section className="card table-card">
      <div className="card-heading"><div><span className="eyebrow">AKUN KASAPINK</span><h2>Daftar user</h2></div><span className="result-count">{users.length} user</span></div>
      {error && !showForm && <div className="form-error"><AlertCircle size={16} />{error}<button className="text-button" onClick={() => void loadUsers()}>Coba lagi</button></div>}
      {loading ? <div className="loading-grid"><div className="skeleton" /></div> : users.length ? <div className="table-scroll"><table><thead><tr><th>USERNAME</th><th>ROLE</th><th>DIBUAT</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.id}><td><div className="table-name"><span className="ingredient-token"><UserRound size={16} /></span><b>{user.username}</b></div></td><td><span className={`status-pill ${user.role === "testing" ? "status-low" : "status-ok"}`}>{user.role}</span></td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(user.createdAt))}</td></tr>)}
      </tbody></table></div> : <div className="empty-state"><span className="empty-icon"><UserRound size={20} /></span><b>Belum ada user</b><p>Buat user pertama untuk mulai mengelola akses.</p></div>}
    </section>
  </>;
}
