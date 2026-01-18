"use client";

import { RealtimeCursors } from "@/components/realtime-cursors";
import { useState } from "react";

const generateRandomColor = () =>
  `hsl(${Math.floor(Math.random() * 360)}, 100%, 70%)`;

export default function Home() {
  const [color] = useState(() => generateRandomColor());

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute h-full w-full left-0 top-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundSize: "16px 16px",
          backgroundImage:
            "linear-gradient(to right, gray 1px, transparent 1px), linear-gradient(to bottom, gray 1px, transparent 1px)",
        }}
      />

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white/90">CosmoSync</h1>
          <p className="text-white/50 text-lg">
            Move your mouse to see realtime multiplayer cursors
          </p>
          <div
            className="inline-block w-4 h-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          <p className="text-white/30 text-sm">Your cursor color</p>
        </div>
      </div>

      {/* Connection indicator */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white/50 text-sm">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>Connected</span>
      </div>

      {/* Realtime cursors */}
      <RealtimeCursors roomName="cosmosync-room" color={color} />
    </div>
  );
}
