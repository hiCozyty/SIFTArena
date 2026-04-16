"use client"

import React, { useRef, useState, type PropsWithChildren } from "react"
import { motion } from "motion/react"
import type { MotionProps } from "motion/react"
import {
  Folder,
  Search,
  Inbox,
  Settings,
  Command,
  Compass,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface AppleDockProps {
  className?: string
  iconSize?: number
  direction?: "top" | "middle" | "bottom"
  children: React.ReactNode
}

const DEFAULT_SIZE = 40

const appleDockVariants =
  "mx-auto mt-8 flex h-[58px] w-max items-center justify-center gap-2 rounded-2xl border p-2 backdrop-blur-md supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10"

const AppleDock = React.forwardRef<HTMLDivElement, AppleDockProps>(
  (
    { children, iconSize = DEFAULT_SIZE, direction = "middle", ...props },
    ref
  ) => {
    const renderChildren = () => {
      return React.Children.map(children, (child) => {
        if (
          React.isValidElement<AppleDockIconProps>(child) &&
          child.type === AppleDockIcon
        ) {
          return React.cloneElement(child, {
            ...child.props,
            size: iconSize,
          })
        }
        return child
      })
    }

    return (
      <div
        ref={ref}
        {...props}
        className={cn(appleDockVariants, {
          "items-start": direction === "top",
          "items-center": direction === "middle",
          "items-end": direction === "bottom",
        })}
      >
        {renderChildren()}
      </div>
    )
  }
)

AppleDock.displayName = "AppleDock"

export { AppleDock }

export interface AppleDockIconProps extends Omit<
  MotionProps & React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  size?: number
  className?: string
  children?: React.ReactNode
  props?: PropsWithChildren
}

export const AppleDockIcon = ({
  size = DEFAULT_SIZE,
  className,
  children,
  ...props
}: AppleDockIconProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const [isClicked, setIsClicked] = useState(false)
  const padding = Math.max(6, size * 0.2)

  const handleMouseDown = () => setIsClicked(true)
  const handleMouseUp = () => setIsClicked(false)

  return (
    <div
      ref={ref}
      style={{
        width: size,
        height: size,
        padding,
      }}
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-secondary",
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      {...props}
    >
      <motion.div
        animate={{ scale: isClicked ? 0.7 : 1 }}
        transition={{ duration: 0.15 }}
        className="flex aspect-square h-full w-full items-center justify-center rounded-full"
      >
        {children}
      </motion.div>
    </div>
  )
}

AppleDockIcon.displayName = "AppleDockIcon"

export default function AppleDockDemo() {
  type IconData = {
    IconComponent: LucideIcon
    bgColor: string
    textColor: string
    label: string
  }

  const dockIcons: IconData[] = [
    {
      IconComponent: Folder,
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-500",
      label: "Folder",
    },
    {
      IconComponent: Search,
      bgColor: "bg-orange-400/10",
      textColor: "text-orange-400",
      label: "Search",
    },
    {
      IconComponent: Inbox,
      bgColor: "bg-teal-400/10",
      textColor: "text-teal-400",
      label: "Inbox",
    },
    {
      IconComponent: Settings,
      bgColor: "bg-red-500/10",
      textColor: "text-red-500",
      label: "Settings",
    },
    {
      IconComponent: Command,
      bgColor: "bg-amber-300/10",
      textColor: "text-amber-300",
      label: "Command",
    },
    {
      IconComponent: Compass,
      bgColor: "bg-sky-400/10",
      textColor: "text-sky-400",
      label: "Compass",
    },
  ]

  return (
    <div className="flex items-center justify-center bg-background">
      <div className="relative">
        <AppleDock>
          {dockIcons.map(({ IconComponent, bgColor, textColor, label }) => (
            <AppleDockIcon
              key={label}
              className={cn(bgColor, textColor)}
              aria-label={label}
            >
              <IconComponent className="h-6 w-6" />
            </AppleDockIcon>
          ))}
        </AppleDock>
      </div>
    </div>
  )
}
