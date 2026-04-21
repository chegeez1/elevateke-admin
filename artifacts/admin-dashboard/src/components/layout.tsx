import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import { removeAdminToken } from "../App";
import { 
  LayoutDashboard, 
  Users, 
  Settings,
  SlidersHorizontal,
  ListTodo, 
  ArrowLeftRight, 
  TrendingUp, 
  Megaphone, 
  Mail, 
  BarChart, 
  LogOut,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/plans", label: "Plans", icon: Settings },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/withdrawals", label: "Withdrawals", icon: ArrowLeftRight },
  { href: "/trade", label: "Trade Control", icon: TrendingUp },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/reports", label: "Reports", icon: BarChart },
  { href: "/settings", label: "Platform Settings", icon: SlidersHorizontal },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        removeAdminToken();
        setLocation("/login");
      }
    });
  };

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden text-sm">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground 
        transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border bg-sidebar/50">
          <div className="font-bold text-lg tracking-tight">ElevateKe Admin</div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5 text-sidebar-foreground/70" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors
                    ${isActive 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' 
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}
                  `}>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" 
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 border-b bg-background flex items-center px-4 md:hidden shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 mr-2">
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-bold">ElevateKe Admin</div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/10">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
