"use client";

// Slide 3 visual: a canvas of particles that drift around their home positions,
// scatter away from the pointer, and spring back. The physics lives in
// lib/particles.ts; this component owns the canvas, sizing and the frame loop.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

import {
  buildParticles,
  edgeFade,
  scatterKick,
  stepParticles,
  type Particle,
  type Pointer,
} from "./lib/particles";

type ParticleFieldProps = {
  /** Any CSS colour. */
  color: string;
  size: number;
  letters: boolean;
};

export function ParticleField({ color, size, letters }: ParticleFieldProps) {
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const pointer = useRef<Pointer | null>(null);
  const dims = useRef({ w: 0, h: 0 });
  // latest props, read inside the frame loop without restarting it
  const look = useRef({ color, size, letters });
  useEffect(() => {
    look.current = { color, size, letters };
  });

  function draw() {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { w, h } = dims.current;
    const { color: fill, size: sz, letters: asLetters } = look.current;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = fill;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let lastScale = 0;
    for (const p of parts.current) {
      ctx.globalAlpha = p.alpha * edgeFade(p.y, h);
      if (asLetters) {
        if (p.scale !== lastScale) {
          lastScale = p.scale;
          ctx.font = `700 ${Math.round((sz * 3.4 + 7) * p.scale)}px system-ui, sans-serif`;
        }
        ctx.fillText(p.glyph, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * p.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // size the canvas to its box and (re)build the particle grid
  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let first = true;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dims.current = { w: r.width, h: r.height };
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      cv.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      // particles assemble from below on first show, then just re-layout on resize
      parts.current = buildParticles(r.width, r.height, {
        scatter: first && !reduce,
      });
      first = false;
      draw();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduce]);

  // frame loop (skipped entirely for reduced motion)
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const tick = (t: number) => {
      stepParticles(parts.current, t, pointer.current, look.current.size);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  // a little burst when the look changes, so the swap feels physical
  const prev = useRef({ color, letters });
  useEffect(() => {
    if (reduce) {
      draw();
      return;
    }
    if (prev.current.letters !== letters) scatterKick(parts.current);
    else if (prev.current.color !== color)
      scatterKick(parts.current, Math.random, true);
    prev.current = { color, letters };
  }, [color, letters, size, reduce]);

  return (
    <div
      className="ob-pfield"
      ref={wrap}
      aria-hidden="true"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <canvas ref={canvas} />
    </div>
  );
}
