import { IonPage, IonContent } from '@ionic/react';
import React, { useState, useEffect } from 'react';
// ... rest of imports
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Fingerprint, Globe, ArrowLeft } from 'lucide-react';
import { getTenantPrefix, getTenantFromHostname } from '../lib/tenantUtils';
import Logo from '../components/Logo';

const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [error, setError] = useState('');
  const [brand, setBrand] = useState<{ storeName: string; logoUrl: string }>({
    storeName: 'Monday',
    logoUrl: '/logo.svg'
  });
  const [showResend, setShowResend] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [unverifiedTenantId, setUnverifiedTenantId] = useState('');
  const { login, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const tenantPrefix = getTenantPrefix();
  const currentTenantFromHost = getTenantFromHostname();

  useEffect(() => {
    // Fetch brand info if we have a tenant context
    const fetchBrand = async () => {
      try {
        const api = (await import('../lib/api')).default;
        const res = await api.get('/api/settings/public/brand');
        if (res.data) {
          setBrand(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch brand:', err);
      }
    };
    
    fetchBrand();
  }, []);

  useEffect(() => {
    if (user) {
      const params = new URLSearchParams(location.search);
      const redirectTo = params.get('redirect');
      if (redirectTo) {
        navigate(`${tenantPrefix}/${redirectTo}`);
      } else {
        navigate(`${tenantPrefix}/`);
      }
    }
  }, [user, navigate, tenantPrefix, location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If we are on the main domain, we must ensure we have a subdomain or redirect to it
    if (!currentTenantFromHost && subdomain) {
      // Redirect to the subdomain login page
      const protocol = window.location.protocol;
      const domain = 'monday.com.vn';
      // Only redirect if not on localhost
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        window.location.href = `${protocol}//${subdomain}.${domain}/login`;
        return;
      } else {
        // On localhost, we can just use the path-based approach by navigating
        navigate(`/${subdomain}/login`);
        return;
      }
    }

    try {
      setError('');
      setShowResend(false);
      await login(identifier, password);
      const params = new URLSearchParams(location.search);
      const redirectTo = params.get('redirect');
      if (redirectTo) {
        navigate(`${tenantPrefix}/${redirectTo}`);
      } else {
        navigate(`${tenantPrefix}/`);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response) {
        const msg = err.response.data?.error;
        const details = err.response.data?.details;
        const requireVerification = err.response.data?.requireVerification;
        
        setError(typeof msg === 'string' ? (details ? `${msg}: ${details}` : msg) : 'Đăng nhập thất bại');
        
        if (requireVerification) {
          setShowResend(true);
          setUnverifiedEmail(err.response.data.email);
          setUnverifiedTenantId(err.response.data.tenantId);
        }
      } else if (err.request) {
        setError('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng.');
      } else {
        setError(`Lỗi: ${err.message}`);
      }
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail || !unverifiedTenantId) return;
    
    setResendStatus('loading');
    try {
      const api = (await import('../lib/api')).default;
      await api.post('/api/auth/resend-verification', {
        email: unverifiedEmail,
        tenantId: unverifiedTenantId
      });
      setResendStatus('success');
      setShowResend(false);
    } catch (err) {
      console.error('Resend error:', err);
      setResendStatus('error');
    }
  };

  return (
    <IonPage>
      <IonContent>
        <div className="min-h-screen bg-background flex items-center justify-center p-4 selection:bg-primary/10">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-md w-full bg-card rounded-3xl shadow-xl shadow-slate-200/50 border border-border p-8 sm:p-12 relative overflow-hidden"
      >
        <div className="flex flex-col items-center mb-10">
          {brand.logoUrl ? (
            <img 
              src={brand.logoUrl} 
              alt={brand.storeName} 
              className="h-16 w-auto mb-6 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.svg';
              }}
            />
          ) : (
            <Logo size="lg" className="mb-6" />
          )}
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Chào mừng trở lại</h1>
          <p className="text-muted-foreground font-semibold tracking-wider uppercase text-[10px] mt-2 px-3 py-1 bg-muted rounded-full">
            {currentTenantFromHost ? brand.storeName || currentTenantFromHost : 'Hệ thống quản lý POS'}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/5 text-destructive p-4 rounded-xl text-sm mb-6 font-medium border border-destructive/10 flex flex-col gap-2">
             <div className="flex items-center gap-3">
               <span className="w-2 h-2 bg-destructive rounded-full" />
               {typeof error === 'string' ? error : JSON.stringify(error)}
             </div>
             {showResend && (
               <button 
                 onClick={handleResendVerification}
                 disabled={resendStatus === 'loading'}
                 className="text-xs text-destructive underline font-bold uppercase tracking-widest mt-1 ml-5 disabled:opacity-50"
               >
                 {resendStatus === 'loading' ? 'Đang gửi...' : 'Gửi lại email xác thực'}
               </button>
             )}
          </div>
        )}

        {resendStatus === 'success' && (
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-sm mb-6 font-medium border border-emerald-100 flex items-center gap-3">
            <span className="w-2 h-2 bg-emerald-600 rounded-full" />
            Email xác thực đã được gửi. Vui lòng kiểm tra hộp thư.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!currentTenantFromHost && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Chi nhánh</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                  className="w-full h-12 bg-muted/40 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 font-medium transition-all"
                  placeholder="ten-chi-nhanh"
                  required={!currentTenantFromHost}
                />
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 w-4 h-4" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Tài khoản</label>
            <input 
              type="text" 
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full h-12 bg-muted/40 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary px-4 font-medium transition-all"
              placeholder="Email hoặc số điện thoại"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Mật khẩu</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 bg-muted/40 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary px-4 font-medium transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]"
          >
            <LogIn className="w-4 h-4" />
            Đăng nhập
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-border/50 text-center">
          {currentTenantFromHost ? (
            <a 
              href="https://monday.com.vn/register" 
              className="text-muted-foreground font-bold hover:text-primary flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <UserPlus className="w-4 h-4" />
              Đăng ký chi nhánh mới
            </a>
          ) : (
            <Link to="/register" className="text-primary font-bold hover:underline flex items-center justify-center gap-2 text-sm">
              <UserPlus className="w-4 h-4" />
              Tạo tài khoản cửa hàng
            </Link>
          )}
          {!currentTenantFromHost && (
             <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest mt-8 transition-colors">
               <ArrowLeft size={10} />
               Về trang chủ
             </Link>
          )}
        </div>
      </motion.div>
    </div>
    </IonContent>
  </IonPage>
  );
};

export default LoginPage;
