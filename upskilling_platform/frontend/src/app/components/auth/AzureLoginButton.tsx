"use client";

import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/Button";

interface AzureLoginButtonProps {
  tenant?: string;
}

export function AzureLoginButton({ tenant = "" }: AzureLoginButtonProps) {
  const { loginAzure } = useAuth();

  const handleClick = () => {
    loginAzure(tenant);
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full border-slate-200 bg-white text-slate-900 shadow-sm hover:border-emerald-600/20 hover:bg-emerald-50 hover:text-slate-900"
      onClick={handleClick}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 23 23"
        className="mr-2"
      >
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H12z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H12z" />
      </svg>
      Sign in with Azure Entra ID
    </Button>
  );
}
