"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect } from "react";

export default function SplashScreen() {
  useEffect(() => {
    const audio = new Audio("/splash-sound.mp3");
    audio.volume = 0.25;
    audio.play().catch(() => {
      // Browser may block sound until user interacts. That's okay.
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white"
    >
      {/* Medical-tech background particles */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-[10%] top-[20%] h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        <div className="absolute left-[75%] top-[18%] h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
        <div className="absolute left-[30%] top-[75%] h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />
        <div className="absolute left-[85%] top-[70%] h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
        <div className="absolute left-[55%] top-[45%] h-1 w-1 animate-pulse rounded-full bg-white" />
      </div>

      {/* Glow */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: [0.9, 1.08, 0.95], opacity: [0.35, 0.8, 0.45] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute h-72 w-72 rounded-full bg-blue-500 blur-3xl"
      />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Logo drawing / reveal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="rounded-[2rem] border border-white/10 bg-white/95 p-6 shadow-2xl shadow-blue-500/30"
        >
          <motion.div
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ delay: 0.2, duration: 1.3, ease: "easeInOut" }}
          >
            <Image
              src="/managewisemd-logo.png"
              alt="ManageWiseMD"
              width={330}
              height={330}
              priority
              className="mx-auto"
            />
          </motion.div>
        </motion.div>

        {/* Text */}
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Welcome to <span className="text-blue-400">ManageWiseMD</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.6 }}
          className="mt-2 text-sm uppercase tracking-[0.25em] text-slate-300"
        >
          Smarter Practice. Better Care.
        </motion.p>

        {/* Loading bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/20"
        >
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ delay: 2, duration: 0.8, ease: "easeInOut" }}
            className="h-full rounded-full bg-blue-400"
          />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.1, duration: 0.5 }}
          className="mt-3 text-xs text-slate-400"
        >
          Loading your workspace...
        </motion.p>
      </div>
    </motion.div>
  );
}