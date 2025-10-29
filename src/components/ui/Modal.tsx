'use client'
import React, { PropsWithChildren } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
}

export default function Modal({ open, onClose, title, children }: PropsWithChildren<ModalProps>) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* dialog */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl">
        {title && <h3 className="mb-3 text-xl font-bold">{title}</h3>}
        <div>{children}</div>
      </div>
    </div>
  )
}
