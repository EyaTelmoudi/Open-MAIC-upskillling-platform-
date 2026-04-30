import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/app/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <input
        type={isPassword && visible ? "text" : type}
        className={cn(
          "flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isPassword && "pr-11",
          className
        )}
        ref={ref}
        {...props}
      />
      {isPassword ? (
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-text-secondary transition-colors hover:text-text-primary"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
