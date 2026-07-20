import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { Button } from '../ui/Button'
import logo from '../assets/inja-logo.jpg'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(false)
  const login = useLogin()
  const nav = useNavigate()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(false)
    login.mutate({ username, password }, {
      onSuccess: () => nav('/departments', { replace: true }),
      onError: () => setErr(true),
    })
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-login-bg overflow-hidden font-sans">
      <div className="absolute w-[420px] h-[420px] rounded-full bg-login-orb opacity-55 -top-[140px] -left-[110px]" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-login-orb opacity-50 -bottom-[120px] -right-[90px]" />
      <form onSubmit={onSubmit} className="relative w-[380px] bg-bg rounded-3xl p-8 shadow-modal">
        <div className="flex flex-col items-center gap-3.5 mb-6">
          <img src={logo} alt="اینجا فست‌فود" className="w-[76px] h-[76px] rounded-[20px] object-cover" />
          <div className="text-center">
            <div className="font-extrabold text-[19px] text-ink">اینجا فست‌فود</div>
            <div className="text-[12.5px] text-muted mt-1">سامانهٔ مستندسازی فرآیندها</div>
          </div>
        </div>
        <label className="block text-[12.5px] font-semibold text-violet mb-1.5">نام کاربری</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="analyst"
          className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-xl text-sm text-ink bg-white outline-none mb-4 focus:border-coral" />
        <label className="block text-[12.5px] font-semibold text-violet mb-1.5">گذرواژه</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
          className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-xl text-sm text-ink bg-white outline-none mb-2 focus:border-coral" />
        {err && <div className="text-conflict text-[12px] mb-2">نام کاربری یا گذرواژه نادرست است</div>}
        <Button variant="coral" type="submit" className="w-full py-3.5 mt-2 text-[14.5px]">ورود به سامانه</Button>
        <div className="text-center mt-4 text-[11px] text-faint">دسترسی تک‌کاربره · محافظت‌شده با نام‌کاربری و گذرواژه</div>
      </form>
    </div>
  )
}
