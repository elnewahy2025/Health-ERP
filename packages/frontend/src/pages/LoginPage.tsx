import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../stores/authStore';
import { securityApi } from '../lib/api';
import { Stethoscope, Loader2, Eye, EyeOff, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('vision');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [partialToken, setPartialToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !tenantSlug) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const result = await login(email, password, tenantSlug);
      // If MFA is required and we got back a partial token
      if (((result as Record<string, unknown>)?.mfaRequired)) {
        setPartialToken(((result as Record<string, unknown>)?.partialToken as string));
        setMfaRequired(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string }; toast.error(axiosErr?.response?.data?.error || axiosErr?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) { toast.error('Enter your 6-digit code'); return; }
    setLoading(true);
    try {
      await (await import('../lib/api')).securityApi.mfaVerify(partialToken, mfaCode);
      // After MFA verification, reload to get fresh auth state
      window.location.href = '/';
    } catch (err: unknown) {
      const axiosErr2 = err as { response?: { data?: { error?: string } }; message?: string }; toast.error(axiosErr2?.response?.data?.error || 'Invalid code');
    } finally { setLoading(false); }
  };

  if (mfaRequired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Smartphone className="w-12 h-12 text-primary-600 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
            <p className="text-sm text-gray-500 mt-1">Enter the code from your authenticator app</p>
          </div>
          <div className="card p-6 text-center">
            <input className="input text-center text-2xl tracking-[1em] max-w-[200px] mx-auto font-mono"
              placeholder="000000" maxLength={6} value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
              autoFocus />
            <button onClick={handleMfaVerify} disabled={loading || mfaCode.length !== 6} className="btn-primary w-full mt-4">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Verify
            </button>
            <p className="text-xs text-gray-400 mt-3">Lost access? Contact your administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.loginSubtitle')}</p>
        </div>
        <form onSubmit={handleLogin} className="card p-6 space-y-4">
          <div>
            <label className="label">{t('auth.tenantSlug')}</label>
            <input className="input" placeholder={t('auth.tenantSlugPlaceholder')} value={tenantSlug}
              onChange={e => setTenantSlug(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t('auth.email')}</label>
            <input type="email" className="input" placeholder="admin@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t('auth.password')}</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className="input pr-10"
                placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-primary-600 hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t('auth.login')}
          </button>
          <p className="text-center text-sm text-gray-500">
            Don't have an account? <Link to="/register" className="text-primary-600 hover:underline font-medium">Register</Link>
          </p>
          <p className="text-center text-sm text-gray-500 border-t border-gray-100 pt-3">
            <Link to="/portal" className="text-primary-600 hover:underline font-medium">Patient portal →</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
