import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { signup, login } from "../../lib/api";
import type { BridgeMode } from "../../lib/store";

export interface AuthPanelProps {
  mode: BridgeMode;
  bridgeUrl: string;
  onAuthenticated: (token: string, username: string) => void;
  onSwitchToLocal: () => void;
}

type AuthScreen = "login" | "signup";

export default function AuthPanel({
  mode: _mode,
  bridgeUrl,
  onAuthenticated,
  onSwitchToLocal,
}: AuthPanelProps) {
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const fn = screen === "signup" ? signup : login;
      const result = await fn(bridgeUrl, trimmedUser, password);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onAuthenticated(result.data.token, result.data.username);
    } finally {
      setLoading(false);
    }
  }

  const isLogin = screen === "login";

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        {/* Logo + title */}
        <div className="space-y-2 text-center">
          <img
            src="https://r2.mdevd.co/asset/logo_transparent.png"
            alt="Keb"
            className="mx-auto size-10 object-contain"
          />
          <h1 className="text-lg font-semibold">Keb — Knowledge Bases</h1>
          <p className="text-xs text-muted-foreground">
            {isLogin ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Username</label>
            <Input
              type="text"
              placeholder="alice"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">
              3-30 characters: letters, numbers, hyphens
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">At least 8 characters</p>
          </div>

          <Button type="submit" disabled={loading} className="h-9 w-full" size="default">
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="size-4" />
                Sign In
              </>
            ) : (
              <>
                <UserPlus className="size-4" />
                Create Account
              </>
            )}
          </Button>
        </form>

        {/* Toggle login/signup */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setScreen(isLogin ? "signup" : "login");
              setError("");
            }}
            className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        {/* Switch to local mode */}
        <div className="border-t border-border pt-2 text-center">
          <button
            type="button"
            onClick={onSwitchToLocal}
            className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Use local mode instead
          </button>
        </div>
      </div>
    </div>
  );
}
