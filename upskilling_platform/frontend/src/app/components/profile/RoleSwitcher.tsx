import { useState } from "react";
import { Shield, ChevronDown } from "lucide-react";

const roles = [
  { id: "admin", label: "Admin", color: "text-red-400" },
  { id: "manager", label: "Manager", color: "text-blue-400" },
  { id: "learning_expert", label: "Learning Expert", color: "text-purple-400" },
  { id: "member", label: "Member", color: "text-green-400" },
  { id: "intern", label: "Intern", color: "text-yellow-400" },
];

interface RoleSwitcherProps {
  currentRole: string;
  onRoleChange?: (role: string) => void;
}

export function RoleSwitcher({ currentRole, onRoleChange }: RoleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const active = roles.find((r) => r.id === currentRole) || roles[3];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-popover"
      >
        <Shield className={`h-4 w-4 ${active.color}`} />
        <span className={active.color}>{active.label}</span>
        <ChevronDown className="h-3 w-3 text-text-secondary" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => {
                onRoleChange?.(role.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-popover ${
                role.id === currentRole ? "bg-popover" : ""
              }`}
            >
              <Shield className={`h-4 w-4 ${role.color}`} />
              <span className={role.color}>{role.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
