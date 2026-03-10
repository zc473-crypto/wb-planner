// src/planner/AdminPanel.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500;600&display=swap');`

function fmt(ts) {
  if (!ts) return '—'
  try { return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

export default function AdminPanel({ lang, setLang, user, onEnterPlanner, onSignOut }) {
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [addErr, setAddErr]     = useState('')
  const [adding, setAdding]     = useState(false)
  const [search, setSearch]     = useState('')
  const en = lang === 'en'
  const mono = { fontFamily: 'monospace' }

  const reload = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'whitelist'))
      const rows = snap.docs.map(d => d.data()).sort((a, b) => {
        // Admin first, then by lastLogin desc
        if (a.email === user.email.toLowerCase()) return -1
        if (b.email === user.email.toLowerCase()) return 1
        const ta = a.lastLogin?.toMillis?.() || 0
        const tb = b.lastLogin?.toMillis?.() || 0
        return tb - ta
      })
      setEntries(rows)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const addEmail = async () => {
    setAddErr('')
    const e = newEmail.trim().toLowerCase()
    if (!e || !e.includes('@')) { setAddErr(en ? 'Enter a valid email.' : '请输入有效邮箱。'); return }
    if (entries.find(x => x.email === e)) { setAddErr(en ? 'Already in whitelist.' : '已在白名单中。'); return }
    setAdding(true)
    try {
      await setDoc(doc(db, 'whitelist', e), { email: e, displayName: '', photoURL: '', addedAt: serverTimestamp(), lastLogin: null })
      setNewEmail('')
      await reload()
    } catch { setAddErr(en ? 'Failed to add. Check Firestore permissions.' : '添加失败，请检查 Firestore 权限。') }
    setAdding(false)
  }

  const removeEmail = async (email) => {
    if (email === user.email.toLowerCase()) return // can't remove self
    if (!window.confirm(en ? `Remove ${email} from whitelist?` : `确认从白名单移除 ${email}？`)) return
    try {
      await deleteDoc(doc(db, 'whitelist', email))
      setEntries(prev => prev.filter(x => x.email !== email))
    } catch { alert(en ? 'Failed to remove.' : '移除失败。') }
  }

  const filtered = entries.filter(e =>
    e.email.includes(search.toLowerCase()) ||
    (e.displayName || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'sans-serif' }}>
      <style>{FONTS}</style>

      {/* Nav */}
      <div style={{ background: '#0f172a', padding: '0 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'DM Serif Display',serif", color: '#f8fafc', fontSize: 18 }}>
              {en ? 'WB Planner' : 'WB 规划器'}
            </span>
            <span style={{ background: '#7c3aed', color: '#fff', fontSize: 10, ...mono, padding: '2px 8px', borderRadius: 10 }}>ADMIN</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 16, padding: '4px 12px', fontSize: 11, cursor: 'pointer', ...mono }}>
              {en ? '中文' : 'English'}
            </button>
            <span style={{ fontSize: 11, color: '#475569', ...mono }}>{user?.displayName || user?.email}</span>
            <button onClick={onEnterPlanner}
              style={{ background: '#2563eb', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {en ? 'Open Planner →' : '进入规划器 →'}
            </button>
            <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12 }}>
              {en ? 'Sign Out' : '退出'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
              {en ? 'Whitelist Management' : '白名单管理'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {en ? `${entries.length} accounts · only these emails can sign in` : `共 ${entries.length} 个账号 · 仅白名单内的邮箱可登录`}
            </div>
          </div>
          <button onClick={reload}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
            ↻ {en ? 'Refresh' : '刷新'}
          </button>
        </div>

        {/* Add email */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', ...mono, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>
            {en ? 'Add to whitelist' : '添加邮箱'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmail()}
              placeholder={en ? 'colleague@email.com' : '同事邮箱'}
              style={{ flex: 1, minWidth: 220, padding: '9px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', ...mono }} />
            <button onClick={addEmail} disabled={adding}
              style={{ padding: '9px 20px', background: adding ? '#94a3b8' : '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer' }}>
              {adding ? '…' : (en ? '+ Add' : '+ 添加')}
            </button>
          </div>
          {addErr && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{addErr}</div>}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={en ? 'Search by email or name…' : '按邮箱或姓名搜索…'}
          style={{ width: '100%', padding: '9px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box', ...mono }} />

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', ...mono }}>{en ? 'Loading…' : '加载中…'}</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            {en ? 'No results.' : '无结果。'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(entry => {
              const isSelf = entry.email === user.email.toLowerCase()
              const hasLoggedIn = !!entry.lastLogin
              return (
                <div key={entry.email}
                  style={{ background: '#fff', border: `1px solid ${isSelf ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  {entry.photoURL
                    ? <img src={entry.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: isSelf ? '#7c3aed' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: isSelf ? '#fff' : '#94a3b8', flexShrink: 0 }}>
                        {(entry.displayName || entry.email)[0].toUpperCase()}
                      </div>}

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                        {entry.displayName || entry.email}
                      </span>
                      {isSelf && <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 10, ...mono, padding: '1px 7px', borderRadius: 8 }}>admin</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', ...mono, marginTop: 2 }}>{entry.email}</div>
                    <div style={{ fontSize: 11, color: hasLoggedIn ? '#64748b' : '#94a3b8', marginTop: 3 }}>
                      {hasLoggedIn
                        ? `${en ? 'Last login' : '上次登录'}: ${fmt(entry.lastLogin)}`
                        : (en ? 'Never logged in' : '尚未登录')}
                    </div>
                  </div>

                  {!isSelf && (
                    <button onClick={() => removeEmail(entry.email)}
                      style={{ padding: '6px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                      {en ? 'Remove' : '移除'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
