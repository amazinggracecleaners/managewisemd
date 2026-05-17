"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect } from "react";

type SplashRole = "intro" | "employee" | "manager";

export default function SplashScreen({ role = "intro" }: { role?: SplashRole }) {
  const isManager = role === "manager";
  const isEmployee = role === "employee";

  useEffect(() => {
    const audio = new Audio("/splash-sound.mp3");
    audio.volume = 0.25;
    audio.play().catch(() => {});
  }, []);

  const title = role === "intro"
  ? "Welcome to ManageWiseMD"
  : isManager
  ? "Manager Operations Center"
 
  : "Employee Workspace";
   

  const subtitle = role === "intro"
  ? "Smarter Practice. Better Care."
  : isManager
  ? "Loading business tools..."
  : "Loading your Dashboard...";

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden text-white ${
        isManager
          ? "bg-gradient-to-br from-slate-950 via-emerald-950 to-black"
          : "bg-gradient-to-br from-slate-950 via-blue-950 to-black"
      }`}
    >
      <motion.div
        animate={{ scale: [0.9, 1.08, 0.95], opacity: [0.35, 0.75, 0.45] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className={`absolute h-72 w-72 rounded-full blur-3xl ${
          isManager ? "bg-emerald-500" : "bg-blue-500"
        }`}
      />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.75, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="rounded-[2rem] border border-white/10 bg-white/95 p-6 shadow-2xl"
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

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.6 }}
          className="mt-2 text-sm uppercase tracking-[0.25em] text-slate-300"
        >
          {subtitle}
        </motion.p>

       {role !== "intro" && (
  <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/20">
    <motion.div
      initial={{ width: "0%" }}
      animate={{ width: "100%" }}
      transition={{ delay: 1.8, duration: 0.9, ease: "easeInOut" }}
      className={`h-full rounded-full ${
        isManager ? "bg-emerald-400" : "bg-blue-400"
      }`}
    />
  </div>
)}

        <p className="mt-6 text-xs text-slate-400">
          Powered by ManageWiseMD
        </p>
      </div>
    </motion.div>
  );
}