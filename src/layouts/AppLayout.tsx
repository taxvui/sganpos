import { IonPage, IonContent } from '@ionic/react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Coffee, CookingPot, Settings, LayoutDashboard, QrCode, UtensilsCrossed, History, Grid2X2, Users, ArrowRight, LogOut, Menu, Bell, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { getTenantPrefix, getTenantFromHostname, getTenantIdFromPath } from '@/lib/tenantUtils';
import { useSocket } from '@/hooks/useSocket';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShiftGuard from '@/components/ShiftGuard';
import DashboardPage from '@/pages/DashboardPage';
import POSPage from '@/pages/POSPage';
import KitchenPage from '@/pages/KitchenPage';
import MenuPage from '@/pages/MenuPage';
import TablesPage from '@/pages/TablesPage';
import DevelopPage from '@/pages/DevelopPage';
import CustomerOrderPage from '@/pages/CustomerOrderPage';
import QRManagerPage from '@/pages/QRManagerPage';
import SettingsPage from '@/pages/SettingsPage';
import ShiftListPage from '@/pages/ShiftListPage';
import AdminPage from '@/pages/AdminPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import PrintService from '@/components/printing/PrintService';

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const tenantPrefix = getTenantPrefix();
  const fromHostname = getTenantFromHostname();
  const currentTenant = fromHostname || useAuthStore((state) => (state.user as any)?.tenantId) || getTenantIdFromPath(location.pathname);
  
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [audio] = useState(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

  const checkShift = useAuthStore((state) => state.checkShift);
  
  useSocket((event, data) => {
    if (event === 'order:new') {
      setHasNewOrder(true);
      audio.play().catch(e => console.log('Audio play blocked:', e));
    }
    if (event === 'shift:update') {
      checkShift();
    }
  });

  useEffect(() => {
    if (location.pathname.includes('/kitchen')) {
      setHasNewOrder(false);
    }
  }, [location.pathname]);

  const isMainLanding = !fromHostname && !currentTenant && (location.pathname === '/' || location.pathname === '');
  const isCustomerPage = location.pathname.includes('/order');
  const isDevelopPage = location.pathname.includes('/develop');
  const authPaths = [`${tenantPrefix}/login`, `${tenantPrefix}/register`, `/login`, `/register`].map(p => p.replace(/\/$/, ''));
  const isAuthPage = authPaths.includes(location.pathname.replace(/\/$/, ''));

  if (isMainLanding && !isAuthPage) {
    return (
      <IonPage>
        <IonContent>
          <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center overflow-hidden relative">
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[100px]" />
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative z-10 flex flex-col items-center w-full max-w-2xl"
            >
              <Logo size="lg" className="mb-6 sm:mb-8 shrink-0" />
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black text-foreground tracking-tight leading-tight mb-4 sm:mb-6 lg:mb-8">
                Quản lý vận hành <br/> 
                <span className="text-primary">với đẳng cấp mới</span>
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base lg:text-lg font-medium max-w-xl mb-8 sm:mb-10 lg:mb-12 mx-auto leading-relaxed px-2">
                Hệ sinh thái thông minh chuyên biệt cho chuỗi cà phê & nhà hàng hiện đại. 
                Tối ưu quy trình, bứt phá doanh thu.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full max-w-md px-2">
                <Button size="lg" className="h-12 sm:h-14 px-6 sm:px-12 text-base sm:text-lg font-bold rounded-xl sm:rounded-2xl shadow-xl shadow-primary/20 group w-full sm:w-auto" asChild>
                  <Link to="/login" className="flex items-center justify-center">
                    Truy cập hệ thống
                    <ArrowRight className="ml-2 w-4 sm:w-5 h-4 sm:h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                {!fromHostname && (
                  <Button size="lg" variant="outline" className="h-12 sm:h-14 px-6 sm:px-12 text-base sm:text-lg font-bold rounded-xl sm:rounded-2xl w-full sm:w-auto" asChild>
                    <Link to="/register">
                      Mở chi nhánh mới
                    </Link>
                  </Button>
                )}
              </div>
              <div className="mt-12 sm:mt-16 lg:mt-20 pt-8 sm:pt-10 border-t border-border/50 flex flex-col sm:flex-row flex-wrap justify-center gap-4 sm:gap-8 opacity-50 items-center text-xs sm:text-sm">
                <span className="font-black tracking-tighter text-lg sm:text-xl lg:text-2xl text-slate-800">MONDAY.COM.VN</span>
                <div className="hidden sm:block w-1.5 h-1.5 bg-muted-foreground/30 rounded-full" />
                <span className="font-bold uppercase tracking-widest text-muted-foreground">Professional POS Solutions</span>
              </div>
            </motion.div>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (isAuthPage) {
    return (
      <main className="min-h-screen bg-background">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {!fromHostname && <Route path="/register" element={<RegisterPage />} />}
              <Route path={`${tenantPrefix}/login`} element={<LoginPage />} />
              {tenantPrefix !== '' && !fromHostname && <Route path={`${tenantPrefix}/register`} element={<RegisterPage />} />}
              {fromHostname && <Route path="/register" element={<Navigate to="/login" replace />} />}
              {fromHostname && <Route path={`${tenantPrefix}/register`} element={<Navigate to="/login" replace />} />}
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    );
  }

  const navItems = [
    { to: `${tenantPrefix}/`, icon: LayoutDashboard, label: 'Thống kê' },
    { to: `${tenantPrefix}/pos`, icon: Coffee, label: 'Bán hàng' },
    { to: `${tenantPrefix}/shifts`, icon: History, label: 'Lịch sử ca' },
    { to: `${tenantPrefix}/kitchen`, icon: CookingPot, label: 'Bếp', badge: hasNewOrder },
    { to: `${tenantPrefix}/menu`, icon: UtensilsCrossed, label: 'Thực đơn', permission: 'MENU_MANAGE' },
    { to: `${tenantPrefix}/tables`, icon: Grid2X2, label: 'Bàn', permission: 'TABLE_MANAGE' },
    { to: `${tenantPrefix}/qr`, icon: QrCode, label: 'Mã QR', permission: 'TABLE_MANAGE' },
    { to: `${tenantPrefix}/admin`, icon: Users, label: 'Nhân sự', permission: 'USER_MANAGE' },
    { to: `${tenantPrefix}/settings`, icon: Settings, label: 'Cài đặt', permission: 'SETTINGS_MANAGE' },
  ].filter(item => {
    if (!item.permission) return true;
    if (user?.role === 'ADMIN' || user?.role === 'MANAGER') return true;
    return user?.permissions?.includes(item.permission);
  });

  const SidebarContent = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col h-full bg-card shadow-sm", className)}>
      <div className="p-4 sm:p-6 shrink-0">
        <Link to={`${tenantPrefix}/`} className="flex items-center gap-3 group">
          <Logo variant="icon" size="md" className="group-hover:scale-110 transition-transform shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-black text-sm sm:text-base tracking-tight leading-none truncate">SAIGON AN</span>
            <span className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground font-bold">Coffee & Tea</span>
          </div>
        </Link>
      </div>
      
      <ScrollArea className="flex-1 px-3 sm:px-4">
        <nav className="flex flex-col gap-1 py-4">
          {navItems.map((item) => {
            const isActive = (location.pathname === item.to || (item.to === `${tenantPrefix}/` && (location.pathname === tenantPrefix || location.pathname === `${tenantPrefix}/`)));
            return (
              <Link 
                key={item.to}
                to={item.to} 
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg sm:rounded-xl transition-all duration-200 group relative",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "animate-pulse" : "group-hover:scale-110 transition-transform")} />
                <span className="font-semibold text-xs sm:text-sm truncate">{item.label}</span>
                {item.badge && (
                  <Badge variant="destructive" className="ml-auto flex h-4 sm:h-5 w-4 sm:w-5 items-center justify-center rounded-full p-0 text-[8px] sm:text-[10px] shrink-0">
                    !
                  </Badge>
                )}
                {isActive && (
                  <motion.div 
                    layoutId="active-pill" 
                    className="absolute left-0 w-1 h-6 bg-white rounded-full ml-1"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="p-3 sm:p-4 mt-auto border-t border-border/50 shrink-0">
        <div className="bg-muted/50 rounded-lg sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="h-8 sm:h-10 w-8 sm:w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/10 shrink-0">
            <User className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-xs sm:text-sm truncate">{user?.fullName || user?.username}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">{user?.role}</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 sm:h-9 w-8 sm:w-9"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background overflow-hidden selection:bg-primary/20 w-full">
      <PrintService />
      
      {/* Desktop Sidebar */}
      {!isCustomerPage && !isDevelopPage && (
        <SidebarContent className="hidden lg:flex w-72 shrink-0 border-r border-border/50" />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative w-full overflow-hidden">
        {/* Header */}
        <header className="h-14 sm:h-16 lg:h-20 flex items-center justify-between px-3 sm:px-4 lg:px-6 bg-background/80 backdrop-blur-md border-b border-border/50 shrink-0 z-40">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {!isCustomerPage && !isDevelopPage && (
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-9 w-9 sm:h-10 sm:w-10">
                    <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 border-r-0 w-64 sm:w-72">
                  <SidebarContent className="border-r-0" />
                </SheetContent>
              </Sheet>
            )}
            <h2 className="text-sm sm:text-base lg:text-lg font-extrabold tracking-tighter text-foreground/90 truncate">
              {navItems.find(item => item.to === location.pathname)?.label || 'Bảng điều khiển'}
            </h2>
            {location.pathname.includes('/kitchen') && hasNewOrder && (
              <Badge variant="destructive" className="animate-bounce text-xs sm:text-sm shrink-0">Có đơn hàng mới!</Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button variant="outline" size="icon" className="rounded-full relative h-9 w-9 sm:h-10 sm:w-10">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 sm:h-10 sm:w-10 p-0 overflow-hidden border border-border shrink-0">
                  <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary text-xs sm:text-sm font-bold">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 sm:w-56 rounded-xl text-sm sm:text-base">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs sm:text-sm font-bold leading-none truncate">{user?.fullName || user?.username}</p>
                    <p className="text-[10px] sm:text-xs leading-none text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`${tenantPrefix}/settings`)}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Cài đặt hệ thống</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Đăng xuất</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 relative bg-muted/30 p-2 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden w-full">
          <div className="max-w-[1920px] mx-auto w-full h-full relative">
            <AnimatePresence mode="wait">
              <motion.div 
                key={location.pathname} 
                initial={{ opacity: 0, scale: 0.99, y: 4 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.99, y: -4 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="w-full h-full min-h-full"
              >
                <Routes>
                  <Route path={`${tenantPrefix}`}>
                    <Route element={<ProtectedRoute />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="pos" element={
                        <ShiftGuard>
                          <POSPage />
                        </ShiftGuard>
                      } />
                      <Route path="shifts" element={<ShiftListPage />} />
                      <Route path="kitchen" element={<KitchenPage />} />
                      <Route path="menu" element={<MenuPage />} />
                      <Route path="tables" element={<TablesPage />} />
                      <Route path="qr" element={<QRManagerPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="admin" element={<AdminPage />} />
                    </Route>
                    <Route path="develop" element={<DevelopPage />} />
                    <Route path="order" element={<CustomerOrderPage />} />
                  </Route>
                  {tenantPrefix !== '' && (
                    <Route path="/develop" element={<DevelopPage />} />
                  )}
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
