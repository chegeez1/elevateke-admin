import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Deposit from "@/pages/deposit";
import Trade from "@/pages/trade";
import Tasks from "@/pages/tasks";
import Withdraw from "@/pages/withdraw";
import Earnings from "@/pages/earnings";
import Referrals from "@/pages/referrals";
import Inbox from "@/pages/inbox";
import Profile from "@/pages/profile";
import Transactions from "@/pages/transactions";
import FAQ from "@/pages/faq";
import Contact from "@/pages/contact";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/deposit" component={Deposit} />
      <Route path="/trade" component={Trade} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/withdraw" component={Withdraw} />
      <Route path="/earnings" component={Earnings} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/profile" component={Profile} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/faq" component={FAQ} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
