"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

interface DialogResizeContextValue {
  startResizing: () => void
  stopResizing: () => void
}

const DialogResizeContext = React.createContext<DialogResizeContextValue | null>(null)

function Dialog({ onOpenChange, disablePointerDismissal, ...props }: DialogPrimitive.Root.Props) {
  const [isResizing, setIsResizing] = React.useState(false)
  const resizeCooldownTimerRef = React.useRef<number | null>(null)

  const clearResizeCooldown = React.useCallback(() => {
    if (resizeCooldownTimerRef.current !== null) {
      window.clearTimeout(resizeCooldownTimerRef.current)
      resizeCooldownTimerRef.current = null
    }
  }, [])

  const startResizing = React.useCallback(() => {
    clearResizeCooldown()
    setIsResizing(true)
  }, [clearResizeCooldown])

  const stopResizing = React.useCallback(() => {
    clearResizeCooldown()
    resizeCooldownTimerRef.current = window.setTimeout(() => {
      setIsResizing(false)
      resizeCooldownTimerRef.current = null
    }, 140)
  }, [clearResizeCooldown])

  React.useEffect(() => {
    return () => {
      clearResizeCooldown()
    }
  }, [clearResizeCooldown])

  const handleOpenChange = React.useCallback<NonNullable<DialogPrimitive.Root.Props["onOpenChange"]>>((open, eventDetails) => {
    if (!open) {
      clearResizeCooldown()
      setIsResizing(false)
    }
    onOpenChange?.(open, eventDetails)
  }, [clearResizeCooldown, onOpenChange])

  return (
    <DialogResizeContext.Provider value={{ startResizing, stopResizing }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        disablePointerDismissal={Boolean(disablePointerDismissal || isResizing)}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DialogResizeContext.Provider>
  )
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  resizable = true,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  resizable?: boolean
}) {
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const resizeContext = React.useContext(DialogResizeContext)
  const [manualRect, setManualRect] = React.useState<{
    width: number
    height: number
    left: number
    top: number
  } | null>(null)

  const startResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection) => {
    if (!resizable || !popupRef.current) return

    event.preventDefault()
    event.stopPropagation()

    const startRect = popupRef.current.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const minWidth = 320
    const minHeight = 192
    const viewportPadding = 8
    const originalUserSelect = document.body.style.userSelect

    resizeContext?.startResizing()
    document.body.style.userSelect = "none"

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY

      let nextWidth = startRect.width
      let nextHeight = startRect.height
      let nextLeft = startRect.left
      let nextTop = startRect.top

      if (direction.includes("e")) {
        nextWidth = startRect.width + dx
      }
      if (direction.includes("s")) {
        nextHeight = startRect.height + dy
      }
      if (direction.includes("w")) {
        nextWidth = startRect.width - dx
      }
      if (direction.includes("n")) {
        nextHeight = startRect.height - dy
      }

      const maxWidth = window.innerWidth - viewportPadding * 2
      const maxHeight = window.innerHeight - viewportPadding * 2
      nextWidth = Math.min(Math.max(nextWidth, minWidth), maxWidth)
      nextHeight = Math.min(Math.max(nextHeight, minHeight), maxHeight)

      if (direction.includes("w")) {
        const right = startRect.left + startRect.width
        nextLeft = right - nextWidth
      }
      if (direction.includes("n")) {
        const bottom = startRect.top + startRect.height
        nextTop = bottom - nextHeight
      }

      nextLeft = Math.min(Math.max(nextLeft, viewportPadding), window.innerWidth - viewportPadding - nextWidth)
      nextTop = Math.min(Math.max(nextTop, viewportPadding), window.innerHeight - viewportPadding - nextHeight)

      setManualRect({
        width: nextWidth,
        height: nextHeight,
        left: nextLeft,
        top: nextTop,
      })
    }

    const stopResize = () => {
      resizeContext?.stopResizing()
      document.body.style.userSelect = originalUserSelect
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopResize)
    window.addEventListener("pointercancel", stopResize)
  }, [resizable, resizeContext])

  const resizeHandles: Array<{ direction: ResizeDirection; className: string }> = [
    { direction: "n", className: "absolute top-0 left-3 right-3 h-2 cursor-ns-resize" },
    { direction: "s", className: "absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize" },
    { direction: "e", className: "absolute right-0 top-3 bottom-3 w-2 cursor-ew-resize" },
    { direction: "w", className: "absolute left-0 top-3 bottom-3 w-2 cursor-ew-resize" },
    { direction: "ne", className: "absolute top-0 right-0 h-3 w-3 cursor-nesw-resize" },
    { direction: "nw", className: "absolute top-0 left-0 h-3 w-3 cursor-nwse-resize" },
    { direction: "se", className: "absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize" },
    { direction: "sw", className: "absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize" },
  ]

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={popupRef}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm min-w-[20rem] min-h-[12rem] max-h-[calc(100vh-1rem)] overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          resizable ? "touch-none" : "resize-none",
          manualRect ? "!translate-x-0 !translate-y-0" : "",
          className
        )}
        style={manualRect
          ? {
              ...style,
              width: `${manualRect.width}px`,
              height: `${manualRect.height}px`,
              left: `${manualRect.left}px`,
              top: `${manualRect.top}px`,
            }
          : style}
        {...props}
      >
        {children}
        {resizable && (
          <div className="pointer-events-none absolute inset-0">
            {resizeHandles.map((handle) => (
              <div
                key={handle.direction}
                className={cn("pointer-events-auto select-none touch-none", handle.className)}
                onPointerDown={(event) => startResize(event, handle.direction)}
              />
            ))}
          </div>
        )}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
