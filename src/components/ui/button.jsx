import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  gradient: "brand-gradient text-white shadow-sm hover:opacity-90",
  outline: "border border-input bg-card text-foreground hover:bg-muted",
  secondary: "bg-muted text-foreground hover:bg-muted/60",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  link: "text-primary underline-offset-4 hover:underline",
};

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-xs",
  lg: "h-11 px-6",
  icon: "h-9 w-9 p-0",
};

export const Button = forwardRef(({ className, variant = "default", size = "default", loading, disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
      variants[variant],
      sizes[size],
      className
    )}
    {...props}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
));
Button.displayName = "Button";
