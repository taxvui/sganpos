import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { IonPage, IonContent } from '@ionic/react';
import { clsx, type ClassValue } from 'clsx';
// ... existing imports ...
import { 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Coffee,
  ShieldAlert,
  Download,
  Calendar as CalendarIcon
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useReports } from '@/hooks/useReports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const DashboardPage = () => {
  const { user } = useAuthStore();
  const canViewReports = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.permissions?.includes('REPORT_VIEW');
  const [filter, setFilter] = useState('today');

  const dateRange = useMemo(() => {
    let start = new Date();
    let end = new Date();

    switch (filter) {
      case 'today':
        start = startOfDay(new Date());
        end = endOfDay(new Date());
        break;
      case 'yesterday':
        start = startOfDay(subDays(new Date(), 1));
        end = endOfDay(subDays(new Date(), 1));
        break;
      case 'last7days':
        start = startOfDay(subDays(new Date(), 6));
        end = endOfDay(new Date());
        break;
      case 'thisMonth':
        start = startOfMonth(new Date());
        end = endOfMonth(new Date());
        break;
      case 'lastMonth':
        start = startOfMonth(subMonths(new Date(), 1));
        end = endOfMonth(subMonths(new Date(), 1));
        break;
    }
    return { start, end };
  }, [filter]);

  const { data, isLoading } = useReports(dateRange.start.toISOString(), dateRange.end.toISOString());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const COLORS = ['oklch(0.627 0.265 149.214)', 'oklch(0.623 0.214 259.015)', 'oklch(0.769 0.188 70.08)', 'oklch(0.637 0.237 25.331)', 'oklch(0.627 0.265 149.214)'];

  if (!canViewReports) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="h-[80vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 bg-destructive/10 rounded-[32px] flex items-center justify-center mb-6">
              <ShieldAlert size={48} className="text-destructive opacity-40" />
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-2">TRUY CẬP BỊ TỪ CHỐI</h2>
            <p className="max-w-md text-muted-foreground font-medium">Bạn không có quyền truy cập vào chức năng báo cáo & thống kê. Vui lòng liên hệ quản trị viên.</p>
            <Button variant="outline" className="mt-8 rounded-xl px-10" onClick={() => window.history.back()}>
              Quay lại
            </Button>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-8 pb-12"
        >
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <Badge variant="outline" className="mb-2 uppercase tracking-widest font-black opacity-60">Thống kê vận hành</Badge>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic leading-none">Bảng điều khiển</h1>
              <div className="flex items-center gap-2 text-muted-foreground mt-3 font-bold text-xs">
                <CalendarIcon size={14} className="text-primary" />
                {format(dateRange.start, 'dd/MM/yyyy')} — {format(dateRange.end, 'dd/MM/yyyy')}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px] h-12 rounded-xl font-bold border-border/50 bg-card/50 backdrop-blur-sm">
                  <SelectValue placeholder="Chọn thời gian" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="yesterday">Hôm qua</SelectItem>
                  <SelectItem value="last7days">7 ngày qua</SelectItem>
                  <SelectItem value="thisMonth">Tháng này</SelectItem>
                  <SelectItem value="lastMonth">Tháng trước</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl border-border/50 bg-card/50">
                <Download size={18} />
              </Button>
            </div>
          </div>

          {/* Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[
              { label: 'Doanh thu', value: data?.summary?.total || 0, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', trend: '+12.5%', isCurrency: true },
              { label: 'Đơn hàng', value: data?.summary?.count || 0, icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-500/10', trend: '+8.2%' },
              { label: 'Khách hàng', value: data?.summary?.count || 0, icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10', trend: 'Tăng trưởng' },
              { label: 'Tb. Mỗi Đơn', value: data?.summary?.count > 0 ? (data.summary.total / data.summary.count) : 0, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-500/10', trend: '-2.1%', isCurrency: true },
            ].map((stat, i) => (
              <motion.div key={i} variants={item}>
                <Card className="border-border/40 shadow-sm hover:shadow-md transition-all duration-300 group bg-card/40 backdrop-blur-sm overflow-hidden rounded-[24px]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">{stat.label}</CardTitle>
                    <div className={cn("p-2 rounded-xl group-hover:scale-110 transition-transform", stat.bg, stat.color)}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-24 mb-1" />
                    ) : (
                      <div className="text-xl font-black tracking-tight mb-1">
                        {stat.isCurrency ? formatCurrency(stat.value) : stat.value.toLocaleString('vi-VN')}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 line-clamp-1">
                      <span className={cn("text-xs font-black", stat.trend.startsWith('+') ? 'text-emerald-500' : stat.trend.startsWith('-') ? 'text-rose-500' : 'text-blue-500')}>
                        {stat.trend.startsWith('+') ? <ArrowUpRight className="inline h-3 w-3" /> : stat.trend.startsWith('-') ? <ArrowDownRight className="inline h-3 w-3" /> : null}
                        {stat.trend}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground italic truncate">so với kỳ trước</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Main Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div variants={item} className="lg:col-span-2">
              <Card className="h-full border-border/40 bg-card/40 backdrop-blur-sm shadow-sm rounded-[32px] overflow-hidden">
                <CardHeader className="pb-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-black tracking-tight italic uppercase">Xu hướng doanh thu</CardTitle>
                      <CardDescription className="font-bold text-xs uppercase tracking-widest opacity-60">Hiệu suất kinh doanh theo thời gian</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-none font-black text-xs">REAL-TIME</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] w-full">
                    {isLoading ? (
                      <Skeleton className="h-full w-full rounded-2xl" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data?.daily || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="oklch(0.627 0.265 149.214)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="oklch(0.627 0.265 149.214)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="oklch(var(--muted-foreground) / 10%)" />
                          <XAxis 
                            dataKey="_id" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fontWeight: 700, fill: 'oklch(var(--muted-foreground))' }}
                            tickFormatter={(val) => format(new Date(val), 'dd/MM')}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fontWeight: 700, fill: 'oklch(var(--muted-foreground))' }}
                            tickFormatter={(val) => `${(val / 1000).toLocaleString()}k`}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              borderRadius: '16px', 
                              border: 'none', 
                              backgroundColor: 'oklch(var(--popover))', 
                              boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                              fontSize: '11px', 
                              fontWeight: 800,
                              padding: '12px',
                              color: 'oklch(var(--popover-foreground))'
                            }}
                            itemStyle={{ color: 'oklch(var(--popover-foreground))' }}
                            formatter={(val: number) => [formatCurrency(val), 'Doanh thu']}
                            labelFormatter={(label) => format(new Date(label), 'EEEE, dd/MM/yyyy', { locale: vi })}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="revenue" 
                            stroke="oklch(0.627 0.265 149.214)" 
                            strokeWidth={4}
                            fillOpacity={1} 
                            fill="url(#colorRevenue)" 
                            animationDuration={2000}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="h-full border-border/40 bg-card/40 backdrop-blur-sm shadow-sm rounded-[32px] overflow-hidden">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-xl">
                       <PieChartIcon size={20} className="text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black tracking-tight italic uppercase">Thanh toán</CardTitle>
                      <CardDescription className="text-xs font-black uppercase tracking-widest opacity-60">Cơ cấu nguồn thu</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[240px] w-full mb-6">
                    {isLoading ? (
                      <Skeleton className="h-full w-3/4 mx-auto rounded-full" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data?.paymentMethods || []}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={95}
                            paddingAngle={8}
                            dataKey="revenue"
                            nameKey="_id"
                          >
                            {(data?.paymentMethods || []).map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              borderRadius: '16px', 
                              border: 'none', 
                              backgroundColor: 'oklch(var(--popover))', 
                              boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                              fontSize: '11px', 
                              fontWeight: 800,
                              padding: '12px',
                              color: 'oklch(var(--popover-foreground))'
                            }}
                            itemStyle={{ color: 'oklch(var(--popover-foreground))' }}
                            formatter={(val: number) => [formatCurrency(val), 'Doanh thu']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="space-y-4">
                    {(data?.paymentMethods || []).map((method: any, index: number) => (
                       <div key={method._id} className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/10">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                          <span className="text-xs font-black uppercase tracking-tight text-foreground/80">{method._id === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black tracking-tight">{formatCurrency(method.revenue)}</p>
                          <p className="text-xs font-bold text-muted-foreground uppercase">{((method.revenue / Math.max(data.summary.total, 1)) * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                    {!isLoading && (!data?.paymentMethods || data.paymentMethods.length === 0) && (
                      <div className="text-center py-12">
                        <PieChartIcon className="mx-auto w-12 h-12 text-muted/30 mb-2" />
                        <p className="text-muted-foreground text-xs italic font-bold">Chưa có dữ liệu thanh toán</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Products and Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <motion.div variants={item}>
              <Card className="border-border/40 bg-card/40 backdrop-blur-sm shadow-sm rounded-[32px] overflow-hidden h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/10">
                       <BarChartIcon size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black tracking-tight italic uppercase">Top sản phẩm</CardTitle>
                      <CardDescription className="text-xs font-black uppercase tracking-widest opacity-60">Sản phẩm mang lại doanh thu cao nhất</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-lg font-black">TOP 5</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6 pt-4">
                    {isLoading ? (
                      Array(5).fill(0).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-2 w-full" />
                          </div>
                        </div>
                      ))
                    ) : (
                      (data?.topProducts || []).map((product: any, index: number) => (
                        <div key={product._id} className="flex items-center gap-4 group">
                          <div className={cn(
                            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border group-hover:scale-110 transition-transform",
                            index === 0 ? "bg-amber-500/20 border-amber-500/20 text-amber-600" : "bg-muted border-border/50 text-muted-foreground"
                          )}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-black text-foreground truncate">{product._id}</span>
                              <div className="text-right">
                                <span className="text-xs font-bold text-muted-foreground">{product.quantity} lần gọi</span>
                              </div>
                            </div>
                            <div className="w-full bg-muted/50 h-2 rounded-full overflow-hidden border border-border/20">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(product.revenue / Math.max(data?.topProducts[0]?.revenue, 1)) * 100}%` }}
                                transition={{ duration: 1, ease: "circOut" }}
                                className={cn("h-full rounded-full shadow-sm", index === 0 ? "bg-amber-500 border-none" : "bg-primary")}
                              />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 bg-muted/30 px-3 py-1.5 rounded-xl border border-border/20">
                            <p className="text-xs font-black">{formatCurrency(product.revenue)}</p>
                          </div>
                        </div>
                      ))
                    )}
                    {!isLoading && (!data?.topProducts || data.topProducts.length === 0) && (
                      <div className="text-center py-16 opacity-30 grayscale scale-90">
                        <Coffee size={64} className="mx-auto mb-4" />
                        <p className="text-sm italic font-black">Chưa có dữ liệu sản phẩm</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Action Insights Card */}
            <motion.div variants={item}>
              <Card className="bg-slate-900 border-none shadow-2xl rounded-[32px] overflow-hidden h-full text-white relative">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12 -mr-10 -mt-10 select-none">
                  <Coffee size={240} className="text-white" />
                </div>

                <CardHeader className="relative z-10">
                  <CardTitle className="text-xl font-black tracking-tight italic uppercase text-emerald-400">Gợi ý vận hành</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-xs uppercase tracking-widest">Phân tích Insight thông minh</CardDescription>
                </CardHeader>
                
                <CardContent className="relative z-10 pt-4 space-y-10">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-xs px-2 py-0.5 mb-2 font-black">NHẬN XÉT</Badge>
                        <p className="text-slate-200 font-medium text-sm leading-relaxed tracking-tight">
                          Hệ thống ghi nhận <span className="font-black text-white px-1.5 py-0.5 bg-emerald-600 rounded-lg">{data?.summary?.count || 0}</span> giao dịch thành công trong kỳ này. 
                        </p>
                      </div>

                      <div>
                        <Badge className="bg-blue-500/20 text-blue-400 border-none text-xs px-2 py-0.5 mb-2 font-black">THANH TOÁN</Badge>
                        <p className="text-slate-200 font-medium text-sm leading-relaxed tracking-tight">
                          {data?.paymentMethods?.length > 0 ? (
                            `Kênh ${data.paymentMethods[0]?._id === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'} đang chiếm ưu thế với ${(data.paymentMethods[0]?.count / Math.max(data.summary.count, 1) * 100).toFixed(0)}% lưu lượng.`
                          ) : 'Chưa có thông tin thanh toán cho kỳ này.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-8 bg-white/5 border border-white/10 rounded-[28px] backdrop-blur-xl shadow-xl">
                      <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-4">
                        <CalendarIcon className="text-emerald-500" size={32} />
                      </div>
                      <p className="text-white font-black text-4xl tracking-tighter tabular-nums mb-1">
                        {isLoading ? "..." : (data?.summary?.count || 0)}
                      </p>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Đơn hoàn tất</p>
                      <div className="mt-8 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                         <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: "75%" }}
                            transition={{ duration: 1.5 }}
                            className="h-full bg-emerald-500" 
                          />
                      </div>
                      <p className="text-xs font-bold text-slate-500 mt-2 uppercase">75% chỉ tiêu tuần</p>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/50 gap-2 group border-none">
                      Xuất dữ liệu
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" className="h-14 w-14 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 flex-shrink-0">
                      <ArrowUpRight className="text-white" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </IonContent>
    </IonPage>
  );
};

export default DashboardPage;
