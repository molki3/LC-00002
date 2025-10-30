'use client'
import React, { PropsWithChildren, useEffect } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
}

export default function Modal({ open, onClose, title, children }: PropsWithChildren<ModalProps>) {
  // 🧩 Bloquear scroll del body mientras el modal esté abierto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* dialog */}
      <div
        className="
          relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-xl
          flex flex-col
          max-h-[90vh]           /* 🧩 limita altura máxima */
        "
      >
        {/* título (opcional) */}
        {title && (
          <h3 className="px-4 pt-4 text-xl font-bold text-white">{title}</h3>
        )}

        {/* contenido scroll interno */}
        <div
          className="
            flex-1 overflow-y-auto p-4 space-y-4   /* 🧩 scroll vertical interno */
          "
        >
          {children}
        </div>
      </div>
    </div>
  )
}
