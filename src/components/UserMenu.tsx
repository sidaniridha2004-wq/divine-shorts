import { Link, useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/pro-status";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Crown, LogOut, Shield, User } from "lucide-react";

export function UserMenu() {
  const { userId, email, isPro, isAdmin, loading } = useSession();
  const navigate = useNavigate();

  if (loading) return <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />;

  if (!userId) {
    return (
      <Link to="/auth">
        <Button variant="outline" size="sm">Sign in</Button>
      </Link>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {isPro ? (
            <span className="inline-flex items-center gap-1 text-gold">
              <Crown className="h-3.5 w-3.5" /> Pro
            </span>
          ) : (
            <User className="h-3.5 w-3.5" />
          )}
          <span className="hidden max-w-[120px] truncate sm:inline">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isPro && (
          <DropdownMenuItem asChild>
            <Link to="/pro" className="cursor-pointer">
              <Crown className="mr-2 h-4 w-4 text-gold" /> Upgrade to Pro
            </Link>
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer">
              <Shield className="mr-2 h-4 w-4" /> Admin dashboard
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
