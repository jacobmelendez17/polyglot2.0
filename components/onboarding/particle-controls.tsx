"use client";

// Slide 3 controls: colour listbox (4 palette colours), size slider, and a
// switch that turns particles into letters from many writing systems.
// The listbox follows the WAI-ARIA listbox pattern: arrows move, Enter/Space
// selects, Escape closes and returns focus to the button.

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  PARTICLE_COLORS,
  SIZE_MAX,
  SIZE_MIN,
  type ParticleColorId,
} from "./lib/particles";

type ParticleControlsProps = {
  colorId: ParticleColorId;
  onColor: (id: ParticleColorId) => void;
  /** Resolved CSS colour for each option, so swatches match the canvas. */
  swatch: (id: ParticleColorId) => string;
  size: number;
  onSize: (n: number) => void;
  letters: boolean;
  onLetters: (on: boolean) => void;
};

export function ParticleControls(p: ParticleControlsProps) {
  const sizeId = useId();
  const lettersId = useId();
  const fill = ((p.size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100;
  return (
    <div className="ob-ctrls" role="group" aria-label="Particle settings">
      <ColorSelect value={p.colorId} onChange={p.onColor} swatch={p.swatch} />
      <div className="ob-ctrl">
        <label htmlFor={sizeId}>Size</label>
        <span className="ob-range">
          <input
            id={sizeId}
            type="range"
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={0.5}
            value={p.size}
            style={{ ["--fill" as string]: `${fill}%` }}
            onChange={(e) => p.onSize(Number(e.target.value))}
          />
          <output htmlFor={sizeId}>{p.size}</output>
        </span>
      </div>
      <div className="ob-ctrl">
        <label htmlFor={lettersId}>Letters from everywhere</label>
        <input
          id={lettersId}
          type="checkbox"
          role="switch"
          className="ob-switch"
          checked={p.letters}
          onChange={(e) => p.onLetters(e.target.checked)}
        />
      </div>
    </div>
  );
}

function ColorSelect({
  value,
  onChange,
  swatch,
}: {
  value: ParticleColorId;
  onChange: (id: ParticleColorId) => void;
  swatch: (id: ParticleColorId) => string;
}) {
  const reduce = useReducedMotion();
  const labelId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const current =
    PARTICLE_COLORS.find((c) => c.id === value) ?? PARTICLE_COLORS[0];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const openList = () => {
    setActive(PARTICLE_COLORS.findIndex((c) => c.id === value));
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const pick = (i: number) => {
    onChange(PARTICLE_COLORS[i]!.id);
    close();
  };

  return (
    <div className="ob-ctrl">
      <span id={labelId}>Color</span>
      <div className="ob-dd" ref={wrap}>
        <button
          ref={btn}
          type="button"
          className="ob-dd-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${listId}-btn`}
          id={`${listId}-btn`}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              openList();
            }
          }}
        >
          <i className="ob-swatch" style={{ background: swatch(current.id) }} />
          <span>{current.name}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={list}
              id={listId}
              className="ob-dd-list"
              role="listbox"
              tabIndex={-1}
              aria-labelledby={labelId}
              aria-activedescendant={`${listId}-${active}`}
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.94 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 420, damping: 24 },
              }}
              exit={{
                opacity: 0,
                y: 6,
                scale: 0.96,
                transition: { duration: 0.16 },
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => (a + 1) % PARTICLE_COLORS.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(
                    (a) =>
                      (a + PARTICLE_COLORS.length - 1) % PARTICLE_COLORS.length,
                  );
                } else if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(active);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                } else if (e.key === "Tab") close(false);
              }}
            >
              {PARTICLE_COLORS.map((c, i) => (
                <motion.li
                  key={c.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={c.id === value}
                  className={i === active ? "is-active" : undefined}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { delay: 0.04 + i * 0.035 },
                  }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  <i
                    className="ob-swatch"
                    style={{ background: swatch(c.id) }}
                  />
                  {c.name}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
