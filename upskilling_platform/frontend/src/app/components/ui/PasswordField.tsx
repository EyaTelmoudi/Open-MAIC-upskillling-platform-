"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/app/lib/utils";

type PasswordFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
  buttonClassName?: string;
};

const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ className, wrapperClassName, buttonClassName, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className={cn("relative", wrapperClassName)}>
        <input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn(
            "flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 pr-11 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className={cn(
            "absolute inset-y-0 right-0 inline-flex items-center px-3 text-text-secondary transition-colors hover:text-text-primary",
            buttonClassName
          )}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);

PasswordField.displayName = "PasswordField";

export { PasswordField };
