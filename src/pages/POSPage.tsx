import { IonPage, IonContent } from '@ionic/react';
import React, { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { 
  ShoppingCart, Plus, Minus, Trash2, Coffee, CheckCircle2, 
  Banknote, CreditCard, X, ChevronRight, CircleDollarSign, 
  ChevronLeft, Printer, StickyNote, MessageSquare, Search,
  Store, Utensils, Truck, LogOut, Info, AlertTriangle, Wifi, WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { printOrder } from '../lib/printing';
import { get, set, del } from 'idb-keyval';
import { cn } from '@/lib/utils';
import { 
  Button 
} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Product {
  _id: string;
  name: string;
  basePrice: number;
  category: string;
  image?: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  isSent?: boolean;
  orderId?: string;
}

interface Table {
  _id: string;
  name: string;
  status: 'EMPTY' | 'OCCUPIED';
  currentOrderId?: string;
}

const ProductCard: React.FC<{ product: Product, onAdd: () => void }> = ({ product, onAdd }) => (
  <motion.button
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    whileTap={{ scale: 0.96 }}
    onClick={onAdd}
    className="group relative flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:border-primary/50 transition-all text-left overflow-hidden"
  >
    <div className="aspect-square bg-muted overflow-hidden relative">
      {product.image ? (
        <img 
          src={product.image} 
          alt={product.name} 
          className="w-full h-full object-cover transition-transform group-hover:scale-110" 
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Coffee className="text-muted-foreground/30 group-hover:text-primary transition-colors" size={40} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
        <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1">
          <Plus size={12} /> Thêm nhanh
        </span>
      </div>
    </div>
    
    <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-1">
      <h3 className="font-bold text-foreground leading-tight line-clamp-2 text-xs sm:text-sm uppercase tracking-tight font-sans">
        {product.name}
      </h3>
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <span className="text-primary font-extrabold text-sm sm:text-base font-mono">
          {product.basePrice.toLocaleString('vi-VN')}
          <span className="text-xs ml-0.5">đ</span>
        </span>
      </div>
    </div>
  </motion.button>
);

const POSPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [tables, setTables] = useState<Table[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableCarts, setTableCarts] = useState<Record<string, CartItem[]>>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Load tableCarts from IDB
  useEffect(() => {
    get('tableCarts').then((saved) => {
      if (saved) {
        setTableCarts(saved);
      }
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Sync tableCarts to IDB
  useEffect(() => {
    if (Object.keys(tableCarts).length > 0) {
      set('tableCarts', tableCarts);
    }
  }, [tableCarts]);
  
  // Flow states
  const [step, setStep] = useState<'TYPE' | 'TABLE' | 'MENU'>('TYPE');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Note Modal States
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedCartItem, setSelectedCartItem] = useState<{ id: string, isSent: boolean } | null>(null);
  const [tempNote, setTempNote] = useState('');

  // Custom Item Modal States
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '' });
  
  // Discount and Tax
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Payment states
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | null>(null);
  const [paymentStep, setPaymentStep] = useState<'SELECT' | 'QR'>('SELECT');
  const [orderCode, setOrderCode] = useState('');
  
  // Shift states
  const { user, shift, closeShift } = useAuthStore();
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showShiftWarning, setShowShiftWarning] = useState(false);
  const [closingBalance, setClosingBalance] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [closing, setClosing] = useState(false);

  const fetchShiftSummary = async () => {
    try {
      const res = await api.get('/api/shifts/summary');
      setShiftSummary(res.data);
      // Auto-fill closing balance with expected to help user
      setClosingBalance(res.data.expectedBalance || 0);
    } catch (err) {
      console.error('Failed to fetch shift summary:', err);
    }
  };

  const generateOrderCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
       code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const fetchInitialData = async () => {
    try {
      const [prodRes, tableRes, setRes] = await Promise.all([
        api.get('/api/products'),
        api.get('/api/tables'),
        api.get('/api/settings')
      ]);
      const productsData = Array.isArray(prodRes.data) ? prodRes.data : [];
      setProducts(productsData);
      setTables(Array.isArray(tableRes.data) ? tableRes.data : []);
      setSettings(setRes.data);
      
      const rawCategories = productsData.map((p: Product) => p.category).filter(Boolean);
      const uniqueCats = Array.from(new Set(rawCategories as string[]));
      const cats: string[] = ['Tất cả', ...uniqueCats.filter(c => c !== 'Tất cả')];
      setCategories(cats);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu:', error);
    } finally {
      setLoading(false);
    }
  };

  const socket = useSocket();

  useEffect(() => {
    fetchInitialData();
    
    // Refresh data when window regains focus to keep sync with Menu changes
    window.addEventListener('focus', fetchInitialData);

    if (socket) {
      socket.on('table:update', (updatedTable: any) => {
        setTables(prev => prev.map(t => t._id === updatedTable._id ? { ...t, ...updatedTable } : t));
        if (selectedTable?._id === updatedTable._id && updatedTable.status === 'EMPTY') {
          resetFlow();
        }
      });
      
      socket.on('order:new', (order: any) => {
        if (selectedTable?._id === order.tableId && step === 'MENU') {
           // Refresh active order data if we are currently in that table's menu
           handleTableSelect(selectedTable);
        }
      });

      socket.on('order:update', (order: any) => {
        if (selectedTable?._id === order.tableId && step === 'MENU') {
           handleTableSelect(selectedTable);
        }
      });

      // Also refresh products and settings if they change
      socket.on('product:update', fetchInitialData);
      socket.on('settings:update', fetchInitialData);
    }

    return () => {
      window.removeEventListener('focus', fetchInitialData);
      if (socket) {
        socket.off('table:update');
        socket.off('order:new');
        socket.off('order:update');
        socket.off('product:update');
        socket.off('settings:update');
      }
    };
  }, [socket]);

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'Tất cả' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleTypeSelect = (type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY') => {
    setOrderType(type);
    setStep('TABLE');
  };

  const handleTableSelect = async (table: Table) => {
    setSelectedTable(table);
    // Keep reference to current unsent items to merge later
    const unsentItems = cart.filter(item => !item.isSent);
    
    if (table.status === 'OCCUPIED') {
      setLoading(true);
      try {
        const res = await api.get(`/api/orders`);
        const allOrders = Array.isArray(res.data) ? res.data : [];
        const tableOrders = allOrders.filter((o: any) => o.tableId === table._id && o.status !== 'COMPLETED');
        
        if (tableOrders.length > 0) {
          // Flatten all items from all active orders
          const allItems = tableOrders.flatMap((o: any) => o.items.map((item: any) => ({
            id: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            isSent: true
          })));

          // Consolidate identical items
          const consolidatedCart: CartItem[] = [];
          allItems.forEach(item => {
            const existing = consolidatedCart.find(c => c.id === item.id && c.isSent === item.isSent);
            if (existing) {
              existing.quantity += item.quantity;
            } else {
              consolidatedCart.push({ ...item });
            }
          });

          // If multiple orders exist, merge them into the last one for a single source of truth
          if (tableOrders.length > 1) {
            const lastOrder = tableOrders[tableOrders.length - 1];
            await api.patch(`/api/orders/${lastOrder._id}`, {
              items: consolidatedCart.filter(i => i.isSent).map(i => ({
                productId: i.id,
                name: i.name,
                price: i.price,
                quantity: i.quantity
              })),
              subtotal: consolidatedCart.reduce((s, i) => s + i.price * i.quantity, 0),
              total: consolidatedCart.reduce((s, i) => s + i.price * i.quantity, 0)
            });
            
            await Promise.all(tableOrders.slice(0, -1).map(o => 
              api.patch(`/api/orders/${o._id}`, { status: 'COMPLETED', total: 0, items: [] })
            ));
          }

          // MERGE with local unsent items
          unsentItems.forEach(u => {
            const existing = consolidatedCart.find(c => c.id === u.id && !c.isSent);
            if (existing) {
              existing.quantity += u.quantity;
            } else {
              consolidatedCart.push({ ...u });
            }
          });

          setCart(consolidatedCart);
          setActiveOrderId(tableOrders[tableOrders.length - 1]._id);
          
          setDiscountType(tableOrders[0].discountType || 'FIXED');
          setDiscountValue(tableOrders.reduce((sum, o) => sum + (o.discountValue || 0), 0));
        } else {
          setCart(tableCarts[table._id] || unsentItems);
          setActiveOrderId(null);
        }
      } catch (err) {
        console.error('Failed to fetch table order:', err);
        setCart(tableCarts[table._id] || unsentItems);
      } finally {
        setLoading(false);
      }
    } else {
      setCart(tableCarts[table._id] || unsentItems);
      setActiveOrderId(null);
    }
    setStep('MENU');
  };

  // Sync cart to tableCarts whenever it changes
  useEffect(() => {
    if (selectedTable && step === 'MENU') {
      setTableCarts(prev => ({ ...prev, [selectedTable._id]: cart }));
    }
  }, [cart, selectedTable, step]);

  const handlePrintProvisional = () => {
    if (cart.length === 0) return;
    
    printOrder({
      tableName: selectedTable?.name || 'Mang về',
      items: cart.map(item => ({
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      total,
      orderType: orderType || undefined
    }, settings, true);
  };

  const resetFlow = () => {
    setStep('TYPE');
    setOrderType(null);
    setSelectedTable(null);
    setCart([]);
    setShowPaymentModal(false);
    setPaymentMethod(null);
    setPaymentStep('SELECT');
    setActiveOrderId(null);
  };

  const filteredTables = tables.filter(t => {
    if (orderType === 'DINE_IN') return t.name.startsWith('Bàn');
    if (orderType === 'TAKEAWAY') return t.name.startsWith('Mang về');
    if (orderType === 'DELIVERY') return t.name.startsWith('Ship');
    return true;
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product._id && !item.isSent);
      if (existing) {
        return prev.map((item) =>
          (item.id === product._id && !item.isSent) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { id: product._id, name: product.name, price: product.basePrice, quantity: 1, isSent: false }];
    });
  };

  const handleSendToKitchen = async () => {
    const unsentItems = cart.filter(item => !item.isSent);
    if (unsentItems.length === 0 || !selectedTable) return;
    
    setOrdering(true);
    try {
      const orderData = {
        orderType: orderType,
        tableId: selectedTable._id,
        items: unsentItems.map((item) => ({
          productId: item.id.startsWith('custom-') ? undefined : item.id,
          name: item.name + (item.note ? ` (${item.note})` : ''),
          price: item.price,
          quantity: item.quantity,
          note: item.note
        })),
        subtotal: unsentItems.reduce((s, i) => s + i.price * i.quantity, 0),
        total: unsentItems.reduce((s, i) => s + i.price * i.quantity, 0),
        status: 'PENDING',
        paymentStatus: 'UNPAID'
      };

      await api.post('/api/orders', orderData);
      
      // Update cart to mark these items as sent
      setCart(prev => prev.map(item => ({ ...item, isSent: true })));
      
      // If we weren't occupied, we are now
      if (selectedTable.status === 'EMPTY') {
        setSelectedTable({ ...selectedTable, status: 'OCCUPIED' });
      }
      toast.success('Đã gửi báo bếp thành công');
    } catch (error) {
      console.error('Failed to send to kitchen:', error);
      toast.error('Lỗi khi báo bếp');
    } finally {
      setOrdering(false);
    }
  };

  const updateQuantity = async (id: string, delta: number) => {
    const itemToUpdate = cart.find(i => i.id === id);
    if (!itemToUpdate) return;
    
    const isSentItem = itemToUpdate.isSent;

    // Check permission for sent items
    if (isSentItem && (user as any)?.role !== 'ADMIN' && (user as any)?.role !== 'MANAGER' && !(user as any)?.permissions?.includes('POS_EDIT')) {
      toast.error('Bạn không có quyền sửa món đã gửi bếp!');
      return;
    }
    
    setCart((prev) => {
      const updated = prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0);
      
      // Sync with DB if it's a sent item and we have an active order
      if (isSentItem && activeOrderId && selectedTable) {
        const sentItems = updated.filter(i => i.isSent);
        if (sentItems.length === 0) {
          // If no items left, we might want to delete the order or mark it completed
          api.delete(`/api/orders/${activeOrderId}`).catch(err => console.error(err));
          // If the whole cart is empty, reset table
          if (updated.length === 0) {
            api.patch(`/api/tables/${selectedTable._id}`, { status: 'EMPTY' }).catch(err => console.error(err));
            setStep('TABLE');
            setSelectedTable(null);
            setActiveOrderId(null);
          }
        } else {
          api.patch(`/api/orders/${activeOrderId}`, {
            items: sentItems.map(i => ({
              productId: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity
            })),
            subtotal: sentItems.reduce((s, i) => s + i.price * i.quantity, 0),
            total: sentItems.reduce((s, i) => s + i.price * i.quantity, 0)
          }).catch(err => console.error('Failed to sync updated quantity:', err));
        }
      }
      
      return updated;
    });
  };

  const removeFromCart = async (id: string) => {
    const itemToRemove = cart.find(i => i.id === id);
    if (!itemToRemove) return;
    
    const isSentItem = itemToRemove.isSent;

    // Check permission for sent items
    if (isSentItem && (user as any)?.role !== 'ADMIN' && (user as any)?.role !== 'MANAGER' && !(user as any)?.permissions?.includes('POS_DELETE')) {
      toast.error('Bạn không có quyền xóa món đã gửi bếp!');
      return;
    }

    setCart((prev) => {
      const updated = prev.filter((item) => item.id !== id);

      // Sync with DB if it's a sent item and we have an active order
      if (isSentItem && activeOrderId && selectedTable) {
        const sentItems = updated.filter(i => i.isSent);
        if (sentItems.length === 0) {
          api.delete(`/api/orders/${activeOrderId}`).catch(err => console.error(err));
          if (updated.length === 0) {
            api.patch(`/api/tables/${selectedTable._id}`, { status: 'EMPTY' }).catch(err => console.error(err));
            setStep('TABLE');
            setSelectedTable(null);
            setActiveOrderId(null);
          }
        } else {
          api.patch(`/api/orders/${activeOrderId}`, {
            items: sentItems.map(i => ({
              productId: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity
            })),
            subtotal: sentItems.reduce((s, i) => s + i.price * i.quantity, 0),
            total: sentItems.reduce((s, i) => s + i.price * i.quantity, 0)
          }).catch(err => console.error('Failed to sync removed item:', err));
        }
      }

      return updated;
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxRate = settings?.taxRate || 0;
  
  const discountAmount = discountType === 'PERCENTAGE' 
    ? (subtotal * discountValue) / 100 
    : discountValue;
    
  const taxAmount = ((subtotal - discountAmount) * taxRate) / 100;
  const total = subtotal - discountAmount + taxAmount;

  const handleCheckoutInitiate = () => {
    if (cart.length === 0 || !orderType) return;
    
    // Sync prices with latest product catalog for final billing
    // "Tất cả các đơn hàng phải chốt theo giá tại thời điểm hoàn thành"
    const updatedCart = cart.map(item => {
      const currentProduct = products.find(p => p._id === item.id);
      if (currentProduct) {
        return { ...item, price: currentProduct.basePrice };
      }
      return item;
    });
    setCart(updatedCart);

    setOrderCode(generateOrderCode());
    setShowPaymentModal(true);
    setPaymentStep('SELECT');
  };

  const handleConfirmPayment = async (method: 'CASH' | 'TRANSFER') => {
    setPaymentMethod(method);
    if (method === 'TRANSFER') {
      setPaymentStep('QR');
    } else {
      await processOrder(method);
    }
  };

  const processOrder = async (method: string) => {
    if (ordering) return;
    setOrdering(true);
    try {
      // Find all active orders for this table to complete them
      const res = await api.get('/api/orders');
      const allOrders = Array.isArray(res.data) ? res.data : [];
      const tableOrders = allOrders.filter((o: any) => o.tableId === selectedTable?._id && o.status !== 'COMPLETED');
      
      const orderData = {
        orderCode: orderCode,
        orderType: orderType,
        tableId: selectedTable?._id,
        items: cart.map((item) => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        discountAmount: discountAmount,
        discountType: discountType,
        discountValue: discountValue,
        total: total,
        paymentMethod: method,
        status: 'COMPLETED',
        paymentStatus: 'PAID'
      };

      // We complete all orders for the table. 
      // If there are multiple, we update them all to COMPLETED.
      // We also create/update one of them with the final receipt details or handle as needed.
      // Best approach: Mark all existing as COMPLETED, and if new items were added (not yet in DB), 
      // we've already handled the aggregation in 'cart'.
      
      await Promise.all(tableOrders.map(o => 
        api.patch(`/api/orders/${o._id}`, { status: 'COMPLETED', paymentStatus: 'PAID' })
      ));

      // If we had a cart that included items not yet in ANY order, we should probably create a "Final" order 
      // or ensure all items were sent to kitchen first.
      // But based on handleSendToKitchen, all items should be isSent: true before checkout if we follow the flow.
      // To be safe, if there's no active order but we have a cart, we create a new one.
      if (tableOrders.length === 0) {
        await api.post('/api/orders', orderData);
      } else {
        // Update the last one with full details for record keeping
        await api.patch(`/api/orders/${tableOrders[tableOrders.length - 1]._id}`, orderData);
      }
      
      // Print Final Invoice
      printOrder({
        orderCode: orderCode,
        tableName: selectedTable?.name || 'Mang về',
        items: cart.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        discountAmount: discountAmount,
        total: total,
        paymentMethod: method,
        orderType: orderType || undefined
      }, settings);

      setOrderSuccess(true);
      setShowPaymentModal(false);

      // Clear the cart for this table in localStorage
      if (selectedTable) {
        setTableCarts(prev => {
          const newCarts = { ...prev };
          delete newCarts[selectedTable._id];
          return newCarts;
        });
      }
      
      setTimeout(() => {
        setOrderSuccess(false);
        resetFlow();
      }, 2000);
    } catch (error) {
      toast.error('Lỗi khi thanh toán');
      console.error(error);
    } finally {
      setOrdering(false);
    }
  };


  const getActiveTables = () => {
    return tables.filter(t => (tableCarts[t._id]?.length || 0) > 0);
  };

  const handleCloseShiftInitiate = async () => {
    const active = getActiveTables();
    if (active.length > 0) {
      setShowShiftWarning(true);
    } else {
      await fetchShiftSummary();
      setShowCloseShiftModal(true);
    }
  };

  const handleCloseShift = async () => {
    setClosing(true);
    try {
      const activeTables = getActiveTables();
      const reportData = await closeShift(closingBalance, shiftNotes, activeTables.length);
      
      // Print report
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const productRows = reportData.productSales?.map((p: any) => `
          <div class="row">
            <span>${p.name} (x${p.quantity})</span>
            <b>${p.amount.toLocaleString('vi-VN')}đ</b>
          </div>
        `).join('') || '';

        printWindow.document.write(`
          <html>
            <head>
              <title>Báo Cáo Chốt Ca</title>
              <style>
                body { font-family: sans-serif; padding: 20px; line-height: 1.4; font-size: 14px; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .section-title { font-weight: bold; text-transform: uppercase; margin-top: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 12px; color: #666; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; border-bottom: 1px dashed #eee; }
                .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
                h2 { margin: 0; }
                .highlight { background: #f9f9f9; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .notes { font-style: italic; color: #666; margin-top: 10px; padding: 10px; background: #fff8e1; border-left: 4px solid #ffc107; }
              </style>
            </head>
            <body>
              <div class="header">
                <h2>BÁO CÁO KẾT THÚC CA</h2>
                <div style="font-weight: bold; margin-top: 5px;">MÃ CA: ${reportData.code}</div>
                <div>${new Date().toLocaleString('vi-VN')}</div>
              </div>
              <div class="row"><span>Nhân viên:</span> <b>${reportData.userName}</b></div>
              <div class="row"><span>Thời gian:</span> <span>${new Date(reportData.startTime).toLocaleTimeString('vi-VN')} - ${new Date(reportData.endTime).toLocaleTimeString('vi-VN')}</span></div>
              
              <div class="section-title">Tổng hợp doanh thu</div>
              <div class="row"><span>Tiền đầu ca:</span> <span>${reportData.openingBalance.toLocaleString('vi-VN')}đ</span></div>
              <div class="row"><span>Doanh thu Tiền mặt:</span> <span>${reportData.cashSales?.toLocaleString('vi-VN') || 0}đ</span></div>
              <div class="row"><span>Doanh thu Chuyển khoản:</span> <span>${reportData.transferSales?.toLocaleString('vi-VN') || 0}đ</span></div>
              <div class="row" style="font-weight: bold;"><span>TỔNG DOANH THU:</span> <span>${reportData.totalSales.toLocaleString('vi-VN')}đ</span></div>
              
              <div class="section-title">Kiểm kê tiền mặt</div>
              <div class="row"><span>Tiền mặt theo hệ thống:</span> <b>${(reportData.openingBalance + (reportData.cashSales || 0)).toLocaleString('vi-VN')}đ</b></div>
              <div class="row"><span>Tiền mặt thực tế:</span> <b>${reportData.closingBalance.toLocaleString('vi-VN')}đ</b></div>
              <div class="row" style="color: ${reportData.closingBalance - (reportData.openingBalance + (reportData.cashSales || 0)) === 0 ? 'black' : 'red'};">
                <span>Chênh lệch:</span> 
                <b>${(reportData.closingBalance - (reportData.openingBalance + (reportData.cashSales || 0))).toLocaleString('vi-VN')}đ</b>
              </div>

              ${reportData.notes ? `<div class="notes"><b>Ghi chú:</b> ${reportData.notes}</div>` : ''}

              <div class="section-title">Chi tiết sản phẩm bán ra</div>
              ${productRows}

              <div class="highlight">
                <div class="row"><span>Bàn giao bàn đang phục vụ:</span> <b>${activeTables.length} bàn</b></div>
              </div>

              <div class="footer">
                <p>Hệ thống quản lý PosApp</p>
                <p>Cảm ơn quý khách!</p>
              </div>
              <script>window.print(); setTimeout(() => window.close(), 1000);</script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }

      setShowCloseShiftModal(false);
      setShowShiftWarning(false);
      setShiftNotes('');
      toast.success('Chốt ca thành công');
    } catch (error) {
      toast.error('Lỗi khi chốt ca');
    } finally {
      setClosing(false);
    }
  };

  const discountTypeFormatted = discountType === 'PERCENTAGE' ? '%' : 'VNĐ';

  const addCustomItem = () => {
    if (!customItem.name || !customItem.price) return;
    const priceNum = parseInt(customItem.price);
    if (isNaN(priceNum)) return;

    const newItem: CartItem = {
      id: `custom-${Date.now()}`,
      name: customItem.name,
      price: priceNum,
      quantity: 1,
      isSent: false
    };

    setCart(prev => [...prev, newItem]);
    setCustomItem({ name: '', price: '' });
    setShowCustomItemModal(false);
  };

  const handleOpenNoteModal = (item: CartItem) => {
    setSelectedCartItem({ id: item.id, isSent: !!item.isSent });
    setTempNote(item.note || '');
    setShowNoteModal(true);
  };

  const saveNote = () => {
    if (!selectedCartItem) return;
    
    setCart(prev => prev.map(item => 
      (item.id === selectedCartItem.id && (!item.isSent || selectedCartItem.isSent)) 
        ? { ...item, note: tempNote } 
        : item
    ));
    
    setShowNoteModal(false);
    setSelectedCartItem(null);
  };

  const CartContent = ({ onBack }: { onBack?: () => void }) => (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tighter uppercase leading-none">Giỏ hàng</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs h-4 px-1.5 font-black uppercase tracking-widest italic border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                {selectedTable?.name}
              </Badge>
              {!isOnline && <Badge variant="destructive" className="text-[10px] h-4 px-1.5 uppercase font-black tracking-widest">Offline</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowCustomItemModal(true)}
            className="w-9 h-9 text-emerald-600 hover:bg-emerald-50 rounded-xl"
          >
            <Plus size={18} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={resetFlow}
            className="w-9 h-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
          >
            <Trash2 size={18} />
          </Button>
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="w-9 h-9 lg:hidden rounded-xl">
              <X size={18} />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 sm:px-6 py-4">
        <AnimatePresence initial={false}>
          {cart.length === 0 ? (
            <div key="empty-cart" className="h-[40vh] flex flex-col items-center justify-center text-slate-200 opacity-50">
              <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mb-4">
                <Coffee size={32} className="text-slate-300" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Bắt đầu chọn món ngay</p>
            </div>
          ) : (
            <div key="cart-list" className="flex flex-col gap-3 pb-4">
              {cart.map((item) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  key={item.id + (item.isSent ? '-sent' : '-pending')}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex flex-col gap-3 group relative overflow-hidden",
                    item.isSent 
                      ? "bg-slate-50 border-slate-100 opacity-90" 
                      : "bg-white border-slate-200 shadow-sm hover:shadow-md"
                  )}
                >
                  {item.isSent && (
                    <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500 text-[10px] font-black text-white uppercase tracking-widest rounded-bl-lg">
                      Sent to Kitchen
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-2">
                     <div className="flex-1">
                       <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight leading-tight mb-1">{item.name}</h4>
                       <div className="flex flex-wrap items-center gap-2">
                         <span className="text-xs font-bold text-slate-400 font-mono">
                           {item.price.toLocaleString('vi-VN')}đ / món
                         </span>
                         {item.note && (
                           <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-emerald-500/20 text-emerald-600 bg-emerald-500/5 gap-1 font-bold">
                             <MessageSquare size={8} /> {item.note}
                           </Badge>
                         )}
                       </div>
                       <button 
                        onClick={() => handleOpenNoteModal(item)}
                        className="mt-2 flex items-center gap-1.5 py-1 px-2 group/note bg-slate-50 hover:bg-emerald-50 rounded-lg transition-all"
                       >
                         <StickyNote size={10} className="text-slate-400 group-hover/note:text-emerald-500" />
                         <span className="text-xs font-black text-slate-500 group-hover/note:text-emerald-600 uppercase tracking-widest">
                           {item.note ? 'Sửa chú thích' : 'Thêm chú thích'}
                         </span>
                       </button>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeFromCart(item.id)} 
                        className="h-8 w-8 text-slate-300 hover:text-red-500 rounded-xl shrink-0"
                      >
                        <X size={14} />
                      </Button>
                   </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100/50">
                    <span className="text-slate-900 font-black text-sm font-mono">
                      {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                    </span>
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => updateQuantity(item.id, -1)} 
                        className="h-7 w-7 bg-white shadow-sm hover:text-red-500 rounded-lg"
                      >
                        <Minus size={12} />
                      </Button>
                      <span className="font-mono text-xs font-black min-w-[32px] text-center text-slate-900">
                        {item.quantity}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => updateQuantity(item.id, 1)} 
                        className="h-7 w-7 bg-white shadow-sm hover:text-emerald-500 rounded-lg"
                      >
                        <Plus size={12} />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </ScrollArea>

      <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
            <span>Tạm tính</span>
            <span className="text-slate-700 font-mono italic">{subtotal.toLocaleString('vi-VN')}đ</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Giảm giá</span>
              <button 
                onClick={() => setDiscountType(discountType === 'PERCENTAGE' ? 'FIXED' : 'PERCENTAGE')}
                className="text-[10px] font-black bg-slate-100 h-4 px-1.5 rounded uppercase tracking-tighter text-slate-500 border border-slate-200"
              >
                {discountTypeFormatted}
              </button>
            </div>
            <Input 
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value))}
              className="w-20 h-7 bg-slate-50 border-slate-200 text-right text-xs font-black text-emerald-600 focus-visible:ring-emerald-500 p-1"
            />
          </div>

          {taxRate > 0 && (
            <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
              <span>VAT ({taxRate}%)</span>
              <span className="text-slate-700 font-mono italic">{taxAmount.toLocaleString('vi-VN')}đ</span>
            </div>
          )}

          <div className="flex justify-between items-end pt-3 mt-1 border-t border-dashed border-slate-200">
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Thành tiền</span>
            <div className="text-right">
              <p className="text-3xl font-black text-emerald-600 tracking-tighter font-mono leading-none">
                {total.toLocaleString('vi-VN')}
                <span className="text-sm ml-1 italic tracking-normal">đ</span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            disabled={cart.length === 0 || ordering}
            variant="outline"
            onClick={handleSendToKitchen}
            className={cn(
              "h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all gap-2 border-slate-200",
              cart.some(i => !i.isSent)
                ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white"
                : "bg-slate-50 text-slate-400 opacity-60"
            )}
          >
            <Utensils size={14} /> Báo bếp
          </Button>
          <Button
            disabled={cart.length === 0}
            variant="outline"
            onClick={handlePrintProvisional}
            className="h-12 border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest gap-2"
          >
            <Printer size={14} /> Tạm tính
          </Button>
        </div>

        <Button
          disabled={cart.length === 0 || ordering}
          onClick={handleCheckoutInitiate}
          className={cn(
            "w-full h-16 rounded-2xl font-black text-lg gap-3 uppercase tracking-widest shadow-xl transition-all",
            cart.length === 0 ? "bg-slate-100 text-slate-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20",
            ordering && "opacity-70 animate-pulse"
          )}
        >
          {ordering ? (
             <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : orderSuccess ? (
            <>
              <CheckCircle2 size={24} />
              <span>Checkout!</span>
            </>
          ) : (
            <>
              <Banknote size={24} />
              <span>Thanh toán</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <IonPage>
        <IonContent>
          <div className="h-full flex items-center justify-center bg-slate-50">
            <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent>
        <div className="flex h-full overflow-hidden bg-slate-50 justify-center">
      <div className="flex w-full max-w-[1440px] h-full overflow-hidden bg-white lg:bg-transparent shadow-2xl lg:shadow-none">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <AnimatePresence mode="wait">
          {/* STEP 1: Select Order Type */}
          {step === 'TYPE' && (
            <motion.div 
              key="type-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full flex flex-col justify-center items-center max-w-6xl mx-auto p-4 sm:p-8"
            >
              <div className="text-center mb-12 sm:mb-16">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Badge variant={isOnline ? "outline" : "destructive"} className="px-3 py-1 gap-2 border-slate-200">
                    {isOnline ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} />}
                    {isOnline ? "System Online" : "System Offline (Local Mode)"}
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tighter uppercase mb-4">
                  Terminal <span className="text-emerald-600">POS</span>
                </h1>
                <p className="text-slate-500 font-medium tracking-tight">Chào mừng quay trở lại, <span className="text-slate-900 font-bold">{user?.name}</span></p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
                {[
                  { id: 'DINE_IN', label: 'Tại chỗ', sub: 'Dine-in Order', icon: <Utensils size={32} />, color: 'emerald', action: () => handleTypeSelect('DINE_IN') },
                  { id: 'TAKEAWAY', label: 'Mang về', sub: 'Take Away', icon: <Store size={32} />, color: 'slate', action: () => handleTypeSelect('TAKEAWAY') },
                  { id: 'DELIVERY', label: 'Ship đi', sub: 'Delivery Slot', icon: <Truck size={32} />, color: 'blue', action: () => handleTypeSelect('DELIVERY') },
                  { id: 'SHIFT', label: 'Chốt ca', sub: 'End Session', icon: <CircleDollarSign size={32} />, color: 'rose', action: handleCloseShiftInitiate }
                ].map((t, idx) => (
                  <motion.button
                    key={`type-${t.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.1 } }}
                    onClick={t.action}
                    className={cn(
                      "group relative bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-2xl transition-all flex flex-col items-center justify-center gap-6 overflow-hidden",
                      t.color === 'emerald' && "hover:border-emerald-500/50 hover:shadow-emerald-500/10",
                      t.color === 'slate' && "hover:border-slate-900/50 hover:shadow-slate-900/10",
                      t.color === 'blue' && "hover:border-blue-500/50 hover:shadow-blue-500/10",
                      t.color === 'rose' && "hover:border-rose-500/50 hover:shadow-rose-500/10"
                    )}
                  >
                    <div className={cn(
                      "w-16 h-16 rounded-[24px] flex items-center justify-center transition-all group-hover:scale-110 group-hover:rotate-3",
                      t.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                      t.color === 'slate' && "bg-slate-50 text-slate-800",
                      t.color === 'blue' && "bg-blue-50 text-blue-600",
                      t.color === 'rose' && "bg-rose-50 text-rose-600"
                    )}>
                      {t.icon}
                    </div>
                    <div className="text-center">
                      <span className="block text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">{t.label}</span>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">{t.sub}</span>
                    </div>

                    <div className={cn(
                      "absolute bottom-0 left-0 h-1 transition-all w-0 group-hover:w-full",
                      t.color === 'emerald' && "bg-emerald-500",
                      t.color === 'slate' && "bg-slate-900",
                      t.color === 'blue' && "bg-blue-500",
                      t.color === 'rose' && "bg-rose-500"
                    )} />
                  </motion.button>
                ))}
              </div>

              <div className="mt-16 flex items-center gap-8 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all">
                <div className="flex flex-col items-center">
                   <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center text-slate-400">
                     <Info size={18} />
                   </div>
                   <span className="text-xs font-bold uppercase tracking-widest mt-2">{tables.length} Máy trạm</span>
                </div>
                <div className="flex flex-col items-center">
                   <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center text-slate-400">
                     <Utensils size={18} />
                   </div>
                   <span className="text-xs font-bold uppercase tracking-widest mt-2">{products.length} Món ăn</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Select Table/Slot */}
          {step === 'TABLE' && (
            <motion.div 
              key="table-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col p-4 sm:p-8 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 sm:mb-12">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setStep('TYPE')}
                    className="rounded-xl border-slate-200"
                  >
                    <ChevronLeft className="text-slate-500" />
                  </Button>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase italic">
                      {orderType === 'DINE_IN' ? 'Chọn Bàn' : orderType === 'TAKEAWAY' ? 'Chọn Ô mang về' : 'Chọn Slot ship'}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Lựa chọn vị trí để bắt đầu đơn hàng</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-3 py-1">
                    {tables.filter(t => t.status === 'OCCUPIED').length} Đang phục vụ
                  </Badge>
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/20 px-3 py-1">
                    {tables.filter(t => t.status === 'EMPTY').length} Trống
                  </Badge>
                </div>
              </div>
              
              <ScrollArea className="flex-1 -mx-4 sm:-mx-8 px-4 sm:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6 pb-8">
                  {filteredTables.map((table, idx) => {
                    const hasItems = (tableCarts[table._id]?.length || 0) > 0;
                    const isOccupied = table.status === 'OCCUPIED';

                    return (
                      <motion.button
                        key={`table-${table._id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1, transition: { delay: idx * 0.05 } }}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleTableSelect(table)}
                        className={cn(
                          "relative aspect-square sm:aspect-[4/3] rounded-[32px] border-2 flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden shadow-sm",
                          isOccupied 
                            ? "bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/20"
                            : hasItems
                              ? "bg-amber-50 border-amber-400/50 text-amber-900 shadow-amber-500/10"
                              : "bg-white border-slate-100 hover:border-emerald-500 text-slate-900"
                        )}
                      >
                        <div className={cn(
                          "text-xs uppercase tracking-widest font-black px-2 py-0.5 rounded-full mb-1",
                          isOccupied
                            ? "bg-white/20 text-white"
                            : hasItems
                              ? "bg-amber-500 text-white"
                              : "bg-slate-100 text-slate-400 group-hover:bg-emerald-500 group-hover:text-white"
                        )}>
                          {isOccupied ? 'Phục vụ' : hasItems ? 'Có món' : 'Trống'}
                        </div>
                        <span className="font-black text-2xl sm:text-3xl tracking-tighter italic">{table.name}</span>
                        
                        {/* Status bar */}
                        <div className={cn(
                          "absolute bottom-0 left-0 w-full h-1.5 opacity-0 group-hover:opacity-100 transition-all",
                          isOccupied ? "bg-white/30" : "bg-emerald-500"
                        )} />
                        
                        {/* Animated background circle */}
                        <div className={cn(
                          "absolute -bottom-8 -right-8 w-24 h-24 rounded-full opacity-10 blur-2xl group-hover:scale-150 transition-transform",
                          isOccupied ? "bg-white" : "bg-emerald-500"
                        )} />
                      </motion.button>
                    );
                  })}
                </div>
              </ScrollArea>
            </motion.div>
          )}

          {/* STEP 3: Select Menu Items */}
          {step === 'MENU' && (
            <motion.div 
               key="menu-step"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex flex-col h-full bg-slate-50"
            >
              <header className="px-4 sm:px-8 py-4 sm:py-6 bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={async () => {
                        const hasUnsent = cart.some(i => !i.isSent);
                        if (hasUnsent) {
                          await handleSendToKitchen();
                        }
                        setStep('TABLE');
                      }} 
                      className="rounded-xl border-slate-200 bg-white shadow-sm"
                    >
                      <ChevronLeft className="text-slate-500" />
                    </Button>
                    <div className="flex-1 sm:flex-initial">
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter uppercase italic">{selectedTable?.name}</h1>
                      <div className="flex items-center gap-2">
                        <p className="text-emerald-600 text-xs font-black uppercase tracking-widest leading-none">{orderType?.replace('_', ' ')}</p>
                        <span className="text-slate-200 text-xs">|</span>
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest leading-none">Shift: {shift?.code}</p>
                      </div>
                    </div>
                    {/* Cart Trigger for Mobile */}
                    <Button 
                      onClick={() => setShowMobileCart(true)}
                      className="lg:hidden relative h-12 w-12 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all p-0"
                    >
                      <ShoppingCart size={20} />
                      {cart.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full border-2 border-white text-[10px] flex items-center justify-center font-black">
                          {cart.reduce((acc, curr) => acc + curr.quantity, 0)}
                        </span>
                      )}
                    </Button>
                  </div>
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <Input 
                      type="text" 
                      placeholder="Tìm món trong thực đơn..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white border-slate-200 pl-11 rounded-xl h-11 text-sm focus-visible:ring-emerald-500 shadow-sm" 
                    />
                  </div>
                </div>
                
                {/* Category Filter */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {categories.map((cat, index) => (
                    <button
                      key={`cat-${cat}-${index}`}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm",
                        selectedCategory === cat 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/10" 
                          : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </header>

              <ScrollArea className="flex-1 px-4 sm:px-8 pb-8">
                <div className="pt-8">
                  {selectedCategory === 'Tất cả' && !searchQuery ? (
                    categories.filter(c => c !== 'Tất cả').map((cat) => {
                      const catProducts = products.filter(p => p.category === cat);
                      if (catProducts.length === 0) return null;
                      return (
                        <div key={`cat-group-${cat}`} className="mb-10">
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] mb-6 flex items-center gap-4">
                            {cat}
                            <div className="h-px flex-1 bg-slate-200" />
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
                            {catProducts.map((product, idx) => (
                              <ProductCard key={`${cat}-${product._id}-${idx}`} product={product} onAdd={() => addToCart(product)} />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
                      {filteredProducts.map((product, idx) => (
                        <ProductCard key={`filtered-${product._id}-${idx}`} product={product} onAdd={() => addToCart(product)} />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cart Panel (Desktop) */}
      <AnimatePresence>
        {step === 'MENU' && (
          <motion.aside 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="hidden lg:flex w-[400px] bg-white border-l border-slate-200 flex-col shadow-2xl z-20"
          >
            <CartContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Cart Drawer (Mobile) */}
      <AnimatePresence>
        {showMobileCart && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileCart(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[60] lg:hidden"
            />
            <motion.aside 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 h-[85vh] bg-white rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.2)] z-[70] lg:hidden flex flex-col overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-4 shrink-0" />
              <div className="flex-1 overflow-hidden">
                <CartContent onBack={() => setShowMobileCart(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Payment Dialog */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => !ordering && setShowPaymentModal(open)}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none rounded-[40px] shadow-2xl">
          {paymentStep === 'SELECT' ? (
            <div className="p-8">
              <DialogHeader className="mb-8">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Banknote size={20} />
                   </div>
                   <div>
                     <DialogTitle className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Thanh toán</DialogTitle>
                     <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Chọn phương thức để kết thúc</DialogDescription>
                   </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mb-8">
                <Button 
                  variant="outline"
                  onClick={() => handleConfirmPayment('CASH')}
                  className="w-full h-24 p-6 border-slate-200 rounded-[32px] flex items-center justify-between group hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left bg-white shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors">
                      <Banknote size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase">Tiền mặt</p>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Thanh toán trực tiếp</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </Button>

                <Button 
                  variant="outline"
                  onClick={() => handleConfirmPayment('TRANSFER')}
                  className="w-full h-24 p-6 border-slate-200 rounded-[32px] flex items-center justify-between group hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left bg-white shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors">
                      <CreditCard size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase">Chuyển khoản</p>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">VietQR Dynamic code</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              <div className="p-6 bg-emerald-600 rounded-[32px] shadow-lg shadow-emerald-500/20 flex justify-between items-center text-white">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest opacity-80">Tổng tiền thu</span>
                  <div className="text-3xl font-black font-mono tracking-tighter mt-1">
                    {total.toLocaleString('vi-VN')}đ
                  </div>
                </div>
                        <div className="h-10 w-10 rounded-full bg-slate-900/10 flex items-center justify-center">
                   <CircleDollarSign size={24} />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 flex flex-col items-center text-center">
              <header className="w-full flex justify-between items-center mb-10">
                <Button variant="ghost" size="icon" onClick={() => setPaymentStep('SELECT')} className="rounded-full">
                  <ChevronLeft size={20} />
                </Button>
                <DialogTitle className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">VietQR Payment</DialogTitle>
                <div className="w-10" />
              </header>

              <div className="bg-white p-6 rounded-[40px] border border-slate-100 shadow-inner mb-8">
                {settings && (
                  <img 
                    src={`https://img.vietqr.io/image/${settings.bankCode || 'ICB'}-${settings.bankAccount || '0000'}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(`TT ${orderCode} ${selectedTable?.name || ''}`)}&accountName=${encodeURIComponent(settings.bankAccountHolder || '')}`}
                    alt="VietQR"
                    className="w-64 h-auto rounded-3xl shadow-2xl mx-auto border-4 border-white"
                  />
                )}
              </div>

              <div className="w-full space-y-2 mb-8 text-left">
                <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-widest italic">Order Key</span>
                  <span className="text-sm font-black text-emerald-700 tracking-widest">{orderCode}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                   <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-xl">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Account</span>
                      <span className="text-[11px] font-black text-slate-900 uppercase">{settings?.bankAccountHolder}</span>
                   </div>
                   <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-xl">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Number</span>
                      <span className="text-xs font-black text-slate-900 font-mono italic">{settings?.bankAccount}</span>
                   </div>
                </div>
              </div>

              <Button 
                onClick={() => processOrder('TRANSFER')}
                disabled={ordering}
                className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-emerald-500/20 gap-3"
              >
                {ordering ? (
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={24} />
                    <span>Xác nhận đã nhận</span>
                  </>
                )}
              </Button>
              <p className="mt-4 text-xs text-slate-400 font-bold uppercase tracking-[0.2em] italic">Vui lòng kiểm tra biến động số dư trước</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shift Closing Warning Dialog */}
      <Dialog open={showShiftWarning} onOpenChange={setShowShiftWarning}>
        <DialogContent className="sm:max-w-[400px] p-8 rounded-[40px] border-none shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mb-8">
              <CircleDollarSign className="text-amber-600 w-10 h-10" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900 mb-4 tracking-tighter uppercase italic">Cảnh báo bàn đang phục vụ</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium mb-10 leading-relaxed text-sm">
              Hiện vẫn còn <span className="text-rose-600 font-black">{getActiveTables().length} bàn</span> đang có khách hoặc chưa thanh toán. Nhân viên ca sau sẽ tiếp quản các bàn này. Bạn vẫn muốn chốt ca?
            </DialogDescription>
            <div className="w-full space-y-4">
              <Button 
                onClick={async () => {
                  setShowShiftWarning(false);
                  await fetchShiftSummary();
                  setShowCloseShiftModal(true);
                }}
                className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg"
              >
                Tiếp tục chốt ca
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowShiftWarning(false)}
                className="w-full h-14 text-slate-400 font-black uppercase tracking-widest hover:text-slate-900"
              >
                Quay lại kiểm tra
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Selection Dialog */}
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent className="sm:max-w-[440px] p-8 rounded-[40px] border-none shadow-2xl">
          <DialogHeader className="mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <StickyNote size={20} />
              </div>
              <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Ghi chú món</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {PRESET_NOTES.map((note) => (
                <button
                  key={note}
                  onClick={() => setTempNote((prev) => (prev.includes(note) ? prev.replace(note, '').trim() : (prev + ' ' + note).trim()))}
                  className={cn(
                    "p-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border",
                    tempNote.includes(note)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"
                  )}
                >
                  {note}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Ghi chú khác</label>
              <textarea
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
                placeholder="Nhập yêu cầu đặc biệt..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px] shadow-inner"
              />
            </div>

            <Button
              onClick={saveNote}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-emerald-500/20"
            >
              Lưu ghi chú
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Item Dialog */}
      <Dialog open={showCustomItemModal} onOpenChange={setShowCustomItemModal}>
        <DialogContent className="sm:max-w-[440px] p-8 rounded-[40px] border-none shadow-2xl">
          <DialogHeader className="mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Plus size={20} />
              </div>
              <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Món ngoài menu</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Tên món</label>
              <Input
                type="text"
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                placeholder="Ví dụ: Nước sâm đặc biệt"
                className="h-14 px-6 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Giá tiền (VNĐ)</label>
              <Input
                type="number"
                value={customItem.price}
                onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                placeholder="25000"
                className="h-14 px-6 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus-visible:ring-emerald-500"
              />
            </div>

            <Button
              onClick={addCustomItem}
              disabled={!customItem.name || !customItem.price}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-emerald-200/20 disabled:scale-100"
            >
              Thêm vào giỏ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={showCloseShiftModal} onOpenChange={(open) => !closing && setShowCloseShiftModal(open)}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none rounded-[48px] shadow-2xl">
          <div className="p-10">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                   <LogOut className="text-rose-600 w-6 h-6" />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">Chốt ca bán hàng</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Tổng kết doanh thu và tiền mặt</p>
                 </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-[32px] space-y-4 border border-slate-100 shadow-inner">
                  {shiftSummary && (
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-widest">Tiền đầu ca</span>
                        <span className="font-black text-slate-700 font-mono">{shiftSummary.openingBalance.toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-widest">Doanh thu Tiền mặt</span>
                        <span className="font-black text-emerald-600 font-mono">+{shiftSummary.cashSales.toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-widest">Doanh thu CK</span>
                        <span className="font-black text-blue-600 font-mono">+{shiftSummary.transferSales.toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="h-px bg-slate-200" />
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Hệ thống tính</span>
                        <span className="text-lg font-black text-slate-900 font-mono">{shiftSummary.expectedBalance.toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Tiền mặt thực tế (Quầy)</label>
                     <div className="relative">
                        <Input 
                          type="number"
                          value={closingBalance}
                          onChange={(e) => setClosingBalance(Number(e.target.value))}
                          className="h-16 bg-white rounded-2xl border-slate-200 text-2xl font-black text-slate-900 text-center focus-visible:ring-rose-500 shadow-sm"
                          placeholder="0"
                        />
                        <span className="absolute top-1/2 -translate-y-1/2 left-6 text-slate-300 font-black">đ</span>
                     </div>
                  </div>

                  {shiftSummary && closingBalance !== shiftSummary.expectedBalance && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 pt-2"
                    >
                      <div className="flex justify-between items-center p-4 bg-rose-50 rounded-2xl border border-rose-100 italic">
                        <span className="text-xs font-black text-rose-600 uppercase tracking-widest">Chênh lệch:</span>
                        <span className="text-lg font-black text-rose-600 font-mono">
                          {(closingBalance - shiftSummary.expectedBalance).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-black text-rose-600 uppercase tracking-widest px-2">Giải trình (Bắt buộc)</label>
                        <textarea 
                          value={shiftNotes}
                          onChange={(e) => setShiftNotes(e.target.value)}
                          placeholder="Lý do chênh lệch..."
                          className="w-full p-4 bg-white rounded-2xl border border-rose-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 min-h-[100px] shadow-sm resize-none"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-3 mt-8">
                  <Button 
                    onClick={handleCloseShift}
                    disabled={closing || (shiftSummary && closingBalance !== shiftSummary.expectedBalance && !shiftNotes.trim())}
                    className="w-full h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-rose-500/20 gap-3"
                  >
                    {closing ? (
                      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogOut size={20} />
                        Xác nhận chốt ca
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowCloseShiftModal(false)}
                    className="w-full h-12 text-slate-400 font-black uppercase tracking-widest hover:text-slate-900"
                  >
                    Huỷ bỏ
                  </Button>
                </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
      </div>
    </IonContent>
  </IonPage>
  );
};

export default POSPage;
