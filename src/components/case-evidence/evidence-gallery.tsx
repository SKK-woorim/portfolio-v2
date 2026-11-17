"use client";

import Image from "next/image";
import { Maximize2, X } from "lucide-react";
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { EvidenceFigure } from "@/lib/content/evidence";

export function EvidenceGallery({ figures }: { figures: EvidenceFigure[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<EvidenceFigure | null>(null);

  function show(figure: EvidenceFigure) {
    setOpen(figure);
    dialogRef.current?.showModal();
  }

  function handleDialogClick(event: ReactMouseEvent<HTMLDialogElement>) {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isDialogContent =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isDialogContent) dialog.close();
  }

  return (
    <>
      <div className="evidence-gallery">
        {figures.map((figure) => (
          <figure key={figure.src} className="evidence-figure" data-wide={figure.wide ?? false} data-tall={figure.tall ?? false} data-split={figure.split ?? false} data-kind={figure.kind}>
            <button type="button" className="evidence-figure-frame focus-ring" onClick={() => show(figure)} aria-label={`${figure.caption} 크게 보기`}>
              <Image src={figure.src} alt={figure.alt} width={figure.width} height={figure.height} sizes={figure.wide ? "(max-width: 767px) 100vw, 1200px" : "(max-width: 767px) 100vw, 700px"} />
              <span className="evidence-zoom" aria-hidden="true"><Maximize2 size={14} /></span>
            </button>
            <figcaption>
              <span>{figure.caption}</span>
              <small>
                {figure.note ? <em>{figure.note}</em> : null}
                {figure.page ? <span>보고서 {figure.page}</span> : null}
              </small>
            </figcaption>
          </figure>
        ))}
      </div>
      <dialog
        ref={dialogRef}
        className="evidence-lightbox"
        aria-label={open?.caption ?? "이미지 크게 보기"}
        onClose={() => setOpen(null)}
        onClick={handleDialogClick}
        {...({ closedby: "any" } as Record<string, string>)}
      >
        {open ? (
          <div className="evidence-lightbox-body">
            <div className="evidence-lightbox-bar">
              <p>{open.caption}</p>
              <button type="button" className="focus-ring" onClick={() => dialogRef.current?.close()} aria-label="닫기" autoFocus><X size={18} /></button>
            </div>
            <div className="evidence-lightbox-scroll" data-wide={open.wide ?? false}>
              <Image src={open.src} alt={open.alt} width={open.width} height={open.height} unoptimized />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
