"use client";

import {forwardRef} from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: {value: string; label: string}[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({options, className = "", ...props}, ref) => {
    return (
      <select
        ref={ref}
        className={`flex h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 focus-visible:border-emerald-400 ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
    );
  }
);

Select.displayName = "Select";
