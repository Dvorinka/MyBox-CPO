import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-none hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/80",
        outline: "text-foreground",
        available:
          "border-transparent bg-[#2596be]/10 text-[#2596be] hover:bg-[#2596be]/15 dark:bg-[#2596be]/15 dark:text-[#38bdf8] dark:hover:bg-[#2596be]/20",
        preparing:
          "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/15",
        charging:
          "border-transparent bg-[#102472]/10 text-[#102472] hover:bg-[#102472]/15 dark:bg-[#3b82f6]/15 dark:text-[#3b82f6] dark:hover:bg-[#3b82f6]/20",
        finishing:
          "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-slate-500/15",
        faulted:
          "border-transparent bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15",
        offline:
          "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:hover:bg-gray-500/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
