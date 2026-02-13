"use client";

interface FooterProps {
  engine: "local" | "cloud";
}

export function Footer({ engine }: FooterProps) {
  return (
    <footer className="mt-8 text-xs text-muted-foreground text-center sm:text-left">
      <p>
        Current engine: <span className="font-mono font-medium">{engine}</span>.{" "}
        {engine === "local"
          ? "Data is saved in this browser only."
          : "Data syncs in real time via Firestore."}
      </p>
    </footer>
  );
}
