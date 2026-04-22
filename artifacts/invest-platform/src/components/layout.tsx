import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetMe, useGetDashboardSummary } from "@workspace/api-client-react";
import { LogOut, Home, Wallet, TrendingUp, CheckSquare, ArrowDownToLine, History, Users, Mail, User, HelpCircle, PhoneCall, Menu, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const bottomTabItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/deposit", label: "Deposit", icon: Wallet },
  { href: "/earnings", label: "Earnings", icon: History, earningsDot: true },
  { href: "/withdraw", label: "Withdraw", icon: ArrowDownToLine },
  { href: "/profile", label: "Profile", icon: User },
];

export function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: user, isLoading: loadingUser } = useGetMe({ query: { enabled: isAuthenticated } });
  const { data: summary } = useGetDashboardSummary({ query: { enabled: isAuthenticated } });

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/deposit", label: "Deposit", icon: Wallet },
    { href: "/trade", label: "Trade", icon: TrendingUp },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/withdraw", label: "Withdraw", icon: ArrowDownToLine },
    { href: "/earnings", label: "Earnings", icon: History, dot: summary?.canClaimEarnings === true },
    { href: "/transactions", label: "Transactions", icon: History },
    { href: "/referrals", label: "Referrals", icon: Users },
    { href: "/inbox", label: "Inbox", icon: Mail, badge: summary?.unreadMessages },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/contact", label: "Contact", icon: PhoneCall },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Nav */}
      <div className="md:hidden flex items-center justify-between p-4 bg-primary text-primary-foreground">
        <span className="font-bold text-xl">ElevateKe</span>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-primary text-white border-none">
            <div className="flex flex-col gap-4 mt-8">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 p-2 hover:bg-primary-foreground/10 rounded-lg" onClick={() => setDrawerOpen(false)}>
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  {item.badge ? <span className="ml-auto bg-destructive text-white text-xs px-2 py-1 rounded-full">{item.badge}</span> : null}
                  {item.dot ? (
                    <span className="ml-auto flex-shrink-0 relative flex h-2.5 w-2.5">
                      {location !== "/earnings" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                    </span>
                  ) : null}
                </Link>
              ))}
              <Button variant="ghost" className="justify-start px-2 hover:bg-primary-foreground/10 text-white" onClick={logout}>
                <LogOut size={20} className="mr-3" /> Logout
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground min-h-screen p-4 sticky top-0 h-screen overflow-y-auto">
        <span className="font-bold text-2xl mb-8 px-2">ElevateKe</span>
        <div className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 p-2 hover:bg-primary-foreground/10 rounded-lg transition-colors">
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.badge ? <span className="ml-auto bg-destructive text-white text-xs px-2 py-1 rounded-full">{item.badge}</span> : null}
              {item.dot ? (
                <span className="ml-auto flex-shrink-0 relative flex h-2.5 w-2.5">
                  {location !== "/earnings" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        <Button variant="ghost" className="justify-start px-2 mt-auto hover:bg-primary-foreground/10 text-white" onClick={logout}>
          <LogOut size={20} className="mr-3" /> Logout
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full pb-20 md:pb-8">
        {children}
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-50">
        {bottomTabItems.map((item) => {
          const isActive = location === item.href;
          const showDot = item.earningsDot && summary?.canClaimEarnings === true;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative text-xs ${
                isActive ? "text-primary" : "text-gray-500"
              }`}
            >
              <span className="relative">
                <item.icon size={22} />
                {showDot && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    {!isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        {/* More tab — opens the full navigation drawer */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs text-gray-500"
        >
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
