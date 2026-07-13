"use client";

// The entire board UI is the prototype's own code, ported near-verbatim in
// lib/board/app.js (see the header comment there). React only hosts it.

import { useEffect, useRef } from "react";
import { initBoard } from "@/lib/board/app";

export default function Home() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) initBoard(ref.current);
  }, []);
  return <div ref={ref} />;
}
